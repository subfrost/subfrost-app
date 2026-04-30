'use client';

import { useMemo, useState, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { usePools } from '@/hooks/usePools';
import { useAllPoolStats } from '@/hooks/usePoolData';
import { saveSwapPair } from '@/app/swap/swapPair';
import type { PoolSummary } from '@/app/swap/types';

const MarketsSidepanel = lazy(() => import('@/app/swap/components/MarketsSidepanel'));

export default function HomeMarketsButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [volumePeriod, setVolumePeriod] = useState<'24h' | '30d'>('30d');

  const { data: poolsData } = usePools({ sortBy: 'tvl', order: 'desc' });
  const { data: poolStats } = useAllPoolStats();

  const markets = useMemo<PoolSummary[]>(() => {
    const basePools = poolsData?.items ?? [];

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

  const handleSelect = (pool: PoolSummary) => {
    saveSwapPair(pool.token0, pool.token1);
    setIsOpen(false);
    router.push('/swap');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="sf-tab-btn flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]">
          Other Markets
        </span>
        <ChevronRight size={14} className="text-[color:var(--sf-text)]/60" />
      </button>

      {isOpen && (
        <Suspense fallback={null}>
          <MarketsSidepanel
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            pools={markets}
            onSelect={handleSelect}
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
          />
        </Suspense>
      )}
    </>
  );
}
