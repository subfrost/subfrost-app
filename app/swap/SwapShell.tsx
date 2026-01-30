"use client";

import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
import type { PoolSummary, TokenMeta } from "./types";
import type { TokenOption } from "@/app/components/TokenSelectorModal";
import type { LPPosition } from "./components/LiquidityInputs";
import type { OperationType } from "@/app/components/SwapSuccessNotification";

// Critical path imports - needed immediately
import SwapHeaderTabs from "./components/SwapHeaderTabs";
import { useSwapQuotes } from "@/hooks/useSwapQuotes";
import { useSwapMutation } from "@/hooks/useSwapMutation";
import { useWallet } from "@/context/WalletContext";
import { getConfig } from "@/utils/getConfig";
import { useSellableCurrencies } from "@/hooks/useSellableCurrencies";
import { useEnrichedWalletData } from "@/hooks/useEnrichedWalletData";
import { useGlobalStore } from "@/stores/global";
import { useFeeRate } from "@/hooks/useFeeRate";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { usePools } from "@/hooks/usePools";
import { useAllPoolStats } from "@/hooks/usePoolData";
import { useAllPoolCandleVolumes } from "@/hooks/usePoolCandleVolumes";
import { useModalStore } from "@/stores/modals";
import { useWrapMutation } from "@/hooks/useWrapMutation";
import { useUnwrapMutation } from "@/hooks/useUnwrapMutation";
import { useWrapSwapMutation } from "@/hooks/useWrapSwapMutation";
import { useSwapUnwrapMutation } from "@/hooks/useSwapUnwrapMutation";
import { useAddLiquidityMutation } from "@/hooks/useAddLiquidityMutation";
import { useRemoveLiquidityMutation } from "@/hooks/useRemoveLiquidityMutation";
import { useLPPositions } from "@/hooks/useLPPositions";
import { useTranslation } from '@/hooks/useTranslation';

// Lazy loaded components - split into separate chunks
const SwapInputs = lazy(() => import("./components/SwapInputs"));
const LiquidityInputs = lazy(() => import("./components/LiquidityInputs"));
const MarketsGrid = lazy(() => import("./components/MarketsGrid"));
const PoolDetailsCard = lazy(() => import("./components/PoolDetailsCard"));
const SwapSummary = lazy(() => import("./components/SwapSummary"));
const TransactionSettingsModal = lazy(() => import("@/app/components/TransactionSettingsModal"));
const TokenSelectorModal = lazy(() => import("@/app/components/TokenSelectorModal"));
const LPPositionSelectorModal = lazy(() => import("./components/LPPositionSelectorModal"));
const SwapSuccessNotification = lazy(() => import("@/app/components/SwapSuccessNotification"));
const MyWalletSwaps = lazy(() => import("./components/MyWalletSwaps"));

// Loading skeleton for swap form
const SwapFormSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-24 bg-[color:var(--sf-primary)]/10 rounded-xl" />
    <div className="h-10 w-10 mx-auto bg-[color:var(--sf-primary)]/10 rounded-full" />
    <div className="h-24 bg-[color:var(--sf-primary)]/10 rounded-xl" />
    <div className="h-14 bg-[color:var(--sf-primary)]/10 rounded-xl" />
  </div>
);

// Loading skeleton for markets grid
const MarketsSkeleton = () => (
  <div className="animate-pulse space-y-3">
    <div className="h-20 bg-[color:var(--sf-primary)]/10 rounded-xl" />
    <div className="h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" />
  </div>
);

