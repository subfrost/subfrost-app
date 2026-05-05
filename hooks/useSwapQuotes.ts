/**
 * useSwapQuotes.ts
 *
 * Calculates swap quotes for AMM token exchanges.
 *
 * The SwapQuote type includes a `poolId` field for reference. Swaps are now
 * routed through the factory contract (opcode 13: SwapExactTokensForTokens)
 * because the deployed pool logic is missing the Swap opcode.
 *
 * ## Quotes Not Showing (Troubleshooting)
 *
 * If swap quotes stop appearing after code changes, this is usually caused by:
 *
 * 1. **Next.js module caching** - Stale cached versions prevent data flow:
 *    ```bash
 *    rm -rf .next && lsof -ti:3000 | xargs kill -9; pnpm dev
 *    ```
 *
 * 2. **Pool data not loading** - Check useAlkanesTokenPairs console logs:
 *    - Should see "[useAlkanesTokenPairs] SDK returned N pools"
 *    - If 0 pools, check REST endpoint or RPC connection
 *
 * 3. **Browser cache** - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R
 *
 * JOURNAL (2026-03-01): Quotes stopped showing after swap signing fix.
 * Root cause was Next.js caching stale hook versions. Fixed by clearing
 * .next directory and restarting dev server.
 *
 * @see useSwapMutation.ts - Uses factory opcode 13 for swaps
 * @see useAlkanesTokenPairs.ts - Pool data fetching
 * @see constants/index.ts - Documentation on factory vs pool opcodes
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useDebounce } from 'use-debounce';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { usePools, type PoolsListItem } from '@/hooks/usePools';
import { queryPoolFeeWithProvider } from '@/hooks/usePoolFee';
import { FRBTC_UNWRAP_FEE_PER_1000, FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { calculateMaximumFromSlippage, calculateMinimumFromSlippage } from '@/utils/amm';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { fetchRouterQuote } from '@/hooks/useRouterQuote';
import { usePoolStateLive } from '@/hooks/usePoolStateLive';
import type { LivePoolState } from '@/lib/alkanes/poolState';
import { swapCalculateOut, swapCalculateIn } from '@/lib/alkanes/swapMath';

type Direction = 'buy' | 'sell';

/**
 * SwapQuote contains all information needed to execute a swap.
 *
 * The `poolId` field is REQUIRED for executing swaps via useSwapMutation.
 * It identifies which pool contract to call directly using the two-protostone pattern.
 */
export type SwapQuote = {
  direction: Direction;
  inputAmount: string; // in display units
  buyAmount: string; // alks
  sellAmount: string; // alks
  exchangeRate: string;
  minimumReceived: string; // alks
  maximumSent: string; // alks
  displayBuyAmount: string; // display units
  displaySellAmount: string; // display units
  displayMinimumReceived: string; // display units
  displayMaximumSent: string; // display units
  error?: string;
  route?: string[];
  hops?: number;
  /**
   * Pool contract ID (for reference/validation).
   * Swaps are routed through the factory with opcode 13, not the pool directly.
   */
  poolId?: { block: string | number; tx: string | number };
  /**
   * Which routing source provides this quote's price.
   * 'amm' = factory opcode 13 (default), 'clob' = Carbine orderbook,
   * 'router' = Universal Router chose best of AMM/CLOB.
   * Undefined when no router is configured (mainnet/regtest).
   */
  routeSource?: 'amm' | 'clob' | 'router';
  /**
   * True when the live state-trie reserve fetch hasn't returned yet.
   * The UI must disable the swap button and show "Loading reserves…"
   * — submitting against this quote would hand the slippage gate a
   * nonsense `amount_out_min`. See SoT-2 / 2026-05-05 incident.
   */
  reservesUnavailable?: boolean;
};

const ALKS_DECIMALS = 8;
const toAlks = (amount: string): string => {
  if (!amount) return '0';
  return new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
};
const fromAlks = (alks: string, displayPlaces = 8): string => {
  if (!alks) return '0';
  return new BigNumber(alks)
    .dividedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .toFixed(displayPlaces);
};

// WebProvider type for the function signature
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

