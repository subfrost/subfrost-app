import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

// ============================================================================
// Types
// ============================================================================

export interface PoolPrice {
  poolId: string;
  poolName: string;
  price: number;
  priceInverse: number;
  reserve0: string;
  reserve1: string;
  blockHeight: number;
  timestamp?: number;
}

/** Volume period type */
export type VolumePeriod = '24h' | '7d' | '30d';

export interface PoolVolume {
  poolId: string;
  poolName: string;
  volume: number;
  volumeUsd?: number;
  volume24h: number;
  volume24hUsd?: number;
  volume7d?: number;
  volume7dUsd?: number;
  volume30d?: number;
  volume30dUsd?: number;
  period: VolumePeriod;
  startHeight: number;
  endHeight: number;
  timestamp: number;
}

export interface PoolStats {
  poolId: string;
  poolName: string;
  price: number;
  priceInverse: number;
  tvlUsd: number;
  tvlToken0: number;
  tvlToken1: number;
  volume24hUsd: number;
  volume30dUsd?: number;
  apr: number;
  reserve0: string;
  reserve1: string;
  lpTotalSupply: string;
  token0Symbol: string;
  token1Symbol: string;
  timestamp: number;
}

export interface BitcoinPrice {
  usd: number;
  timestamp: number;
}

export interface MarketStats {
  totalSupply: string;
  totalSupplyFormatted: number;
  priceUsd: number;
  priceBtc: number;
  marketCapUsd: number;
  timestamp: number;
}

export interface TvlPoolStats {
  poolId: string;
  poolName: string;
  reserve0: string;
  reserve1: string;
  tvlToken0: number;
  tvlToken1: number;
  tvlUsd: number;
  lpTotalSupply: string;
}

export interface TvlStats {
  pools: Record<string, TvlPoolStats>;
  totalTvlUsd: number;
  timestamp: number;
}

export interface DashboardStats {
  marketStats: MarketStats;
  tvlStats: TvlStats;
  btcPrice: BitcoinPrice;
  pools: Record<string, PoolStats>;
  timestamp: number;
}

// ============================================================================
// API Helpers
// ============================================================================

function buildUrl(basePath: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

async function fetchPoolPrices(network?: string): Promise<Record<string, PoolPrice>> {
  const url = buildUrl('/api/pools', { pool: 'all', network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch pool prices');
  }

  return json.data.pools;
}

async function fetchPoolPrice(poolKey: string, network?: string): Promise<PoolPrice> {
  const url = buildUrl('/api/pools', { pool: poolKey, network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || `Failed to fetch price for ${poolKey}`);
  }

  return json.data;
}

async function fetchAllPoolStats(network?: string): Promise<Record<string, PoolStats>> {
  const url = buildUrl('/api/pools/stats', { pool: 'all', network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch pool stats');
  }

  return json.data;
}

async function fetchPoolStats(poolKey: string, network?: string): Promise<PoolStats> {
  const url = buildUrl('/api/pools/stats', { pool: poolKey, network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || `Failed to fetch stats for ${poolKey}`);
  }

  return json.data;
}

async function fetchDashboardStats(network?: string): Promise<DashboardStats> {
  const url = buildUrl('/api/pools/stats', { dashboard: 'true', network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch dashboard stats');
  }

  return json.data;
}

async function fetchAllPoolVolumes(period: VolumePeriod = '24h', network?: string): Promise<Record<string, PoolVolume>> {
  const url = buildUrl('/api/pools/volume', { pool: 'all', period, network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || 'Failed to fetch pool volumes');
  }

  return json.data;
}

async function fetchPoolVolume(poolKey: string, period: VolumePeriod = '24h', network?: string): Promise<PoolVolume> {
  const url = buildUrl('/api/pools/volume', { pool: poolKey, period, network });
  const response = await fetch(url);
  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || `Failed to fetch volume for ${poolKey}`);
  }

  return json.data;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all pool prices for current network
 */
export function usePoolPrices(): UseQueryResult<Record<string, PoolPrice>> {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['pool-prices', 'all', network],
    queryFn: () => fetchPoolPrices(network),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 30_000,
    enabled: !!network,
  });
}

/**
 * Fetch single pool price for current network
 */
export function usePoolPrice(poolKey: string): UseQueryResult<PoolPrice> {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['pool-price', poolKey, network],
    queryFn: () => fetchPoolPrice(poolKey, network),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: !!poolKey && !!network,
  });
}

/**
 * Fetch all pool stats (TVL, volume, APR) for current network
 */
export function useAllPoolStats(): UseQueryResult<Record<string, PoolStats>> {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['pool-stats', 'all', network],
    queryFn: () => fetchAllPoolStats(network),
    staleTime: 60_000, // 1 minute
    refetchInterval: 60_000,
    enabled: !!network,
  });
}

/**
 * Fetch single pool stats for current network
 */
export function usePoolStats(poolKey: string): UseQueryResult<PoolStats> {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['pool-stats', poolKey, network],
    queryFn: () => fetchPoolStats(poolKey, network),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!poolKey && !!network,
  });
}

/**
 * Fetch full dashboard stats (market stats, TVL, BTC price, all pools) for current network
 * This is the most comprehensive data fetch for the main dashboard
 */
export function useDashboardStats(): UseQueryResult<DashboardStats> {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['dashboard-stats', network],
    queryFn: () => fetchDashboardStats(network),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!network,
  });
}

/** Stale times for different volume periods */
const VOLUME_STALE_TIMES: Record<VolumePeriod, number> = {
  '24h': 300_000,   // 5 minutes
  '7d': 600_000,    // 10 minutes
  '30d': 900_000,   // 15 minutes
};

/**
 * Fetch all pool volumes for current network
 * @param period - Time period ('24h', '7d', or '30d') - default: '24h'
 */
export function useAllPoolVolumes(period: VolumePeriod = '24h'): UseQueryResult<Record<string, PoolVolume>> {
  const { network } = useWallet();
  const staleTime = VOLUME_STALE_TIMES[period];

  return useQuery({
    queryKey: ['pool-volumes', 'all', period, network],
    queryFn: () => fetchAllPoolVolumes(period, network),
    staleTime,
    refetchInterval: staleTime,
    enabled: !!network,
  });
}

/**
 * Fetch single pool volume for current network
 * @param poolKey - Pool key (e.g., 'DIESEL_BUSD')
 * @param period - Time period ('24h', '7d', or '30d') - default: '24h'
 */
export function usePoolVolume(poolKey: string, period: VolumePeriod = '24h'): UseQueryResult<PoolVolume> {
  const { network } = useWallet();
  const staleTime = VOLUME_STALE_TIMES[period];

  return useQuery({
    queryKey: ['pool-volume', poolKey, period, network],
    queryFn: () => fetchPoolVolume(poolKey, period, network),
    staleTime,
    refetchInterval: staleTime,
    enabled: !!poolKey && !!network,
  });
}

// ============================================================================
// Derived/Formatted Values
// ============================================================================

/**
 * Format USD value for display
 */
export function formatUsd(value: number | undefined, options?: { compact?: boolean }): string {
  if (value === undefined || isNaN(value)) return '$0.00';

  if (options?.compact && value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (options?.compact && value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return '0.00%';

  return `${value.toFixed(2)}%`;
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: string | bigint | undefined,
  decimals: number = 8,
  options?: { maxDecimals?: number }
): string {
  if (amount === undefined) return '0';

  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const formatted = Number(value) / Math.pow(10, decimals);

  const maxDecimals = options?.maxDecimals ?? 4;
  return formatted.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}
