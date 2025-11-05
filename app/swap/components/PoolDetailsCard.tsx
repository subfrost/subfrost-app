import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";

export default function PoolDetailsCard({ pool }: { pool?: PoolSummary }) {
  const { network } = useWallet();
  if (!pool) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-glass-border)] bg-gradient-to-br from-white/40 to-white/20 p-8 text-center backdrop-blur-sm transition-all">
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
    <div className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-gradient-to-br from-[color:var(--sf-glass-bg)] to-white/60 p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(40,67,114,0.1)] transition-all animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">Total Value Locked</div>
          <div className="text-3xl font-extrabold text-[color:var(--sf-primary)]">
            {formatUsd(pool.tvlUsd)}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-2 text-sm font-bold text-[color:var(--sf-text)]">
            <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="sm" network={network} />
            <span>/</span>
            <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="sm" network={network} />
            <span>{pool.pairLabel}</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/60 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/60">24h Volume</div>
          <div className="text-lg font-bold text-[color:var(--sf-text)]">{formatUsd(pool.vol24hUsd)}</div>
          <div className="mt-3 text-xs font-semibold text-[color:var(--sf-text)]/60">APR</div>
          <div className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-base font-bold text-green-700">
            {formatPercent(pool.apr)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Pool Balance Distribution</div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[color:var(--sf-outline)]/20 shadow-inner">
          <div className="h-full w-1/2 bg-gradient-to-r from-[color:var(--sf-primary)] to-blue-500 transition-all duration-700" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--sf-primary)]" />
            <span className="font-semibold text-[color:var(--sf-text)]">{pool.token0.symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[color:var(--sf-text)]">{pool.token1.symbol}</span>
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
  return `${v.toFixed(2)}%`;
}


