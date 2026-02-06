import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import {
  poolPricesQueryOptions,
  poolPriceQueryOptions,
  allPoolStatsQueryOptions,
  poolStatsQueryOptions,
  dashboardStatsQueryOptions,
  allPoolVolumesQueryOptions,
  poolVolumeQueryOptions,
} from '@/queries/poolData';

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
// Hooks
// ============================================================================

export function usePoolPrices(): UseQueryResult<Record<string, PoolPrice>> {
  const { network } = useWallet();
  return useQuery(poolPricesQueryOptions(network));
}

export function usePoolPrice(poolKey: string): UseQueryResult<PoolPrice> {
  const { network } = useWallet();
  return useQuery(poolPriceQueryOptions(network, poolKey));
}

export function useAllPoolStats(): UseQueryResult<Record<string, PoolStats>> {
  const { network } = useWallet();
  return useQuery(allPoolStatsQueryOptions(network));
}

export function usePoolStats(poolKey: string): UseQueryResult<PoolStats> {
  const { network } = useWallet();
  return useQuery(poolStatsQueryOptions(network, poolKey));
}

export function useDashboardStats(): UseQueryResult<DashboardStats> {
  const { network } = useWallet();
  return useQuery(dashboardStatsQueryOptions(network));
}

export function useAllPoolVolumes(period: VolumePeriod = '24h'): UseQueryResult<Record<string, PoolVolume>> {
  const { network } = useWallet();
  return useQuery(allPoolVolumesQueryOptions(network, period));
}

export function usePoolVolume(poolKey: string, period: VolumePeriod = '24h'): UseQueryResult<PoolVolume> {
  const { network } = useWallet();
  return useQuery(poolVolumeQueryOptions(network, poolKey, period));
}

// ============================================================================
// Derived/Formatted Values
// ============================================================================

export function formatUsd(value: number | undefined, options?: { compact?: boolean }): string {
  if (value === undefined || isNaN(value)) return '$0.00';
  if (options?.compact && value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (options?.compact && value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return '0.00%';
  return `${value.toFixed(2)}%`;
}

export function formatTokenAmount(
  amount: string | bigint | undefined,
  decimals: number = 8,
  options?: { maxDecimals?: number },
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
