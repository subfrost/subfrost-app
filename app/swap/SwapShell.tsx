"use client";

import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
import type { PoolSummary, SelectedOrder, TokenMeta } from "./types";
import type { TokenOption } from "@/app/components/TokenSelectorModal";
import type { LPPosition } from "./components/LiquidityInputs";
import { useNotification } from "@/context/NotificationContext";

// Critical path imports - needed immediately
import { useSwapQuotes } from "@/hooks/useSwapQuotes";
import { useSwapMutation } from "@/hooks/useSwapMutation";
import { useWallet } from "@/context/WalletContext";
import { getConfig, getRpcUrl } from "@/utils/getConfig";
// useSellableCurrencies removed — used alkanes_protorunesbyaddress (30s).
// Now reuses walletBalances.alkanes from useEnrichedWalletData (~1s, already cached).
import { useEnrichedWalletData } from "@/hooks/useEnrichedWalletData";
import { usePendingTxs } from "@/hooks/usePendingTxs";
import { useGlobalStore } from "@/stores/global";
import { useFeeRate } from "@/hooks/useFeeRate";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { usePools } from "@/hooks/usePools";
import { useAllPoolStats } from "@/hooks/usePoolData";
import { pickPositive } from "@/lib/pools/mergeStats";
import { useModalStore } from "@/stores/modals";
import BigNumber from 'bignumber.js';
import { useWrapMutation } from "@/hooks/useWrapMutation";
import { useUnwrapMutation } from "@/hooks/useUnwrapMutation";
import { useWrapZecMutation } from "@/hooks/useWrapZecMutation";
import { useUnwrapZecMutation } from "@/hooks/useUnwrapZecMutation";
import { useWrapEthMutation } from "@/hooks/useWrapEthMutation";
import { useUnwrapEthMutation } from "@/hooks/useUnwrapEthMutation";
import { useBridgeEthMutation } from "@/hooks/useBridgeEthMutation";
import { useBridgeZecMutation } from "@/hooks/useBridgeZecMutation";
import { useFrbtcPremium } from "@/hooks/useFrbtcPremium";
import { FRBTC_WRAP_FEE_PER_1000 } from "@/constants/alkanes";
import { useAddLiquidityMutation } from "@/hooks/useAddLiquidityMutation";
import { useAtomicWrapSwapMutation } from "@/hooks/useAtomicWrapSwapMutation";
import { useAtomicWrapAddLiquidityMutation } from "@/hooks/useAtomicWrapAddLiquidityMutation";
import { useTokenToBtcSwap } from "@/hooks/useTokenToBtcSwap";
import { getEsploraTx, getHeight } from "@/lib/alkanes/rpc";
import { useMatchedLpPool } from "@/hooks/useMatchedLpPool";
import { usePoolStateLive } from "@/hooks/usePoolStateLive";
import { computePairedLpAmount, computeRemoveLiquidityMinAmounts } from "@/lib/alkanes/liquidity-math";
import { useTokenNames, resolveTokenDisplay } from "@/hooks/useTokenNames";
import { useRemoveLiquidityMutation } from "@/hooks/useRemoveLiquidityMutation";
import { useLPPositions } from "@/hooks/useLPPositions";
import { useTranslation } from '@/hooks/useTranslation';
import { KNOWN_TOKENS } from "@/lib/alkanes-client";

// New unified layout components
import TradeForm, { type OrderType } from "./components/TradeForm";
import BottomPanels from "./components/BottomPanels";
import MobileDataPanels from "./components/MobileDataPanels";
import { consumeSwapIntent } from "./swapPair";

// Lazy loaded components - split into separate chunks
const PoolDetailsCard = lazy(() => import("./components/PoolDetailsCard"));
const SwapSummary = lazy(() => import("./components/SwapSummary"));
const TokenSelectorModal = lazy(() => import("@/app/components/TokenSelectorModal"));
const LPPositionSelectorModal = lazy(() => import("./components/LPPositionSelectorModal"));
const TransactionStepper = lazy(() => import("./components/TransactionStepper"));
const OrderbookPanel = lazy(() => import("./components/OrderbookPanel"));

// Types for multi-step swap flow state machine
// JOURNAL (2026-03-15): Added to provide clear UX feedback during BTC→Token and Token→BTC swaps.
// These flows require two sequential transactions due to UTXO dependency chain.
type SwapFlowStep =
  | { type: 'idle' }
  | { type: 'wrapping'; }
  | { type: 'wrap-confirming'; txId: string; attempt: number; maxAttempts: number }
  | { type: 'swapping' }
  | { type: 'swap-confirming'; txId: string; attempt: number; maxAttempts: number }
  | { type: 'swap-indexing'; txId: string; wrapTxId?: string }
  | { type: 'unwrapping' }
  | { type: 'unwrap-confirming'; txId: string; attempt: number; maxAttempts: number; swapTxId?: string }
  | { type: 'unwrap-indexing'; txId: string; swapTxId?: string }
  | { type: 'complete'; wrapTxId?: string; swapTxId?: string; unwrapTxId?: string }
  | { type: 'error'; step: 'wrap' | 'swap' | 'unwrap'; message: string; wrapTxId?: string; swapTxId?: string };

/** Get the human-readable bridge route for a cross-chain pair. */
function getBridgeRoute(from: string, to: string): string {
  const routes: Record<string, string> = {
    'btc-eth': 'BTC → frBTC → frETH → ETH',
    'eth-btc': 'ETH → frETH → frBTC → BTC',
    'btc-zec': 'BTC → frBTC → frZEC → ZEC',
    'zec-btc': 'ZEC → frZEC → frBTC → BTC',
    'eth-zec': 'ETH → frETH → frBTC → frZEC → ZEC',
    'zec-eth': 'ZEC → frZEC → frBTC → frETH → ETH',
  };
  return routes[`${from}-${to}`] || `${from.toUpperCase()} → ${to.toUpperCase()}`;
}

