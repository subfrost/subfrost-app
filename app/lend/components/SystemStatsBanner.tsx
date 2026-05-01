'use client';

/**
 * Protocol-wide stats banner: oracle price, TCR, recovery-mode flag, total
 * troves / coll / debt. Mirrors Liquity's top-of-page system info row.
 */

import { useSystemData, MCR, CCR } from '@/hooks/frostlend';
import {
  frbtcSatsToBtc,
  frostUsdToFloat,
  icrToPercent,
} from '@/constants/frostlend';

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export default function SystemStatsBanner() {
  const { data, isLoading } = useSystemData();

  if (isLoading) {
    return (
      <div className="sf-card p-4 text-sm text-zinc-400">Loading protocol stats…</div>
    );
  }
  if (!data) {
    return (
      <div className="sf-card p-4 text-sm text-zinc-400">
        Frostlend not deployed on this network. Open the devnet helper to deploy.
      </div>
    );
  }

  // GetTcr returns u128::MAX (or near it) when total system debt is zero.
  // Treat any TCR > 1e10 as the "no troves" sentinel and render `—`.
  const SENTINEL_THRESHOLD = 10_000_000_000n * 10n ** 18n; // 1e28 in 18-dec form
  const noTroves = data.troveCount === 0 || data.tcr === 0n || data.tcr > SENTINEL_THRESHOLD;
  const tcrPct = noTroves ? null : icrToPercent(data.tcr);
  const ccrPct = icrToPercent(CCR);

  return (
    <div className={`sf-card p-4 ${data.isRecoveryMode && !noTroves ? 'ring-1 ring-red-500/40' : ''}`}>
      {data.isRecoveryMode && !noTroves && (
        <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
          ⚠ Recovery Mode: TCR &lt; {ccrPct}%. Borrowing restricted, all troves with ICR &lt; CCR are liquidatable.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="frBTC / USD" value={data.priceUsd === 0 ? '—' : `$${formatUsd(data.priceUsd)}`} />
        <Stat
          label="TCR"
          value={tcrPct === null ? '—' : `${tcrPct.toFixed(2)}%`}
          tone={tcrPct !== null && tcrPct < icrToPercent(CCR) ? 'warn' : 'normal'}
        />
        <Stat label="Troves" value={data.troveCount.toString()} />
        <Stat
          label="Total Coll"
          value={`${frbtcSatsToBtc(data.totalCollateral).toFixed(4)} frBTC`}
        />
        <Stat
          label="Total Debt"
          value={`${formatUsd(frostUsdToFloat(data.totalDebt))} frostUSD`}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warn' }) {
  const valueClass = tone === 'warn' ? 'text-red-300' : 'text-zinc-100';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