async function calculateSwapPrice(
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
  pool: PoolsListItem,
  provider: WebProvider | null,
  wrapFee: number = FRBTC_WRAP_FEE_PER_1000,
  unwrapFee: number = FRBTC_UNWRAP_FEE_PER_1000,
  originalSellCurrency?: string,
  originalBuyCurrency?: string,
  liveState?: LivePoolState | null,
) {
  const effectiveSell = originalSellCurrency ?? sellCurrency;
  const effectiveBuy = originalBuyCurrency ?? buyCurrency;
  const [pBlock, pTx] = pool.id.split(':');
  const poolFee = await queryPoolFeeWithProvider(provider, { block: pBlock, tx: pTx });
  let buyAmount: string;
  let sellAmount: string;
  const amountInAlks = toAlks(amount);
  const amountNumeric = parseFloat(amount);
  if (!amount || !Number.isFinite(amountNumeric) || amountNumeric === 0) {
    return {
      direction,
      inputAmount: amount,
      buyAmount: '0',
      sellAmount: '0',
      exchangeRate: '0',
      minimumReceived: '0',
      maximumSent: '0',
      displayBuyAmount: '0',
      displaySellAmount: '0',
      displayMinimumReceived: '0',
      displayMaximumSent: '0',
    } as SwapQuote;
  }

  const isSellToken0 = pool?.token0.id === sellCurrency;
  // Reserves MUST come from the live state-trie (`alkanes_simulate` opcode
  // 999 PoolDetails via `usePoolStateLive`). Using cached aggregator data
  // (`pool.token0Amount`) here is a Rule SoT-2 violation — verified
  // 2026-05-05 by recomputing user-reported failed swaps:
  //   Tx 2c51b734… min_out = 1197 DIESEL, pool actual = 762 DIESEL
  //   Tx c52ef600… min_out = 392 DIESEL, pool actual = 289 DIESEL
  // Both reverted with `predicate failed: insufficient output`. The
  // aggregator was showing reserves ~1.57× the live values and the
  // silent fallback meant slippage was applied to the wrong number.
  //
  // If `liveState` isn't available yet (in-flight, errored, or disabled),
  // return a zero quote so the UI can show "Loading…" / disable the
  // swap button. Anything else is silently wrong.
  if (!liveState) {
    return {
      direction,
      inputAmount: amount,
      buyAmount: '0',
      sellAmount: '0',
      exchangeRate: '0',
      minimumReceived: '0',
      maximumSent: '0',
      displayBuyAmount: '0',
      displaySellAmount: '0',
      displayMinimumReceived: '0',
      displayMaximumSent: '0',
      reservesUnavailable: true,
    } as SwapQuote;
  }
  const r0 = liveState.reserve0;
  const r1 = liveState.reserve1;
  const reserveIn = isSellToken0 ? Number(r0) : Number(r1);
  const reserveOut = isSellToken0 ? Number(r1) : Number(r0);

  if (direction === 'sell') {
    let amountIn = Number(amountInAlks);
    if (effectiveSell === 'btc') {
      amountIn = (amountIn * (1000 - wrapFee)) / 1000;
    }
    let calculatedOut = swapCalculateOut({ amountIn, reserveIn, reserveOut, feePercentage: poolFee });
    if (effectiveBuy === 'btc') {
      calculatedOut = (calculatedOut * (1000 - unwrapFee)) / 1000;
    }
    sellAmount = amountInAlks;
    buyAmount = calculatedOut.toString();
  } else {
    let amountOut = Number(amountInAlks);
    if (effectiveBuy === 'btc') {
      amountOut = (amountOut * (1000 + unwrapFee)) / 1000;
    }
    let calculatedIn = swapCalculateIn({ amountOut, reserveIn, reserveOut, feePercentage: poolFee });
    if (effectiveSell === 'btc') {
      calculatedIn = (calculatedIn * (1000 + wrapFee)) / 1000;
    }
    buyAmount = amountInAlks;
    sellAmount = calculatedIn.toString();
  }

  const exchangeRate = new BigNumber(buyAmount || '0').dividedBy(sellAmount || '1').toString();
  const minReceivedInAlks = calculateMinimumFromSlippage({ amount: buyAmount, maxSlippage });
  const maxSentInAlks = calculateMaximumFromSlippage({ amount: sellAmount, maxSlippage });

  return {
    direction,
    inputAmount: amount,
    buyAmount,
    sellAmount: direction !== 'sell' ? maxSentInAlks : sellAmount,
    exchangeRate,
    minimumReceived: minReceivedInAlks,
    maximumSent: maxSentInAlks,
    displayBuyAmount: fromAlks(buyAmount),
    displaySellAmount: direction !== 'sell' ? fromAlks(maxSentInAlks) : fromAlks(sellAmount),
    displayMinimumReceived: fromAlks(minReceivedInAlks),
    displayMaximumSent: fromAlks(maxSentInAlks),
    // Include poolId for the swap mutation to use
    poolId: (() => { const [b, t] = pool.id.split(':'); return { block: b, tx: t }; })(),
  } as SwapQuote;
}

