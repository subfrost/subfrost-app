'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import TreasuryBreakdownChart from '../charts/TreasuryBreakdownChart';
import StakerPieChart from '../charts/StakerPieChart';
import { useFireTokenStats } from '@/hooks/fire/useFireTokenStats';
import { useFireStakingStats } from '@/hooks/fire/useFireStakingStats';
import { useFireTreasury } from '@/hooks/fire/useFireTreasury';
import { useFireMockData } from '@/hooks/fire/useFireMockData';
import { formatCompact, LOCK_TIERS } from '@/utils/fireCalculations';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

const EmissionScheduleChart = dynamic(() => import('../charts/EmissionScheduleChart'), { ssr: false });

export default function FireOverviewPanel() {
  const { t } = useTranslation();
  const { data: tokenStats } = useFireTokenStats();
  const { data: stakingStats } = useFireStakingStats();
  const { data: treasury } = useFireTreasury();
  const mockData = useFireMockData();

  const metrics = useMemo(() => {
    const emissionRemaining = new BigNumber(tokenStats?.emissionPoolRemaining || '0').dividedBy(1e8);
    const totalStaked = new BigNumber(stakingStats?.totalStaked || '0').dividedBy(1e8);
    const totalBacking = new BigNumber(treasury?.totalBacking || '0').dividedBy(1e8);

    return {
      totalStaked: totalStaked.gt(0) ? formatCompact(totalStaked.toNumber()) + ' LP' : '--',
      totalBacking: totalBacking.gt(0) ? totalBacking.toFixed(4) + ' BTC' : '--',
      emissionRemaining: emissionRemaining.gt(0) ? formatCompact(emissionRemaining.toNumber()) : '--',
    };
  }, [tokenStats, stakingStats, treasury]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Treasury breakdown */}
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)]">
        <TreasuryBreakdownChart />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.totalBacking')}</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">{metrics.totalBacking}</div>
          </div>
          <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.emissionPool')}</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">{metrics.emissionRemaining}</div>
          </div>
        </div>
      </div>

      {/* Staking overview */}
        <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-3">
            {t('fire.stakingOverview')}
          </div>
          <div className="mb-4">
            <div className="text-xs text-[color:var(--sf-muted)]">{t('fire.totalValueStaked')}</div>
            <div className="text-2xl sm:text-3xl font-bold text-[color:var(--sf-text)]">{metrics.totalStaked}</div>
          </div>

          {/* APY by tier table */}
          <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[color:var(--sf-muted)] border-b border-[color:var(--sf-row-border)]">
                  <th className="text-left py-2.5 px-3 font-semibold">{t('fire.lockTier')}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">{t('fire.boost')}</th>
                  <th className="text-right py-2.5 px-3 font-semibold">{t('fire.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {LOCK_TIERS.map((tier, i) => (
                  <tr key={tier.label} className="text-[color:var(--sf-text)]/80 border-b border-[color:var(--sf-row-border)] last:border-0">
                    <td className="py-2 px-3">{tier.label}</td>
                    <td className="text-right px-3">
                      <span className={`font-bold ${i === 0 ? 'text-[color:var(--sf-muted)]' : 'text-orange-400'}`}>
                        {tier.multiplier}x
                      </span>
                    </td>
                    <td className="text-right px-3 text-[color:var(--sf-muted)]">
                      {tier.duration > 0 ? `${tier.duration} blks` : t('fire.flex')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Staker distribution */}
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-3">
              {t('fire.topStakers')}
            </div>
            <StakerPieChart data={mockData.stakerDistribution} size={140} />
          </div>
        </div>

      {/* Emission schedule */}
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)]">
        <EmissionScheduleChart numYears={10} height={320} />
      </div>
    </div>
  );
}
