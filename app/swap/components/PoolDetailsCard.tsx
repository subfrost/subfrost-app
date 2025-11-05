import type { PoolSummary } from "../types";

export default function PoolDetailsCard({ pool }: { pool?: PoolSummary }) {
  if (!pool) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-sm text-[color:var(--sf-text)]/80">
        Select a market below to view pool details.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[color:var(--sf-text)]/70">TVL</div>
          <div className="text-xl font-extrabold text-[color:var(--sf-text)]">
            {formatUsd(pool.tvlUsd)}
          </div>
          <div className="text-xs text-[color:var(--sf-text)]/60">{pool.pairLabel}</div>
        </div>
        <div className="text-right text-sm text-[color:var(--sf-text)]/70">
          <div>24h Vol: {formatUsd(pool.vol24hUsd)}</div>
          <div>APR: {formatPercent(pool.apr)}</div>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/80">Pool Balances</div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 bg-[color:var(--sf-primary)]/60" />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--sf-text)]/70">
          <span>{pool.token0.symbol}</span>
          <span>{pool.token1.symbol}</span>
        </div>
      </div>
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


