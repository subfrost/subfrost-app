'use client';

import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

interface FloorPriceIndicatorProps {
  totalBacking: string;
  circulatingSupply: string;
  cooldownBlocks?: number;
}

export default function FloorPriceIndicator({
  totalBacking,
  circulatingSupply,
  cooldownBlocks,
}: FloorPriceIndicatorProps) {
  const { t } = useTranslation();
  const backing = new BigNumber(totalBacking);
  const supply = new BigNumber(circulatingSupply);
  const floorPrice = supply.isZero()
    ? new BigNumber(0)
    : backing.dividedBy(supply);
  const floorPriceSats = floorPrice.toFixed(0);
  const floorPriceBtc = floorPrice.dividedBy(1e8).toFixed(8);

  return (
    <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] relative overflow-hidden">
      {/* Orange glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-orange-400/70">
            {t('fire.floorPrice')}
          </div>
          {cooldownBlocks !== undefined && cooldownBlocks <= 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span className="text-[10px] font-semibold text-emerald-400">{t('fire.readyToRedeem')}</span>
            </div>
          )}
          {cooldownBlocks !== undefined && cooldownBlocks > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
              <span className="text-[10px] font-semibold text-amber-400">{t('fire.cooldown')}</span>
            </div>
          )}
        </div>
        <div className="text-3xl sm:text-4xl font-bold text-orange-400">
          {floorPriceSats} <span className="text-lg text-orange-400/50">sats</span>
        </div>
        <div className="text-sm text-[color:var(--sf-muted)] mt-1">
          {floorPriceBtc} {t('fire.btcPerFire')}
        </div>
        <div className="flex gap-4 sm:gap-6 mt-3 text-xs text-[color:var(--sf-muted)]">
          <span>{t('fire.backing')}: {backing.dividedBy(1e8).toFixed(4)} BTC</span>
          <span>{t('fire.supply')}: {supply.dividedBy(1e8).toFixed(2)} FIRE</span>
        </div>
      </div>
    </div>
  );
}
