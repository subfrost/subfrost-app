'use client';

import { LOCK_TIERS } from '@/utils/fireCalculations';

interface LockTierSelectorProps {
  selectedTier: number;
  onSelect: (tierIndex: number) => void;
}

export default function LockTierSelector({ selectedTier, onSelect }: LockTierSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
        Lock Duration
      </span>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {LOCK_TIERS.map((tier, index) => (
          <button
            key={tier.label}
            onClick={() => onSelect(index)}
            className={`rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 text-center transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] border ${
              selectedTier === index
                ? 'border-orange-500/50 bg-orange-500/10 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]'
                : 'border-[color:var(--sf-glass-border)] bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/60 hover:border-[color:var(--sf-outline)]'
            }`}
          >
            <div className="text-xs sm:text-sm font-bold">{tier.label}</div>
            <div className={`text-[10px] sm:text-xs ${selectedTier === index ? 'text-orange-400/70' : 'opacity-50'}`}>
              {tier.multiplier}x
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
