'use client';

import { LOCK_TIERS } from '@/utils/fireCalculations';
import { useTranslation } from '@/hooks/useTranslation';

interface LockTierSelectorProps {
  selectedTier: number;
  onSelect: (tierIndex: number) => void;
}

const LOCK_TIER_KEYS: Record<string, string> = {
  'None': 'fire.lockNone',
  '1 Week': 'fire.lock1Week',
  '1 Month': 'fire.lock1Month',
  '3 Months': 'fire.lock3Months',
  '6 Months': 'fire.lock6Months',
  '1 Year': 'fire.lock1Year',
};

export default function LockTierSelector({ selectedTier, onSelect }: LockTierSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
        {t('fire.lockDuration')}
      </span>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {LOCK_TIERS.map((tier, index) => (
          <button
            key={tier.label}
            type="button"
            onClick={() => onSelect(index)}
            className={`sf-tile inline-flex flex-col items-center justify-center px-2 sm:px-3 py-2 sm:py-2.5 text-center text-[color:var(--sf-percent-btn)] focus:outline-none ${
              selectedTier === index ? '!bg-[color:var(--sf-primary)]/20' : ''
            }`}
          >
            <div className="text-xs sm:text-sm font-bold">{t(LOCK_TIER_KEYS[tier.label] || tier.label)}</div>
            <div className={`text-[10px] sm:text-xs font-bold ${selectedTier === index ? 'text-[color:var(--sf-percent-btn)]' : 'opacity-50'}`}>
              {tier.multiplier}x
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