export default function SwapShell() {
  const { t } = useTranslation();

  // Markets from API: all pools sorted by TVL desc
  const { data: poolsData } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });

  // Enhanced pool stats from our local API (TVL, Volume, APR)
  const { data: poolStats } = useAllPoolStats();

  // Build pool list for candle volume fetching
  const poolsForVolume = useMemo(() => {
    const pools = poolsData?.items ?? [];
    return pools.map(p => ({ id: p.id, token1Id: p.token1.id }));
  }, [poolsData?.items]);

  // Fetch volume data using ammdata.get_candles (24h and 30d volumes)
  const { data: candleVolumes } = useAllPoolCandleVolumes(poolsForVolume);

  // Merge external pool data with our enhanced stats and volume data
  const markets = useMemo<PoolSummary[]>(() => {
    const basePools = poolsData?.items ?? [];

    // Create maps for quick lookup
    const statsMap = new Map<string, NonNullable<typeof poolStats>[string]>();

    if (poolStats) {
      for (const [, stats] of Object.entries(poolStats)) {
        statsMap.set(stats.poolId, stats);
      }
    }

    // Enhance each pool with stats and volume data
    return basePools.map(pool => {
      const stats = statsMap.get(pool.id);
      const candleVolume = candleVolumes?.[pool.id];

      // Calculate token TVL percentages from reserves
      const totalTvl = stats?.tvlUsd || pool.tvlUsd || 0;
      const token0Tvl = totalTvl / 2;
      const token1Tvl = totalTvl / 2;

      // Get volume from candle API (ammdata.get_candles), fall back to stats, then to pool data
      const vol24hUsd = candleVolume?.volume24hUsd ?? stats?.volume24hUsd ?? pool.vol24hUsd;
      const vol30dUsd = candleVolume?.volume30dUsd ?? stats?.volume30dUsd ?? pool.vol30dUsd;

      // Calculate APR: (daily_volume * fee_rate * 365) / TVL * 100
      // Fee rate is 0.8% for LPs (8/1000)
      let apr = stats?.apr ?? pool.apr;
      if (!apr && vol24hUsd && totalTvl > 0) {
        const lpFeeRate = 0.008; // 0.8%
        const dailyFees = (vol24hUsd || 0) * lpFeeRate;
        apr = ((dailyFees * 365) / totalTvl) * 100;
      }

      return {
        ...pool,
        tvlUsd: stats?.tvlUsd ?? pool.tvlUsd,
        token0TvlUsd: stats?.tvlToken0 ?? token0Tvl,
        token1TvlUsd: stats?.tvlToken1 ?? token1Tvl,
        vol24hUsd,
        vol30dUsd,
        apr,
      } as PoolSummary;
    });
  }, [poolsData?.items, poolStats, candleVolumes]);

  // Volume period state (shared between MarketsGrid and PoolDetailsCard)
  const [volumePeriod, setVolumePeriod] = useState<'24h' | '30d'>('30d');

  // Mobile chart visibility state
  const [showMobileChart, setShowMobileChart] = useState(false);

  // Tab state
  const [selectedTab, setSelectedTab] = useState<'swap' | 'lp'>('swap');
  
  // Liquidity mode state
  const [liquidityMode, setLiquidityMode] = useState<'provide' | 'remove'>('provide');

  // Swap state
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
  const [selectedLPPosition, setSelectedLPPosition] = useState<LPPosition | null>(null);
  const [isLPSelectorOpen, setIsLPSelectorOpen] = useState(false);
  const [removeAmount, setRemoveAmount] = useState<string>("");

  // LP positions from wallet (real data from useLPPositions hook)
  const { positions: lpPositions, isLoading: isLoadingLPPositions } = useLPPositions();

  // Debug: log LP positions when they change
  useEffect(() => {
    console.log('[SwapShell] LP positions updated:', lpPositions);
    console.log('[SwapShell] LP positions loading:', isLoadingLPPositions);
  }, [lpPositions, isLoadingLPPositions]);

  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector } = useModalStore();
  const [successTxId, setSuccessTxId] = useState<string | null>(null);
  const [successOperationType, setSuccessOperationType] = useState<OperationType>('swap');
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
  const wrapSwapMutation = useWrapSwapMutation();
  const swapUnwrapMutation = useSwapUnwrapMutation();
  const addLiquidityMutation = useAddLiquidityMutation();
  const removeLiquidityMutation = useRemoveLiquidityMutation();

  // Wallet/config
  const { address, network } = useWallet();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);

  // User tokens (for FROM selector)
  const { data: userCurrencies = [], isFetching: isFetchingUserCurrencies } = useSellableCurrencies(address);
  const idToUserCurrency = useMemo(() => {
    const map = new Map<string, any>();
    userCurrencies.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [userCurrencies]);

  // Build a map from tokenId to token metadata from pools data (has correct symbols)
  const poolTokenMap = useMemo(() => {
    const map = new Map<string, TokenMeta>();
    console.log('[SwapShell] Building poolTokenMap from', markets.length, 'markets');
    markets.forEach((pool) => {
      if (!map.has(pool.token0.id)) {
        map.set(pool.token0.id, pool.token0);
        console.log('[SwapShell] Added token to map:', pool.token0.id, pool.token0.symbol);
      }
      if (!map.has(pool.token1.id)) {
        map.set(pool.token1.id, pool.token1);
        console.log('[SwapShell] Added token to map:', pool.token1.id, pool.token1.symbol);
      }
    });
    console.log('[SwapShell] poolTokenMap has', map.size, 'tokens:', Array.from(map.keys()));
    return map;
  }, [markets]);

  // Default from/to tokens: BTC → BUSD (use pool data for correct symbol)
  useEffect(() => {
    if (!fromToken) setFromToken({ id: 'btc', symbol: 'BTC', name: 'BTC' });
  }, [fromToken]);
  const toInitializedRef = useRef(false);
  useEffect(() => {
    if (!toInitializedRef.current && !toToken && BUSD_ALKANE_ID) {
      // Use poolTokenMap for correct symbol if available, otherwise fallback
      const poolToken = poolTokenMap.get(BUSD_ALKANE_ID);
      const symbol = poolToken?.symbol ?? 'DIESEL';
      const name = poolToken?.name ?? 'DIESEL';
      setToToken({ id: BUSD_ALKANE_ID, symbol, name });
      toInitializedRef.current = true;
    }
  }, [toToken, BUSD_ALKANE_ID, poolTokenMap]);

  // Default LP tokens: Select Token / BTC
  useEffect(() => {
    if (!poolToken1 && selectedTab === 'lp') {
      setPoolToken1({ id: 'btc', symbol: 'BTC', name: 'BTC' });
    }
  }, [poolToken1, selectedTab]);

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
      const symbol = currency.symbol || currency.name || currency.id;
      if (!seen.has(currency.id) && shouldShowToken(currency.id, symbol)) {
        seen.add(currency.id);
        opts.push({
          id: currency.id,
          symbol,
          name: currency.name || currency.symbol || currency.id,
          iconUrl: currency.iconUrl,
          isAvailable: true,
        });
      }
    });

    return opts;
  }, [poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, userCurrencies, network, toToken, baseTokenIds]);

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
    const shouldShowToken = (tokenId: string, symbol: string): boolean => {
      if (tokenId === fromId) return false; // Can't swap to self
      // For BTC/frBTC wrapping, always allow
      if (fromId === 'btc' && tokenId === FRBTC_ALKANE_ID) return true;
      if (fromId === FRBTC_ALKANE_ID && tokenId === 'btc') return true;
      // Always allow base tokens (BTC, frBTC, bUSD) - they show before pools load
      if (baseTokenIds.has(tokenId)) return true;
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
      const symbol = currency.symbol || currency.name || currency.id;
      if (!seen.has(currency.id) && shouldShowToken(currency.id, symbol)) {
        seen.add(currency.id);
        opts.push({
          id: currency.id,
          symbol,
          name: currency.name || currency.symbol || currency.id,
          iconUrl: currency.iconUrl,
          isAvailable: true,
        });
      }
    });

    return opts;
  }, [fromToken, poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, userCurrencies, baseTokenIds, markets, network]);

  // Balances - use useEnrichedWalletData for all balances (BTC and alkanes)
  // This is the same data source used by the Header for consistency
  const { balances: walletBalances, isLoading: isLoadingWalletData, refresh: refreshWalletData } = useEnrichedWalletData();
  // Use walletBalances.bitcoin.total for BTC balance (same as Header)
  const btcBalanceSats = walletBalances?.bitcoin?.total ?? 0;
  const isBalancesLoading = Boolean(isFetchingUserCurrencies || isLoadingWalletData);

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

      // Show 2 decimals for large values (100+), 4 decimals for smaller values
      const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
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
      return `${t('swap.balanceColon')} ${displayBalance.toFixed(4)}`;
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
    if (cur?.priceInfo?.price && cur.priceInfo.price > 0) {
      return cur.priceInfo.price;
    }
    
    // For frBTC, use BTC price
    if (tokenId === FRBTC_ALKANE_ID) {
      return btcPrice;
    }

    // For bUSD and USDT, assume $1
    if (tokenId === BUSD_ALKANE_ID || tokenId === 'usdt') {
      return 1.0;
    }

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

  const handleSwap = async () => {
    console.log('[handleSwap] Called with:', {
      fromToken: fromToken?.id,
      toToken: toToken?.id,
      FRBTC_ALKANE_ID,
      isWrapPair,
      isUnwrapPair,
      fromAmount,
      toAmount,
      direction,
    });

    if (!fromToken || !toToken) return;

    // Wrap/Unwrap direct pairs
    if (isWrapPair) {
      console.log('[handleSwap] isWrapPair=true, calling wrapMutation...');
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          setSuccessOperationType('wrap');
          setSuccessTxId(res.transactionId);
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Wrap error:', e);
        window.alert('Wrap failed. See console for details.');
      }
      return;
    }

    if (isUnwrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          setSuccessOperationType('unwrap');
          setSuccessTxId(res.transactionId);
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap error:', e);
        window.alert('Unwrap failed. See console for details.');
      }
      return;
    }

    // BTC → Token swap: One-click wrap + swap in a single transaction
    if (isBtcToTokenSwap) {
      // We need a quote with poolId for the swap portion
      if (!quote || !quote.poolId) {
        console.error('[SWAP] BTC → Token swap requires quote with poolId');
        window.alert('Unable to find pool for this swap. Please try again.');
        return;
      }

      try {
        console.log('[SWAP] Executing one-click BTC →', toToken.symbol, 'swap');
        const btcAmount = direction === 'sell' ? fromAmount : toAmount;

        const res = await wrapSwapMutation.mutateAsync({
          btcAmount,
          buyAmount: quote.buyAmount,
          buyCurrency: toToken.id,
          maxSlippage,
          feeRate: fee.feeRate,
          poolId: quote.poolId,
          deadlineBlocks,
        });

        if (res?.success && res.transactionId) {
          console.log('[SWAP] One-click BTC → Token swap success:', res.transactionId);
          setSuccessOperationType('swap');
          setSuccessTxId(res.transactionId);
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] BTC → Token swap failed:', e);
        window.alert(`Swap failed: ${e?.message || 'See console for details.'}`);
      }
      return;
    }

    // Token → BTC swap: One-click swap + unwrap in a single transaction
    if (isTokenToBtcSwap) {
      // We need a quote with poolId for the swap portion
      if (!quote || !quote.poolId) {
        console.error('[SWAP] Token → BTC swap requires quote with poolId');
        window.alert('Unable to find pool for this swap. Please try again.');
        return;
      }

      try {
        console.log('[SWAP] Executing one-click', fromToken.symbol, '→ BTC swap');
        const sellAmount = direction === 'sell' ? quote.sellAmount : quote.sellAmount;

        const res = await swapUnwrapMutation.mutateAsync({
          sellCurrency: fromToken.id,
          sellAmount,
          expectedBtcAmount: quote.buyAmount, // frBTC amount ≈ BTC amount
          maxSlippage,
          feeRate: fee.feeRate,
          poolId: quote.poolId,
          deadlineBlocks,
        });

        if (res?.success && res.transactionId) {
          console.log('[SWAP] One-click Token → BTC swap success:', res.transactionId);
          setSuccessOperationType('swap');
          setSuccessTxId(res.transactionId);
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Token → BTC swap failed:', e);
        window.alert(`Swap failed: ${e?.message || 'See console for details.'}`);
      }
      return;
    }

    // Default AMM swap (frBTC/DIESEL or other alkane pairs)
    if (!quote) return;

    // Validate that we have a poolId - confirms a pool exists for this pair
    if (!quote.poolId) {
      console.error('[SWAP] No poolId in quote - cannot execute swap');
      window.alert('Swap failed: Pool not found. Please try again.');
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
    } as const;

    try {
      const res = await swapMutation.mutateAsync(payload as any);
      if (res?.success && res.transactionId) {
        setSuccessOperationType('swap');
        setSuccessTxId(res.transactionId);
      }
    } catch (e: any) {
      console.error('[SWAP] Mutation error:', e?.message);
      window.alert(e?.message || 'Swap failed. See console for details.');
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

  const handleSelectPool = (pool: PoolSummary) => {
    setSelectedPool(pool);
    if (selectedTab === 'swap') {
      setFromToken(pool.token0);
      setToToken(pool.token1);
    } else {
      setPoolToken0(pool.token0);
      setPoolToken1(pool.token1);
    }
  };

  const handleAddLiquidity = async () => {
    console.log('[handleAddLiquidity] Starting...', { poolToken0, poolToken1, poolToken0Amount, poolToken1Amount });

    if (!poolToken0 || !poolToken1) {
      window.alert('Please select both tokens');
      return;
    }

    if (!poolToken0Amount || !poolToken1Amount ||
        parseFloat(poolToken0Amount) <= 0 || parseFloat(poolToken1Amount) <= 0) {
      window.alert('Please enter valid amounts for both tokens');
      return;
    }

    // Handle BTC: requires wrap to frBTC first
    const hasBtc = poolToken0.id === 'btc' || poolToken1.id === 'btc';
    if (hasBtc) {
      window.alert(
        'Adding liquidity with BTC requires wrapping to frBTC first.\n\n' +
        'Please wrap your BTC to frBTC using the Swap tab, then add liquidity with frBTC.'
      );
      return;
    }

    try {
      // Pass poolId if we have a selected pool, so the mutation can call the pool directly
      const poolId = selectedPool?.id
        ? (() => {
            const [block, tx] = selectedPool.id.split(':').map(Number);
            return { block, tx };
          })()
        : undefined;

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
        console.log('[handleAddLiquidity] Success! txid:', result.transactionId);
        setSuccessOperationType('addLiquidity');
        setSuccessTxId(result.transactionId);
        // Clear amounts after success
        setPoolToken0Amount('');
        setPoolToken1Amount('');
      }
    } catch (e: any) {
      console.error('[handleAddLiquidity] Error:', e);
      window.alert(`Add liquidity failed: ${e?.message || 'See console for details'}`);
    }
  };

  const handleRemoveLiquidity = async () => {
    console.log('[handleRemoveLiquidity] Starting...', { selectedLPPosition, removeAmount });

    if (!selectedLPPosition) {
      window.alert('Please select an LP position to remove');
      return;
    }

    if (!removeAmount || parseFloat(removeAmount) <= 0) {
      window.alert('Please enter a valid amount to remove');
      return;
    }

    if (parseFloat(removeAmount) > parseFloat(selectedLPPosition.amount)) {
      window.alert('Amount exceeds your LP position balance');
      return;
    }

    try {
      const result = await removeLiquidityMutation.mutateAsync({
        lpTokenId: selectedLPPosition.id,  // LP token's alkane ID (same as pool ID)
        lpAmount: removeAmount,
        lpDecimals: 8,
        minAmount0: '0',  // No slippage protection for now
        minAmount1: '0',
        token0Decimals: 8,
        token1Decimals: 8,
        feeRate: fee.feeRate,
        deadlineBlocks,
      });

      if (result?.success && result.transactionId) {
        console.log('[handleRemoveLiquidity] Success! txid:', result.transactionId);
        setSuccessOperationType('removeLiquidity');
        setSuccessTxId(result.transactionId);
        // Clear state after success
        setRemoveAmount('');
        setSelectedLPPosition(null);
      }
    } catch (e: any) {
      console.error('[handleRemoveLiquidity] Error:', e);
      window.alert(`Remove liquidity failed: ${e?.message || 'See console for details'}`);
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

    // Map BTC to frBTC for pool checking (BTC multi-hops via frBTC)
    const id1 = token1Id === 'btc' ? FRBTC_ALKANE_ID : token1Id;
    const id2 = token2Id === 'btc' ? FRBTC_ALKANE_ID : token2Id;

    // Check if there's an actual pool with these two tokens
    return markets.some(p =>
      (p.token0.id === id1 && p.token1.id === id2) ||
      (p.token0.id === id2 && p.token1.id === id1)
    );
  }, [markets, FRBTC_ALKANE_ID]);

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

  // Prepare token options for modal with balances and prices
  const fromTokenOptions = useMemo<TokenOption[]>(() => {
    const options = fromOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      // Check if token has an allowed pool with the selected TO token
      let isAvailable = true;
      if (toToken) {
        // Check if this pair is in the allowed list
        isAvailable = isAllowedPair(token.id, toToken.id);
      }
      
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        iconUrl: token.id === 'btc' ? undefined : (token.iconUrl || currency?.iconUrl),
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: currency?.priceInfo?.price,
        isAvailable,
      };
    });
    
    return sortTokenOptions(options);
  }, [fromOptions, idToUserCurrency, btcBalanceSats, toToken, isAllowedPair]);

  const toTokenOptions = useMemo<TokenOption[]>(() => {
    const options = toOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      // Check if token has an allowed pool with the selected FROM token
      let isAvailable = true;
      if (fromToken) {
        // Check if this pair is in the allowed list
        isAvailable = isAllowedPair(token.id, fromToken.id);
      }

      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        iconUrl: token.id === 'btc' ? undefined : (token.iconUrl || currency?.iconUrl),
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: currency?.priceInfo?.price,
        isAvailable,
      };
    });

    return sortTokenOptions(options);
  }, [toOptions, idToUserCurrency, btcBalanceSats, fromToken, isAllowedPair]);

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
    
    // Build full list of all allowed tokens for LP
    const opts: TokenOption[] = [];
    
    // Add BTC first
    let btcIsAvailable = counterpartToken 
      ? isAllowedPair('btc', counterpartToken.id)
      : true; // If no counterpart, BTC is always available
    
    // For LP mode, disallow BTC/frBTC pairing
    if (counterpartToken && (counterpartToken.id === FRBTC_ALKANE_ID)) {
      btcIsAvailable = false;
    }
    
    opts.push({
      id: 'btc',
      symbol: 'BTC',
      name: 'BTC',
      iconUrl: undefined,
      balance: String(btcBalanceSats ?? 0),
      price: undefined,
      isAvailable: btcIsAvailable,
    });

    // Get whitelisted pool tokens only
    const seen = new Set(['btc']); // BTC already added above

    // Always add frBTC as a base token (available before pools load)
    if (FRBTC_ALKANE_ID && !seen.has(FRBTC_ALKANE_ID)) {
      seen.add(FRBTC_ALKANE_ID);
      const frbtcCurrency = idToUserCurrency.get(FRBTC_ALKANE_ID);
      let frbtcIsAvailable = true;
      if (counterpartToken) {
        frbtcIsAvailable = isAllowedPair(FRBTC_ALKANE_ID, counterpartToken.id);
        // For LP mode, disallow BTC/frBTC pairing
        if (counterpartToken.id === 'btc') {
          frbtcIsAvailable = false;
        }
      }
      opts.push({
        id: FRBTC_ALKANE_ID,
        symbol: 'frBTC',
        name: 'frBTC',
        iconUrl: frbtcCurrency?.iconUrl,
        balance: frbtcCurrency?.balance,
        price: frbtcCurrency?.priceInfo?.price,
        isAvailable: frbtcIsAvailable,
      });
    }

    // Always add BUSD/DIESEL as a base token (available before pools load)
    if (BUSD_ALKANE_ID && !seen.has(BUSD_ALKANE_ID)) {
      seen.add(BUSD_ALKANE_ID);
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
        price: busdCurrency?.priceInfo?.price,
        isAvailable: busdIsAvailable,
      });
    }
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if (!seen.has(poolToken.id)) {
        seen.add(poolToken.id);
        const currency = idToUserCurrency.get(poolToken.id);

        // Check if this token can pair with the counterpart token (if selected)
        let isAvailable = true;
        if (counterpartToken) {
          isAvailable = isAllowedPair(poolToken.id, counterpartToken.id);

          // For LP mode, disallow BTC/frBTC pairing
          if (poolToken.id === FRBTC_ALKANE_ID && counterpartToken.id === 'btc') {
            isAvailable = false;
          }
        }

        opts.push({
          id: poolToken.id,
          symbol: poolToken.symbol,
          name: poolToken.name,
          iconUrl: poolToken.iconUrl || currency?.iconUrl,
          balance: poolToken.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
          price: currency?.priceInfo?.price,
          isAvailable,
        });
      }
    });

    // Also add tokens from user's wallet that aren't in pools yet
    // This allows users to add liquidity for new token pairs
    userCurrencies.forEach((currency: any) => {
      const symbol = currency.symbol || currency.name || currency.id;

      if (!seen.has(currency.id)) {
        seen.add(currency.id);

        // Check if this token can pair with the counterpart token (if selected)
        let isAvailable = true;
        if (counterpartToken) {
          isAvailable = isAllowedPair(currency.id, counterpartToken.id);

          // For LP mode, disallow BTC/frBTC pairing
          if (currency.id === FRBTC_ALKANE_ID && counterpartToken.id === 'btc') {
            isAvailable = false;
          }
        }

        opts.push({
          id: currency.id,
          symbol,
          name: currency.name || currency.symbol || currency.id,
          iconUrl: currency.iconUrl,
          balance: currency.balance,
          price: currency.priceInfo?.price,
          isAvailable,
        });
      }
    });

    console.log('[poolTokenOptions] Built options:', opts.length, 'tokens');
    console.log('[poolTokenOptions] userCurrencies count:', userCurrencies?.length || 0);
    console.log('[poolTokenOptions] poolTokenMap size:', poolTokenMap?.size || 0);
    console.log('[poolTokenOptions] opts:', opts.map(o => ({ id: o.id, symbol: o.symbol })));

    return sortTokenOptions(opts);
  }, [markets, idToUserCurrency, userCurrencies, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, poolTokenMap, btcBalanceSats, tokenSelectorMode, poolToken0, poolToken1, isAllowedPair, network]);

  const handleTokenSelect = (tokenId: string) => {
    if (tokenSelectorMode === 'from') {
      const token = fromOptions.find((t) => t.id === tokenId);
      if (token) {
        // If selecting the same token as TO, swap them
        if (toToken && toToken.id === tokenId) {
          setToToken(fromToken);
        }
        setFromToken(token);
        setToAmount("");
      }
    } else if (tokenSelectorMode === 'to') {
      const token = toOptions.find((t) => t.id === tokenId);
      if (token) {
        // If selecting the same token as FROM, swap them
        if (fromToken && fromToken.id === tokenId) {
          setFromToken(toToken);
        }
        console.log('[DEBUG] Setting toToken:', token);
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
      const btc = sats / 1e8;
      setDirection('sell');
      setFromAmount(btc.toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        const amt = Number(cur.balance) / 1e8;
        setDirection('sell');
        // Use 8 decimals for frBTC, 2 for other tokens
        const decimals = fromToken.id === FRBTC_ALKANE_ID ? 8 : 2;
        setFromAmount(amt.toFixed(decimals));
      }
    }
  };

  // Handle percentage of balance click
  const handlePercentFrom = (percent: number) => {
    if (!fromToken) return;
    if (fromToken.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = (sats * percent) / 1e8;
      setDirection('sell');
      setFromAmount(btc.toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        const amt = (Number(cur.balance) * percent) / 1e8;
        setDirection('sell');
        // Use 8 decimals for frBTC, 2 for other tokens
        const decimals = fromToken.id === FRBTC_ALKANE_ID ? 8 : 2;
        setFromAmount(amt.toFixed(decimals));
      }
    }
  };

  // Handle percentage of balance click for LP token 0
  const handlePercentToken0 = (percent: number) => {
    if (!poolToken0) return;
    if (poolToken0.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = (sats * percent) / 1e8;
      setPoolToken0Amount(btc.toFixed(8));
    } else {
      // Try walletAlkaneBalances first, then idToUserCurrency
      let balance = walletAlkaneBalances.get(poolToken0.id);
      if (!balance) {
        const cur = idToUserCurrency.get(poolToken0.id);
        balance = cur?.balance;
      }
      if (balance) {
        const amt = (Number(balance) * percent) / 1e8;
        const decimals = poolToken0.id === FRBTC_ALKANE_ID ? 8 : 4;
        setPoolToken0Amount(amt.toFixed(decimals));
      }
    }
  };

  // Handle percentage of balance click for LP token 1
  const handlePercentToken1 = (percent: number) => {
    if (!poolToken1) return;
    if (poolToken1.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = (sats * percent) / 1e8;
      setPoolToken1Amount(btc.toFixed(8));
    } else {
      // Try walletAlkaneBalances first, then idToUserCurrency
      let balance = walletAlkaneBalances.get(poolToken1.id);
      if (!balance) {
        const cur = idToUserCurrency.get(poolToken1.id);
        balance = cur?.balance;
      }
      if (balance) {
        const amt = (Number(balance) * percent) / 1e8;
        const decimals = poolToken1.id === FRBTC_ALKANE_ID ? 8 : 4;
        setPoolToken1Amount(amt.toFixed(decimals));
      }
    }
  };

  return (
    <div className="flex w-full flex-col gap-8 h-full">
      <Suspense fallback={null}>
        {successTxId && (
          <SwapSuccessNotification
            txId={successTxId}
            onClose={() => setSuccessTxId(null)}
            operationType={successOperationType}
          />
        )}
      </Suspense>

      <div className="flex flex-col md:grid md:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Left Column: Swap/LP Module */}
        <div className="flex flex-col min-h-0 md:min-h-0">
          {/* Swap/Liquidity Tabs */}
          <div className="flex w-full items-center justify-center mb-4">
            <SwapHeaderTabs selectedTab={selectedTab} onTabChange={setSelectedTab} />
          </div>

          <section className="relative w-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md flex-shrink-0 border-t border-[color:var(--sf-top-highlight)]">
          <Suspense fallback={<SwapFormSkeleton />}>
          {selectedTab === 'swap' ? (
            <SwapInputs
              from={fromToken}
              to={toToken}
              fromOptions={fromOptions}
              toOptions={toOptions}
              fromAmount={fromAmount}
              toAmount={toAmount}
              onChangeFromAmount={(v) => { setDirection('sell'); setFromAmount(v); }}
              onChangeToAmount={(v) => { setDirection('buy'); setToAmount(v); }}
              onSelectFromToken={(id) => {
                const t = fromOptions.find((x) => x.id === id);
                if (t) {
                  setFromToken(t);
                  // Reset TO selection when FROM changes
                  setToToken(undefined);
                  setToAmount("");
                }
              }}
              onSelectToToken={(symbol) => {
                if (!symbol) {
                  setToToken(undefined);
                  setToAmount("");
                  return;
                }
                const t = toOptions.find((x) => x.id === symbol);
                if (t) setToToken(t);
              }}
              onInvert={handleInvert}
              onSwapClick={handleSwap}
              fromBalanceText={formatBalance(fromToken?.id)}
              toBalanceText={formatBalance(toToken?.id)}
              fromFiatText={calculateUsdValue(fromToken?.id, fromAmount)}
              toFiatText={calculateUsdValue(toToken?.id, toAmount)}
              onMaxFrom={fromToken ? handleMaxFrom : undefined}
              onPercentFrom={fromToken ? handlePercentFrom : undefined}
              ethereumAddress={ethereumAddress}
              onChangeEthereumAddress={setEthereumAddress}
              summary={
                <SwapSummary
                  sellId={fromToken?.id ?? ''}
                  buyId={toToken?.id ?? ''}
                  sellName={fromToken?.name ?? fromToken?.symbol}
                  buyName={toToken?.name ?? toToken?.symbol}
                  direction={direction}
                  quote={quote}
                  isCalculating={!!isCalculating}
                  feeRate={fee.feeRate}
                  isCrossChainFrom={['USDT', 'ETH', 'SOL', 'ZEC'].includes(fromToken?.symbol ?? '')}
                  feeSelection={fee.selection}
                  setFeeSelection={fee.setSelection}
                  customFee={fee.custom}
                  setCustomFee={fee.setCustom}
                  feePresets={fee.presets}
                />
              }
            />
          ) : (
            <LiquidityInputs
              token0={poolToken0}
              token1={poolToken1}
              token0Options={poolTokenOptions}
              token1Options={poolTokenOptions}
              token0Amount={poolToken0Amount}
              token1Amount={poolToken1Amount}
              onChangeToken0Amount={setPoolToken0Amount}
              onChangeToken1Amount={setPoolToken1Amount}
              onSelectToken0={(id) => {
                const t = poolTokenOptions.find((x) => x.id === id);
                if (t) setPoolToken0(t);
              }}
              onSelectToken1={(id) => {
                const t = poolTokenOptions.find((x) => x.id === id);
                if (t) setPoolToken1(t);
              }}
              onAddLiquidity={handleAddLiquidity}
              onRemoveLiquidity={handleRemoveLiquidity}
              isLoading={addLiquidityMutation.isPending}
              isRemoveLoading={removeLiquidityMutation.isPending}
              token0BalanceText={formatBalance(poolToken0?.id)}
              token1BalanceText={formatBalance(poolToken1?.id)}
              token0FiatText="$0.00"
              token1FiatText="$0.00"
              onPercentToken0={poolToken0 ? handlePercentToken0 : undefined}
              onPercentToken1={poolToken1 ? handlePercentToken1 : undefined}
              minimumToken0={poolToken0Amount ? (parseFloat(poolToken0Amount) * 0.995).toFixed(
                poolToken0?.id === 'btc' || poolToken0?.id === FRBTC_ALKANE_ID ? 8 : 2
              ) : undefined}
              minimumToken1={poolToken1Amount ? (parseFloat(poolToken1Amount) * 0.995).toFixed(
                poolToken1?.id === 'btc' || poolToken1?.id === FRBTC_ALKANE_ID ? 8 : 2
              ) : undefined}
              feeRate={fee.feeRate}
              feeSelection={fee.selection}
              setFeeSelection={fee.setSelection}
              customFee={fee.custom}
              setCustomFee={fee.setCustom}
              feePresets={fee.presets}
              liquidityMode={liquidityMode}
              onModeChange={setLiquidityMode}
              selectedLPPosition={selectedLPPosition}
              onSelectLPPosition={setSelectedLPPosition}
              onOpenLPSelector={() => setIsLPSelectorOpen(true)}
              removeAmount={removeAmount}
              onChangeRemoveAmount={setRemoveAmount}
            />
          )}
          </Suspense>
          </section>

          {/* Mobile Chart Toggle Button */}
          <button
            type="button"
            onClick={() => setShowMobileChart(!showMobileChart)}
            className="md:hidden mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/70 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/80 hover:text-[color:var(--sf-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            {showMobileChart ? t('swap.hideChart') : t('swap.showChart')}
          </button>

          {/* Mobile-only Chart - below swap form */}
          {showMobileChart && (
            <div className="md:hidden mt-4">
              <Suspense fallback={<div className="animate-pulse h-48 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
                <PoolDetailsCard
                  pool={selectedTab === 'lp' && poolToken0 && poolToken1
                    ? markets.find(p => {
                        const token0Id = poolToken0.id === 'btc' ? FRBTC_ALKANE_ID : poolToken0.id;
                        const token1Id = poolToken1.id === 'btc' ? FRBTC_ALKANE_ID : poolToken1.id;
                        return (
                          (p.token0.id === token0Id && p.token1.id === token1Id) ||
                          (p.token0.id === token1Id && p.token1.id === token0Id)
                        );
                      })
                    : selectedTab === 'swap' && fromToken && toToken
                    ? markets.find(p => {
                        const from0Id = fromToken.id === 'btc' ? FRBTC_ALKANE_ID : fromToken.id;
                        const to1Id = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
                        return (
                          (p.token0.id === from0Id && p.token1.id === to1Id) ||
                          (p.token0.id === to1Id && p.token1.id === from0Id)
                        );
                      })
                    : selectedPool
                  }
                />
              </Suspense>
            </div>
          )}

          {/* My Wallet Swaps - desktop only, under swap modal */}
          <div className="hidden md:block mt-8">
            <Suspense fallback={<div className="animate-pulse h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
              <MyWalletSwaps />
            </Suspense>
          </div>
        </div>

        {/* Right Column: TVL and Markets */}
        <Suspense fallback={<MarketsSkeleton />}>
        <div className="flex flex-col gap-4">
          {/* Desktop-only Chart - hidden on mobile where it appears above swap form */}
          <div className="hidden md:block">
          <PoolDetailsCard
            pool={selectedTab === 'lp' && poolToken0 && poolToken1
              ? markets.find(p => {
                  const token0Id = poolToken0.id === 'btc' ? FRBTC_ALKANE_ID : poolToken0.id;
                  const token1Id = poolToken1.id === 'btc' ? FRBTC_ALKANE_ID : poolToken1.id;
                  return (
                    (p.token0.id === token0Id && p.token1.id === token1Id) ||
                    (p.token0.id === token1Id && p.token1.id === token0Id)
                  );
                })
              : selectedTab === 'swap' && fromToken && toToken
              ? markets.find(p => {
                  const from0Id = fromToken.id === 'btc' ? FRBTC_ALKANE_ID : fromToken.id;
                  const to1Id = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
                  return (
                    (p.token0.id === from0Id && p.token1.id === to1Id) ||
                    (p.token0.id === to1Id && p.token1.id === from0Id)
                  );
                })
              : selectedPool
            }
          />
          </div>
          <MarketsGrid
            pools={markets}
            onSelect={handleSelectPool}
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
          />
        </div>
        </Suspense>
      </div>

      {/* My Wallet Swaps - mobile only, at the bottom under market cards */}
      <div className="md:hidden mt-6">
        <Suspense fallback={<div className="animate-pulse h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
          <MyWalletSwaps />
        </Suspense>
      </div>

      <Suspense fallback={null}>
      <TransactionSettingsModal
        selection={fee.selection}
        setSelection={fee.setSelection}
        custom={fee.custom}
        setCustom={fee.setCustom}
        feeRate={fee.feeRate}
        isCrossChainFrom={['USDT', 'ETH', 'SOL', 'ZEC'].includes(fromToken?.symbol ?? '')}
      />

      <TokenSelectorModal
        isOpen={isTokenSelectorOpen}
        onClose={closeTokenSelector}
        tokens={
          tokenSelectorMode === 'from'
            ? fromTokenOptions
            : tokenSelectorMode === 'pool0' || tokenSelectorMode === 'pool1'
            ? poolTokenOptions
            : toTokenOptions
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
            ? (['USDT', 'ETH', 'SOL', 'ZEC'].includes(toToken?.symbol ?? '') ? toToken?.symbol : undefined)
            : tokenSelectorMode === 'to'
            ? (['USDT', 'ETH', 'SOL', 'ZEC'].includes(fromToken?.symbol ?? '') ? fromToken?.symbol : undefined)
            : undefined
        }
        onBridgeTokenSelect={(tokenSymbol) => {
          const bridgeTokenMap: Record<string, { name: string }> = {
            USDT: { name: 'USDT' },
            ETH: { name: 'ETH' },
            SOL: { name: 'SOL' },
            ZEC: { name: 'ZEC' },
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
