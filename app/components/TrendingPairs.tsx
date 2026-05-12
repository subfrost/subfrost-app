'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import { useAllPoolStats } from '@/hooks/usePoolData';
import { pickPositive } from '@/lib/pools/mergeStats';
import TokenIcon from '@/app/components/TokenIcon';
import HomeMarketsButton from '@/app/components/HomeMarketsButton';
import { useTranslation } from '@/hooks/useTranslation';


function PairBadge({ a, b }: { a: { id: string; symbol: string }, b: { id: string; symbol: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 w-10">
        <div className="absolute left-0 top-0 h-6 w-6 rounded-full bg-transparent">
          <TokenIcon id={a.id} symbol={a.symbol} size="sm" />
        </div>
        <div className="absolute right-0 top-0 h-6 w-6 rounded-full bg-transparent">
          <TokenIcon id={b.id} symbol={b.symbol} size="sm" />
        </div>
      </div>
      <div className="truncate text-sm font-bold text-[color:var(--sf-text)]">
        {a.symbol} / {b.symbol}
      </div>
    </div>
  );
}

function formatUsd(n?: number, showZeroAsDash = false) {
  if (n == null || (showZeroAsDash && n === 0)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e7) {
    return `$${(n / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e6) {
    return `$${(n / 1e6).toFixed(3)}M`;
  }
  if (abs >= 1e5) {
    return `$${(n / 1e3).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function TrendingPairs() {
  const { t } = useTranslation();
  const { data } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });

  // Enhanced pool stats from our local API (TVL, Volume, APR)
  const { data: poolStats } = useAllPoolStats();

  const pairs = useMemo(() => {
    const filtered = data?.items ?? [];

    // Create stats lookup map (fallback)
    const statsMap = new Map<string, NonNullable<typeof poolStats>[string]>();
    if (poolStats) {
      for (const [, stats] of Object.entries(poolStats)) {
        statsMap.set(stats.poolId, stats);
      }
    }

    // Merge stats with pools (usePools already provides TVL/volume from OYL Alkanode).
    // pickPositive (not `||`) so a `0` from the primary source doesn't
    // short-circuit the stats overlay — the user-reported staging symptom
    // (DIESEL/frBTC TVL=$0 → wrong trending pair selected) was caused by
    // that exact bug. See lib/pools/mergeStats.ts header for context.
    const enrichedPools = filtered.map(p => {
      const stats = statsMap.get(p.id);
      return {
        ...p,
        tvlUsd: pickPositive(p.tvlUsd, stats?.tvlUsd),
        vol24hUsd: pickPositive(p.vol24hUsd, stats?.volume24hUsd),
        vol30dUsd: pickPositive(p.vol30dUsd, stats?.volume30dUsd),
      };
    });

    // Check if any pool has volume data
    const hasAny24hVolume = enrichedPools.some(p => (p.vol24hUsd ?? 0) > 0);
    const hasAny30dVolume = enrichedPools.some(p => (p.vol30dUsd ?? 0) > 0);

    // Sort by 24h volume if any exists, otherwise 30d volume, otherwise TVL
    return enrichedPools
      .sort((a, b) => {
        if (hasAny24hVolume) {
          return (b.vol24hUsd ?? 0) - (a.vol24hUsd ?? 0);
        }
        if (hasAny30dVolume) {
          return (b.vol30dUsd ?? 0) - (a.vol30dUsd ?? 0);
        }
        // Final fallback to TVL
        return (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0);
      })
      .slice(0, 1);
  }, [data?.items, poolStats]);

  return (
    <div className="sf-card h-full">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('trending.trendingPair')}</h3>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {pairs.map((p) => (
          <Link
            key={p.id}
            href="/swap"
            className="sf-tile p-5 focus:outline-none"
          >
            <div className="flex items-center justify-between mb-3">
              <PairBadge a={{ id: p.token0.id, symbol: p.token0.symbol }} b={{ id: p.token1.id, symbol: p.token1.symbol }} />
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('trending.volume24h')}</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.vol24hUsd, true)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('trending.volume30d')}</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.vol30dUsd, true)}</div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('trending.tvl')}</div>
                <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.tvlUsd)}</div>
              </div>
            </div>
          </Link>
        ))}
        {pairs.length === 0 && (
          <div className="text-sm text-[color:var(--sf-text)]/60">{t('trending.noPairs')}</div>
        )}
        <HomeMarketsButton />
      </div>
    </div>
  );
}
