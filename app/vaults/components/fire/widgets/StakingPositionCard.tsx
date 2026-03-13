'use client';

import { LOCK_TIERS } from '@/utils/fireCalculations';
import BigNumber from 'bignumber.js';

interface StakingPositionCardProps {
  positionId: number;
  amount: string;
  lockTier: number;
  unlockBlock: number;
  pendingRewards: string;
  currentBlock?: number;
  onClaim: (positionId: number) => void;
  onUnstake: (positionId: number) => void;
  disabled?: boolean;
}

export default function StakingPositionCard({
  positionId,
  amount,
  lockTier,
  unlockBlock,
  pendingRewards,
  currentBlock = 0,
  onClaim,
  onUnstake,
  disabled = false,
}: StakingPositionCardProps) {
  const tier = LOCK_TIERS[lockTier] || LOCK_TIERS[0];
  const isLocked = currentBlock < unlockBlock;
  const formattedAmount = new BigNumber(amount).dividedBy(1e8).toFixed(4);
  const formattedRewards = new BigNumber(pendingRewards).dividedBy(1e8).toFixed(6);
  const blocksRemaining = isLocked ? unlockBlock - currentBlock : 0;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-[color:var(--sf-text)]">
          Position #{positionId + 1}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          isLocked
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
        }`}>
          {isLocked ? `${blocksRemaining} blks` : 'Unlocked'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">Staked LP</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">{formattedAmount}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">Lock</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">
            {tier.label} <span className="text-orange-400">({tier.multiplier}x)</span>
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">Pending FIRE</div>
          <div className="text-sm font-bold text-orange-400">{formattedRewards}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onClaim(positionId)}
          disabled={disabled || pendingRewards === '0'}
          className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-2.5 text-xs font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
        >
          Claim
        </button>
        <button
          onClick={() => onUnstake(positionId)}
          disabled={disabled || isLocked}
          className="flex-1 rounded-xl border border-[color:var(--sf-glass-border)] py-2.5 text-xs font-bold text-[color:var(--sf-text)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:bg-[color:var(--sf-panel-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Unstake
        </button>
      </div>
    </div>
  );
}
