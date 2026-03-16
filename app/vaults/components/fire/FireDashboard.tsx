'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import FireHeaderTabs, { type FireTab } from './FireHeaderTabs';
import FireOverviewPanel from './panels/FireOverviewPanel';
import FireStakingPanel from './panels/FireStakingPanel';
import FireBondingPanel from './panels/FireBondingPanel';
import FireRedemptionPanel from './panels/FireRedemptionPanel';
import FireDistributionPanel from './panels/FireDistributionPanel';
import { useFireTokenStats } from '@/hooks/fire/useFireTokenStats';
import { useFireStakingStats } from '@/hooks/fire/useFireStakingStats';
import { useFireMockData } from '@/hooks/fire/useFireMockData';
import { formatCompact } from '@/utils/fireCalculations';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

const FirePriceChart = dynamic(() => import('./charts/FirePriceChart'), { ssr: false });

export default function FireDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FireTab>('dashboard');
  const { data: tokenStats } = useFireTokenStats();
  const { data: stakingStats } = useFireStakingStats();
  const mockData = useFireMockData();

  const heroMetrics = useMemo(() => {
    const circSupply = new BigNumber(tokenStats?.circulatingSupply || '0').dividedBy(1e8);
    const lastPrice = mockData.priceHistory[mockData.priceHistory.length - 1]?.value || 0;
    const prevPrice = mockData.priceHistory[mockData.priceHistory.length - 2]?.value || lastPrice;
    const priceDelta = prevPrice > 0 ? ((lastPrice - prevPrice) / prevPrice * 100) : 0;
    const marketCap = circSupply.multipliedBy(lastPrice);
    const totalStaked = new BigNumber(stakingStats?.totalStaked || '0').dividedBy(1e8);
    const emissionRate = new BigNumber(stakingStats?.emissionRate || '0').dividedBy(1e8);

    return {
      price: lastPrice > 0 ? `${lastPrice.toFixed(8)}` : '--',
      priceDelta: priceDelta.toFixed(1) + '%',
      priceDeltaPositive: priceDelta >= 0,
      marketCap: marketCap.gt(0) ? formatCompact(marketCap.toNumber()) : '--',
      circSupply: circSupply.gt(0) ? formatCompact(circSupply.toNumber()) : '--',
      totalStaked: totalStaked.gt(0) ? formatCompact(totalStaked.toNumber()) : '--',
      emissionRate: emissionRate.gt(0) ? `${emissionRate.toFixed(6)}/blk` : '--',
      currentEpoch: `Epoch ${stakingStats?.currentEpoch || '0'}`,
    };
  }, [tokenStats, stakingStats, mockData]);

  return (
    <div className="space-y-6">
      {/* 50/50 Grid: Tabs+Content (Left) + Hero (Right) — matches VaultDetail breakpoints */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Tab navigation + Tab content */}
        <div className="flex flex-col gap-5 sm:gap-6">
          <FireHeaderTabs activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="min-h-[400px]">
            {activeTab === 'dashboard' && <FireOverviewPanel />}
            {activeTab === 'stake' && <FireStakingPanel />}
            {activeTab === 'bond' && <FireBondingPanel />}
            {activeTab === 'redeem' && <FireRedemptionPanel />}
            {activeTab === 'distribute' && <FireDistributionPanel />}
          </div>
        </div>

        {/* Right Column: Hero — glassmorphic card (visible md+, card on mobile) */}
        {/* Mobile: simplified card */}
        <div className="md:hidden rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-[0_4px_16px_rgba(249,115,22,0.35)] flex-shrink-0">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-[color:var(--sf-text)]">{t('fire.title')}</h1>
              <p className="text-xs text-[color:var(--sf-muted)]">{t('fire.subtitle')}</p>
            </div>
          </div>
          {/* Price chart */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
                {t('fire.priceChart')}
              </span>
              <span className={`text-xs font-bold ${heroMetrics.priceDeltaPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {heroMetrics.priceDeltaPositive ? '+' : ''}{heroMetrics.priceDelta}
              </span>
            </div>
            <FirePriceChart data={mockData.priceHistory} height={180} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t('fire.price'), value: heroMetrics.price, unit: 'frBTC' },
              { label: t('fire.marketCap'), value: heroMetrics.marketCap, unit: 'frBTC' },
              { label: t('fire.circSupply'), value: heroMetrics.circSupply, unit: 'FIRE' },
              { label: t('fire.totalStaked'), value: heroMetrics.totalStaked, unit: 'LP' },
              { label: t('fire.emissionRate'), value: heroMetrics.emissionRate, unit: heroMetrics.currentEpoch },
            ].map(({ label, value, unit }) => (
              <div key={label} className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-0.5">{label}</div>
                <div className="text-base font-bold text-[color:var(--sf-text)] truncate">{value}</div>
                <div className="text-[10px] text-[color:var(--sf-muted)]">{unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: full hero */}
        <div className="hidden md:flex md:flex-col">
          <div className="rounded-2xl p-5 sm:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] relative overflow-hidden">
            {/* Background glow accent */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {/* Title row */}
              <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
                <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-[0_4px_16px_rgba(249,115,22,0.35)] flex-shrink-0">
                  <svg className="h-5 w-5 sm:h-7 sm:w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--sf-text)]">{t('fire.title')}</h1>
                  <p className="text-xs sm:text-sm text-[color:var(--sf-muted)]">{t('fire.subtitle')}</p>
                </div>
              </div>

              {/* Price chart */}
              <div className="mb-5 sm:mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
                    {t('fire.priceChart')}
                  </span>
                  <span className={`text-xs font-bold ${heroMetrics.priceDeltaPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {heroMetrics.priceDeltaPositive ? '+' : ''}{heroMetrics.priceDelta}
                  </span>
                </div>
                <FirePriceChart data={mockData.priceHistory} height={220} />
              </div>

              {/* Hero metric grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {[
                  { label: t('fire.price'), value: heroMetrics.price, unit: 'frBTC' },
                  { label: t('fire.marketCap'), value: heroMetrics.marketCap, unit: 'frBTC' },
                  { label: t('fire.circSupply'), value: heroMetrics.circSupply, unit: 'FIRE' },
                  { label: t('fire.totalStaked'), value: heroMetrics.totalStaked, unit: 'LP' },
                  { label: t('fire.emissionRate'), value: heroMetrics.emissionRate, unit: heroMetrics.currentEpoch },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-0.5">{label}</div>
                    <div className="text-base sm:text-lg font-bold text-[color:var(--sf-text)] truncate">{value}</div>
                    <div className="text-[10px] text-[color:var(--sf-muted)]">{unit}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
