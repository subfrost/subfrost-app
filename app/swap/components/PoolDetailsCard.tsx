import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";

export default function PoolDetailsCard({ pool }: { pool?: PoolSummary }) {
  const { network } = useWallet();
  if (!pool) {
    return (
      <div className="hidden md:block rounded-2xl border-2 border-dashed border-[color:var(--sf-glass-border)] bg-gradient-to-br from-[color:var(--sf-surface)]/40 to-[color:var(--sf-surface)]/20 p-8 text-center backdrop-blur-sm transition-all">
        <svg className="mx-auto mb-3 h-12 w-12 text-[color:var(--sf-text)]/30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className="text-sm font-semibold text-[color:var(--sf-text)]/70">
          Select a market below to view pool details
        </p>
      </div>
    );
  }

  return (
    <div className="hidden md:block rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-gradient-to-br from-[color:var(--sf-glass-bg)] to-[color:var(--sf-surface)]/60 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">Total Value Locked</div>
          <div className="text-3xl font-extrabold text-[color:var(--sf-primary)]">
            {formatUsd(pool.tvlUsd)}
          </div>
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            <div className="inline-flex items-center gap-2">
              <TokenIcon key={pool.token0.id} symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="sm" network={network} />
              <span className="text-[color:var(--sf-text)]">/</span>
              <TokenIcon key={pool.token1.id} symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="sm" network={network} />
            </div>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">{pool.pairLabel}</span>
          </div>
        </div>
        <div className="rounded-xl bg-[color:var(--sf-surface)]/60 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/60">24h Volume</div>
          <div className="text-lg font-bold text-[color:var(--sf-text)]">{formatUsd(pool.vol24hUsd)}</div>
          <div className="mt-3 text-xs font-semibold text-[color:var(--sf-text)]/60">APY</div>
          <div className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">
            {formatPercent(pool.apr)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Pool Balance Distribution</div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[color:var(--sf-outline)]/20 shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-[color:var(--sf-primary)] to-blue-500 transition-all duration-700" 
            style={{ width: `${getToken0Percentage(pool)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--sf-primary)]" />
            <span className="font-semibold text-[color:var(--sf-text)]">{pool.token0.symbol} {formatPercent(getToken0Percentage(pool))}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[color:var(--sf-text)]">{pool.token1.symbol} {formatPercent(getToken1Percentage(pool))}</span>
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          </div>
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
  return `${v.toFixed(1)}%`;
}

function getToken0Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token0TvlUsd / total) * 100;
}

function getToken1Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token1TvlUsd / total) * 100;
}


