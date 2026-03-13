'use client';

import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

interface BondCardProps {
  bondId: number;
  lpAmount: string;
  fireAmount: string;
  vestStart: number;
  vestEnd: number;
  claimed: string;
  currentBlock?: number;
  onClaim: (bondId: number) => void;
  disabled?: boolean;
}

export default function BondCard({
  bondId,
  lpAmount,
  fireAmount,
  vestStart,
  vestEnd,
  claimed,
  currentBlock = 0,
  onClaim,
  disabled = false,
}: BondCardProps) {
  const { t } = useTranslation();
  const totalVestBlocks = vestEnd - vestStart;
  const elapsedBlocks = Math.min(currentBlock - vestStart, totalVestBlocks);
  const vestProgress = totalVestBlocks > 0 ? Math.max(0, Math.min(1, elapsedBlocks / totalVestBlocks)) : 0;
  const vestProgressPct = (vestProgress * 100).toFixed(1);
  const isFullyVested = vestProgress >= 1;

  const formattedLp = new BigNumber(lpAmount).dividedBy(1e8).toFixed(4);
  const formattedFire = new BigNumber(fireAmount).dividedBy(1e8).toFixed(4);
  const formattedClaimed = new BigNumber(claimed).dividedBy(1e8).toFixed(4);
  const claimable = new BigNumber(fireAmount)
    .multipliedBy(vestProgress)
    .minus(claimed)
    .toFixed(4);

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-[color:var(--sf-text)]">{t('fire.bond')} #{bondId + 1}</span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          isFullyVested
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
        }`}>
          {isFullyVested ? t('fire.fullyVested') : `${vestProgressPct}%`}
        </span>
      </div>

      {/* Vesting progress bar */}
      <div className="mb-4">
        <div className="h-1.5 rounded-full bg-[color:var(--sf-panel-bg)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700"
            style={{ width: `${vestProgressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.lpBonded')}</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">{formattedLp}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.totalFire')}</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">{formattedFire}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.claimed')}</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">{formattedClaimed}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.claimable')}</div>
          <div className="text-sm font-bold text-orange-400">{claimable}</div>
        </div>
      </div>

      <button
        onClick={() => onClaim(bondId)}
        disabled={disabled || claimable === '0.0000'}
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-2.5 text-xs font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {t('fire.claimVestedFire')}
      </button>
    </div>
  );
}