export default function SwapShell() {
  const { t } = useTranslation();

  // Markets from API: all pools sorted by TVL desc
  const { data: poolsData, isLoading: isLoadingPools } = usePools({ sortBy: 'tvl', order: 'desc' });

  // Enhanced pool stats from our local API (TVL, Volume, APR)
  const { data: poolStats, isLoading: isLoadingPoolStats } = useAllPoolStats();

  // Merge pool data with stats from /api/pools/stats (fallback for any missing data)
  const markets = useMemo<PoolSummary[]>(() => {
    const basePools = poolsData?.items ?? [];

    // If poolStats available, use as fallback overlay
    const statsMap = new Map<string, NonNullable<typeof poolStats>[string]>();
    if (poolStats) {
      for (const [, stats] of Object.entries(poolStats)) {
        statsMap.set(stats.poolId, stats);
      }
    }

    return basePools.map(pool => {
      const stats = statsMap.get(pool.id);

      // pickPositive (not `||`) so a `0` from the primary `pool` doesn't
      // short-circuit the stats overlay. Same rationale as TrendingPairs —
      // see lib/pools/mergeStats.ts header. The token0/token1 split keeps
      // its existing fallback to `pool.tvlUsd / 2` for symmetry, but uses
      // pickPositive on the merged tvl too.
      const mergedTvl = pickPositive(pool.tvlUsd, stats?.tvlUsd);
      return {
        ...pool,
        tvlUsd: mergedTvl,
        token0TvlUsd: pickPositive(pool.token0TvlUsd, stats?.tvlToken0, mergedTvl / 2),
        token1TvlUsd: pickPositive(pool.token1TvlUsd, stats?.tvlToken1, mergedTvl / 2),
        vol24hUsd: pickPositive(pool.vol24hUsd, stats?.volume24hUsd),
        vol30dUsd: pickPositive(pool.vol30dUsd, stats?.volume30dUsd),
        apr: pickPositive(pool.apr, stats?.apr),
      } as PoolSummary;
    });
  }, [poolsData?.items, poolStats]);

  const marketType = 'spot' as const;

  // Order type drives the desktop left panel default: market/liquidity → chart, limit → orderbook.
  // Users can still manually flip the panel via the Chart / Order Book buttons.
  const [orderType, setOrderType] = useState<OrderType>('market');

  // Order selected from the orderbook. Clicking a row jumps to the limit tab and
  // populates price/amount/side. A fresh object reference per click ensures
  // re-clicking the same row re-syncs the inputs in LimitOrderPanel.
  const [limitSelectedOrder, setLimitSelectedOrder] = useState<SelectedOrder | undefined>();
  const handleOrderbookSelect = (order: SelectedOrder) => {
    setLimitSelectedOrder(order);
    setOrderType('limit');
  };
  const [desktopLeftView, setDesktopLeftView] = useState<'chart' | 'orderbook'>('chart');
  useEffect(() => {
    setDesktopLeftView(orderType === 'limit' ? 'orderbook' : 'chart');
  }, [orderType]);

  // Liquidity mode state
  const [liquidityMode, setLiquidityMode] = useState<'provide' | 'remove'>('provide');

  // Swap state (selectedPool will be initialized to top volume pool below)
  const [selectedPool, setSelectedPool] = useState<PoolSummary | undefined>();
  const [fromToken, setFromToken] = useState<TokenMeta | undefined>();
  const [toToken, setToToken] = useState<TokenMeta | undefined>();
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [direction, setDirection] = useState<'sell' | 'buy'>('sell');

  // Ethereum address for cross-chain swaps
  const [ethereumAddress, setEthereumAddress] = useState<string>("");

  // LP state
  const [poolToken0, setPoolToken0] = useState<TokenMeta | undefined>();
  const [poolToken1, setPoolToken1] = useState<TokenMeta | undefined>();
  const [poolToken0Amount, setPoolToken0Amount] = useState<string>("");
  const [poolToken1Amount, setPoolToken1Amount] = useState<string>("");
  // Which side the user typed last — drives auto-recalculation of the paired
  // amount when live reserves change. `null` = neither (no recompute).
  const [lpTypedSide, setLpTypedSide] = useState<0 | 1 | null>(null);
  const [selectedLPPosition, setSelectedLPPosition] = useState<LPPosition | null>(null);
  const [isLPSelectorOpen, setIsLPSelectorOpen] = useState(false);
  const [removeAmount, setRemoveAmount] = useState<string>("");

  // Live pool state for the selected LP position. Polls /get-pool-details every
  // 5s and on every block (HeightPoller). Used to compute slippage-protected
  // min amounts against the *current* indexer snapshot rather than the bulk
  // markets cache (~30s aggregate). Only enabled once the user has typed an
  // amount — no point polling while the form is idle.
  const removeLpLiveState = usePoolStateLive(selectedLPPosition?.id, {
    enabled: !!selectedLPPosition && !!removeAmount && parseFloat(removeAmount) > 0,
  });

  // Multi-step swap flow state (BTC→Token, Token→BTC)
  // JOURNAL (2026-03-15): Added to track progress and show TransactionStepper UI
  const [swapFlowStep, setSwapFlowStep] = useState<SwapFlowStep>({ type: 'idle' });

  // Bundle-progress tracking for the BTC→Token atomic split-tx (CPFP)
  // flow. The SDK builds and broadcasts Tx A (wrap) and Tx B (execute)
  // sequentially inside one `executeAtomicSwap` call — during that
  // window the JS side has no signal that Tx A is already in mempool
  // and the stepper would otherwise show Step 2 as "Broadcasting…" for
  // the entire 1-30s the SDK takes to broadcast both.
  //
  // We poll `usePendingTxs` (which merges IDB + WASM-side mempool) and
  // count how many of *our* pending txs were added since the swap
  // started. The atomic await is still the source of truth for
  // success/error; the polling just upgrades the visible state from
  // "Broadcasting…" to "Awaiting confirmation…" the moment Tx A lands
  // in mempool, and again when Tx B does. CPFP guarantees they confirm
  // in the same block, so a separate per-tx confirmation poll isn't
  // useful here.
  const { pendingTxs } = usePendingTxs();
  const bundleStartCountRef = useRef<number | null>(null);

  // Watch the pending count while a BTC→Token atomic swap is in flight.
  // Count goes from baseline to baseline+1 (Tx A in mempool) → upgrade
  // Step 1 to "confirming". From baseline+1 to baseline+2 (Tx B in
  // mempool) → upgrade Step 2 to "confirming" too. The atomic await
  // resolving will overwrite to 'complete'.
  //
  // The gate accepts both 'swapping' (initial) and 'wrap-confirming'
  // (after we've already detected Tx A) so the second-tx detection
  // can still fire. 'swap-confirming' / 'complete' / 'error' /
  // 'idle' all stop the loop.
  useEffect(() => {
    // Clear the baseline when we leave the watched window so the
    // count delta from a previous swap can't leak into the next.
    if (
      swapFlowStep.type === 'idle' ||
      swapFlowStep.type === 'complete' ||
      swapFlowStep.type === 'error'
    ) {
      bundleStartCountRef.current = null;
      return;
    }
    if (
      swapFlowStep.type !== 'swapping' &&
      swapFlowStep.type !== 'wrap-confirming'
    ) return;
    if (bundleStartCountRef.current == null) return;
    const newlyPending = pendingTxs.length - bundleStartCountRef.current;
    if (newlyPending >= 2) {
      // Both Tx A and Tx B are in our mempool view. CPFP-chained, will
      // confirm together. Upgrade to swap-confirming so the stepper's
      // Step 2 stops claiming "Broadcasting…" and shows "Awaiting
      // confirmation…" instead.
      const lastTwo = pendingTxs.slice(-2);
      setSwapFlowStep({
        type: 'swap-confirming',
        txId: lastTwo[1]?.txid ?? lastTwo[0]?.txid ?? '',
        attempt: 1,
        // Bound the visible progress bar to mainnet block target. We
        // don't actually wait this long — the next state transition
        // (to 'complete') happens when executeAtomicSwap resolves.
        maxAttempts: 60,
      });
    } else if (newlyPending >= 1) {
      // Tx A is in mempool. Surface that to the user — still in the
      // 'wrap-confirming' shape so Step 1 turns into a confirming
      // indicator while Step 2 stays "loading" until Tx B lands.
      const last = pendingTxs[pendingTxs.length - 1];
      setSwapFlowStep({
        type: 'wrap-confirming',
        txId: last?.txid ?? '',
        attempt: 1,
        maxAttempts: 60,
      });
    }
  }, [pendingTxs, swapFlowStep.type]);

  // LP positions from wallet (real data from useLPPositions hook)
  const { positions: lpPositions, isLoading: isLoadingLPPositions } = useLPPositions();

  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector } = useModalStore();
  const { showNotification, showError } = useNotification();
  const { data: btcPrice } = useBtcPrice();

  const sellId = fromToken?.id ?? '';
  const buyId = toToken?.id ?? '';
  const { data: quote, isFetching: isCalculating } = useSwapQuotes(
    sellId,
    buyId,
    direction === 'sell' ? fromAmount : toAmount,
    direction,
    maxSlippage,
  );
  const swapMutation = useSwapMutation();
  const wrapMutation = useWrapMutation();
  const unwrapMutation = useUnwrapMutation();
  const wrapZecMutation = useWrapZecMutation();
  const unwrapZecMutation = useUnwrapZecMutation();
  const wrapEthMutation = useWrapEthMutation();
  const unwrapEthMutation = useUnwrapEthMutation();
  const { bridgeToEth } = useBridgeEthMutation();
  const { bridgeToZec } = useBridgeZecMutation();
  const addLiquidityMutation = useAddLiquidityMutation();
  const removeLiquidityMutation = useRemoveLiquidityMutation();
  const { executeAtomicSwap } = useAtomicWrapSwapMutation();
  const { executeAtomicAddLiquidity } = useAtomicWrapAddLiquidityMutation();
  const { executeTokenToBtcSwap } = useTokenToBtcSwap();
  const { data: premiumData } = useFrbtcPremium();

  // Wallet/config
  const { address, network } = useWallet();
  const config = getConfig(network);
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = config;
  const FRZEC_ALKANE_ID = (config as any).FRZEC_ALKANE_ID as string | undefined;
  const FRETH_ALKANE_ID = (config as any).FRETH_ALKANE_ID as string | undefined;
  const FIRE_TOKEN_ID = (config as any).FIRE_TOKEN_ID as string | undefined;
  const FRUSD_TOKEN_ID = (config as any).FRUSD_TOKEN_ID as string | undefined;
  const VOLBTC_POOL_ID = (config as any).DXBTC_NORMAL_POOL_ID as string | undefined;

  // Wallet balances — single source for BTC + alkanes across swap page
  const { balances: walletBalances, btcFast, isAlkanesLoading, refresh: refreshWalletData } = useEnrichedWalletData();

  // Protocol tokens that should always appear in the token selector
  const protocolTokens = useMemo(() => {
    const tokens: { id: string; symbol: string; name: string }[] = [];
    if (FIRE_TOKEN_ID) tokens.push({ id: FIRE_TOKEN_ID, symbol: 'FIRE', name: 'FIRE Token' });
    if (FRUSD_TOKEN_ID) tokens.push({ id: FRUSD_TOKEN_ID, symbol: 'frUSD', name: 'frUSD Stablecoin' });
    if (VOLBTC_POOL_ID) tokens.push({ id: VOLBTC_POOL_ID, symbol: 'volBTC', name: 'volBTC Pool' });
    return tokens;
  }, [FIRE_TOKEN_ID, FRUSD_TOKEN_ID, VOLBTC_POOL_ID]);

  // User tokens — reuse alkane balances from useEnrichedWalletData (already cached, ~1s).
  // Previously used useSellableCurrencies → alkanes_protorunesbyaddress (30s).
  const userCurrencies = useMemo(() => {
    if (!walletBalances?.alkanes) return [];
    return walletBalances.alkanes.map((alkane: any) => ({
      id: alkane.alkaneId,
      name: alkane.name,
      symbol: alkane.symbol,
      balance: alkane.balance,
      priceUsd: alkane.priceUsd,
    }));
  }, [walletBalances?.alkanes]);

  const idToUserCurrency = useMemo(() => {
    const map = new Map<string, any>();
    userCurrencies.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [userCurrencies]);

  // Wallet-independent token prices derived from pool TVL/reserves.
  // Espo's per-token priceUsd (used by idToUserCurrency) is only available
  // when a wallet is connected, so input fields would show $0.00 for any
  // alkane until connect. `markets` is wallet-independent — derive a price
  // from each pool's token{0,1}TvlUsd / (amount / 10^decimals). Pools are
  // sorted by TVL desc, so first-found wins (highest-liquidity pool).
  const derivedTokenPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const pool of markets) {
      const entries: Array<{ id?: string; amount?: string; tvlUsd?: number }> = [
        { id: pool.token0?.id, amount: (pool as any).token0Amount, tvlUsd: pool.token0TvlUsd },
        { id: pool.token1?.id, amount: (pool as any).token1Amount, tvlUsd: pool.token1TvlUsd },
      ];
      for (const { id, amount, tvlUsd } of entries) {
        if (!id || !amount || !tvlUsd || tvlUsd <= 0) continue;
        if (map.has(id)) continue;
        const decimals = KNOWN_TOKENS[id]?.decimals ?? 8;
        const denom = Number(amount) / 10 ** decimals;
        if (!Number.isFinite(denom) || denom <= 0) continue;
        const price = tvlUsd / denom;
        if (Number.isFinite(price) && price > 0) map.set(id, price);
      }
    }
    return map;
  }, [markets]);

  // Independent token name source — fetches from /get-alkanes bulk API.
  // Loads independently of usePools, ensuring names are available even if pools fail.
  const { data: tokenNamesMap } = useTokenNames();

  // Build a map from tokenId to token metadata from pools data (has correct symbols)
  // Enriches numeric-named tokens using the standalone tokenNamesMap (most reliable source)
  const poolTokenMap = useMemo(() => {
    const map = new Map<string, TokenMeta>();
    markets.forEach((pool) => {
      if (!map.has(pool.token0.id)) map.set(pool.token0.id, pool.token0);
      if (!map.has(pool.token1.id)) map.set(pool.token1.id, pool.token1);
    });

    // Enrich tokens that still have numeric-only names
    const numericOnly = /^\d+$/;
    for (const [id, token] of map) {
      if (numericOnly.test(token.symbol) || (token.name && numericOnly.test(token.name))) {
        const resolved = resolveTokenDisplay(id, token.symbol, token.name, tokenNamesMap, idToUserCurrency);
        if (resolved.symbol !== token.symbol || resolved.name !== token.name) {
          map.set(id, { ...token, symbol: resolved.symbol, name: resolved.name });
        }
      }
    }

    return map;
  }, [markets, idToUserCurrency, tokenNamesMap]);

  // Find the trending pool for defaults: 24H Vol > 30D Vol > TVL
  // This matches the algorithm used by TrendingPairs component
  const topVolumePool = useMemo(() => {
    if (markets.length === 0) return undefined;

    const hasAny24hVolume = markets.some(p => (p.vol24hUsd ?? 0) > 0);
    const hasAny30dVolume = markets.some(p => (p.vol30dUsd ?? 0) > 0);

    // Sort a copy of markets by the appropriate metric
    // Use pool ID as tiebreaker to ensure stable sorting
    const sorted = [...markets].sort((a, b) => {
      let diff = 0;
      if (hasAny24hVolume) {
        diff = (b.vol24hUsd ?? 0) - (a.vol24hUsd ?? 0);
      } else if (hasAny30dVolume) {
        diff = (b.vol30dUsd ?? 0) - (a.vol30dUsd ?? 0);
      } else {
        // Final fallback to TVL
        diff = (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0);
      }
      // Stable tiebreaker: sort by pool ID if values are equal
      if (diff === 0) {
        return a.id.localeCompare(b.id);
      }
      return diff;
    });

    return sorted[0];
  }, [markets]);

  // Check if we have meaningful volume data merged into markets
  const hasVolumeDataMerged = useMemo(() => {
    return markets.some(p => (p.vol24hUsd ?? 0) > 0 || (p.vol30dUsd ?? 0) > 0);
  }, [markets]);

  // Check if poolStats actually has data (not just loaded as empty object)
  const poolStatsHasData = useMemo(() => {
    return poolStats !== undefined && Object.keys(poolStats).length > 0;
  }, [poolStats]);

  // Initialize swap tokens to the trending pair (highest volume) on every visit.
  // A saved pair is only honored as a one-shot handoff from explicit cross-page
  // navigation (e.g. HomeMarketsButton): consumeSwapIntent() reads and clears it.
  // User selections within the swap page are NOT persisted — entering /swap
  // always lands on the current trending pair.
  //
  // Two-phase approach:
  //   Phase 1 (eager): As soon as pools load, pick trending by TVL fallback.
  //     This avoids empty selectors while waiting for volume stats.
  //   Phase 2 (refined): Once volume stats arrive, re-pick trending if we used the TVL fallback.
  const trendingPoolInitializedRef = useRef(false);
  const usedSessionRef = useRef(false);

  // Immediately consume any one-shot saved intent (set by HomeMarketsButton or
  // the wallet dashboard token/position rows). No fallback to BTC/USDC or
  // anything else — undefined tokens render as "Select" until the
  // trending-pool effect below populates them.
  //
  // For 'removeLiquidity' intents we synchronously flip into the liquidity tab
  // in remove mode and stash the position id, then a useEffect below resolves
  // it against `lpPositions` once that hook has data.
  const sessionRestoredRef = useRef(false);
  const pendingPositionIdRef = useRef<string | null>(null);
  if (!sessionRestoredRef.current && !fromToken && !toToken) {
    const intent = consumeSwapIntent();
    if (intent?.kind === 'swap') {
      setFromToken(intent.from);
      setToToken(intent.to);
      sessionRestoredRef.current = true;
      usedSessionRef.current = true;
    } else if (intent?.kind === 'removeLiquidity') {
      setOrderType('liquidity');
      setLiquidityMode('remove');
      pendingPositionIdRef.current = intent.positionId;
      sessionRestoredRef.current = true;
      usedSessionRef.current = true;
    }
  }

  // Resolve a pending removeLiquidity intent once LP positions load.
  // If the position can't be found after positions finish loading, silently
  // give up — the user can pick from the LP selector themselves.
  useEffect(() => {
    if (!pendingPositionIdRef.current) return;
    if (isLoadingLPPositions) return;
    const match = lpPositions.find(p => p.id === pendingPositionIdRef.current);
    if (match) {
      setSelectedLPPosition(match);
    }
    pendingPositionIdRef.current = null;
  }, [lpPositions, isLoadingLPPositions]);

  useEffect(() => {
    if (trendingPoolInitializedRef.current) return;

    // Phase 1: need at least pools loaded with some markets
    if (isLoadingPools || markets.length === 0) return;

    // If a one-shot pair was already consumed synchronously above, attach the
    // matching pool record (if any) and mark initialized — don't override it.
    if (usedSessionRef.current && fromToken && toToken) {
      const matchingPool = markets.find(
        (p) =>
          (p.token0.id === fromToken.id && p.token1.id === toToken.id) ||
          (p.token0.id === toToken.id && p.token1.id === fromToken.id)
      );
      if (matchingPool) setSelectedPool(matchingPool);
      trendingPoolInitializedRef.current = true;
      return;
    }

    // Default: use trending (highest volume) pool — or first pool by TVL if no volume data yet
    if (topVolumePool) {
      setFromToken(topVolumePool.token0);
      setToToken(topVolumePool.token1);
      setSelectedPool(topVolumePool);
      trendingPoolInitializedRef.current = true;
    }
  }, [topVolumePool, isLoadingPools, markets, fromToken, toToken]);

  // Phase 2 (refined): Once volume stats finish loading, re-evaluate trending pool.
  // If the user restored from a one-shot handoff, skip this.
  const volumeRefinedRef = useRef(false);
  useEffect(() => {
    if (volumeRefinedRef.current || usedSessionRef.current) return;
    if (isLoadingPoolStats || !poolStatsHasData || !hasVolumeDataMerged) return;
    if (!trendingPoolInitializedRef.current || !topVolumePool) return;

    // Check if trending pool changed now that volume data is available
    if (topVolumePool.id !== selectedPool?.id) {
      setFromToken(topVolumePool.token0);
      setToToken(topVolumePool.token1);
      setSelectedPool(topVolumePool);
    }
    volumeRefinedRef.current = true;
  }, [topVolumePool, isLoadingPoolStats, poolStatsHasData, hasVolumeDataMerged, selectedPool?.id]);

  // Default LP tokens: inherit the active swap pair when the Liquidity tab
  // becomes active (e.g. swap = DIESEL/frBTC → liquidity prefills DIESEL/frBTC).
  // Falls back to frBTC + bUSD/DIESEL if no swap pair is selected. Only
  // pre-fills empty slots — preserves user's prior LP selection.
  useEffect(() => {
    if (orderType !== 'liquidity') return;

    const candidates = [fromToken, toToken].filter(Boolean) as TokenMeta[];
    const fallbackFrbtc: TokenMeta | null = FRBTC_ALKANE_ID
      ? { id: FRBTC_ALKANE_ID, symbol: 'frBTC', name: 'frBTC' }
      : null;
    const fallbackOther: TokenMeta | null = BUSD_ALKANE_ID
      ? (() => {
          const symbol = network === 'mainnet' ? 'bUSD' : 'DIESEL';
          return { id: BUSD_ALKANE_ID, symbol, name: symbol };
        })()
      : null;

    if (!poolToken0) {
      const next = candidates[0] || fallbackFrbtc;
      if (next) setPoolToken0(next);
    }
    if (!poolToken1) {
      const taken = poolToken0?.id || candidates[0]?.id;
      const next = candidates.find((c) => c.id !== taken) || fallbackOther;
      if (next) setPoolToken1(next);
    }
  }, [orderType, poolToken0, poolToken1, fromToken, toToken, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, network]);

  // Allow all tokens - no filtering
  // Base tokens - tokens that can swap with any token (BTC, frBTC, bUSD)
  // Alt tokens (including DIESEL) can only swap to/from these base tokens, not to other alts
  // DIESEL is always 2:0, so we exclude it from base tokens even if BUSD_ALKANE_ID points to it
  const DIESEL_ALKANE_ID = '2:0';
  const baseTokenIds = useMemo(() => {
    const ids = ['btc', FRBTC_ALKANE_ID];
    // Only include BUSD_ALKANE_ID if it's actual bUSD, not DIESEL
    if (BUSD_ALKANE_ID && BUSD_ALKANE_ID !== DIESEL_ALKANE_ID) {
      ids.push(BUSD_ALKANE_ID);
    }
    return new Set(ids.filter(Boolean));
  }, [FRBTC_ALKANE_ID, BUSD_ALKANE_ID]);

  // Build FROM options - show all tokens with pools (no alt-to-alt restriction)
  const fromOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    const seen = new Set<string>();
    const toId = toToken?.id;

    // Helper to check if a token should be shown (by ID and symbol)
    const shouldShowToken = (tokenId: string, symbol: string): boolean => {
      if (tokenId === toId) return false; // Can't swap from self
      return true;
    };

    // Always add BTC first (always available)
    if (shouldShowToken('btc', 'BTC')) {
      opts.push({
        id: 'btc',
        symbol: 'BTC',
        name: 'BTC',
        isAvailable: true
      });
      seen.add('btc');
    }

    // Always add frBTC (BTC <-> frBTC wrapping is always allowed)
    if (FRBTC_ALKANE_ID && shouldShowToken(FRBTC_ALKANE_ID, 'frBTC')) {
      opts.push({
        id: FRBTC_ALKANE_ID,
        symbol: 'frBTC',
        name: 'frBTC',
        isAvailable: true
      });
      seen.add(FRBTC_ALKANE_ID);
    }

    // Always add frZEC (BTC <-> frZEC wrapping via CGGMP21)
    if (FRZEC_ALKANE_ID && !seen.has(FRZEC_ALKANE_ID) && shouldShowToken(FRZEC_ALKANE_ID, 'frZEC')) {
      opts.push({
        id: FRZEC_ALKANE_ID,
        symbol: 'frZEC',
        name: 'frZEC',
        isAvailable: true
      });
      seen.add(FRZEC_ALKANE_ID);
    }

    // Always add frETH (BTC <-> frETH wrapping via FROST)
    if (FRETH_ALKANE_ID && !seen.has(FRETH_ALKANE_ID) && shouldShowToken(FRETH_ALKANE_ID, 'frETH')) {
      opts.push({
        id: FRETH_ALKANE_ID,
        symbol: 'frETH',
        name: 'frETH',
        isAvailable: true
      });
      seen.add(FRETH_ALKANE_ID);
    }

    // Add bUSD/DIESEL (available before pools load)
    if (BUSD_ALKANE_ID) {
      // Use poolTokenMap for correct symbol if available, otherwise use network-appropriate default
      const busdToken = poolTokenMap.get(BUSD_ALKANE_ID);
      const symbol = busdToken?.symbol ?? (network === 'mainnet' ? 'bUSD' : 'DIESEL');
      const name = busdToken?.name ?? symbol;
      if (shouldShowToken(BUSD_ALKANE_ID, symbol)) {
        opts.push({
          id: BUSD_ALKANE_ID,
          symbol,
          name,
          isAvailable: true
        });
        seen.add(BUSD_ALKANE_ID);
      }
    }

    // Add protocol tokens (FIRE, frUSD, volBTC) — always visible when configured
    protocolTokens.forEach((pt) => {
      if (!seen.has(pt.id) && shouldShowToken(pt.id, pt.symbol)) {
        opts.push({ id: pt.id, symbol: pt.symbol, name: pt.name, isAvailable: true });
        seen.add(pt.id);
      }
    });

    // Add tokens from pool data (only if TO is not an alt token)
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if (!seen.has(poolToken.id) && shouldShowToken(poolToken.id, poolToken.symbol)) {
        opts.push({
          ...poolToken,
          isAvailable: true
        });
        seen.add(poolToken.id);
      }
    });

    // Also add tokens from user's wallet that aren't in pools yet
    userCurrencies.forEach((currency: any) => {
      const rawSym = currency.symbol || currency.name || currency.id;
      if (!seen.has(currency.id) && shouldShowToken(currency.id, rawSym)) {
        seen.add(currency.id);
        // Resolve name now using tokenNamesMap (avoids showing numeric IDs)
        const resolved = resolveTokenDisplay(currency.id, rawSym, currency.name || currency.symbol || currency.id, tokenNamesMap);
        opts.push({
          id: currency.id,
          symbol: resolved.symbol,
          name: resolved.name,
          iconUrl: currency.iconUrl,
          isAvailable: true,
        });
      }
    });

    return opts;
  }, [poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, protocolTokens, userCurrencies, tokenNamesMap, network, toToken, baseTokenIds]);

  // Build TO options - show all tokens with pools (no alt-to-alt restriction)
  const toOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    const seen = new Set<string>();
    const fromId = fromToken?.id;

    // For BTC, also treat it as frBTC for pool lookups (BTC swaps go through frBTC)
    const fromIdForPoolLookup = fromId === 'btc' ? FRBTC_ALKANE_ID : fromId;

    // Build a set of tokens that have pools with the FROM token
    const tokensWithPoolsForFrom = new Set<string>();
    if (fromIdForPoolLookup) {
      markets.forEach((pool) => {
        if (pool.token0.id === fromIdForPoolLookup) {
          tokensWithPoolsForFrom.add(pool.token1.id);
        } else if (pool.token1.id === fromIdForPoolLookup) {
          tokensWithPoolsForFrom.add(pool.token0.id);
        }
      });
      // If FROM is BTC, frBTC pool tokens are also available via wrap
      if (fromId === 'btc' && FRBTC_ALKANE_ID) {
        tokensWithPoolsForFrom.add(FRBTC_ALKANE_ID);
      }
      // If FROM is frBTC, BTC is available via unwrap
      if (fromId === FRBTC_ALKANE_ID) {
        tokensWithPoolsForFrom.add('btc');
      }
    }

    // Helper to check if a token should be shown (by ID and symbol)
    // Build set of protocol token IDs for always-visible check
    const protocolTokenIds = new Set(protocolTokens.map(pt => pt.id));

    const shouldShowToken = (tokenId: string, symbol: string): boolean => {
      if (tokenId === fromId) return false; // Can't swap to self
      // For BTC/frBTC wrapping, always allow
      if (fromId === 'btc' && tokenId === FRBTC_ALKANE_ID) return true;
      if (fromId === FRBTC_ALKANE_ID && tokenId === 'btc') return true;
      // For BTC/frZEC wrapping, always allow
      if (FRZEC_ALKANE_ID && fromId === 'btc' && tokenId === FRZEC_ALKANE_ID) return true;
      if (FRZEC_ALKANE_ID && fromId === FRZEC_ALKANE_ID && tokenId === 'btc') return true;
      // For BTC/frETH wrapping, always allow
      if (FRETH_ALKANE_ID && fromId === 'btc' && tokenId === FRETH_ALKANE_ID) return true;
      if (FRETH_ALKANE_ID && fromId === FRETH_ALKANE_ID && tokenId === 'btc') return true;
      // Cross-chain: native ETH and ZEC are always available as destinations from BTC
      if (fromId === 'btc' && (tokenId === 'eth' || tokenId === 'zec')) return true;
      // Cross-chain: BTC is always available as destination from ETH or ZEC
      if ((fromId === 'eth' || fromId === 'zec') && tokenId === 'btc') return true;
      // Cross-chain: ETH ↔ ZEC
      if (fromId === 'eth' && tokenId === 'zec') return true;
      if (fromId === 'zec' && tokenId === 'eth') return true;
      // Always allow base tokens (BTC, frBTC, bUSD) - they show before pools load
      if (baseTokenIds.has(tokenId)) return true;
      // Always allow protocol tokens (FIRE, frUSD, volBTC) — explicitly configured as swappable
      if (protocolTokenIds.has(tokenId)) return true;
      // Always allow DIESEL/bUSD — primary gas/stable token
      if (BUSD_ALKANE_ID && tokenId === BUSD_ALKANE_ID) return true;
      // Show any token that has a pool with the FROM token
      const tokenIdForLookup = tokenId === 'btc' ? FRBTC_ALKANE_ID : tokenId;
      return tokensWithPoolsForFrom.has(tokenIdForLookup) || tokensWithPoolsForFrom.has(tokenId);
    };

    // Add BTC first (if allowed)
    if (shouldShowToken('btc', 'BTC')) {
      opts.push({
        id: 'btc',
        symbol: 'BTC',
        name: 'BTC',
        isAvailable: true
      });
      seen.add('btc');
    }

    // Add frBTC (BTC <-> frBTC wrapping is always allowed)
    if (FRBTC_ALKANE_ID && shouldShowToken(FRBTC_ALKANE_ID, 'frBTC')) {
      opts.push({
        id: FRBTC_ALKANE_ID,
        symbol: 'frBTC',
        name: 'frBTC',
        isAvailable: true
      });
      seen.add(FRBTC_ALKANE_ID);
    }

    // Add frZEC (BTC <-> frZEC wrapping via CGGMP21)
    if (FRZEC_ALKANE_ID && !seen.has(FRZEC_ALKANE_ID) && shouldShowToken(FRZEC_ALKANE_ID, 'frZEC')) {
      opts.push({
        id: FRZEC_ALKANE_ID,
        symbol: 'frZEC',
        name: 'frZEC',
        isAvailable: true
      });
      seen.add(FRZEC_ALKANE_ID);
    }

    // Add frETH (BTC <-> frETH wrapping via FROST)
    if (FRETH_ALKANE_ID && !seen.has(FRETH_ALKANE_ID) && shouldShowToken(FRETH_ALKANE_ID, 'frETH')) {
      opts.push({
        id: FRETH_ALKANE_ID,
        symbol: 'frETH',
        name: 'frETH',
        isAvailable: true
      });
      seen.add(FRETH_ALKANE_ID);
    }

    // Add bUSD if it should be shown
    if (BUSD_ALKANE_ID && !seen.has(BUSD_ALKANE_ID)) {
      const busdToken = poolTokenMap.get(BUSD_ALKANE_ID);
      // Use network-appropriate default symbol when pool data isn't loaded yet
      const defaultSymbol = network === 'mainnet' ? 'bUSD' : 'DIESEL';
      const symbol = busdToken?.symbol ?? defaultSymbol;
      if (shouldShowToken(BUSD_ALKANE_ID, symbol)) {
        opts.push({
          id: BUSD_ALKANE_ID,
          symbol,
          name: busdToken?.name ?? defaultSymbol,
          isAvailable: true
        });
        seen.add(BUSD_ALKANE_ID);
      }
    }

    // Add protocol tokens (FIRE, frUSD, volBTC) — always visible when configured
    protocolTokens.forEach((pt) => {
      if (!seen.has(pt.id) && shouldShowToken(pt.id, pt.symbol)) {
        opts.push({ id: pt.id, symbol: pt.symbol, name: pt.name, isAvailable: true });
        seen.add(pt.id);
      }
    });

    // Add remaining tokens from pool data
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if (!seen.has(poolToken.id) && shouldShowToken(poolToken.id, poolToken.symbol)) {
        opts.push({
          ...poolToken,
          isAvailable: true
        });
        seen.add(poolToken.id);
      }
    });

    // Also add tokens from user's wallet that have pools with FROM token
    userCurrencies.forEach((currency: any) => {
      const rawSym = currency.symbol || currency.name || currency.id;
      if (!seen.has(currency.id) && shouldShowToken(currency.id, rawSym)) {
        seen.add(currency.id);
        const resolved = resolveTokenDisplay(currency.id, rawSym, currency.name || currency.symbol || currency.id, tokenNamesMap);
        opts.push({
          id: currency.id,
          symbol: resolved.symbol,
          name: resolved.name,
          iconUrl: currency.iconUrl,
          isAvailable: true,
        });
      }
    });

    return opts;
  }, [fromToken, poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, protocolTokens, userCurrencies, tokenNamesMap, baseTokenIds, markets, network]);

  // walletBalances already declared above via useEnrichedWalletData
  // BTC balance from btcFast (instant) with enriched fallback
  const btcBalanceSats = btcFast?.total ?? walletBalances?.bitcoin?.total ?? 0;
  const isBalancesLoading = Boolean(isAlkanesLoading);

  // Build a map from alkane ID to balance from wallet data (more reliable than useSellableCurrencies)
  const walletAlkaneBalances = useMemo(() => {
    const map = new Map<string, string>();
    if (walletBalances?.alkanes) {
      for (const alkane of walletBalances.alkanes) {
        map.set(alkane.alkaneId, alkane.balance);
      }
    }
    return map;
  }, [walletBalances?.alkanes]);

  // Build a map from alkane ID to authoritative name/symbol from wallet data.
  // This is the same data source used by the wallet balance panel (proven working).
  const walletAlkaneNames = useMemo(() => {
    const map = new Map<string, { name: string; symbol: string }>();
    if (walletBalances?.alkanes) {
      for (const alkane of walletBalances.alkanes) {
        if (alkane.name || alkane.symbol) {
          map.set(alkane.alkaneId, { name: alkane.name || '', symbol: alkane.symbol || '' });
        }
      }
    }
    return map;
  }, [walletBalances?.alkanes]);

  const formatBalance = (id?: string): string => {
    if (isBalancesLoading) return t('swap.loadingBalance');
    if (!id) return `${t('swap.balanceColon')} 0`;

    // BTC balance (btcBalanceSats now uses walletBalances.bitcoin.total)
    if (id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      return `${t('swap.balanceColon')} ${btc.toFixed(8)}`;
    }

    // Alkane token balance (frBTC, DIESEL, etc.)
    // Prefer walletAlkaneBalances (from useEnrichedWalletData) over useSellableCurrencies
    // as it's more reliable and consistent with the wallet dashboard
    let balance = walletAlkaneBalances.get(id);
    if (!balance) {
      const cur = idToUserCurrency.get(id);
      balance = cur?.balance;
    }

    if (!balance) {
      return `${t('swap.balanceColon')} 0`;
    }

    // Alkane balances use 8 decimal places (like satoshis)
    // Example: 99000000 raw = 0.99 frBTC
    // Use BigInt for precision to avoid floating point errors
    try {
      const value = BigInt(balance);
      const divisor = BigInt(1e8);
      const whole = value / divisor;
      const remainder = value % divisor;
      const wholeStr = whole.toString();
      const remainderStr = remainder.toString().padStart(8, '0');

      // Show 2 decimals for large values (100+), 8 decimals for smaller values
      const decimalPlaces = wholeStr.length >= 3 ? 2 : 8;
      const truncatedRemainder = remainderStr.slice(0, decimalPlaces);

      // Remove trailing zeros
      const trimmedRemainder = truncatedRemainder.replace(/0+$/, '') || '0';

      if (trimmedRemainder === '0' && whole > 0) {
        return `${t('swap.balanceColon')} ${wholeStr}`;
      }

      return `${t('swap.balanceColon')} ${wholeStr}.${trimmedRemainder}`;
    } catch {
      // Fallback for non-BigInt compatible values
      const rawBalance = Number(balance);
      const displayBalance = rawBalance / 1e8;
      return `${t('swap.balanceColon')} ${displayBalance.toFixed(8)}`;
    }
  };

  // Get price for any token (from user currencies or derive from pools)
  const getTokenPrice = (tokenId?: string): number | undefined => {
    if (!tokenId) return undefined;

    // Handle BTC price separately
    if (tokenId === 'btc') {
      return btcPrice;
    }

    // Check user currencies first (most reliable)
    const cur = idToUserCurrency.get(tokenId);
    if (cur?.priceUsd && cur.priceUsd > 0) {
      return cur.priceUsd;
    }

    // For frBTC, use BTC price
    if (tokenId === FRBTC_ALKANE_ID) {
      return btcPrice;
    }

    // For bUSD and USDT, assume $1
    if (tokenId === BUSD_ALKANE_ID || tokenId === 'usdt') {
      return 1.0;
    }

    // Espo's global price catalog (`/get-alkanes` priceUsd) — works without
    // a wallet connection AND without depending on the pools query landing
    // first. Without this, swap inputs for tokens the user doesn't already
    // hold show $0.00 in the precious window between page load and the
    // pool-TVL derivation populating.
    const meta = tokenNamesMap?.get(tokenId);
    if (meta?.priceUsd && meta.priceUsd > 0) {
      return meta.priceUsd;
    }
    if (meta?.priceInSatoshi && meta.priceInSatoshi > 0 && btcPrice && btcPrice > 0) {
      return (meta.priceInSatoshi / 1e8) * btcPrice;
    }

    // Fallback: derive from pool TVL — works without a wallet connection.
    const derived = derivedTokenPrices.get(tokenId);
    if (derived && derived > 0) return derived;

    return undefined;
  };

  // Calculate USD value for a token amount
  const calculateUsdValue = (tokenId?: string, amount?: string): string => {
    if (!tokenId || !amount || amount === '' || isNaN(Number(amount))) return '$0.00';
    
    const numAmount = Number(amount);
    if (numAmount === 0) return '$0.00';
    
    const priceUsd = getTokenPrice(tokenId);
    
    if (!priceUsd || priceUsd === 0) return '$0.00';
    
    const usdValue = numAmount * priceUsd;
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(usdValue);
  };

  const isWrapPair = useMemo(() => fromToken?.id === 'btc' && toToken?.id === FRBTC_ALKANE_ID, [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);
  const isUnwrapPair = useMemo(() => fromToken?.id === FRBTC_ALKANE_ID && toToken?.id === 'btc', [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);

  // frZEC wrap/unwrap pair detection (CGGMP21 wrapped Zcash)
  const isWrapZecPair = useMemo(() => fromToken?.id === 'btc' && toToken?.id === FRZEC_ALKANE_ID, [fromToken?.id, toToken?.id, FRZEC_ALKANE_ID]);
  const isUnwrapZecPair = useMemo(() => fromToken?.id === FRZEC_ALKANE_ID && toToken?.id === 'btc', [fromToken?.id, toToken?.id, FRZEC_ALKANE_ID]);

  // frETH wrap/unwrap pair detection (FROST wrapped ETH)
  const isWrapEthPair = useMemo(() => fromToken?.id === 'btc' && toToken?.id === FRETH_ALKANE_ID, [fromToken?.id, toToken?.id, FRETH_ALKANE_ID]);
  const isUnwrapEthPair = useMemo(() => fromToken?.id === FRETH_ALKANE_ID && toToken?.id === 'btc', [fromToken?.id, toToken?.id, FRETH_ALKANE_ID]);

  // Cross-chain bridge detection — native ETH/ZEC as swap endpoints
  const isCrossChainSwap = useMemo(() => {
    const fromId = fromToken?.id;
    const toId = toToken?.id;
    if (!fromId || !toId) return false;
    const nativeChains = new Set(['btc', 'eth', 'zec']);
    return nativeChains.has(fromId) && nativeChains.has(toId) && fromId !== toId;
  }, [fromToken?.id, toToken?.id]);

  const crossChainDirection = useMemo(() => {
    if (!isCrossChainSwap) return null;
    return { from: fromToken!.id, to: toToken!.id };
  }, [isCrossChainSwap, fromToken?.id, toToken?.id]);

  // Check if this is a BTC → token swap (not direct wrap to frBTC)
  const isBtcToTokenSwap = useMemo(() =>
    fromToken?.id === 'btc' && toToken?.id !== FRBTC_ALKANE_ID && toToken?.id !== 'btc',
    [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]
  );

  // Check if this is a token → BTC swap (requires unwrap after swap)
  const isTokenToBtcSwap = useMemo(() =>
    fromToken?.id !== 'btc' && fromToken?.id !== FRBTC_ALKANE_ID && toToken?.id === 'btc',
    [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]
  );

  // Helper: Convert swapFlowStep to TransactionStepper steps
  // JOURNAL (2026-03-15): Shows clear visual feedback during multi-step swaps
  const { stepperSteps, currentStepIndex, showStepper } = useMemo(() => {
    const step = swapFlowStep;
    if (step.type === 'idle') {
      return { stepperSteps: [], currentStepIndex: 0, showStepper: false };
    }

    // BTC → Token flow (wrap then swap)
    if (isBtcToTokenSwap) {
      const steps: import('./components/TransactionStepper').TransactionStep[] = [
        {
          label: `${t('swap.step1Wrap') || 'Step 1: Wrap BTC → frBTC'}`,
          status: step.type === 'wrapping' ? 'loading'
                : step.type === 'wrap-confirming' ? 'confirming'
                : (step.type === 'swapping' || step.type === 'swap-confirming' || step.type === 'swap-indexing' || step.type === 'complete') ? 'complete'
                : step.type === 'error' && step.step === 'wrap' ? 'error'
                : 'pending',
          txId: step.type === 'wrap-confirming' ? step.txId
              : step.type === 'swap-indexing' ? step.wrapTxId
              : step.type === 'complete' ? step.wrapTxId
              : step.type === 'error' ? step.wrapTxId
              : undefined,
          pollingAttempt: step.type === 'wrap-confirming' ? step.attempt : undefined,
          maxAttempts: step.type === 'wrap-confirming' ? step.maxAttempts : undefined,
          errorMessage: step.type === 'error' && step.step === 'wrap' ? step.message : undefined,
        },
        {
          label: `${t('swap.step2Swap') || 'Step 2: Swap frBTC →'} ${toToken?.symbol || 'Token'}`,
          status: step.type === 'swapping' ? 'loading'
                : step.type === 'swap-confirming' ? 'confirming'
                : step.type === 'swap-indexing' ? 'indexing'
                : step.type === 'complete' ? 'complete'
                : step.type === 'error' && step.step === 'swap' ? 'error'
                : 'pending',
          txId: step.type === 'swap-confirming' ? step.txId
              : step.type === 'swap-indexing' ? step.txId
              : step.type === 'complete' ? step.swapTxId
              : step.type === 'error' ? step.swapTxId
              : undefined,
          pollingAttempt: step.type === 'swap-confirming' ? step.attempt : undefined,
          maxAttempts: step.type === 'swap-confirming' ? step.maxAttempts : undefined,
          errorMessage: step.type === 'error' && step.step === 'swap' ? step.message : undefined,
        },
      ];
      const currentIdx = step.type === 'wrapping' || step.type === 'wrap-confirming' ? 0
                       : step.type === 'swapping' || step.type === 'swap-confirming' || step.type === 'swap-indexing' ? 1
                       : step.type === 'complete' ? 1
                       : step.type === 'error' ? (step.step === 'wrap' ? 0 : 1)
                       : 0;
      return { stepperSteps: steps, currentStepIndex: currentIdx, showStepper: true };
    }

    // Token → BTC flow (swap then unwrap)
    if (isTokenToBtcSwap) {
      const steps: import('./components/TransactionStepper').TransactionStep[] = [
        {
          label: `${t('swap.step1Swap') || 'Step 1: Swap'} ${fromToken?.symbol || 'Token'} → frBTC`,
          status: step.type === 'swapping' ? 'loading'
                : step.type === 'swap-confirming' ? 'confirming'
                : (step.type === 'unwrapping' || step.type === 'unwrap-confirming' || step.type === 'unwrap-indexing' || step.type === 'complete') ? 'complete'
                : step.type === 'error' && step.step === 'swap' ? 'error'
                : 'pending',
          txId: step.type === 'swap-confirming' ? step.txId
              : step.type === 'unwrap-confirming' ? step.swapTxId
              : step.type === 'unwrap-indexing' ? step.swapTxId
              : step.type === 'complete' ? step.swapTxId
              : step.type === 'error' ? step.swapTxId
              : undefined,
          pollingAttempt: step.type === 'swap-confirming' ? step.attempt : undefined,
          maxAttempts: step.type === 'swap-confirming' ? step.maxAttempts : undefined,
          errorMessage: step.type === 'error' && step.step === 'swap' ? step.message : undefined,
        },
        {
          label: `${t('swap.step2Unwrap') || 'Step 2: Unwrap frBTC → BTC'}`,
          status: step.type === 'unwrapping' ? 'loading'
                : step.type === 'unwrap-confirming' ? 'confirming'
                : step.type === 'unwrap-indexing' ? 'indexing'
                : step.type === 'complete' ? 'complete'
                : step.type === 'error' && step.step === 'unwrap' ? 'error'
                : 'pending',
          txId: step.type === 'unwrap-confirming' ? step.txId
              : step.type === 'unwrap-indexing' ? step.txId
              : step.type === 'complete' ? step.unwrapTxId
              : undefined,
          pollingAttempt: step.type === 'unwrap-confirming' ? step.attempt : undefined,
          maxAttempts: step.type === 'unwrap-confirming' ? step.maxAttempts : undefined,
          errorMessage: step.type === 'error' && step.step === 'unwrap' ? step.message : undefined,
        },
      ];
      const currentIdx = step.type === 'swapping' || step.type === 'swap-confirming' ? 0
                       : step.type === 'unwrapping' || step.type === 'unwrap-confirming' || step.type === 'unwrap-indexing' ? 1
                       : step.type === 'complete' ? 1
                       : step.type === 'error' ? (step.step === 'swap' ? 0 : 1)
                       : 0;
      return { stepperSteps: steps, currentStepIndex: currentIdx, showStepper: true };
    }

    return { stepperSteps: [], currentStepIndex: 0, showStepper: false };
  }, [swapFlowStep, isBtcToTokenSwap, isTokenToBtcSwap, fromToken?.symbol, toToken?.symbol, t]);

  // Extract error message from any error type (Error object, string, JsValue)
  const extractErrorMessage = (e: any): string => {
    if (typeof e === 'string') return e;
    if (e?.message) return e.message;
    if (e?.toString && e.toString() !== '[object Object]') return e.toString();
    return String(e);
  };

  // Convert raw SDK error string to user-readable message
  const humanizeError = (raw: string): string => {
    if (raw.includes('User rejected') || raw.includes('User denied') || raw.includes('cancelled')) {
      return t('errors.userCancelled');
    } else if (raw.includes('Insufficient alkanes')) {
      const match = raw.match(/need (\d+) of ([\d:]+), have (\d+)/);
      if (match) {
        const [, needed, tokenId, available] = match;
        return t('errors.insufficientBalance', {
          tokenId,
          needed: (Number(needed) / 1e8).toFixed(8),
          available: (Number(available) / 1e8).toFixed(8),
        });
      }
    } else if (raw.includes('Insufficient funds')) {
      const fundsMatch = raw.match(/need (\d+) sats/);
      const needed = fundsMatch ? (Number(fundsMatch[1]) / 1e8).toFixed(6) : null;
      return needed
        ? t('errors.insufficientBtcWithAmount', { needed })
        : t('errors.insufficientBtcGeneric');
    } else if (raw.includes('Pool not found') || raw.includes('Unable to find pool')) {
      return t('errors.poolNotFound');
    } else if (raw.includes('dust limit')) {
      return t('errors.dustAmount');
    } else if (raw.includes('EXPIRED')) {
      return t('errors.deadlineExpired');
    } else if (raw.includes('timeout') || raw.includes('Timeout')) {
      return t('errors.requestTimeout');
    }
    return raw;
  };

  const showSwapError = (raw: string) => {
    showError(humanizeError(raw));
  };

  const handleSwap = async () => {

    if (!fromToken || !toToken) return;

    // Wrap/Unwrap direct pairs
    if (isWrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'wrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Wrap error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    if (isUnwrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'unwrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    // frZEC wrap (BTC → frZEC) — CGGMP21 wrapped Zcash
    if (isWrapZecPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapZecMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'wrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Wrap ZEC error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    // frZEC unwrap (frZEC → BTC)
    if (isUnwrapZecPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapZecMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'unwrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap ZEC error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    // frETH wrap (BTC → frETH) — FROST wrapped ETH
    if (isWrapEthPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapEthMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'wrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Wrap ETH error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    // frETH unwrap (frETH → BTC)
    if (isUnwrapEthPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapEthMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          showNotification(res.transactionId, 'unwrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap ETH error:', e);
        showSwapError(extractErrorMessage(e));
      }
      return;
    }

    // =========================================================================
    // Cross-chain swap (BTC↔ETH, BTC↔ZEC, ETH↔ZEC)
    // =========================================================================
    // These are multi-step bridge operations that route through frAssets:
    //   BTC→ETH: wrap BTC → frBTC → swap frBTC→frETH → BurnAndBridge → ETH
    //   ETH→BTC: deposit ETH → mint frETH → swap frETH→frBTC → unwrap → BTC
    //   BTC→ZEC: wrap BTC → frBTC → swap frBTC→frZEC → BurnAndBridge → ZEC
    //   ZEC→BTC: deposit ZEC → mint frZEC → swap frZEC→frBTC → unwrap → BTC
    //   ETH→ZEC: deposit ETH → frETH → frBTC → frZEC → BurnAndBridge → ZEC
    //   ZEC→ETH: deposit ZEC → frZEC → frBTC → frETH → BurnAndBridge → ETH
    if (isCrossChainSwap && crossChainDirection) {
      const { from: srcChain, to: dstChain } = crossChainDirection;

      // For now, show a message that cross-chain bridge UI is coming.
      // The full deposit → swap → withdraw pipeline lives in BridgeDepositFlow.
      showSwapError(
        `Cross-chain swap: ${srcChain.toUpperCase()} → ${dstChain.toUpperCase()}\n\n` +
        `This will route through: ${getBridgeRoute(srcChain, dstChain)}\n\n` +
        `Bridge UI coming soon — use the bridge panel for full cross-chain operations.`
      );
      return;
    }

    // BTC → Token swap: Atomic wrap+swap in a single transaction.
    // Two chained protostones: p0 wraps BTC→frBTC, p1 swaps frBTC→Token.
    // Verified in alkanes-rs/crates/alkanes-integ-tests/tests/atomic_wrap_swap.rs
    if (isBtcToTokenSwap) {
      if (!quote || !quote.poolId) {
        console.error('[SWAP] BTC → Token swap requires quote with poolId');
        showSwapError(t('errors.poolNotFoundForSwap'));
        return;
      }

      try {
        // Snapshot pending-tx count so the bundle progress effect can
        // detect deltas (Tx A → +1, Tx A+B → +2) and upgrade Step 1/2
        // to 'confirming' as the SDK broadcasts them. See the
        // bundleStartCountRef effect above.
        bundleStartCountRef.current = pendingTxs.length;
        setSwapFlowStep({ type: 'swapping' });
        const result = await executeAtomicSwap({
          btcAmount: fromAmount,
          buyTokenId: toToken.id,
          poolId: quote.poolId,
          quoteBuyAmount: quote.buyAmount,
          minimumReceived: quote.minimumReceived || '1',
          maxSlippage,
          deadlineBlocks,
          feeRate: fee.feeRate,
        });

        if (result?.success && result.transactionId) {
          const swapTxId = result.transactionId;
          // splitTransactions=true returns wrapTxId (parent) + transactionId
          // (child/reveal). CPFP-anchored, so they confirm together; we still
          // poll the swap (child) tx because it's the one the user cares about
          // — the wrap step gets ✓ from the same confirmation.
          const wrapTxId = (result as any).wrapTxId as string | undefined;
          showNotification(swapTxId, 'swap');

          // Devnet/regtest skip polling — useAtomicWrapSwapMutation auto-mines.
          const isLocal = ['devnet', 'regtest-local', 'qubitcoin-regtest'].includes(network ?? '');
          const isRegtestRemote = ['regtest', 'subfrost-regtest'].includes(network ?? '');
          if (isLocal) {
            setSwapFlowStep({ type: 'complete', swapTxId, wrapTxId });
            setTimeout(() => refreshWalletData(), 2000);
            setTimeout(() => setSwapFlowStep({ type: 'idle' }), 5000);
          } else {
            // Confirmation poll. "Broadcasting" was misleading post-broadcast:
            // both txs are in mempool, CPFP is anchored, but the UI used to
            // jump straight from "Broadcasting" → ✓ when broadcast resolved.
            // Now we explicitly show "Waiting for confirmation" until the
            // block lands, matching what the Token→BTC flow does.
            const pollInterval = isRegtestRemote ? 1500 : 15000;
            const maxPollAttempts = isRegtestRemote ? 20 : 120;
            let confirmed = false;
            let confirmationHeight: number | undefined;
            for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
              setSwapFlowStep({
                type: 'swap-confirming',
                txId: swapTxId,
                attempt: attempt + 1,
                maxAttempts: maxPollAttempts,
              });
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              try {
                const tx = await getEsploraTx(network!, swapTxId);
                if (tx?.status?.confirmed) {
                  confirmed = true;
                  confirmationHeight = tx.status.block_height;
                  break;
                }
              } catch {
                // polling RPC error — keep retrying
              }
            }
            if (!confirmed) {
              console.warn('[SWAP] BTC → Token swap did not confirm within poll window; marking complete:', swapTxId);
            }

            // Indexing beat — block landed but metashrew may still be
            // catching up; balances won't refresh until metashrew_height
            // reaches the confirmation block. Bounded short so a slow
            // indexer doesn't hang the modal.
            if (confirmed && confirmationHeight) {
              const indexPollInterval = isRegtestRemote ? 1000 : 3000;
              const maxIndexPolls = 10;
              for (let attempt = 0; attempt < maxIndexPolls; attempt++) {
                setSwapFlowStep({ type: 'swap-indexing', txId: swapTxId, wrapTxId });
                try {
                  const h = await getHeight(network!);
                  if (h >= confirmationHeight) break;
                } catch {
                  // ignore — keep polling
                }
                await new Promise(resolve => setTimeout(resolve, indexPollInterval));
              }
            }

            setSwapFlowStep({ type: 'complete', swapTxId, wrapTxId });
            setTimeout(() => refreshWalletData(), 2000);
            setTimeout(() => setSwapFlowStep({ type: 'idle' }), 5000);
          }
        } else {
          setSwapFlowStep({ type: 'error', step: 'swap', message: 'No transaction ID returned' });
        }
      } catch (e: any) {
        console.error('[SWAP] Atomic BTC → Token swap failed:', e);
        const raw = extractErrorMessage(e);
        const msg = humanizeError(raw);
        if (swapFlowStep.type !== 'error') {
          setSwapFlowStep({ type: 'error', step: 'swap', message: msg });
        }
        if (raw.includes('Insufficient alkanes')) {
          const match = raw.match(/need (\d+) of ([\d:]+), have (\d+)/);
          if (match) {
            const [, needed, tokenId, available] = match;
            const neededDisplay = (Number(needed) / 1e8).toFixed(8);
            const availableDisplay = (Number(available) / 1e8).toFixed(8);
            showSwapError(t('errors.insufficientSpendableDetailed', {
              tokenId,
              requested: neededDisplay,
              spendable: availableDisplay,
            }));
          } else {
            showSwapError(t('errors.swapFailed', { message: msg }));
          }
        } else {
          showSwapError(t('errors.swapFailed', { message: msg }));
        }
      }
      return;
    }

    // Token → BTC swap: two-step flow (swap Token→frBTC, then unwrap frBTC→BTC).
    // State machine + TransactionStepper drive the UX feedback.
    if (isTokenToBtcSwap) {
      if (!quote || !quote.poolId) {
        console.error('[SWAP] Token → BTC swap requires quote with poolId');
        showSwapError(t('errors.poolNotFoundForSwap'));
        return;
      }

      try {
        // Implementation lives in useTokenToBtcSwap. Two-tx chained flow:
        // swap Token→frBTC, then unwrap frBTC→BTC. UI state transitions and
        // toast notifications come back via callbacks.
        await executeTokenToBtcSwap({
          fromTokenId: fromToken.id,
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          poolId: quote.poolId,
          feeRate: fee.feeRate,
          onProgress: (p) => setSwapFlowStep(p as any),
          onNotify: (txId, op, ctx) => showNotification(txId, op, ctx),
        });
        setTimeout(() => refreshWalletData(), 2000);
        setTimeout(() => setSwapFlowStep({ type: 'idle' }), 5000);
      } catch (e: any) {
        console.error('[SWAP] Token → BTC swap failed:', e);
        const raw = extractErrorMessage(e);
        const msg = humanizeError(raw);
        // Only update state if not already in error state
        if (swapFlowStep.type !== 'error') {
          setSwapFlowStep({ type: 'error', step: 'swap', message: msg });
        }
        if (raw.includes('Insufficient alkanes')) {
          const match = raw.match(/need (\d+) of ([\d:]+), have (\d+)/);
          if (match) {
            const [, needed, tokenId, available] = match;
            const neededDisplay = (Number(needed) / 1e8).toFixed(8);
            const availableDisplay = (Number(available) / 1e8).toFixed(8);
            showSwapError(t('errors.insufficientSpendableDetailed', {
              tokenId,
              requested: neededDisplay,
              spendable: availableDisplay,
            }));
          } else {
            showSwapError(t('errors.swapFailed', { message: msg }));
          }
        } else {
          showSwapError(t('errors.swapFailed', { message: msg }));
        }
      }
      return;
    }

    // Default AMM swap (frBTC/DIESEL or other alkane pairs)
    // DIAGNOSTIC 2026-05-11: log when click is silently dropped because the
    // quote engine hasn't produced a quote yet. Symptom: user reports "click
    // does nothing, no logs, hangs forever" — the quote was still computing
    // when they clicked, the function returned silently, and there was no
    // user-visible signal of why. Should be replaced with a real CTA-disable
    // (`!quote` should grey out the button until the quote is ready).
    if (!quote) {
      console.warn('[SWAP] handleSwap fired but quote is undefined — quote still computing or failed. fromToken:', fromToken, 'toToken:', toToken, 'fromAmount:', fromAmount, 'toAmount:', toAmount, 'isCalculating:', isCalculating);
      showSwapError(t('errors.poolNotFound'));
      return;
    }

    // Validate that we have either a poolId (direct swap) or a route (multi-hop swap).
    // Multi-hop swaps use the factory's opcode 13 with a token path, not a single poolId.
    // The quote.route array indicates multi-hop (e.g., [DIESEL, bUSD, frBTC]).
    const hasValidRoute = quote.route && quote.route.length >= 2;
    if (!quote.poolId && !hasValidRoute) {
      console.error('[SWAP] No poolId or route in quote - cannot execute swap');
      console.error('[SWAP] Full quote object:', JSON.stringify(quote, null, 2));
      showSwapError(t('errors.swapFailedPoolNotFound'));
      return;
    }

    const payload = {
      sellCurrency: fromToken.id,
      buyCurrency: toToken.id,
      direction,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      maxSlippage,
      feeRate: fee.feeRate,
      tokenPath: quote.route ?? [fromToken.id, toToken.id],
      poolId: quote.poolId,
      deadlineBlocks,
      routeSource: (quote as any).routeSource,
    } as const;

    try {
      const res = await swapMutation.mutateAsync(payload as any);
      if (res?.success && res.transactionId) {
        showNotification(res.transactionId, 'swap');
      }
    } catch (e: any) {
      console.error('[SWAP] Mutation error:', e?.message);
      showSwapError(extractErrorMessage(e));
    }
  };

  useEffect(() => {
    if (!quote) return;
    if (direction === 'sell') {
      setToAmount(quote.displayBuyAmount);
    } else {
      setFromAmount(quote.displaySellAmount);
    }
  }, [quote?.displayBuyAmount, quote?.displaySellAmount, direction]);

  const tokenOptions = useMemo<TokenMeta[]>(() => {
    if (selectedPool) return [selectedPool.token0, selectedPool.token1];
    // Fallback options - use poolTokenMap for correct symbols when available
    const busdToken = poolTokenMap.get(BUSD_ALKANE_ID);
    const frbtcToken = poolTokenMap.get(FRBTC_ALKANE_ID);
    return [
      { id: "btc", symbol: "BTC", name: "BTC" },
      { id: FRBTC_ALKANE_ID, symbol: frbtcToken?.symbol ?? "frBTC", name: frbtcToken?.name ?? "frBTC" },
      { id: BUSD_ALKANE_ID, symbol: busdToken?.symbol ?? "DIESEL", name: busdToken?.name ?? "DIESEL" },
    ];
  }, [selectedPool, poolTokenMap, BUSD_ALKANE_ID, FRBTC_ALKANE_ID]);

  const handleAddLiquidity = async () => {

    if (!poolToken0 || !poolToken1) {
      showSwapError(t('errors.selectBothTokens'));
      return;
    }

    if (!poolToken0Amount || !poolToken1Amount ||
        parseFloat(poolToken0Amount) <= 0 || parseFloat(poolToken1Amount) <= 0) {
      showSwapError(t('errors.enterValidAmounts'));
      return;
    }

    // BTC + frBTC is not a valid pool pair (BTC is just unwrapped frBTC).
    const equivalentId = (id: string) => (id === 'btc' ? FRBTC_ALKANE_ID : id);
    if (FRBTC_ALKANE_ID && equivalentId(poolToken0.id) === equivalentId(poolToken1.id)) {
      showSwapError(t('errors.invalidPair') || 'Cannot pair BTC with frBTC — they are equivalent');
      return;
    }

    // Detect BTC side: route through atomic wrap+addLiquidity (single tx).
    const btcOnSide0 = poolToken0.id === 'btc';
    const btcOnSide1 = poolToken1.id === 'btc';
    const isAtomicWrapAdd = btcOnSide0 || btcOnSide1;

    try {
      const poolId = selectedPool?.id
        ? (() => {
            const [block, tx] = selectedPool.id.split(':').map(Number);
            return { block, tx };
          })()
        : undefined;

      if (isAtomicWrapAdd) {
        const btcAmount = btcOnSide0 ? poolToken0Amount : poolToken1Amount;
        const tokenAmount = btcOnSide0 ? poolToken1Amount : poolToken0Amount;
        const tokenSide = btcOnSide0 ? poolToken1 : poolToken0;
        const result = await executeAtomicAddLiquidity({
          tokenSideId: tokenSide.id,
          btcAmount,
          tokenAmount,
          maxSlippage,
          deadlineBlocks,
          feeRate: fee.feeRate,
          poolId,
        });
        if (result?.success && result.transactionId) {
          showNotification(result.transactionId, 'addLiquidity');
          setPoolToken0Amount('');
          setPoolToken1Amount('');
        }
        return;
      }

      const result = await addLiquidityMutation.mutateAsync({
        token0Id: poolToken0.id,
        token1Id: poolToken1.id,
        token0Amount: poolToken0Amount,
        token1Amount: poolToken1Amount,
        token0Decimals: 8, // Default for alkanes
        token1Decimals: 8,
        maxSlippage,
        feeRate: fee.feeRate,
        deadlineBlocks,
        poolId,
      });

      if (result?.success && result.transactionId) {
        showNotification(result.transactionId, 'addLiquidity');
        // Clear amounts after success
        setPoolToken0Amount('');
        setPoolToken1Amount('');
      }
    } catch (e: any) {
      console.error('[handleAddLiquidity] Error:', e);
      showSwapError(t('errors.addLiquidityFailed', { message: extractErrorMessage(e) }));
    }
  };

  const handleRemoveLiquidity = async () => {

    if (!selectedLPPosition) {
      showSwapError(t('errors.selectLpPosition'));
      return;
    }

    if (!removeAmount || parseFloat(removeAmount) <= 0) {
      showSwapError(t('errors.enterValidRemoveAmount'));
      return;
    }

    if (parseFloat(removeAmount) > parseFloat(selectedLPPosition.amount)) {
      showSwapError(t('errors.removeExceedsBalance'));
      return;
    }

    if (!selectedLPPosition.token0Id || !selectedLPPosition.token1Id) {
      showSwapError('LP position is missing token IDs');
      return;
    }

    // Force a fresh opcode 999 read right before submit so slippage params are
    // computed against current state-trie reserves/supply, not the indexer-
    // aggregated markets cache. Falls back to markets only if the live read
    // genuinely fails (RPC error). See usePoolStateLive.
    let reserve0: string | undefined;
    let reserve1: string | undefined;
    let lpTotalSupply: string | undefined;
    try {
      const fresh = await removeLpLiveState.refetch();
      if (fresh.data) {
        reserve0 = fresh.data.reserve0;
        reserve1 = fresh.data.reserve1;
        lpTotalSupply = fresh.data.totalSupply;
      }
    } catch (e) {
      console.warn('[handleRemoveLiquidity] live pool refetch failed, falling back to cache:', e);
    }
    if (!reserve0 || !reserve1 || !lpTotalSupply) {
      const cached = markets.find(p => p.id === selectedLPPosition.id);
      reserve0 = cached?.token0Amount;
      reserve1 = cached?.token1Amount;
      lpTotalSupply = cached?.lpTotalSupply;
    }
    if (!reserve0 || !reserve1 || !lpTotalSupply) {
      showSwapError('Pool reserves or LP total supply unavailable — refresh and retry');
      return;
    }

    let minAmount0: string;
    let minAmount1: string;
    try {
      ({ minAmount0, minAmount1 } = computeRemoveLiquidityMinAmounts({
        lpAmountDisplay: removeAmount,
        reserve0,
        reserve1,
        lpTotalSupply,
        maxSlippagePercent: maxSlippage,
      }));
    } catch (e: any) {
      showSwapError(e?.message || 'Failed to compute slippage');
      return;
    }

    try {
      const result = await removeLiquidityMutation.mutateAsync({
        lpTokenId: selectedLPPosition.id,
        lpAmount: removeAmount,
        lpDecimals: 8,
        token0Id: selectedLPPosition.token0Id,
        token1Id: selectedLPPosition.token1Id,
        minAmount0,
        minAmount1,
        token0Decimals: 8,
        token1Decimals: 8,
        feeRate: fee.feeRate,
        deadlineBlocks,
      });

      if (result?.success && result.transactionId) {
        showNotification(result.transactionId, 'removeLiquidity');
        // Clear state after success
        setRemoveAmount('');
        setSelectedLPPosition(null);
      }
    } catch (e: any) {
      console.error('[handleRemoveLiquidity] Error:', e);
      showSwapError(t('errors.removeLiquidityFailed', { message: extractErrorMessage(e) }));
    }
  };

  const handleInvert = () => {
    // Swap tokens
    setFromToken((prev) => {
      const next = toToken;
      setToToken(prev);
      return next;
    });
    // Swap amounts
    setFromAmount((prev) => {
      const next = toAmount;
      setToAmount(prev);
      return next ?? "";
    });
  };

  // Helper function to check if a viable pool exists for a token pair
  const isAllowedPair = useMemo(() => (token1Id: string, token2Id: string): boolean => {
    // Special case: BTC <-> frBTC wrap/unwrap is always allowed
    if ((token1Id === 'btc' && token2Id === FRBTC_ALKANE_ID) ||
        (token1Id === FRBTC_ALKANE_ID && token2Id === 'btc')) {
      return true;
    }

    // Special case: BTC <-> frZEC wrap/unwrap is always allowed
    if (FRZEC_ALKANE_ID &&
        ((token1Id === 'btc' && token2Id === FRZEC_ALKANE_ID) ||
         (token1Id === FRZEC_ALKANE_ID && token2Id === 'btc'))) {
      return true;
    }

    // Special case: BTC <-> frETH wrap/unwrap is always allowed
    if (FRETH_ALKANE_ID &&
        ((token1Id === 'btc' && token2Id === FRETH_ALKANE_ID) ||
         (token1Id === FRETH_ALKANE_ID && token2Id === 'btc'))) {
      return true;
    }

    // Cross-chain: any native chain pair is always allowed (BTC, ETH, ZEC)
    const nativeChains = new Set(['btc', 'eth', 'zec']);
    if (nativeChains.has(token1Id) && nativeChains.has(token2Id)) {
      return true;
    }

    // Map BTC to frBTC for pool checking (BTC multi-hops via frBTC)
    const id1 = token1Id === 'btc' ? FRBTC_ALKANE_ID : token1Id;
    const id2 = token2Id === 'btc' ? FRBTC_ALKANE_ID : token2Id;

    // Check if there's an actual pool with these two tokens
    return markets.some(p =>
      (p.token0.id === id1 && p.token1.id === id2) ||
      (p.token0.id === id2 && p.token1.id === id1)
    );
  }, [markets, FRBTC_ALKANE_ID, FRZEC_ALKANE_ID, FRETH_ALKANE_ID]);

  // Custom sort function for token options: BTC, DIESEL/bUSD, frBTC, then alphabetical
  const sortTokenOptions = (options: TokenOption[]): TokenOption[] => {
    return [...options].sort((a, b) => {
      // Priority order (DIESEL and bUSD are the same token on different networks)
      const getPriority = (symbol: string) => {
        if (symbol === 'BTC') return 0;
        if (symbol === 'bUSD' || symbol === 'DIESEL') return 1;
        if (symbol === 'frBTC') return 2;
        return 3;
      };

      const priorityA = getPriority(a.symbol);
      const priorityB = getPriority(b.symbol);

      // If different priorities, sort by priority
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If same priority (both are priority 3, i.e., other tokens), sort alphabetically
      return a.symbol.localeCompare(b.symbol);
    });
  };

  // Prepare token options for modal with balances and prices.
  // resolveTokenDisplay is imported from useTokenNames — uses tokenNamesMap as primary source.

  // Diagnostic: log token name data sources (runs once per data change, not every render)
  useEffect(() => {
    if (!tokenNamesMap || tokenNamesMap.size === 0) return;
  }, [tokenNamesMap]);

  const fromTokenOptions = useMemo<TokenOption[]>(() => {
    const options = fromOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      let isAvailable = true;
      if (toToken) {
        isAvailable = isAllowedPair(token.id, toToken.id);
      }

      const resolved = resolveTokenDisplay(token.id, token.symbol, token.name, tokenNamesMap, idToUserCurrency, walletAlkaneNames);

      return {
        id: token.id,
        symbol: resolved.symbol,
        name: resolved.name,
        iconUrl: token.id === 'btc' ? undefined : (token.iconUrl || currency?.iconUrl),
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: getTokenPrice(token.id),
        isAvailable,
      };
    });

    return sortTokenOptions(options);
  }, [fromOptions, idToUserCurrency, tokenNamesMap, walletAlkaneNames, btcBalanceSats, toToken, isAllowedPair, btcPrice]);

  const toTokenOptions = useMemo<TokenOption[]>(() => {
    const options = toOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      let isAvailable = true;
      if (fromToken) {
        isAvailable = isAllowedPair(token.id, fromToken.id);
      }

      const resolved = resolveTokenDisplay(token.id, token.symbol, token.name, tokenNamesMap, idToUserCurrency, walletAlkaneNames);

      return {
        id: token.id,
        symbol: resolved.symbol,
        name: resolved.name,
        iconUrl: token.id === 'btc' ? undefined : (token.iconUrl || currency?.iconUrl),
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: getTokenPrice(token.id),
        isAvailable,
      };
    });

    return sortTokenOptions(options);
  }, [toOptions, idToUserCurrency, tokenNamesMap, walletAlkaneNames, btcBalanceSats, fromToken, isAllowedPair, btcPrice]);

  // Pool token options - show all tokens that appear in any pool
  const poolTokenOptions = useMemo<TokenOption[]>(() => {
    const poolTokenIds = new Set<string>();

    markets.forEach(pool => {
      poolTokenIds.add(pool.token0.id);
      poolTokenIds.add(pool.token1.id);
    });
    
    // Also add BTC since it can be wrapped to frBTC
    if (poolTokenIds.has(FRBTC_ALKANE_ID)) {
      poolTokenIds.add('btc');
    }
    
    // Determine which counterpart token to check against
    const counterpartToken = tokenSelectorMode === 'pool0' ? poolToken1 :
                            tokenSelectorMode === 'pool1' ? poolToken0 :
                            undefined;
    // Hide the counterpart token itself so user can't pick the same token on both sides
    const counterpartId = counterpartToken?.id;

    // Build full list of all allowed tokens for LP
    const opts: TokenOption[] = [];
    
    // Add BTC first. Hide only if counterpart is BTC itself — frBTC on the
    // other side is allowed (user picks between BTC and frBTC for the same
    // BTC-equivalent input; mutation handles atomic wrap when BTC is picked).
    const btcHidden = counterpartId === 'btc';
    let btcIsAvailable = counterpartToken
      ? isAllowedPair('btc', counterpartToken.id)
      : true; // If no counterpart, BTC is always available

    if (!btcHidden) {
      opts.push({
        id: 'btc',
        symbol: 'BTC',
        name: 'BTC',
        iconUrl: undefined,
        balance: String(btcBalanceSats ?? 0),
        price: getTokenPrice('btc'),
        isAvailable: btcIsAvailable,
      });
    }

    // Get whitelisted pool tokens only
    const seen = new Set(['btc']); // BTC already added above

    // Always add frBTC as a base token. Hide only if counterpart is frBTC
    // itself; counterpart=BTC is allowed (user can choose the unwrapped form).
    const frbtcHidden = counterpartId === FRBTC_ALKANE_ID;
    if (FRBTC_ALKANE_ID && !seen.has(FRBTC_ALKANE_ID)) {
      seen.add(FRBTC_ALKANE_ID);
      if (!frbtcHidden) {
        const frbtcCurrency = idToUserCurrency.get(FRBTC_ALKANE_ID);
        let frbtcIsAvailable = true;
        if (counterpartToken) {
          frbtcIsAvailable = isAllowedPair(FRBTC_ALKANE_ID, counterpartToken.id);
        }
        opts.push({
          id: FRBTC_ALKANE_ID,
          symbol: 'frBTC',
          name: 'frBTC',
          iconUrl: frbtcCurrency?.iconUrl,
          balance: frbtcCurrency?.balance,
          price: getTokenPrice(FRBTC_ALKANE_ID),
          isAvailable: frbtcIsAvailable,
        });
      }
    }

    // Always add BUSD/DIESEL as a base token (available before pools load)
    if (BUSD_ALKANE_ID && !seen.has(BUSD_ALKANE_ID)) {
      seen.add(BUSD_ALKANE_ID);
      if (counterpartId !== BUSD_ALKANE_ID) {
        const busdCurrency = idToUserCurrency.get(BUSD_ALKANE_ID);
        const busdToken = poolTokenMap.get(BUSD_ALKANE_ID);
        const defaultSymbol = network === 'mainnet' ? 'bUSD' : 'DIESEL';
        let busdIsAvailable = true;
        if (counterpartToken) {
          busdIsAvailable = isAllowedPair(BUSD_ALKANE_ID, counterpartToken.id);
        }
        opts.push({
          id: BUSD_ALKANE_ID,
          symbol: busdToken?.symbol ?? defaultSymbol,
          name: busdToken?.name ?? defaultSymbol,
          iconUrl: busdToken?.iconUrl || busdCurrency?.iconUrl,
          balance: busdCurrency?.balance,
          price: getTokenPrice(BUSD_ALKANE_ID),
          isAvailable: busdIsAvailable,
        });
      }
    }
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if (!seen.has(poolToken.id)) {
        seen.add(poolToken.id);
        const currency = idToUserCurrency.get(poolToken.id);

        // Hide the counterpart token itself (no duplicate pairs) and BTC/frBTC from each other
        if (counterpartId && poolToken.id === counterpartId) return;
        if (counterpartId === 'btc' && poolToken.id === FRBTC_ALKANE_ID) return;
        if (counterpartId === FRBTC_ALKANE_ID && poolToken.id === 'btc') return;

        // Check if this token can pair with the counterpart token (if selected)
        let isAvailable = true;
        if (counterpartToken) {
          isAvailable = isAllowedPair(poolToken.id, counterpartToken.id);
        }

        const resolved = resolveTokenDisplay(poolToken.id, poolToken.symbol, poolToken.name, tokenNamesMap, idToUserCurrency, walletAlkaneNames);

        opts.push({
          id: poolToken.id,
          symbol: resolved.symbol,
          name: resolved.name,
          iconUrl: poolToken.iconUrl || currency?.iconUrl,
          balance: poolToken.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
          price: getTokenPrice(poolToken.id),
          isAvailable,
        });
      }
    });

    // Also add tokens from user's wallet that aren't in pools yet
    // This allows users to add liquidity for new token pairs
    userCurrencies.forEach((currency: any) => {
      if (!seen.has(currency.id)) {
        // Hide the counterpart token itself (no duplicate pairs) and BTC/frBTC from each other
        if (counterpartId && currency.id === counterpartId) { seen.add(currency.id); return; }
        if (counterpartId === 'btc' && currency.id === FRBTC_ALKANE_ID) { seen.add(currency.id); return; }
        if (counterpartId === FRBTC_ALKANE_ID && currency.id === 'btc') { seen.add(currency.id); return; }
        seen.add(currency.id);

        // Check if this token can pair with the counterpart token (if selected)
        let isAvailable = true;
        if (counterpartToken) {
          isAvailable = isAllowedPair(currency.id, counterpartToken.id);
        }

        const rawSymbol = currency.symbol || currency.name || currency.id;
        const rawName = currency.name || currency.symbol || currency.id;
        const resolved = resolveTokenDisplay(currency.id, rawSymbol, rawName, tokenNamesMap, idToUserCurrency, walletAlkaneNames);

        opts.push({
          id: currency.id,
          symbol: resolved.symbol,
          name: resolved.name,
          iconUrl: currency.iconUrl,
          balance: currency.balance,
          price: getTokenPrice(currency.id),
          isAvailable,
        });
      }
    });

    return sortTokenOptions(opts);
  }, [markets, idToUserCurrency, userCurrencies, tokenNamesMap, walletAlkaneNames, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, poolTokenMap, btcBalanceSats, tokenSelectorMode, poolToken0, poolToken1, isAllowedPair, network, btcPrice]);

  const handleTokenSelect = (tokenId: string) => {
    if (tokenSelectorMode === 'from') {
      // Use enriched token options (with resolved names) for the state
      const enriched = fromTokenOptions.find((t) => t.id === tokenId);
      const token = enriched
        ? { id: enriched.id, symbol: enriched.symbol, name: enriched.name, iconUrl: enriched.iconUrl }
        : fromOptions.find((t) => t.id === tokenId);
      if (token) {
        if (toToken && toToken.id === tokenId) {
          setToToken(fromToken);
        }
        setFromToken(token);
        setToAmount("");
      }
    } else if (tokenSelectorMode === 'to') {
      const enriched = toTokenOptions.find((t) => t.id === tokenId);
      const token = enriched
        ? { id: enriched.id, symbol: enriched.symbol, name: enriched.name, iconUrl: enriched.iconUrl }
        : toOptions.find((t) => t.id === tokenId);
      if (token) {
        if (fromToken && fromToken.id === tokenId) {
          setFromToken(toToken);
        }
        setToToken(token);
      }
    } else if (tokenSelectorMode === 'pool0') {
      // For pool token selection, look in poolTokenOptions which includes all wallet tokens
      const poolOption = poolTokenOptions.find((t) => t.id === tokenId);
      if (poolOption) {
        // If selecting the same token as pool1, swap them
        if (poolToken1 && poolToken1.id === tokenId) {
          setPoolToken1(poolToken0);
        }
        // Convert TokenOption to TokenMeta
        setPoolToken0({
          id: poolOption.id,
          symbol: poolOption.symbol,
          name: poolOption.name,
          iconUrl: poolOption.iconUrl,
        });
      }
    } else if (tokenSelectorMode === 'pool1') {
      // For pool token selection, look in poolTokenOptions which includes all wallet tokens
      const poolOption = poolTokenOptions.find((t) => t.id === tokenId);
      if (poolOption) {
        // If selecting the same token as pool0, swap them
        if (poolToken0 && poolToken0.id === tokenId) {
          setPoolToken0(poolToken1);
        }
        // Convert TokenOption to TokenMeta
        setPoolToken1({
          id: poolOption.id,
          symbol: poolOption.symbol,
          name: poolOption.name,
          iconUrl: poolOption.iconUrl,
        });
      }
    }
  };

  // Handle max balance click
  const handleMaxFrom = () => {
    if (!fromToken) return;
    if (fromToken.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      setDirection('sell');
      setFromAmount((sats / 1e8).toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        setDirection('sell');
        setFromAmount((Number(cur.balance) / 1e8).toFixed(8));
      }
    }
  };

  const handlePercentFrom = (percent: number) => {
    if (!fromToken) return;
    if (fromToken.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      setDirection('sell');
      setFromAmount(((sats * percent) / 1e8).toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        setDirection('sell');
        setFromAmount(((Number(cur.balance) * percent) / 1e8).toFixed(8));
      }
    }
  };

  // Calculate active percent for TokenSelectorModal
  const getActivePercentFrom = (): number | null => {
    if (!fromAmount || !fromToken) return null;

    let balance = 0;
    if (fromToken.id === 'btc') {
      balance = Number(btcBalanceSats || 0) / 1e8;
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        balance = Number(cur.balance) / 1e8;
      }
    }

    if (!balance || balance === 0) return null;

    const amount = parseFloat(fromAmount);
    if (!amount) return null;

    const tolerance = 0.0001;
    if (Math.abs(amount - balance * 0.25) < tolerance) return 0.25;
    if (Math.abs(amount - balance * 0.5) < tolerance) return 0.5;
    if (Math.abs(amount - balance * 0.75) < tolerance) return 0.75;
    if (Math.abs(amount - balance) < tolerance) return 1;

    return null;
  };

  // Find the live pool for the user's UI pair (BTC ≡ frBTC). Stale
  // selectedPool can disagree with whatever the user picked in the LP
  // selectors, so we compute the match fresh from the markets list.
  const matchedLpPool = useMatchedLpPool(poolToken0, poolToken1, markets, FRBTC_ALKANE_ID);

  // Live reserves for the matched pool — used to compute the paired LP amount
  // against the current state-trie ratio rather than the cached one. Without
  // this, users typing in the AddLiquidity inputs see a stale paired value
  // and can hit `amountBMin` reverts even at moderate slippage when supply
  // has drifted since the markets snapshot. Enabled only when at least one
  // side has been typed — idle pair selection shouldn't trigger polling.
  const addLpHasAmount =
    (!!poolToken0Amount && parseFloat(poolToken0Amount) > 0) ||
    (!!poolToken1Amount && parseFloat(poolToken1Amount) > 0);
  const addLpLiveState = usePoolStateLive(matchedLpPool?.id, {
    enabled: !!matchedLpPool && addLpHasAmount,
  });

  // Auto-calculate the paired LP amount based on the matched pool's reserve
  // ratio. Pure math is in lib/alkanes/liquidity-math.ts.
  const computePaired = (typedSide: 0 | 1, value: string): string | null => {
    if (!matchedLpPool || !poolToken0 || !poolToken1) return null;
    const reserve0 = addLpLiveState.data?.reserve0 ?? matchedLpPool.token0Amount;
    const reserve1 = addLpLiveState.data?.reserve1 ?? matchedLpPool.token1Amount;
    if (!reserve0 || !reserve1) return null;
    return computePairedLpAmount({
      typedSide,
      typedDisplay: value,
      uiToken0Id: poolToken0.id,
      uiToken1Id: poolToken1.id,
      poolToken0Id: matchedLpPool.token0.id,
      reserve0,
      reserve1,
      frbtcId: FRBTC_ALKANE_ID,
      wrapFeePerThousand: premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000,
    });
  };

  const handlePoolToken0AmountChange = (value: string) => {
    setPoolToken0Amount(value);
    setLpTypedSide(value ? 0 : null);
    if (!value) { setPoolToken1Amount(''); return; }
    const paired = computePaired(0, value);
    if (paired !== null) setPoolToken1Amount(paired);
  };

  const handlePoolToken1AmountChange = (value: string) => {
    setPoolToken1Amount(value);
    setLpTypedSide(value ? 1 : null);
    if (!value) { setPoolToken0Amount(''); return; }
    const paired = computePaired(1, value);
    if (paired !== null) setPoolToken0Amount(paired);
  };

  // Auto-recompute the paired amount when live reserves shift on a new block.
  // Without this the user sees a stale paired number for as long as they keep
  // the form open — same UX as Uniswap's "price has changed" auto-update. Only
  // depends on the live reserves so it doesn't loop on its own setState.
  useEffect(() => {
    if (lpTypedSide === null) return;
    const reserve0 = addLpLiveState.data?.reserve0;
    const reserve1 = addLpLiveState.data?.reserve1;
    if (!reserve0 || !reserve1) return;
    const typedValue = lpTypedSide === 0 ? poolToken0Amount : poolToken1Amount;
    if (!typedValue || parseFloat(typedValue) <= 0) return;
    const paired = computePaired(lpTypedSide, typedValue);
    if (paired === null) return;
    if (lpTypedSide === 0) {
      setPoolToken1Amount(prev => (prev === paired ? prev : paired));
    } else {
      setPoolToken0Amount(prev => (prev === paired ? prev : paired));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLpLiveState.data?.reserve0, addLpLiveState.data?.reserve1]);

  // For 25/50/75% buttons: render the result with 8 total digits (excluding the
  // decimal point) so high-value tokens show 8 decimals (e.g. "0.00000000") and
  // lower-value tokens trade decimals for integer digits (e.g. "100.00000").
  // MAX (percent=1) keeps full 8-decimal precision so the user can spend their
  // whole balance.
  const formatPercentAmount = (value: number, percent: number): string => {
    if (percent === 1) return value.toFixed(8);
    if (!Number.isFinite(value) || value <= 0) return '0.00000000';
    const intDigits = value >= 1 ? Math.floor(value).toString().length : 0;
    const decimals = Math.max(0, 8 - intDigits);
    return value.toFixed(decimals);
  };

  // Handle percentage of balance click for LP token 0
  const handlePercentToken0 = (percent: number) => {
    if (!poolToken0) return;
    let amount: string | null = null;
    if (poolToken0.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      amount = formatPercentAmount((sats * percent) / 1e8, percent);
    } else {
      let balance = walletAlkaneBalances.get(poolToken0.id);
      if (!balance) {
        const cur = idToUserCurrency.get(poolToken0.id);
        balance = cur?.balance;
      }
      if (balance) {
        amount = formatPercentAmount((Number(balance) * percent) / 1e8, percent);
      }
    }
    if (amount !== null) handlePoolToken0AmountChange(amount);
  };

  // Handle percentage of balance click for LP token 1
  const handlePercentToken1 = (percent: number) => {
    if (!poolToken1) return;
    let amount: string | null = null;
    if (poolToken1.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      amount = formatPercentAmount((sats * percent) / 1e8, percent);
    } else {
      let balance = walletAlkaneBalances.get(poolToken1.id);
      if (!balance) {
        const cur = idToUserCurrency.get(poolToken1.id);
        balance = cur?.balance;
      }
      if (balance) {
        amount = formatPercentAmount((Number(balance) * percent) / 1e8, percent);
      }
    }
    if (amount !== null) handlePoolToken1AmountChange(amount);
  };

  // Compute the pool and chart token for the Espo chart.
  // For frBTC pairs → chart shows the non-frBTC token with quote=btc
  // For bUSD pairs → chart shows the non-bUSD token with quote=usd
  // For TOKEN/TOKEN pairs → chart shows the "to" token with quote=usd
  const chartPool = useMemo(() => {
    if (fromToken && toToken) {
      const fromId = fromToken.id === 'btc' ? FRBTC_ALKANE_ID : fromToken.id;
      const toId = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
      return markets.find(p =>
        (p.token0.id === fromId && p.token1.id === toId) ||
        (p.token0.id === toId && p.token1.id === fromId)
      );
    }
    return selectedPool;
  }, [fromToken, toToken, markets, selectedPool, FRBTC_ALKANE_ID]);

  const chartTokenId = useMemo(() => {
    if (!chartPool) return undefined;
    const t0 = chartPool.token0?.id;
    const t1 = chartPool.token1?.id;
    if (t0 === FRBTC_ALKANE_ID) return t1;
    if (t1 === FRBTC_ALKANE_ID) return t0;
    if (t0 === BUSD_ALKANE_ID) return t1;
    if (t1 === BUSD_ALKANE_ID) return t0;
    if (toToken) {
      const toId = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
      if (toId === t0 || toId === t1) return toId;
    }
    return t0;
  }, [chartPool, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, toToken]);

  return (
    <div className="flex w-full flex-col gap-4 h-full">
      {/* Desktop: 12-column grid — Chart (7) + TradeForm/Orderbook (5) */}
      {/* Mobile: stacked — TradeForm first, then data panels */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-3">

        {/* Trade Form — FIRST on mobile (order matters), RIGHT on desktop */}
        <div className="lg:col-span-5 lg:order-2 order-1 min-h-0">
          <div className="flex flex-col gap-3">
            <TradeForm
              fromToken={fromToken}
              toToken={toToken}
              network={network}
              swapInputsProps={{
                from: fromToken,
                to: toToken,
                fromOptions,
                toOptions,
                fromAmount,
                toAmount,
                onChangeFromAmount: (v: string) => { setDirection('sell'); setFromAmount(v); },
                onChangeToAmount: (v: string) => { setDirection('buy'); setToAmount(v); },
                onSelectFromToken: (id: string) => {
                  const t = fromOptions.find((x: any) => x.id === id);
                  if (t) { setFromToken(t); setToToken(undefined); setToAmount(""); }
                },
                onSelectToToken: (symbol: string) => {
                  if (!symbol) { setToToken(undefined); setToAmount(""); return; }
                  const t = toOptions.find((x: any) => x.id === symbol);
                  if (t) setToToken(t);
                },
                onInvert: handleInvert,
                onSwapClick: handleSwap,
                isSwapping: swapMutation.isPending || wrapMutation.isPending || unwrapMutation.isPending,
                fromBalanceText: formatBalance(fromToken?.id),
                toBalanceText: formatBalance(toToken?.id),
                fromFiatText: calculateUsdValue(fromToken?.id, fromAmount),
                toFiatText: calculateUsdValue(toToken?.id, toAmount),
                calculateUsdValue,
                onMaxFrom: fromToken ? handleMaxFrom : undefined,
                onPercentFrom: fromToken ? handlePercentFrom : undefined,
                ethereumAddress,
                onChangeEthereumAddress: setEthereumAddress,
                summary: (
                  <SwapSummary
                    sellId={fromToken?.id ?? ''}
                    buyId={toToken?.id ?? ''}
                    sellName={fromToken?.name ?? fromToken?.symbol}
                    buyName={toToken?.name ?? toToken?.symbol}
                    direction={direction}
                    quote={quote}
                    isCalculating={!!isCalculating}
                    feeRate={fee.feeRate}
                    isCrossChainFrom={['ETH', 'ZEC', 'USDT', 'USDC'].includes(fromToken?.symbol ?? '')}
                    isCrossChainTo={['ETH', 'ZEC', 'USDT', 'USDC'].includes(toToken?.symbol ?? '')}
                    feeSelection={fee.selection}
                    setFeeSelection={fee.setSelection}
                    customFee={fee.custom}
                    setCustomFee={fee.setCustom}
                    feePresets={fee.presets}
                  />
                ),
              }}
              baseToken={fromToken?.symbol || 'DIESEL'}
              quoteToken={toToken?.symbol || 'frBTC'}
              limitSelectedOrder={limitSelectedOrder}
              liquidityProps={{
                token0: poolToken0,
                token1: poolToken1,
                token0Options: poolTokenOptions,
                token1Options: poolTokenOptions,
                token0Amount: poolToken0Amount,
                token1Amount: poolToken1Amount,
                onChangeToken0Amount: handlePoolToken0AmountChange,
                onChangeToken1Amount: handlePoolToken1AmountChange,
                onSelectToken0: (id: string) => {
                  const t = poolTokenOptions.find((x) => x.id === id);
                  if (t) setPoolToken0(t);
                },
                onSelectToken1: (id: string) => {
                  const t = poolTokenOptions.find((x) => x.id === id);
                  if (t) setPoolToken1(t);
                },
                onAddLiquidity: handleAddLiquidity,
                onRemoveLiquidity: handleRemoveLiquidity,
                isLoading: addLiquidityMutation.isPending,
                isRemoveLoading: removeLiquidityMutation.isPending,
                token0BalanceText: formatBalance(poolToken0?.id),
                token1BalanceText: formatBalance(poolToken1?.id),
                token0FiatText: calculateUsdValue(poolToken0?.id, poolToken0Amount),
                token1FiatText: calculateUsdValue(poolToken1?.id, poolToken1Amount),
                onPercentToken0: poolToken0 ? handlePercentToken0 : undefined,
                onPercentToken1: poolToken1 ? handlePercentToken1 : undefined,
                minimumToken0: poolToken0Amount ? (parseFloat(poolToken0Amount) * 0.995).toFixed(
                  poolToken0?.id === 'btc' || poolToken0?.id === FRBTC_ALKANE_ID ? 8 : 2
                ) : undefined,
                minimumToken1: poolToken1Amount ? (parseFloat(poolToken1Amount) * 0.995).toFixed(
                  poolToken1?.id === 'btc' || poolToken1?.id === FRBTC_ALKANE_ID ? 8 : 2
                ) : undefined,
                feeRate: fee.feeRate,
                feeSelection: fee.selection,
                setFeeSelection: fee.setSelection,
                customFee: fee.custom,
                setCustomFee: fee.setCustom,
                feePresets: fee.presets,
                liquidityMode,
                onModeChange: setLiquidityMode,
                selectedLPPosition,
                onSelectLPPosition: setSelectedLPPosition,
                onOpenLPSelector: () => setIsLPSelectorOpen(true),
                removeAmount,
                onChangeRemoveAmount: setRemoveAmount,
              }}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
            />

            {/* Transaction Stepper - shows during multi-step swaps */}
            {showStepper && stepperSteps.length > 0 && (
              <Suspense fallback={null}>
                <TransactionStepper
                  steps={stepperSteps}
                  currentStepIndex={currentStepIndex}
                  network={network}
                  onRetry={() => setSwapFlowStep({ type: 'idle' })}
                />
              </Suspense>
            )}
          </div>
        </div>

        {/* Chart / Orderbook switcher — desktop only (7 cols).
            Buttons are absolutely positioned over the content so the chart/orderbook
            panels can start at the very top of the card while the buttons retain their
            original top-right placement. */}
        <div className="hidden lg:flex lg:col-span-7 lg:order-1 sf-card flex-col h-full overflow-hidden relative" style={{ minHeight: '450px' }}>
          <div className="flex-1 min-h-0 relative">
            {/* Both panels stay mounted so the chart iframe doesn't reload when toggling. */}
            <div className={`absolute inset-0 ${desktopLeftView === 'chart' ? '' : 'invisible pointer-events-none'}`}>
              <PoolDetailsCard pool={chartPool} chartTokenId={chartTokenId} isWrapPair={!chartPool && (isWrapPair || isUnwrapPair || isWrapZecPair || isUnwrapZecPair || isWrapEthPair || isUnwrapEthPair)} bare />
            </div>
            <div className={`absolute inset-0 ${desktopLeftView === 'orderbook' ? '' : 'invisible pointer-events-none'}`}>
              <Suspense fallback={<div className="h-full bg-[color:var(--sf-primary)]/5 rounded-xl animate-pulse" />}>
                <OrderbookPanel
                  baseToken={fromToken?.id || '2:0'}
                  quoteToken={toToken?.id || '32:0'}
                  onOrderSelect={handleOrderbookSelect}
                  bare
                />
              </Suspense>
            </div>
          </div>
          <div className="absolute top-0 right-0 flex items-center justify-end gap-2 p-3 pb-0 z-10 pointer-events-none">
            <button
              onClick={() => setDesktopLeftView('chart')}
              className={`sf-tab-btn pointer-events-auto ${desktopLeftView === 'chart' ? 'sf-tab-btn--active' : ''}`}
            >
              {t('swap.chart')}
            </button>
            <button
              onClick={() => setDesktopLeftView('orderbook')}
              className={`sf-tab-btn pointer-events-auto ${desktopLeftView === 'orderbook' ? 'sf-tab-btn--active' : ''}`}
            >
              {t('swap.orderBook')}
            </button>
          </div>
        </div>

        {/* Mobile data panels — collapsible chart + orderbook (below trade form on mobile) */}
        <div className="lg:hidden order-2">
          <MobileDataPanels
            chartPool={chartPool}
            chartTokenId={chartTokenId}
            isWrapPair={!chartPool && (isWrapPair || isUnwrapPair || isWrapZecPair || isUnwrapZecPair || isWrapEthPair || isUnwrapEthPair)}
            baseTokenId={fromToken?.id || '2:0'}
            quoteTokenId={toToken?.id || '32:0'}
            onOrderSelect={handleOrderbookSelect}
          />
        </div>
      </div>

      {/* Bottom Panels: Open Orders, Positions, Trades, Activity */}
      <BottomPanels
        baseToken={fromToken?.symbol || 'DIESEL'}
        quoteToken={toToken?.symbol || 'frBTC'}
        baseTokenId={fromToken?.id || '2:0'}
        quoteTokenId={toToken?.id || '32:0'}
        poolId={chartPool?.id}
        isWrapPair={isWrapPair || isUnwrapPair}
        onAddLiquidity={(pair) => {
          if (pair.token0Id) {
            setPoolToken0({ id: pair.token0Id, symbol: pair.token0Symbol, name: pair.token0Symbol });
          }
          if (pair.token1Id) {
            setPoolToken1({ id: pair.token1Id, symbol: pair.token1Symbol, name: pair.token1Symbol });
          }
          setLiquidityMode('provide');
          setOrderType('liquidity');
        }}
        onRemoveLiquidity={(pos) => {
          setSelectedLPPosition(pos);
          setLiquidityMode('remove');
          setOrderType('liquidity');
        }}
      />

      <Suspense fallback={null}>
      <TokenSelectorModal
        isOpen={isTokenSelectorOpen}
        onClose={closeTokenSelector}
        tokens={
          (tokenSelectorMode === 'from'
            ? fromTokenOptions
            : tokenSelectorMode === 'pool0' || tokenSelectorMode === 'pool1'
            ? poolTokenOptions
            : toTokenOptions
          ).filter((t) => {
            // Exclude LP/position assets by name/symbol
            const sym = t.symbol || '';
            const nm = t.name || '';
            if (/\bLP\b/i.test(sym) || /\bLP\b/i.test(nm)) return false;
            if (sym.startsWith('POS-') || nm.startsWith('POS-')) return false;
            // Exclude likely NFTs: raw balance of exactly 1 (not a fungible token amount).
            // Fungible alkanes use 8 decimals so "1 token" = 100_000_000 base units.
            // A balance of literally 1 base unit is almost certainly an NFT/inscription marker.
            // Also exclude tokens with no symbol/name (unknown metadata = likely NFT).
            if (t.balance && BigInt(t.balance) === BigInt(1) && !sym && !nm) return false;
            if (t.balance && BigInt(t.balance) === BigInt(1) && (nm.startsWith('Token ') || nm.match(/^\d+:\d+$/))) return false;
            return true;
          })
        }
        onSelectToken={handleTokenSelect}
        selectedTokenId={
          tokenSelectorMode === 'from'
            ? fromToken?.id
            : tokenSelectorMode === 'to'
            ? toToken?.id
            : tokenSelectorMode === 'pool0'
            ? poolToken0?.id
            : poolToken1?.id
        }
        title={
          tokenSelectorMode === 'from'
            ? t('tokenSelector.selectToSwap')
            : tokenSelectorMode === 'to'
            ? t('tokenSelector.selectToReceive')
            : t('tokenSelector.selectToPool')
        }
        network={network}
        mode={tokenSelectorMode}
        selectedBridgeTokenFromOther={
          // Check if the opposite selector has a cross-chain bridge token selected
          tokenSelectorMode === 'from'
            ? (['ETH', 'ZEC', 'USDT', 'USDC'].includes(toToken?.symbol ?? '') ? toToken?.symbol : undefined)
            : tokenSelectorMode === 'to'
            ? (['ETH', 'ZEC', 'USDT', 'USDC'].includes(fromToken?.symbol ?? '') ? fromToken?.symbol : undefined)
            : undefined
        }
        onPercentFrom={tokenSelectorMode === 'from' && fromToken ? handlePercentFrom : undefined}
        activePercent={tokenSelectorMode === 'from' ? getActivePercentFrom() : null}
        onBridgeTokenSelect={(tokenSymbol) => {
          const bridgeTokenMap: Record<string, { name: string }> = {
            ETH: { name: 'ETH' },
            ZEC: { name: 'ZEC' },
            USDT: { name: 'USDT' },
            USDC: { name: 'USDC' },
          };
          const tokenInfo = bridgeTokenMap[tokenSymbol];
          if (tokenInfo) {
            const bridgeToken: TokenMeta = {
              id: tokenSymbol.toLowerCase(),
              symbol: tokenSymbol,
              name: tokenInfo.name,
              isAvailable: true,
            };
            if (tokenSelectorMode === 'from') {
              setFromToken(bridgeToken);
            } else if (tokenSelectorMode === 'to') {
              setToToken(bridgeToken);
            }
          }
          closeTokenSelector();
        }}
      />

      <LPPositionSelectorModal
        isOpen={isLPSelectorOpen}
        onClose={() => setIsLPSelectorOpen(false)}
        positions={lpPositions}
        onSelectPosition={setSelectedLPPosition}
        selectedPositionId={selectedLPPosition?.id}
      />
      </Suspense>
    </div>
  );
}
// frZEC/frETH token selector debug - 1774714498
