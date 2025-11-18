'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import TokenIcon from '@/app/components/TokenIcon';

function PairBadge({ a, b }: { a: { id: string; symbol: string }, b: { id: string; symbol: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 w-10">
        <div className="absolute left-0 top-0 h-6 w-6 rounded-full border border-white/20 bg-white/5">
          <TokenIcon id={a.id} symbol={a.symbol} size="sm" />
        </div>
        <div className="absolute right-0 top-0 h-6 w-6 rounded-full border border-white/20 bg-white/5">
          <TokenIcon id={b.id} symbol={b.symbol} size="sm" />
        </div>
      </div>
      <div className="truncate text-sm font-medium text-[color:var(--sf-text)]">
        {a.symbol} / {b.symbol}
      </div>
    </div>
  );
}

function formatUsd(n?: number) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

export default function TrendingPairs() {
  const { data } = usePools({ sortBy: 'volume1d', order: 'desc', limit: 6 });
  const pairs = useMemo(() => (data?.items ?? []).slice(0, 6), [data?.items]);

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[color:var(--sf-text)]">Trending pairs</h3>
        <Link href="/swap" className="text-xs text-[color:var(--sf-primary)] hover:underline">View all</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {pairs.map((p) => (
          <Link
            key={p.id}
            href="/swap"
            className="group rounded-xl border border-[color:var(--sf-glass-border)] bg-white/5 p-3 transition-colors hover:bg-white/10"
          >
            <div className="flex items-center justify-between gap-3">
              <PairBadge a={{ id: p.token0.id, symbol: p.token0.symbol }} b={{ id: p.token1.id, symbol: p.token1.symbol }} />
            </div>
            <div className="mt-2 flex items-center justify-end">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/60">TVL</div>
                <div className="text-sm font-semibold text-[color:var(--sf-text)]">{formatUsd(p.tvlUsd)}</div>
              </div>
            </div>
          </Link>
        ))}
        {pairs.length === 0 && (
          <div className="text-sm text-[color:var(--sf-text)]/60">No pairs available.</div>
        )}
      </div>
    </div>
  );
}


