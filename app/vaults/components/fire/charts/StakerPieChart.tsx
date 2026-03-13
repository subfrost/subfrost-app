'use client';

import type { StakerDistribution } from '@/hooks/fire/useFireMockData';
import { useTranslation } from '@/hooks/useTranslation';

interface StakerPieChartProps {
  data: StakerDistribution[];
  size?: number;
}

const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#4b5563'];

export default function StakerPieChart({ data, size = 140 }: StakerPieChartProps) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xs text-[color:var(--sf-muted)]">{t('fire.noData')}</span>
      </div>
    );
  }

  const center = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius * 0.62;

  let cumulativeAngle = -Math.PI / 2;
  const paths = data.map((staker, i) => {
    const angle = (staker.percentage / 100) * Math.PI * 2;
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

    return <path key={i} d={d} fill={COLORS[i % COLORS.length]} opacity={0.9} />;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        {paths}
      </svg>
      <div className="flex flex-wrap sm:flex-col gap-x-4 gap-y-1 sm:gap-1.5">
        {data.map((staker, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-[10px] sm:text-xs text-[color:var(--sf-muted)] whitespace-nowrap">
              {staker.address} <span className="font-semibold text-[color:var(--sf-text)]/70">{staker.percentage}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
