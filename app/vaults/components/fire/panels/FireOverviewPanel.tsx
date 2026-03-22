'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import TreasuryBreakdownChart from '../charts/TreasuryBreakdownChart';
import StakerPieChart from '../charts/StakerPieChart';
import { useFireTokenStats } from '@/hooks/fire/useFireTokenStats';
import { useFireStakingStats } from '@/hooks/fire/useFireStakingStats';
import { useFireTreasury } from '@/hooks/fire/useFireTreasury';
import { useFireChartData } from '@/hooks/fire/useFireChartData';
import { formatCompact } from '@/utils/fireCalculations';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

const EmissionScheduleChart = dynamic(() => import('../charts/EmissionScheduleChart'), { ssr: false });

export default function FireOverviewPanel() {
  const { t } = useTranslation();
  const { data: tokenStats } = useFireTokenStats();
  const { data: stakingStats } = useFireStakingStats();
  const { data: treasury } = useFireTreasury();
  const mockData = useFireChartData();

  const metrics = useMemo(() => {
    const emissionRemaining = new BigNumber(tokenStats?.emissionPoolRemaining || '0').dividedBy(1e8);
    const totalStaked = new BigNumber(stakingStats?.totalStaked || '0').dividedBy(1e8);
    const totalBacking = new BigNumber(treasury?.totalBacking || '0').dividedBy(1e8);

    return {
      totalStaked: totalStaked.gt(0) ? formatCompact(totalStaked.toNumber()) + ' LP' : '-- LP',
      totalBacking: totalBacking.gt(0) ? totalBacking.toFixed(4) + ' BTC' : '--',
      emissionRemaining: emissionRemaining.gt(0) ? formatCompact(emissionRemaining.toNumber()) : '--',
    };
  }, [tokenStats, stakingStats, treasury]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Top stakers */}
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <div className="flex items-start justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
            {t('fire.topStakers')}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
            {t('fire.totalStaked')}
          </div>
        </div>

        <div className="flex gap-4 sm:gap-5">
          {/* Staker pie chart */}
          <div className="flex-1 min-w-0">
            <StakerPieChart data={mockData.stakerDistribution} size={140} />
          </div>

          {/* Temperature bar: staked vs circulating supply */}
          <StakeTemperatureBar circulatingSupply={2100000} totalStaked={1300000} />
        </div>
      </div>

      {/* Emission schedule */}
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <EmissionScheduleChart numYears={10} height={320} />
      </div>

      {/* Treasury breakdown — hidden for now, may re-enable later
      <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <TreasuryBreakdownChart />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.totalBacking')}</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">{metrics.totalBacking}</div>
          </div>
          <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.emissionPool')}</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">{metrics.emissionRemaining}</div>
          </div>
        </div>
      </div>
      */}
    </div>
  );
}

/** Vertical temperature bar showing staked portion of circulating supply */
function StakeTemperatureBar({ circulatingSupply, totalStaked }: { circulatingSupply: number; totalStaked: number }) {
  const pct = circulatingSupply > 0 ? Math.min((totalStaked / circulatingSupply) * 100, 100) : 0;

  const fmt = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <div className="flex gap-1.5 flex-shrink-0 min-h-[160px]">
      {/* The bar */}
      <div className="relative w-5 h-full rounded-full bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] overflow-hidden">
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full bg-gradient-to-t from-orange-600 to-orange-400 transition-all duration-700 ease-out"
          style={{ height: `${pct}%` }}
        />
      </div>

      {/* Labels to the right, top-aligned and bottom-aligned */}
      <div className="flex flex-col justify-between py-0.5">
        <div className="text-[9px] font-semibold text-[color:var(--sf-muted)] whitespace-nowrap">
          {fmt(circulatingSupply)}
        </div>
        <div className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-[9px] font-bold text-orange-400">
            {fmt(totalStaked)}
          </span>
          <span className="text-[8px] text-[color:var(--sf-muted)]">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}
