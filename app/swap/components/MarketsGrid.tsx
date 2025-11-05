import { useState } from "react";
import type { PoolSummary } from "../types";

type Props = {
  pools: PoolSummary[];
  onSelect: (pool: PoolSummary) => void;
};

export default function MarketsGrid({ pools, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false);
  const displayedPools = showAll ? pools : pools.slice(0, 9);
  const hasMore = pools.length > 9;

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-2xl font-extrabold tracking-wide text-[color:var(--sf-text)]">MARKETS</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayedPools.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="text-left rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4 transition hover:shadow-lg hover:bg-white/10 sf-focus-ring"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[color:var(--sf-text)]">{p.pairLabel}</div>
              <div className="text-xs text-[color:var(--sf-text)]/60">APR {formatPercent(p.apr)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-[color:var(--sf-text)]/80">
              <div>TVL {formatUsd(p.tvlUsd)}</div>
              <div>24h Vol {formatUsd(p.vol24hUsd)}</div>
            </div>
          </button>
        ))}
      </div>
      {hasMore && !showAll && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowAll(true)}
            className="rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-6 py-2 font-semibold text-[color:var(--sf-text)] transition hover:bg-white/10 sf-focus-ring"
          >
            See More
          </button>
        </div>
      )}
    </div>
  );
}

function formatUsd(v?: number) {
  if (v == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatPercent(v?: number) {
  if (v == null) return "-";
  return `${v.toFixed(2)}%`;
}


