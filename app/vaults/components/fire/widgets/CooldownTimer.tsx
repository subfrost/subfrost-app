'use client';

import { useTranslation } from '@/hooks/useTranslation';

interface CooldownTimerProps {
  cooldownBlocks: number;
  currentBlock?: number;
}

export default function CooldownTimer({ cooldownBlocks }: CooldownTimerProps) {
  const { t } = useTranslation();

  if (cooldownBlocks <= 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
        <span className="text-sm font-semibold text-emerald-400">{t('fire.readyToRedeem')}</span>
      </div>
    );
  }

  const minutesRemaining = cooldownBlocks * 10;
  const hours = Math.floor(minutesRemaining / 60);
  const mins = minutesRemaining % 60;

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
      <div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
      <span className="text-sm font-semibold text-amber-400">
        {t('fire.cooldown')}: ~{hours}h {mins}m ({cooldownBlocks} blocks)
      </span>
    </div>
  );
}
