'use client';

import { estimateDailyRewards, LOCK_TIERS } from '@/utils/fireCalculations';
import { useTranslation } from '@/hooks/useTranslation';

interface RewardsProjectorProps {
  amount: number;
  lockTierIndex: number;
  emissionRatePerBlock: number;
  totalWeightedStake: number;
}

export default function RewardsProjector({
  amount,
  lockTierIndex,
  emissionRatePerBlock,
  totalWeightedStake,
}: RewardsProjectorProps) {
  const { t } = useTranslation();
  const tier = LOCK_TIERS[lockTierIndex] || LOCK_TIERS[0];
  const daily = estimateDailyRewards(emissionRatePerBlock, totalWeightedStake, amount, tier.multiplier);
  const weekly = daily * 7;
  const monthly = daily * 30;

  if (amount <= 0) {
    return (
      <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3 sm:p-4">
        <span className="text-xs text-[color:var(--sf-muted)]">{t('fire.enterAmount')}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3 sm:p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-2.5">
        {t('fire.estRewards')} <span className="text-orange-400">({tier.multiplier}x {t('fire.boost').toLowerCase()})</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t('fire.daily'), value: daily },
          { label: t('fire.weekly'), value: weekly },
          { label: t('fire.monthly'), value: monthly },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[10px] text-[color:var(--sf-muted)]">{label}</div>
            <div className="text-sm font-bold text-orange-400">{value.toFixed(4)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
