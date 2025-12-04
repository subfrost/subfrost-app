import { useQuery } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useDebounce } from 'use-debounce';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesTokenPairs, type AlkanesTokenPair } from '@/hooks/useAlkanesTokenPairs';
import { queryPoolFeeWithProvider } from '@/hooks/usePoolFee';
import { FRBTC_UNWRAP_FEE_PER_1000, FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { calculateMaximumFromSlippage, calculateMinimumFromSlippage } from '@/utils/amm';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';

type Direction = 'buy' | 'sell';

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

const swapCalculateOut = ({
  amountIn,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountIn: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountIn <= 0) throw new Error('INSUFFICIENT_INPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = amountIn * (1 - feePercentage);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return Math.floor(numerator / denominator);
};

const swapCalculateIn = ({
  amountOut,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountOut: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountOut <= 0) throw new Error('INSUFFICIENT_OUTPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  if (amountOut >= reserveOut) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = (amountOut * reserveIn) / (reserveOut - amountOut);
  const amountIn = amountInWithFee / (1 - feePercentage);
  return Math.ceil(amountIn);
};

// WebProvider type for the function signature
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

async function calculateSwapPrice(
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
  pool: AlkanesTokenPair,
  provider: WebProvider | null,
  wrapFee: number = FRBTC_WRAP_FEE_PER_1000,
  unwrapFee: number = FRBTC_UNWRAP_FEE_PER_1000,
) {
  const poolFee = await queryPoolFeeWithProvider(provider, pool.poolId);
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
  const reserveIn = isSellToken0 ? Number(pool?.token0.token0Amount) : Number(pool?.token1.token1Amount);
  const reserveOut = isSellToken0 ? Number(pool?.token1.token1Amount) : Number(pool?.token0.token0Amount);

  if (direction === 'sell') {
    let amountIn = Number(amountInAlks);
    if (sellCurrency === 'btc') {
      amountIn = (amountIn * (1000 - wrapFee)) / 1000;
    }
    let calculatedOut = swapCalculateOut({ amountIn, reserveIn, reserveOut, feePercentage: poolFee });
    if (buyCurrency === 'btc') {
      calculatedOut = (calculatedOut * (1000 - unwrapFee)) / 1000;
    }
    sellAmount = amountInAlks;
    buyAmount = calculatedOut.toString();
  } else {
    let amountOut = Number(amountInAlks);
    if (buyCurrency === 'btc') {
      amountOut = (amountOut * (1000 + unwrapFee)) / 1000;
    }
    let calculatedIn = swapCalculateIn({ amountOut, reserveIn, reserveOut, feePercentage: poolFee });
    if (sellCurrency === 'btc') {
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

  const { data: sellPairs, isFetching: fetchingSell } = useAlkanesTokenPairs(sellCurrencyId);
  const { data: buyPairs, isFetching: fetchingBuy } = useAlkanesTokenPairs(buyCurrencyId);
  
  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
  const unwrapFee = premiumData?.unwrapFeePerThousand ?? FRBTC_UNWRAP_FEE_PER_1000;

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

      const direct = sellPairs.find(
        (p: any) =>
          (p.token0.id === sellCurrencyId && p.token1.id === buyCurrencyId) ||
          (p.token0.id === buyCurrencyId && p.token1.id === sellCurrencyId),
      );
      if (direct) {
        return calculateSwapPrice(
          sellCurrencyId,
          buyCurrencyId,
          debouncedAmount,
          direction,
          maxSlippage,
          direct,
          provider,
          wrapFee,
          unwrapFee,
        );
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
            );
            routes.push({ ...secondHop, direction: 'sell', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
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
            );
            routes.push({ ...firstHop, direction: 'buy', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
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
            );
            routes.push({ ...secondHop, direction: 'sell', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
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
            );
            routes.push({ ...firstHop, direction: 'buy', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote);
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


