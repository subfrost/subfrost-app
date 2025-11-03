'use client';

import { useMemo } from 'react';
import { usePools } from '@/app/hooks/usePools';
import { cn } from '@/lib/utils';

export function SwapPoolsList({
  className,
  onSelectPair,
}: {
  className?: string;
  onSelectPair: (token0Id: string, token1Id: string) => void;
}) {
  const { data } = usePools({ sort_by: 'volume1d', order: 'desc', limit: 50 });

  const rows = useMemo(() => {
    return (data?.pools || []).map((p) => {
      const token0Id = `${p.token0.block}:${p.token0.tx}`;
      const token1Id = `${p.token1.block}:${p.token1.tx}`;
      return {
        id: `${p.poolId.block}:${p.poolId.tx}`,
        name: p.poolName,
        tvl: p.poolTvlInUsd ?? 0,
        volume1d: p.poolVolume1dInUsd ?? 0,
        apr: p.poolApr ?? undefined,
        token0Id,
        token1Id,
      };
    });
  }, [data]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
        <div className="w-1/3">Pair</div>
        <div className="w-1/4 text-right">TVL</div>
        <div className="w-1/4 text-right">24h Vol</div>
        <div className="w-1/6 text-right">APR</div>
      </div>
      <div className="rounded-md border border-white/10 divide-y divide-white/10 overflow-hidden">
        {rows.map((r) => (
          <button
            key={r.id}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-sm text-left"
            onClick={() => onSelectPair(r.token0Id, r.token1Id)}
          >
            <div className="w-1/3 truncate">{r.name}</div>
            <div className="w-1/4 text-right">${Number(r.tvl).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="w-1/4 text-right">${Number(r.volume1d).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="w-1/6 text-right">{r.apr != null ? `${(r.apr * 100).toFixed(2)}%` : '-'}</div>
          </button>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No pools found.</div>
        )}
      </div>
    </div>
  );
}


