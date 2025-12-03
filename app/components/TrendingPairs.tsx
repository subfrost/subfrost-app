'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import TokenIcon from '@/app/components/TokenIcon';

function PairBadge({ a, b }: { a: { id: string; symbol: string }, b: { id: string; symbol: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 w-10">
        <div className="absolute left-0 top-0 h-6 w-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
          <TokenIcon id={a.id} symbol={a.symbol} size="sm" />
        </div>
        <div className="absolute right-0 top-0 h-6 w-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
          <TokenIcon id={b.id} symbol={b.symbol} size="sm" />
        </div>
      </div>
      <div className="truncate text-sm font-bold text-[color:var(--sf-text)]">
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
  const { data } = usePools({ sortBy: 'volume1d', order: 'desc', limit: 1 });
  const pairs = useMemo(() => (data?.items ?? []).slice(0, 1), [data?.items]);

  return (
    <div className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Pair</h3>
          <Link href="/swap" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-colors">View all</Link>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3">
          {pairs.map((p) => (
            <Link
              key={p.id}
              href="/swap"
              className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 backdrop-blur-md transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-primary)]/10 sf-focus-ring"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <PairBadge a={{ id: p.token0.id, symbol: p.token0.symbol }} b={{ id: p.token1.id, symbol: p.token1.symbol }} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-left">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">24h Volume</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.vol24hUsd)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">TVL</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.tvlUsd)}</div>
                </div>
              </div>
            </Link>
          ))}
          {pairs.length === 0 && (
            <div className="text-sm text-[color:var(--sf-text)]/60">No pairs available.</div>
          )}
        </div>
      </div>
    </div>
  );
}


