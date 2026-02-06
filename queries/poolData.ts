/**
 * Pool data query options (API-backed: /api/pools endpoints).
 *
 * These are simple fetch-and-return queries — the logic stays here
 * since it's just URL construction + JSON parsing.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import type {
  PoolPrice,
  PoolStats,
  DashboardStats,
  PoolVolume,
  VolumePeriod,
} from '@/hooks/usePoolData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUrl(basePath: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, value);
  }
  const qs = searchParams.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

async function fetchJson<T>(url: string, errorPrefix: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  if (!json.success) throw new Error(json.error || errorPrefix);
  return json.data;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

export function poolPricesQueryOptions(network: string) {
  return queryOptions<Record<string, PoolPrice>>({
    queryKey: queryKeys.poolData.prices(network),
    enabled: !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools', { pool: 'all', network }), 'Failed to fetch pool prices'),
  });
}

export function poolPriceQueryOptions(network: string, poolKey: string) {
  return queryOptions<PoolPrice>({
    queryKey: queryKeys.poolData.price(network, poolKey),
    enabled: !!poolKey && !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools', { pool: poolKey, network }), `Failed to fetch price for ${poolKey}`),
  });
}

export function allPoolStatsQueryOptions(network: string) {
  return queryOptions<Record<string, PoolStats>>({
    queryKey: queryKeys.poolData.statsAll(network),
    enabled: !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools/stats', { pool: 'all', network }), 'Failed to fetch pool stats'),
  });
}

export function poolStatsQueryOptions(network: string, poolKey: string) {
  return queryOptions<PoolStats>({
    queryKey: queryKeys.poolData.stats(network, poolKey),
    enabled: !!poolKey && !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools/stats', { pool: poolKey, network }), `Failed to fetch stats for ${poolKey}`),
  });
}

export function dashboardStatsQueryOptions(network: string) {
  return queryOptions<DashboardStats>({
    queryKey: queryKeys.poolData.dashboard(network),
    enabled: !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools/stats', { dashboard: 'true', network }), 'Failed to fetch dashboard stats'),
  });
}

export function allPoolVolumesQueryOptions(network: string, period: VolumePeriod = '24h') {
  return queryOptions<Record<string, PoolVolume>>({
    queryKey: queryKeys.poolData.volumesAll(network, period),
    enabled: !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools/volume', { pool: 'all', period, network }), 'Failed to fetch pool volumes'),
  });
}

export function poolVolumeQueryOptions(network: string, poolKey: string, period: VolumePeriod = '24h') {
  return queryOptions<PoolVolume>({
    queryKey: queryKeys.poolData.volume(network, poolKey, period),
    enabled: !!poolKey && !!network,
    queryFn: () => fetchJson(buildUrl('/api/pools/volume', { pool: poolKey, period, network }), `Failed to fetch volume for ${poolKey}`),
  });
}
