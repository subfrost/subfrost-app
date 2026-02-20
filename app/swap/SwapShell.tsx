"use client";

import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
import type { PoolSummary, TokenMeta } from "./types";
import type { TokenOption } from "@/app/components/TokenSelectorModal";
import type { LPPosition } from "./components/LiquidityInputs";
import { useNotification } from "@/context/NotificationContext";

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
import { useModalStore } from "@/stores/modals";
import BigNumber from 'bignumber.js';
import { useWrapMutation } from "@/hooks/useWrapMutation";
import { useUnwrapMutation } from "@/hooks/useUnwrapMutation";
import { useWrapSwapMutation } from "@/hooks/useWrapSwapMutation";
import { useSwapUnwrapMutation } from "@/hooks/useSwapUnwrapMutation";
import { useFrbtcPremium } from "@/hooks/useFrbtcPremium";
import { FRBTC_WRAP_FEE_PER_1000 } from "@/constants/alkanes";
import { useAddLiquidityMutation } from "@/hooks/useAddLiquidityMutation";
import { useTokenNames, resolveTokenDisplay } from "@/hooks/useTokenNames";
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
  const { data: poolsData, isLoading: isLoadingPools } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });

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

      return {
        ...pool,
        tvlUsd: pool.tvlUsd || stats?.tvlUsd || 0,
        token0TvlUsd: pool.token0TvlUsd || stats?.tvlToken0 || (pool.tvlUsd || 0) / 2,
        token1TvlUsd: pool.token1TvlUsd || stats?.tvlToken1 || (pool.tvlUsd || 0) / 2,
        vol24hUsd: pool.vol24hUsd || stats?.volume24hUsd || 0,
        vol30dUsd: pool.vol30dUsd || stats?.volume30dUsd || 0,
        apr: pool.apr || stats?.apr || 0,
      } as PoolSummary;
    });
  }, [poolsData?.items, poolStats]);

  // Volume period state (shared between MarketsGrid and PoolDetailsCard)
  const [volumePeriod, setVolumePeriod] = useState<'24h' | '30d'>('30d');

  // Mobile chart visibility state
  const [showMobileChart, setShowMobileChart] = useState(false);

  // Tab state
  const [selectedTab, setSelectedTab] = useState<'swap' | 'lp'>('swap');
  
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
  const [selectedLPPosition, setSelectedLPPosition] = useState<LPPosition | null>(null);
  const [isLPSelectorOpen, setIsLPSelectorOpen] = useState(false);
  const [removeAmount, setRemoveAmount] = useState<string>("");

  // LP positions from wallet (real data from useLPPositions hook)
  const { positions: lpPositions, isLoading: isLoadingLPPositions } = useLPPositions();

  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector } = useModalStore();
  const { showNotification } = useNotification();
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
  const { data: premiumData } = useFrbtcPremium();

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

  // Initialize swap tokens and selected pool from trending pool when available.
  // Wait for BOTH pools AND poolStats to finish loading for accurate trending calculation.
  // Using a ref ensures we only do this once, even if topVolumePool reference changes.
  const trendingPoolInitializedRef = useRef(false);
  useEffect(() => {
    // Don't initialize until both queries have completed loading
    // AND poolStats actually has data (not empty object)
    // AND that data has been merged (markets has volume data)
    const bothQueriesLoaded = !isLoadingPools && !isLoadingPoolStats;
    const dataReady = bothQueriesLoaded && poolStatsHasData && hasVolumeDataMerged;

    if (!trendingPoolInitializedRef.current && topVolumePool && dataReady) {
      console.log('[SwapShell] Initializing trending pool:', topVolumePool.pairLabel, {
        vol24h: topVolumePool.vol24hUsd,
        vol30d: topVolumePool.vol30dUsd,
        tvl: topVolumePool.tvlUsd,
      });
      setFromToken(topVolumePool.token0);
      setToToken(topVolumePool.token1);
      setSelectedPool(topVolumePool);
      trendingPoolInitializedRef.current = true;
    }
  }, [topVolumePool, isLoadingPools, isLoadingPoolStats, poolStatsHasData, hasVolumeDataMerged]);

  // Default LP tokens: frBTC / DIESEL (or bUSD on mainnet)
  // Initialize both poolToken0 and poolToken1 with default values when entering LP tab
  useEffect(() => {
    if (selectedTab === 'lp') {
      // Set default token0 to frBTC if not already set
      if (!poolToken0 && FRBTC_ALKANE_ID) {
        setPoolToken0({ id: FRBTC_ALKANE_ID, symbol: 'frBTC', name: 'frBTC' });
      }
      // Set default token1 to DIESEL/bUSD if not already set
      if (!poolToken1 && BUSD_ALKANE_ID) {
        const symbol = network === 'mainnet' ? 'bUSD' : 'DIESEL';
        setPoolToken1({ id: BUSD_ALKANE_ID, symbol, name: symbol });
      }
    }
  }, [selectedTab, poolToken0, poolToken1, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, network]);

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
  }, [poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, userCurrencies, tokenNamesMap, network, toToken, baseTokenIds]);

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
  }, [fromToken, poolTokenMap, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, userCurrencies, tokenNamesMap, baseTokenIds, markets, network]);

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
          showNotification(res.transactionId, 'wrap');
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
          showNotification(res.transactionId, 'unwrap');
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap error:', e);
        window.alert('Unwrap failed. See console for details.');
      }
      return;
    }

    // BTC → Token swap: Two-step wrap (BTC→frBTC) then swap (frBTC→Token)
    //
    // NOTE: This was previously a single-tx atomic wrap+swap using useWrapSwapMutation.
    // That approach failed because the protostone `pointer` field only supports output
    // indices (v0, v1), not protostone indices (p1, p2). The wrap cellpack's pointer=p1
    // didn't deliver frBTC to the swap cellpack's incomingAlkanes. The factory received
    // zero tokens and reverted with "balance underflow". See useWrapSwapMutation.ts header
    // for full investigation details.
    //
    // The two-step approach: wrap first, mine a block (regtest), then swap the frBTC.
    if (isBtcToTokenSwap) {
      if (!quote || !quote.poolId) {
        console.error('[SWAP] BTC → Token swap requires quote with poolId');
        window.alert('Unable to find pool for this swap. Please try again.');
        return;
      }

      try {
        console.log('[SWAP] BTC →', toToken.symbol, ': Step 1/2 — Wrapping BTC to frBTC');
        // fromAmount is always BTC here (it's the "from" token in BTC→Token swaps).
        // When direction='sell', user typed the BTC amount directly.
        // When direction='buy', user typed the target token amount and fromAmount
        // was back-calculated from the quote (via quote.displaySellAmount).
        const btcAmount = fromAmount;

        // Step 1: Wrap BTC → frBTC
        const wrapRes = await wrapMutation.mutateAsync({
          amount: btcAmount,
          feeRate: fee.feeRate,
        });

        if (!wrapRes?.success || !wrapRes.transactionId) {
          throw new Error('Wrap step failed — no transaction ID returned');
        }
        console.log('[SWAP] Step 1 complete — wrap txid:', wrapRes.transactionId);

        // Mine a block and wait for esplora to index it (regtest only).
        // The swap step needs fresh UTXO data — if we proceed too early,
        // the SDK will try to spend UTXOs that the wrap tx already consumed,
        // causing "bad-txns-inputs-missingorspent" on broadcast.
        const isRegtest = ['regtest', 'subfrost-regtest', 'oylnet', 'regtest-local'].includes(network);
        if (isRegtest && address) {
          console.log('[SWAP] Mining block to confirm wrap transaction...');
          try {
            await fetch('/api/regtest/mine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blocks: 1, address }),
            });
            // Poll esplora until the wrap tx is confirmed (indexer lag can be 3-15s)
            const wrapTxId = wrapRes.transactionId;
            const maxPollAttempts = 20;
            for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              try {
                const txResp = await fetch('/api/rpc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'esplora_tx',
                    params: [wrapTxId],
                    id: 1,
                  }),
                });
                const txData = await txResp.json();
                if (txData?.result?.status?.confirmed) {
                  console.log(`[SWAP] Wrap tx confirmed after ${(attempt + 1) * 1.5}s`);
                  // Extra wait for esplora UTXO index to update after tx confirmation
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  break;
                }
                console.log(`[SWAP] Polling wrap tx... attempt ${attempt + 1}/${maxPollAttempts}`);
              } catch {
                // Polling error — keep retrying
              }
            }
          } catch (mineErr) {
            console.warn('[SWAP] Mine failed (non-fatal):', mineErr);
          }
        }

        // Step 2: Swap frBTC → Target token
        console.log('[SWAP] Step 2/2 — Swapping frBTC →', toToken.symbol);

        // Calculate frBTC amount after wrap fee (same logic as useWrapSwapMutation)
        const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
        const btcSats = new BigNumber(btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
        const frbtcAmount = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
          .integerValue(BigNumber.ROUND_FLOOR).toString();

        const swapRes = await swapMutation.mutateAsync({
          sellCurrency: FRBTC_ALKANE_ID,
          buyCurrency: toToken.id,
          direction: 'sell',
          sellAmount: frbtcAmount,
          buyAmount: quote.buyAmount,
          maxSlippage,
          feeRate: fee.feeRate,
          poolId: quote.poolId,
          deadlineBlocks,
        });

        if (swapRes?.success && swapRes.transactionId) {
          console.log('[SWAP] Step 2 complete — swap txid:', swapRes.transactionId);
          showNotification(swapRes.transactionId, 'swap');
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
          showNotification(res.transactionId, 'swap');
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
        showNotification(res.transactionId, 'swap');
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
        showNotification(result.transactionId, 'addLiquidity');
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
        showNotification(result.transactionId, 'removeLiquidity');
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

  // Prepare token options for modal with balances and prices.
  // resolveTokenDisplay is imported from useTokenNames — uses tokenNamesMap as primary source.

  // Diagnostic: log token name data sources (runs once per data change, not every render)
  useEffect(() => {
    if (!tokenNamesMap || tokenNamesMap.size === 0) return;
    console.log(`[SwapShell] tokenNamesMap loaded: ${tokenNamesMap.size} token names from /get-alkanes`);
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
        price: currency?.priceInfo?.price,
        isAvailable,
      };
    });

    return sortTokenOptions(options);
  }, [fromOptions, idToUserCurrency, tokenNamesMap, walletAlkaneNames, btcBalanceSats, toToken, isAllowedPair]);

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
        price: currency?.priceInfo?.price,
        isAvailable,
      };
    });

    return sortTokenOptions(options);
  }, [toOptions, idToUserCurrency, tokenNamesMap, walletAlkaneNames, btcBalanceSats, fromToken, isAllowedPair]);

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
    
    // Add BTC first (hide if counterpart is frBTC or BTC itself)
    const btcHidden = counterpartId === FRBTC_ALKANE_ID || counterpartId === 'btc';
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
        price: undefined,
        isAvailable: btcIsAvailable,
      });
    }

    // Get whitelisted pool tokens only
    const seen = new Set(['btc']); // BTC already added above

    // Always add frBTC as a base token (hide if counterpart is BTC or frBTC itself)
    const frbtcHidden = counterpartId === 'btc' || counterpartId === FRBTC_ALKANE_ID;
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
          price: frbtcCurrency?.priceInfo?.price,
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
          price: busdCurrency?.priceInfo?.price,
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
          price: currency?.priceInfo?.price,
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
          price: currency.priceInfo?.price,
          isAvailable,
        });
      }
    });

    return sortTokenOptions(opts);
  }, [markets, idToUserCurrency, userCurrencies, tokenNamesMap, walletAlkaneNames, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, poolTokenMap, btcBalanceSats, tokenSelectorMode, poolToken0, poolToken1, isAllowedPair, network]);

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

  // Compute the pool and chart token for the Espo chart.
  // For frBTC pairs → chart shows the non-frBTC token with quote=btc
  // For bUSD pairs → chart shows the non-bUSD token with quote=usd
  // For TOKEN/TOKEN pairs → chart shows the "to" token with quote=usd
  const chartPool = useMemo(() => {
    if (selectedTab === 'lp' && poolToken0 && poolToken1) {
      const token0Id = poolToken0.id === 'btc' ? FRBTC_ALKANE_ID : poolToken0.id;
      const token1Id = poolToken1.id === 'btc' ? FRBTC_ALKANE_ID : poolToken1.id;
      return markets.find(p =>
        (p.token0.id === token0Id && p.token1.id === token1Id) ||
        (p.token0.id === token1Id && p.token1.id === token0Id)
      );
    }
    if (selectedTab === 'swap' && fromToken && toToken) {
      const fromId = fromToken.id === 'btc' ? FRBTC_ALKANE_ID : fromToken.id;
      const toId = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
      return markets.find(p =>
        (p.token0.id === fromId && p.token1.id === toId) ||
        (p.token0.id === toId && p.token1.id === fromId)
      );
    }
    return selectedPool;
  }, [selectedTab, poolToken0, poolToken1, fromToken, toToken, markets, selectedPool, FRBTC_ALKANE_ID]);

  const chartTokenId = useMemo(() => {
    if (!chartPool) return undefined;
    const t0 = chartPool.token0?.id;
    const t1 = chartPool.token1?.id;
    // frBTC pairs: show the non-frBTC token
    if (t0 === FRBTC_ALKANE_ID) return t1;
    if (t1 === FRBTC_ALKANE_ID) return t0;
    // bUSD pairs: show the non-bUSD token
    if (t0 === BUSD_ALKANE_ID) return t1;
    if (t1 === BUSD_ALKANE_ID) return t0;
    // TOKEN/TOKEN: show the "to" token (the token user is swapping into)
    if (selectedTab === 'swap' && toToken) {
      const toId = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
      if (toId === t0 || toId === t1) return toId;
    }
    return t0;
  }, [chartPool, FRBTC_ALKANE_ID, BUSD_ALKANE_ID, selectedTab, toToken]);

  return (
    <div className="flex w-full flex-col gap-8 h-full">
      <div className="flex flex-col lg:grid lg:grid-cols-5 xl:grid-cols-3 gap-6">
        {/* Left Column: Swap/LP Module (2/5 on lg, 1/3 on xl) */}
        <div className="flex flex-col min-h-0 lg:col-span-2 xl:col-span-1">
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
            className="lg:hidden mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/70 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/80 hover:text-[color:var(--sf-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            {showMobileChart ? t('swap.hideChart') : t('swap.showChart')}
          </button>

          {/* Mobile-only Chart - below swap form */}
          {showMobileChart && (
            <div className="lg:hidden mt-4">
              <Suspense fallback={<div className="animate-pulse h-48 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
                <PoolDetailsCard pool={chartPool} chartTokenId={chartTokenId} />
              </Suspense>
            </div>
          )}

        </div>

        {/* Right Column: Chart (2/3 width on lg) */}
        <div className="hidden lg:flex flex-col gap-4 lg:col-span-3 xl:col-span-2">
          <PoolDetailsCard pool={chartPool} chartTokenId={chartTokenId} />
        </div>
      </div>

      {/* My Wallet Activity + Markets Grid - 50/50 on lg */}
      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6">
        <div className="hidden lg:block">
          <Suspense fallback={<div className="animate-pulse h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
            <MyWalletSwaps />
          </Suspense>
        </div>
        <Suspense fallback={<MarketsSkeleton />}>
          <MarketsGrid
            pools={markets}
            onSelect={handleSelectPool}
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
            selectedPoolId={selectedPool?.id}
          />
        </Suspense>
      </div>

      {/* My Wallet Swaps - mobile only, at the bottom under market cards */}
      <div className="lg:hidden mt-6">
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
        onPercentFrom={tokenSelectorMode === 'from' && fromToken ? handlePercentFrom : undefined}
        activePercent={tokenSelectorMode === 'from' ? getActivePercentFrom() : null}
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
