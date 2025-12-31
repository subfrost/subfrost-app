"use client";

import { useMemo, useState, useEffect, useRef, lazy, Suspense } from "react";
import type { PoolSummary, TokenMeta } from "./types";
import type { TokenOption } from "@/app/components/TokenSelectorModal";
import type { LPPosition } from "./components/LiquidityInputs";

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
import { useAllPoolStats, useAllPoolVolumes } from "@/hooks/usePoolData";
import { useModalStore } from "@/stores/modals";
import { useWrapMutation } from "@/hooks/useWrapMutation";
import { useUnwrapMutation } from "@/hooks/useUnwrapMutation";
import { useAddLiquidityMutation } from "@/hooks/useAddLiquidityMutation";
import LoadingOverlay from "@/app/components/LoadingOverlay";

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
  // Markets from API: all pools sorted by TVL desc
  const { data: poolsData } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });

  // Enhanced pool stats from our local API (TVL, Volume, APR)
  const { data: poolStats } = useAllPoolStats();

  // Dedicated volume data from volume API (more reliable than stats API)
  const { data: poolVolumes } = useAllPoolVolumes();

  // Merge external pool data with our enhanced stats and volume data
  const markets = useMemo<PoolSummary[]>(() => {
    const basePools = poolsData?.items ?? [];

    // Create maps for quick lookup
    const statsMap = new Map<string, NonNullable<typeof poolStats>[string]>();
    const volumeMap = new Map<string, NonNullable<typeof poolVolumes>[string]>();

    if (poolStats) {
      for (const [, stats] of Object.entries(poolStats)) {
        statsMap.set(stats.poolId, stats);
      }
    }

    if (poolVolumes) {
      for (const [, volume] of Object.entries(poolVolumes)) {
        volumeMap.set(volume.poolId, volume);
      }
    }

    // Enhance each pool with stats and volume data
    return basePools.map(pool => {
      const stats = statsMap.get(pool.id);
      const volume = volumeMap.get(pool.id);

      // Calculate token TVL percentages from reserves
      const totalTvl = stats?.tvlUsd || pool.tvlUsd || 0;
      const token0Tvl = totalTvl / 2;
      const token1Tvl = totalTvl / 2;

      // Get volume from dedicated volume API, fall back to stats, then to pool data
      const vol24hUsd = volume?.volume24hUsd ?? stats?.volume24hUsd ?? pool.vol24hUsd;

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
        vol30dUsd: stats?.volume30dUsd ?? pool.vol30dUsd,
        apr,
      } as PoolSummary;
    });
  }, [poolsData?.items, poolStats, poolVolumes]);

  // Volume period state (shared between MarketsGrid and PoolDetailsCard)
  const [volumePeriod, setVolumePeriod] = useState<'24h' | '30d'>('24h');

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

  // Test LP positions data
  const testLPPositions: LPPosition[] = [
    {
      id: '1',
      token0Symbol: 'DIESEL',
      token1Symbol: 'frBTC',
      amount: '0.1377',
      valueUSD: 191,
      gainLoss: {
        token0: { amount: '+4.973', symbol: 'DIESEL' },
        token1: { amount: '-0.00025911', symbol: 'frBTC' },
      },
    },
  ];

  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector } = useModalStore();
  const [successTxId, setSuccessTxId] = useState<string | null>(null);
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
  const addLiquidityMutation = useAddLiquidityMutation();

  // Wallet/config
  const { address, network } = useWallet();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID, USDT_ALKANE_ID, USDC_ALKANE_ID } = getConfig(network);

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
    if (!fromToken) setFromToken({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
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
      setPoolToken1({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
    }
  }, [poolToken1, selectedTab]);

  // Whitelisted token IDs (mainnet-specific)
  // On non-mainnet networks, allow all tokens from pools
  const whitelistedTokenIds = useMemo(() => {
    if (network !== 'mainnet') {
      // On non-mainnet, return null to indicate "allow all"
      return null;
    }
    return new Set([
      '32:0',      // frBTC
      'btc',       // BTC
      '2:56801',   // bUSD
      '2:16',      // METHANE
      '2:25720',   // ALKAMIST
      '2:35275',   // GOLD DUST
      '2:0',       // DIESEL
      '4:8193',    // USDC (cross-chain)
      '4:8194',    // USDT (cross-chain)
    ]);
  }, [network]);

  // Build FROM options: Only whitelisted tokens
  const fromOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    const seen = new Set<string>();

    // Always add BTC first (always available)
    if (whitelistedTokenIds === null || whitelistedTokenIds.has('btc')) {
      opts.push({
        id: 'btc',
        symbol: 'BTC',
        name: 'Bitcoin',
        isAvailable: true
      });
      seen.add('btc');
    }

    // Always add frBTC (BTC <-> frBTC wrapping is always allowed)
    if (FRBTC_ALKANE_ID && (whitelistedTokenIds === null || whitelistedTokenIds.has(FRBTC_ALKANE_ID))) {
      opts.push({
        id: FRBTC_ALKANE_ID,
        symbol: 'frBTC',
        name: 'frBTC',
        isAvailable: true
      });
      seen.add(FRBTC_ALKANE_ID);
    }

    // Add USDC and USDT as cross-chain swap options
    if (whitelistedTokenIds === null || whitelistedTokenIds.has('4:8193')) {
      opts.push({
        id: '4:8193',
        symbol: 'USDC',
        name: 'USD Coin',
        isAvailable: true
      });
      seen.add('4:8193');
    }
    if (whitelistedTokenIds === null || whitelistedTokenIds.has('4:8194')) {
      opts.push({
        id: '4:8194',
        symbol: 'USDT',
        name: 'Tether USD',
        isAvailable: true
      });
      seen.add('4:8194');
    }

    // Add whitelisted tokens from pool data (null = allow all)
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if ((whitelistedTokenIds === null || whitelistedTokenIds.has(poolToken.id)) && !seen.has(poolToken.id)) {
        opts.push({
          ...poolToken,
          isAvailable: true
        });
        seen.add(poolToken.id);
      }
    });

    return opts;
  }, [poolTokenMap, whitelistedTokenIds, FRBTC_ALKANE_ID]);

  // Build TO options: Only whitelisted tokens
  const toOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    const seen = new Set<string>();
    const fromId = fromToken?.id;

    // Add BTC first (unless FROM token is BTC)
    if ((whitelistedTokenIds === null || whitelistedTokenIds.has('btc')) && fromId !== 'btc') {
      opts.push({
        id: 'btc',
        symbol: 'BTC',
        name: 'Bitcoin',
        isAvailable: true
      });
      seen.add('btc');
    }

    // Always add frBTC (BTC <-> frBTC wrapping is always allowed) unless FROM token is frBTC
    if (FRBTC_ALKANE_ID && (whitelistedTokenIds === null || whitelistedTokenIds.has(FRBTC_ALKANE_ID)) && fromId !== FRBTC_ALKANE_ID) {
      opts.push({
        id: FRBTC_ALKANE_ID,
        symbol: 'frBTC',
        name: 'frBTC',
        isAvailable: true
      });
      seen.add(FRBTC_ALKANE_ID);
    }

    // Add USDC and USDT as cross-chain swap options (excluding FROM token)
    if ((whitelistedTokenIds === null || whitelistedTokenIds.has('4:8193')) && fromId !== '4:8193') {
      opts.push({
        id: '4:8193',
        symbol: 'USDC',
        name: 'USD Coin',
        isAvailable: true
      });
      seen.add('4:8193');
    }
    if ((whitelistedTokenIds === null || whitelistedTokenIds.has('4:8194')) && fromId !== '4:8194') {
      opts.push({
        id: '4:8194',
        symbol: 'USDT',
        name: 'Tether USD',
        isAvailable: true
      });
      seen.add('4:8194');
    }

    // Add whitelisted tokens from pool data (excluding FROM token, null = allow all)
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if ((whitelistedTokenIds === null || whitelistedTokenIds.has(poolToken.id)) && !seen.has(poolToken.id) && poolToken.id !== fromId) {
        opts.push({
          ...poolToken,
          isAvailable: true
        });
        seen.add(poolToken.id);
      }
    });

    return opts;
  }, [fromToken, poolTokenMap, whitelistedTokenIds, FRBTC_ALKANE_ID]);

  // Balances - use useEnrichedWalletData for reliable balance data
  const { balances: walletBalances, isLoading: isLoadingWalletData, refresh: refreshWalletData } = useEnrichedWalletData();
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
    if (!id) return 'Balance: 0';

    // BTC balance
    if (id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      return `Balance: ${btc.toFixed(8)}`;
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
      return 'Balance: 0';
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
        return `Balance: ${wholeStr}`;
      }

      return `Balance: ${wholeStr}.${trimmedRemainder}`;
    } catch {
      // Fallback for non-BigInt compatible values
      const rawBalance = Number(balance);
      const displayBalance = rawBalance / 1e8;
      return `Balance: ${displayBalance.toFixed(4)}`;
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

    // For stablecoins (bUSD, USDT, USDC), assume $1
    if (
      tokenId === BUSD_ALKANE_ID ||
      tokenId === USDT_ALKANE_ID ||
      tokenId === USDC_ALKANE_ID ||
      tokenId === 'usdt' ||
      tokenId === 'usdc'
    ) {
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
    if (!fromToken || !toToken) return;

    // Wrap/Unwrap direct pairs
    if (isWrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
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
          setSuccessTxId(res.transactionId);
          setTimeout(() => refreshWalletData(), 2000);
        }
      } catch (e: any) {
        console.error('[SWAP] Unwrap error:', e);
        window.alert('Unwrap failed. See console for details.');
      }
      return;
    }

    // BTC → Token swap: First wrap BTC to frBTC, then swap frBTC to target token
    if (isBtcToTokenSwap) {
      const confirmTwoStep = window.confirm(
        `This BTC → ${toToken.symbol} swap requires two transactions:\n\n` +
        `1. Wrap BTC to frBTC\n` +
        `2. Swap frBTC for ${toToken.symbol}\n\n` +
        `Both transactions require confirmation. Continue?`
      );

      if (!confirmTwoStep) return;

      try {
        const wrapAmount = direction === 'sell' ? fromAmount : toAmount;
        const wrapRes = await wrapMutation.mutateAsync({ amount: wrapAmount, feeRate: fee.feeRate });

        if (!wrapRes?.success || !wrapRes.transactionId) {
          throw new Error('Wrap transaction failed');
        }

        window.alert(
          `Step 1 complete: BTC wrapped to frBTC.\n\n` +
          `Transaction: ${wrapRes.transactionId.slice(0, 16)}...\n\n` +
          `IMPORTANT: Wait for the transaction to confirm (1-2 blocks), ` +
          `then select frBTC → ${toToken.symbol} to complete your swap.`
        );

        setSuccessTxId(wrapRes.transactionId);
        setTimeout(() => refreshWalletData(), 2000);
        setFromToken({ id: FRBTC_ALKANE_ID, symbol: 'frBTC', name: 'frBTC' });

      } catch (e: any) {
        console.error('[SWAP] BTC → Token swap failed:', e);
        window.alert(`Swap failed: ${e?.message || 'See console for details.'}`);
      }
      return;
    }

    // Default AMM swap (frBTC/DIESEL or other alkane pairs)
    if (!quote) return;

    const payload = {
      sellCurrency: fromToken.id,
      buyCurrency: toToken.id,
      direction,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      maxSlippage,
      feeRate: fee.feeRate,
      tokenPath: quote.route ?? [fromToken.id, toToken.id],
      deadlineBlocks,
    } as const;

    try {
      const res = await swapMutation.mutateAsync(payload as any);
      if (res?.success && res.transactionId) {
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
      { id: "btc", symbol: "BTC", name: "Bitcoin" },
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
      });

      if (result?.success && result.transactionId) {
        console.log('[handleAddLiquidity] Success! txid:', result.transactionId);
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

  // Whitelisted pool IDs (mainnet-specific)
  // On non-mainnet networks, allow all pools
  const whitelistedPoolIds = useMemo(() => {
    if (network !== 'mainnet') {
      // On non-mainnet, return null to indicate "allow all"
      return null;
    }
    return new Set([
      '2:77222',
      '2:77087',
      '2:77221',
      '2:77228',
      '2:77237',
      '2:68441',
      '2:68433',
    ]);
  }, [network]);

  // Helper function to check if a pair is in the allowed list
  const isAllowedPair = useMemo(() => (token1Id: string, token2Id: string): boolean => {
    // Special case: BTC <-> frBTC wrap/unwrap is always allowed
    if ((token1Id === 'btc' && token2Id === FRBTC_ALKANE_ID) ||
        (token1Id === FRBTC_ALKANE_ID && token2Id === 'btc')) {
      return true;
    }

    // Special case: BTC <-> token (multi-hop via frBTC)
    // BTC wraps to frBTC, then frBTC swaps to token
    if (token1Id === 'btc' || token2Id === 'btc') {
      const otherToken = token1Id === 'btc' ? token2Id : token1Id;
      // Check if there's a whitelisted pool between frBTC and the other token
      const hasWhitelistedPoolWithFrbtc = markets.some(p =>
        (whitelistedPoolIds === null || whitelistedPoolIds.has(p.id)) &&
        ((p.token0.id === FRBTC_ALKANE_ID && p.token1.id === otherToken) ||
        (p.token0.id === otherToken && p.token1.id === FRBTC_ALKANE_ID))
      );
      if (hasWhitelistedPoolWithFrbtc) {
        return true;
      }
    }

    // Map BTC to frBTC for pool checking
    const id1 = token1Id === 'btc' ? FRBTC_ALKANE_ID : token1Id;
    const id2 = token2Id === 'btc' ? FRBTC_ALKANE_ID : token2Id;

    // Find the pool in markets with these token IDs
    const pool = markets.find(p =>
      (p.token0.id === id1 && p.token1.id === id2) ||
      (p.token0.id === id2 && p.token1.id === id1)
    );

    // Check if the pool is in our whitelisted pool IDs (null = allow all)
    return pool ? (whitelistedPoolIds === null || whitelistedPoolIds.has(pool.id)) : false;
  }, [markets, FRBTC_ALKANE_ID, whitelistedPoolIds]);

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
        iconUrl: token.iconUrl || currency?.iconUrl,
        balance: currency?.balance,
        price: currency?.priceInfo?.price,
        isAvailable,
      };
    });
    
    return sortTokenOptions(options);
  }, [toOptions, idToUserCurrency, fromToken, isAllowedPair]);

  // Pool token options - filtered to only show tokens that are in the whitelisted pools
  const poolTokenOptions = useMemo<TokenOption[]>(() => {
    const poolTokenIds = new Set<string>();

    // Collect token IDs only from whitelisted pools (null = allow all)
    markets
      .filter(pool => whitelistedPoolIds === null || whitelistedPoolIds.has(pool.id))
      .forEach(pool => {
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
      name: 'Bitcoin',
      iconUrl: undefined,
      balance: String(btcBalanceSats ?? 0),
      price: undefined,
      isAvailable: btcIsAvailable,
    });
    
    // Get whitelisted pool tokens only
    const seen = new Set(['btc']); // BTC already added above
    Array.from(poolTokenMap.values()).forEach((poolToken) => {
      if ((whitelistedTokenIds === null || whitelistedTokenIds.has(poolToken.id)) && !seen.has(poolToken.id)) {
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

    return sortTokenOptions(opts);
  }, [markets, idToUserCurrency, FRBTC_ALKANE_ID, poolTokenMap, btcBalanceSats, tokenSelectorMode, poolToken0, poolToken1, isAllowedPair, whitelistedTokenIds, whitelistedPoolIds]);

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
      const filteredToken = toOptions.find((t) => t.id === tokenId);
      if (filteredToken) {
        // If selecting the same token as pool1, swap them
        if (poolToken1 && poolToken1.id === tokenId) {
          setPoolToken1(poolToken0);
        }
        setPoolToken0(filteredToken);
      }
    } else if (tokenSelectorMode === 'pool1') {
      const filteredToken = toOptions.find((t) => t.id === tokenId);
      if (filteredToken) {
        // If selecting the same token as pool0, swap them
        if (poolToken0 && poolToken0.id === tokenId) {
          setPoolToken0(poolToken1);
        }
        setPoolToken1(filteredToken);
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

  return (
    <div className="flex w-full flex-col gap-8 h-full">
      <Suspense fallback={null}>
        {successTxId && (
          <SwapSuccessNotification
            txId={successTxId}
            onClose={() => setSuccessTxId(null)}
          />
        )}
      </Suspense>

      <div className="flex flex-col md:grid md:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* Left Column: Swap/LP Module + My Wallet Swaps */}
        <div className="flex flex-col min-h-0 md:min-h-0">
          {/* Swap/Liquidity Tabs */}
          <div className="flex w-full items-center justify-center gap-1 mb-4">
            {/* Invisible spacer to balance the +/- button and keep tabs centered */}
            <div className="w-10 h-10" />
            <SwapHeaderTabs selectedTab={selectedTab} onTabChange={setSelectedTab} />
            <button
              type="button"
              onClick={() => setLiquidityMode(liquidityMode === 'provide' ? 'remove' : 'provide')}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 text-[color:var(--sf-text)] transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md outline-none focus:outline-none ${selectedTab !== 'lp' ? 'invisible' : ''}`}
              title={liquidityMode === 'provide' ? 'Switch to Remove Liquidity' : 'Switch to Provide Liquidity'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {liquidityMode === 'provide' ? (
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                ) : (
                  <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
            </button>
          </div>

          <section className="relative w-full rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_12px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl flex-shrink-0">
          {isBalancesLoading && <LoadingOverlay />}
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
                />
              }
            />
          ) : (
            <LiquidityInputs
              token0={poolToken0}
              token1={poolToken1}
              token0Options={toOptions}
              token1Options={toOptions}
              token0Amount={poolToken0Amount}
              token1Amount={poolToken1Amount}
              onChangeToken0Amount={setPoolToken0Amount}
              onChangeToken1Amount={setPoolToken1Amount}
              onSelectToken0={(id) => {
                const t = toOptions.find((x) => x.id === id);
                if (t) setPoolToken0(t);
              }}
              onSelectToken1={(id) => {
                const t = toOptions.find((x) => x.id === id);
                if (t) setPoolToken1(t);
              }}
              onAddLiquidity={handleAddLiquidity}
              isLoading={addLiquidityMutation.isPending}
              token0BalanceText={formatBalance(poolToken0?.id)}
              token1BalanceText={formatBalance(poolToken1?.id)}
              token0FiatText="$0.00"
              token1FiatText="$0.00"
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
              selectedLPPosition={selectedLPPosition}
              onSelectLPPosition={setSelectedLPPosition}
              onOpenLPSelector={() => setIsLPSelectorOpen(true)}
              removeAmount={removeAmount}
              onChangeRemoveAmount={setRemoveAmount}
            />
          )}
          </Suspense>
          </section>

          {/* My Wallet Swaps - under swap modal */}
          <div className="mt-8">
            <Suspense fallback={<div className="animate-pulse h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
              <MyWalletSwaps />
            </Suspense>
          </div>
        </div>

        {/* Right Column: TVL and Markets */}
        <Suspense fallback={<MarketsSkeleton />}>
        <div className="flex flex-col gap-4">
          <PoolDetailsCard
            pool={selectedTab === 'lp' && poolToken0 && poolToken1
              ? markets.find(p => {
                  // Map BTC to frBTC for pool lookup
                  const token0Id = poolToken0.id === 'btc' ? FRBTC_ALKANE_ID : poolToken0.id;
                  const token1Id = poolToken1.id === 'btc' ? FRBTC_ALKANE_ID : poolToken1.id;
                  return (
                    (p.token0.id === token0Id && p.token1.id === token1Id) ||
                    (p.token0.id === token1Id && p.token1.id === token0Id)
                  );
                })
              : selectedTab === 'swap' && fromToken && toToken
              ? markets.find(p => {
                  // Map BTC to frBTC for pool lookup in swap mode
                  const from0Id = fromToken.id === 'btc' ? FRBTC_ALKANE_ID : fromToken.id;
                  const to1Id = toToken.id === 'btc' ? FRBTC_ALKANE_ID : toToken.id;
                  return (
                    (p.token0.id === from0Id && p.token1.id === to1Id) ||
                    (p.token0.id === to1Id && p.token1.id === from0Id)
                  );
                })
              : selectedPool
            }
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
          />
          <MarketsGrid
            pools={markets}
            onSelect={handleSelectPool}
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
          />
        </div>
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
            ? 'Select token to swap'
            : tokenSelectorMode === 'to'
            ? 'Select token to receive'
            : 'Select token to pool'
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
        positions={testLPPositions}
        onSelectPosition={setSelectedLPPosition}
        selectedPositionId={selectedLPPosition?.id}
      />
      </Suspense>
    </div>
  );
}