export function useSwapQuotes(
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
) {
  const [debouncedAmount] = useDebounce(amount, 300);
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const { BUSD_ALKANE_ID, FRBTC_ALKANE_ID } = getConfig(network);
  const sellCurrencyId = sellCurrency === 'btc' ? FRBTC_ALKANE_ID : sellCurrency;
  const buyCurrencyId = buyCurrency === 'btc' ? FRBTC_ALKANE_ID : buyCurrency;

  // Use usePools (cached /api/pools/cached, ~200ms) instead of useAlkanesTokenPairs
  // (cascading fallback chain, 15-30s timeouts). Same data, same espo source.
  const { data: poolsData, isFetching: fetchingPools, isError: poolsError, error: poolsErrorObj } = usePools();
  const sellPairs = useMemo(() =>
    poolsData?.items?.filter(p => p.token0.id === sellCurrencyId || p.token1.id === sellCurrencyId),
    [poolsData, sellCurrencyId]
  );
  const buyPairs = useMemo(() =>
    poolsData?.items?.filter(p => p.token0.id === buyCurrencyId || p.token1.id === buyCurrencyId),
    [poolsData, buyCurrencyId]
  );
  const fetchingSell = fetchingPools;
  const fetchingBuy = fetchingPools;
  const sellError = poolsError;
  const buyError = poolsError;
  const sellErrorObj = poolsErrorObj;
  const buyErrorObj = poolsErrorObj;
  
  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
  const unwrapFee = premiumData?.unwrapFeePerThousand ?? FRBTC_UNWRAP_FEE_PER_1000;

  // Find direct pool for the pair upfront so we can subscribe to its live state
  // outside of queryFn (hook order must be stable). Multi-hop quotes still rely
  // on the cached markets reserves — they're a preview only, the actual
  // amount_out_min is recomputed in useSwapMutation right before submit.
  const directPool = useMemo(() => {
    if (!sellPairs?.length) return undefined;
    return sellPairs.find(p =>
      (p.token0.id === sellCurrencyId && p.token1.id === buyCurrencyId) ||
      (p.token0.id === buyCurrencyId && p.token1.id === sellCurrencyId),
    );
  }, [sellPairs, sellCurrencyId, buyCurrencyId]);

  // Live reserves for the direct pool. Only polls while the user has typed an
  // amount (avoids background traffic when the swap form is idle). HeightPoller
  // also invalidates this on every new block.
  const hasAmount = !!debouncedAmount && parseFloat(debouncedAmount) > 0;
  const liveDirect = usePoolStateLive(directPool?.id, {
    enabled: !!directPool && hasAmount,
  });
  const liveReserve0 = liveDirect.data?.reserve0;
  const liveReserve1 = liveDirect.data?.reserve1;

  return useQuery<SwapQuote>({
    queryKey: [
      'swap-quotes',
      direction,
      sellCurrencyId,
      buyCurrencyId,
      debouncedAmount,
      sellPairs,
      buyPairs,
      maxSlippage,
      wrapFee,
      unwrapFee,
      liveReserve0,
      liveReserve1,
    ],
    enabled: !!sellCurrencyId && !!buyCurrencyId && isInitialized && !!provider,
    queryFn: async () => {
      // Short-circuit: direct BTC ↔ frBTC wrap/unwrap (no AMM)
      const isDirectWrap = sellCurrency === 'btc' && buyCurrency === FRBTC_ALKANE_ID;
      const isDirectUnwrap = sellCurrency === FRBTC_ALKANE_ID && buyCurrency === 'btc';

      const amtNum = parseFloat(debouncedAmount);
      if (isDirectWrap || isDirectUnwrap) {
        if (!debouncedAmount || !Number.isFinite(amtNum) || amtNum === 0) {
          return {
            direction,
            inputAmount: debouncedAmount,
            buyAmount: '0',
            sellAmount: '0',
            exchangeRate: '0',
            minimumReceived: '0',
            maximumSent: '0',
            displayBuyAmount: '0',
            displaySellAmount: '0',
            displayMinimumReceived: '0',
            displayMaximumSent: '0',
            route: [isDirectWrap ? 'wrap' : 'unwrap'],
            hops: 0,
          } as SwapQuote;
        }

        const amountInAlks = toAlks(debouncedAmount);
        let buyAmount: string;
        let sellAmount: string;

        if (direction === 'sell') {
          // Input is the sell side
          const inAlks = Number(amountInAlks);
          if (isDirectWrap) {
            const out = Math.floor((inAlks * (1000 - wrapFee)) / 1000);
            sellAmount = amountInAlks;
            buyAmount = out.toString();
          } else {
            // direct unwrap sell frBTC
            const out = Math.floor((inAlks * (1000 - unwrapFee)) / 1000);
            sellAmount = amountInAlks;
            buyAmount = out.toString();
          }
        } else {
          // Input is the buy side
          const outAlks = Number(amountInAlks);
          if (isDirectWrap) {
            // Need to wrap enough BTC to receive outAlks frBTC after fee
            const requiredIn = Math.ceil((outAlks * 1000) / (1000 - wrapFee));
            buyAmount = amountInAlks;
            sellAmount = requiredIn.toString();
          } else {
            // direct unwrap buy BTC
            const requiredIn = Math.ceil((outAlks * 1000) / (1000 - unwrapFee));
            buyAmount = amountInAlks;
            sellAmount = requiredIn.toString();
          }
        }

        const exchangeRate = new BigNumber(buyAmount || '0').dividedBy(sellAmount || '1').toString();
        const minimumReceived = calculateMinimumFromSlippage({ amount: buyAmount, maxSlippage });
        const maximumSent = calculateMaximumFromSlippage({ amount: sellAmount, maxSlippage });

        return {
          direction,
          inputAmount: debouncedAmount,
          buyAmount,
          sellAmount: direction !== 'sell' ? maximumSent : sellAmount,
          exchangeRate,
          minimumReceived,
          maximumSent,
          displayBuyAmount: fromAlks(buyAmount),
          displaySellAmount: direction !== 'sell' ? fromAlks(maximumSent) : fromAlks(sellAmount),
          displayMinimumReceived: fromAlks(minimumReceived),
          displayMaximumSent: fromAlks(maximumSent),
          route: [isDirectWrap ? 'wrap' : 'unwrap'],
          hops: 0,
        } as SwapQuote;
      }

      if (fetchingSell || fetchingBuy) {
        return {
          direction,
          inputAmount: amount,
          buyAmount: '0',
          sellAmount: '0',
          exchangeRate: '0',
          minimumReceived: '0',
          maximumSent: '0',
          displayBuyAmount: '0',
          displaySellAmount: '0',
          displayMinimumReceived: '0',
          displayMaximumSent: '0',
        } as SwapQuote;
      }
      if (!sellPairs?.length || !buyPairs?.length) {
        return {
          direction,
          inputAmount: amount,
          buyAmount: '0',
          sellAmount: '0',
          exchangeRate: '0',
          minimumReceived: '0',
          maximumSent: '0',
          displayBuyAmount: '0',
          displaySellAmount: '0',
          displayMinimumReceived: '0',
          displayMaximumSent: '0',
          error: 'POOL_NOT_FOUND',
        } as SwapQuote;
      }

      // Log pool discovery for debugging
      // DIAGNOSTIC disabled — re-render spam
      // console.log('[useSwapQuotes] Looking for direct pool:', { sellCurrencyId, buyCurrencyId });

      const direct = directPool;
      // console.log('[useSwapQuotes] Direct pool found:', direct ? { poolId: direct.poolId, token0: direct.token0.id, token1: direct.token1.id } : 'NONE');
      if (direct) {
        const ammQuote = await calculateSwapPrice(
          sellCurrencyId,
          buyCurrencyId,
          debouncedAmount,
          direction,
          maxSlippage,
          direct,
          provider,
          wrapFee,
          unwrapFee,
          sellCurrency,
          buyCurrency,
          liveDirect.data,
        );

        // Check if Universal Router offers a better price (hybrid CLOB+AMM).
        // Router Quote opcode 2 compares CLOB orderbook vs AMM pool and returns
        // the best output amount + source flag (1=CLOB, 0=AMM).
        const config = getConfig(network);
        const routerId = (config as any).UNIVERSAL_ROUTER_ID as string | undefined;

        if (routerId && direction === 'sell') {
          try {
            const amountInAlks = toAlks(debouncedAmount);
            const routerResult = await fetchRouterQuote(
              network, routerId, sellCurrencyId, buyCurrencyId, amountInAlks,
            );

            if (routerResult && routerResult.amountOut !== '0') {
              const routerOut = new BigNumber(routerResult.amountOut);
              const ammOut = new BigNumber(ammQuote.buyAmount);

              // console.log('[useSwapQuotes] Router quote:', routerResult.amountOut, 'via', routerResult.source);
              // console.log('[useSwapQuotes] AMM quote:', ammQuote.buyAmount);

              if (routerOut.gt(ammOut)) {
                // Router found a better price (likely CLOB has a tighter spread)
                const minReceived = calculateMinimumFromSlippage({ amount: routerResult.amountOut, maxSlippage });
                // console.log('[useSwapQuotes] Router wins — using', routerResult.source, 'route');
                return {
                  ...ammQuote,
                  buyAmount: routerResult.amountOut,
                  displayBuyAmount: fromAlks(routerResult.amountOut),
                  minimumReceived: minReceived,
                  displayMinimumReceived: fromAlks(minReceived),
                  exchangeRate: new BigNumber(routerResult.amountOut).dividedBy(ammQuote.sellAmount || '1').toString(),
                  routeSource: routerResult.source,
                } as SwapQuote;
              }
            }
          } catch (err) {
            console.warn('[useSwapQuotes] Router quote failed, falling back to AMM:', err);
          }
        }

        return { ...ammQuote, routeSource: 'amm' as const } as SwapQuote;
      }

      // BUSD bridge route
      const sellToBusd = sellPairs.find(
        (p: any) => p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID,
      );
      const buyToBusd = buyPairs.find(
        (p: any) => p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID,
      );
      
      // frBTC bridge route
      const sellToFrbtc = sellPairs.find(
        (p: any) => p.token0.id === FRBTC_ALKANE_ID || p.token1.id === FRBTC_ALKANE_ID,
      );
      const buyToFrbtc = buyPairs.find(
        (p: any) => p.token0.id === FRBTC_ALKANE_ID || p.token1.id === FRBTC_ALKANE_ID,
      );
      
      // Try both bridge routes and compare
      const routes: SwapQuote[] = [];
      
      // Calculate BUSD bridge route
      if (sellToBusd && buyToBusd) {
        const mid = BUSD_ALKANE_ID;
        if (direction === 'sell') {
          try {
            const firstHop = await calculateSwapPrice(
              sellCurrencyId,
              mid,
              debouncedAmount,
              'sell',
              maxSlippage,
              sellToBusd,
              provider,
              wrapFee,
              unwrapFee,
              sellCurrency,
            );
            const secondHop = await calculateSwapPrice(
              mid,
              buyCurrencyId,
              firstHop.displayBuyAmount,
              'sell',
              maxSlippage,
              buyToBusd,
              provider,
              wrapFee,
              unwrapFee,
              undefined,
              buyCurrency,
            );
            const overallSellAmount = toAlks(debouncedAmount);
            const overallExchangeRate = new BigNumber(secondHop.buyAmount || '0').dividedBy(overallSellAmount || '1').toString();
            routes.push({ ...secondHop, sellAmount: overallSellAmount, displaySellAmount: fromAlks(overallSellAmount), exchangeRate: overallExchangeRate, direction: 'sell', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
          } catch (e) {
            console.warn('BUSD bridge route failed:', e);
          }
        } else {
          try {
            const secondHop = await calculateSwapPrice(
              mid,
              buyCurrencyId,
              debouncedAmount,
              'buy',
              maxSlippage,
              buyToBusd,
              provider,
              wrapFee,
              unwrapFee,
              undefined,
              buyCurrency,
            );
            const firstHop = await calculateSwapPrice(
              sellCurrencyId,
              mid,
              secondHop.displaySellAmount,
              'buy',
              maxSlippage,
              sellToBusd,
              provider,
              wrapFee,
              unwrapFee,
              sellCurrency,
            );
            const overallBuyAmount = toAlks(debouncedAmount);
            const overallExchangeRate = new BigNumber(overallBuyAmount || '0').dividedBy(firstHop.sellAmount || '1').toString();
            routes.push({ ...firstHop, buyAmount: overallBuyAmount, displayBuyAmount: fromAlks(overallBuyAmount), exchangeRate: overallExchangeRate, direction: 'buy', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
          } catch (e) {
            console.warn('BUSD bridge route failed:', e);
          }
        }
      }
      
      // Calculate frBTC bridge route
      if (sellToFrbtc && buyToFrbtc) {
        const mid = FRBTC_ALKANE_ID;
        if (direction === 'sell') {
          try {
            const firstHop = await calculateSwapPrice(
              sellCurrencyId,
              mid,
              debouncedAmount,
              'sell',
              maxSlippage,
              sellToFrbtc,
              provider,
              wrapFee,
              unwrapFee,
              sellCurrency,
            );
            const secondHop = await calculateSwapPrice(
              mid,
              buyCurrencyId,
              firstHop.displayBuyAmount,
              'sell',
              maxSlippage,
              buyToFrbtc,
              provider,
              wrapFee,
              unwrapFee,
              undefined,
              buyCurrency,
            );
            const overallSellAmount = toAlks(debouncedAmount);
            const overallExchangeRate = new BigNumber(secondHop.buyAmount || '0').dividedBy(overallSellAmount || '1').toString();
            routes.push({ ...secondHop, sellAmount: overallSellAmount, displaySellAmount: fromAlks(overallSellAmount), exchangeRate: overallExchangeRate, direction: 'sell', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
          } catch (e) {
            console.warn('frBTC bridge route failed:', e);
          }
        } else {
          try {
            const secondHop = await calculateSwapPrice(
              mid,
              buyCurrencyId,
              debouncedAmount,
              'buy',
              maxSlippage,
              buyToFrbtc,
              provider,
              wrapFee,
              unwrapFee,
              undefined,
              buyCurrency,
            );
            const firstHop = await calculateSwapPrice(
              sellCurrencyId,
              mid,
              secondHop.displaySellAmount,
              'buy',
              maxSlippage,
              sellToFrbtc,
              provider,
              wrapFee,
              unwrapFee,
              sellCurrency,
            );
            const overallBuyAmount = toAlks(debouncedAmount);
            const overallExchangeRate = new BigNumber(overallBuyAmount || '0').dividedBy(firstHop.sellAmount || '1').toString();
            routes.push({ ...firstHop, buyAmount: overallBuyAmount, displayBuyAmount: fromAlks(overallBuyAmount), exchangeRate: overallExchangeRate, direction: 'buy', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
          } catch (e) {
            console.warn('frBTC bridge route failed:', e);
          }
        }
      }
      
      // Return best route (highest output for sell, lowest input for buy)
      if (routes.length > 0) {
        if (direction === 'sell') {
          // Find route with highest buyAmount
          return routes.reduce((best, curr) => 
            new BigNumber(curr.buyAmount).gt(best.buyAmount) ? curr : best
          );
        } else {
          // Find route with lowest sellAmount
          return routes.reduce((best, curr) => 
            new BigNumber(curr.sellAmount).lt(best.sellAmount) ? curr : best
          );
        }
      }

      return {
        direction,
        inputAmount: amount,
        buyAmount: '0',
        sellAmount: '0',
        exchangeRate: '0',
        minimumReceived: '0',
        maximumSent: '0',
        displayBuyAmount: '0',
        displaySellAmount: '0',
        displayMinimumReceived: '0',
        displayMaximumSent: '0',
        error: 'NO_ROUTE_FOUND',
      } as SwapQuote;
    },
  });
}


