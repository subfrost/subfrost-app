/**
 * usePoolMarkets — single source of truth for the merged `PoolSummary[]`
 * surface used by every market display in the app.
 *
 * Combines `usePools` (raw pool list from REST + curated) with
 * `useAllPoolStats` (aggregator-derived TVL/volume/APR overlay) and applies
 * the canonical `pool.X || stats?.Y || 0` merge in one place.
 *
 * Replaces three byte-identical merge blocks that previously lived in
 * TrendingPairs, HomeMarketsButton, and SwapShell — keeping them in lockstep
 * was the only thing standing between this app and a "DIESEL/frBTC shows
 * $1.469M on the home card but $0 on the markets grid" bug. Centralizing
 * here means any future tweak to the merge formula is guaranteed to apply
 * everywhere at once.
 */
import { useMemo } from 'react';

import { usePools, type UsePoolsParams } from '@/hooks/usePools';
import { useAllPoolStats } from '@/hooks/usePoolData';
import type { PoolSummary } from '@/app/swap/types';

export interface PoolMarketsResult {
  markets: PoolSummary[];
  isLoadingPools: boolean;
  isLoadingPoolStats: boolean;
  /** True when /api/pools/stats actually returned non-empty data. */
  poolStatsHasData: boolean;
  /** True when at least one market in the merged set has > 0 24h or 30d volume. */
  hasVolumeDataMerged: boolean;
}

export function usePoolMarkets(params?: UsePoolsParams): PoolMarketsResult {
  const { data: poolsData, isLoading: isLoadingPools } = usePools(params);
  const { data: poolStats, isLoading: isLoadingPoolStats } = useAllPoolStats();

  const markets = useMemo<PoolSummary[]>(() => {
    const basePools = poolsData?.items ?? [];

    const statsMap = new Map<string, NonNullable<typeof poolStats>[string]>();
    if (poolStats) {
      for (const [, stats] of Object.entries(poolStats)) {
        statsMap.set(stats.poolId, stats);
      }
    }

    return basePools.map((pool) => {
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

  const poolStatsHasData = useMemo(
    () => poolStats !== undefined && Object.keys(poolStats).length > 0,
    [poolStats],
  );

  const hasVolumeDataMerged = useMemo(
    () => markets.some((p) => (p.vol24hUsd ?? 0) > 0 || (p.vol30dUsd ?? 0) > 0),
    [markets],
  );

  return { markets, isLoadingPools, isLoadingPoolStats, poolStatsHasData, hasVolumeDataMerged };
}
