'use client';

import { useState } from 'react';
import LockTierSelector from '../widgets/LockTierSelector';
import RewardsProjector from '../widgets/RewardsProjector';
import StakingPositionCard from '../widgets/StakingPositionCard';
import { useFireStakingStats } from '@/hooks/fire/useFireStakingStats';
import { useFireUserPositions } from '@/hooks/fire/useFireUserPositions';
import { useWallet } from '@/context/WalletContext';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

export default function FireStakingPanel() {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: stakingStats } = useFireStakingStats();
  const { data: userPositions } = useFireUserPositions();

  const [amount, setAmount] = useState('');
  const [lockTier, setLockTier] = useState(0);

  const emissionRate = Number(stakingStats?.emissionRate || '0') / 1e8;
  const totalWeightedStake = Number(stakingStats?.totalStaked || '0') / 1e8;
  const parsedAmount = parseFloat(amount) || 0;

  const handleStake = () => {
    if (isDemoGated) return;
    console.log('[FireStakingPanel] Stake:', { amount, lockTier });
  };

  const handleClaim = (positionId: number) => {
    if (isDemoGated) return;
    console.log('[FireStakingPanel] Claim:', { positionId });
  };

  const handleUnstake = (positionId: number) => {
    if (isDemoGated) return;
    console.log('[FireStakingPanel] Unstake:', { positionId });
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Stake form */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
            {t('fire.stakeLpTokens')}
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-1.5 block">{t('fire.amount')}</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full rounded-xl bg-[color:var(--sf-surface)] px-4 py-3.5 text-lg font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 outline-none border border-[color:var(--sf-glass-border)] focus:border-orange-500/50 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[color:var(--sf-muted)]">
                LP
              </span>
            </div>
          </div>

          {/* Lock tier */}
          <div className="mb-4">
            <LockTierSelector selectedTier={lockTier} onSelect={setLockTier} />
          </div>

          {/* Rewards projector */}
          <div className="mb-4">
            <RewardsProjector
              amount={parsedAmount}
              lockTierIndex={lockTier}
              emissionRatePerBlock={emissionRate}
              totalWeightedStake={totalWeightedStake}
            />
          </div>

          {/* Stake button */}
          <button
            onClick={handleStake}
            disabled={!isConnected || parsedAmount <= 0 || isDemoGated}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)]"
          >
            {isDemoGated ? t('common.comingSoon') : !isConnected ? t('fire.connectWallet') : t('fire.stakeLp')}
          </button>
        </div>
      </div>

      {/* Positions */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
          {t('fire.yourPositions')}
        </div>

        {!isConnected ? (
          <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-8 sm:p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <div className="text-[color:var(--sf-muted)] text-sm">{t('fire.connectToViewPositions')}</div>
          </div>
        ) : !userPositions?.positions?.length ? (
          <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-8 sm:p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <div className="text-2xl mb-2">
              <svg className="h-8 w-8 mx-auto text-[color:var(--sf-muted)]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="text-[color:var(--sf-muted)] text-sm">{t('fire.noPositions')}</div>
          </div>
        ) : (
          userPositions.positions.map((pos) => (
            <StakingPositionCard
              key={pos.positionId}
              positionId={pos.positionId}
              amount={pos.amount}
              lockTier={pos.lockTier}
              unlockBlock={pos.unlockBlock}
              pendingRewards={pos.pendingRewards}
              onClaim={handleClaim}
              onUnstake={handleUnstake}
              disabled={isDemoGated}
            />
          ))
        )}

        {userPositions?.pendingRewards && BigInt(userPositions.pendingRewards) > 0n && (
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 text-center">
            <span className="text-sm font-bold text-orange-400">
              {t('fire.totalPending')}: {new BigNumber(userPositions.pendingRewards).dividedBy(1e8).toFixed(6)} FIRE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
