'use client';

import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

interface StakingPositionCardProps {
  tokenId: string;        // Position token AlkaneId (e.g. "2:28")
  depositAmount: string;  // Base units
  multiplier: number;     // 100 = 1.0x, 125 = 1.25x, etc.
  lockDuration: number;   // seconds (0 = no lock)
  lockEnd: number;        // timestamp (0 = no lock)
  onClaim: (tokenId: string) => void;
  onUnstake: (tokenId: string) => void;
  isClaiming?: boolean;
  isUnstaking?: boolean;
}

export default function StakingPositionCard({
  tokenId,
  depositAmount,
  multiplier,
  lockDuration,
  lockEnd,
  onClaim,
  onUnstake,
  isClaiming = false,
  isUnstaking = false,
}: StakingPositionCardProps) {
  const { t } = useTranslation();
  // Lock status: lockEnd is a Bitcoin block timestamp in seconds.
  // On devnet, block_header.time doesn't advance, so we can't reliably
  // compare against "now". Show lock status based on whether lockEnd > 0.
  const hasLock = lockEnd > 0;
  const lockLabel = lockDuration === 0 ? t('fire.unlocked')
    : lockDuration < 604800 ? `< 1 ${t('fire.week')}`
    : lockDuration < 2592000 ? `1 ${t('fire.week')}`
    : lockDuration < 7776000 ? `1 ${t('fire.month')}`
    : lockDuration < 15552000 ? `3 ${t('fire.months')}`
    : lockDuration < 31536000 ? `6 ${t('fire.months')}`
    : `1 ${t('fire.year')}`;

  const formattedAmount = new BigNumber(depositAmount).dividedBy(1e8).toFixed(4);
  const multDisplay = (multiplier / 100).toFixed(2);

  return (
    <div className="sf-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono text-[color:var(--sf-muted)]">
          {tokenId}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          hasLock
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
        }`}>
          {lockLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.stakedLp')}</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)]">{formattedAmount} LP</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.multiplier')}</div>
          <div className="text-sm font-bold text-orange-400">{multDisplay}x</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onClaim(tokenId)}
          disabled={isClaiming}
          className="flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-2.5 text-xs font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isClaiming ? t('fire.claiming') : t('fire.claim')}
        </button>
        <button
          onClick={() => onUnstake(tokenId)}
          disabled={isUnstaking || hasLock}
          className="sf-btn-secondary flex-1 py-2.5 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isUnstaking ? t('fire.unstaking') : t('fire.unstake')}
        </button>
      </div>
    </div>
  );
}
