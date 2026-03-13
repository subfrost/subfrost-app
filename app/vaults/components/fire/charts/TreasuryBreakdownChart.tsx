'use client';

import { useTranslation } from '@/hooks/useTranslation';

interface TreasuryAllocation {
  label: string;
  percentage: number;
  color: string;
}

interface TreasuryBreakdownChartProps {
  size?: number;
}

const ALLOCATIONS: TreasuryAllocation[] = [
  { label: 'LP Seed', percentage: 40, color: '#f97316' },
  { label: 'Bonding', percentage: 25, color: '#3b82f6' },
  { label: 'Distribution', percentage: 20, color: '#8b5cf6' },
  { label: 'Team', percentage: 15, color: '#4b5563' },
];

export default function TreasuryBreakdownChart({ size = 150 }: TreasuryBreakdownChartProps) {
  const { t } = useTranslation();
  const center = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius * 0.62;

  let cumulativeAngle = -Math.PI / 2;
  const paths = ALLOCATIONS.map((alloc, i) => {
    const angle = (alloc.percentage / 100) * Math.PI * 2;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const largeArc = angle > Math.PI ? 1 : 0;
    const outerX1 = center + outerRadius * Math.cos(startAngle);
    const outerY1 = center + outerRadius * Math.sin(startAngle);
    const outerX2 = center + outerRadius * Math.cos(endAngle);
    const outerY2 = center + outerRadius * Math.sin(endAngle);
    const innerX1 = center + innerRadius * Math.cos(endAngle);
    const innerY1 = center + innerRadius * Math.sin(endAngle);
    const innerX2 = center + innerRadius * Math.cos(startAngle);
    const innerY2 = center + innerRadius * Math.sin(startAngle);

    const d = [
      `M ${outerX1} ${outerY1}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerX2} ${outerY2}`,
      `L ${innerX1} ${innerY1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerX2} ${innerY2}`,
      'Z',
    ].join(' ');

    return <path key={i} d={d} fill={alloc.color} opacity={0.9} />;
  });

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-3">
        {t('fire.treasuryAllocation')}
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
          {paths}
        </svg>
        <div className="flex flex-wrap sm:flex-col gap-x-4 gap-y-1 sm:gap-1.5">
          {ALLOCATIONS.map((alloc, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: alloc.color }} />
              <span className="text-[10px] sm:text-xs text-[color:var(--sf-muted)] whitespace-nowrap">
                {alloc.label} <span className="font-semibold text-[color:var(--sf-text)]/70">{alloc.percentage}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
