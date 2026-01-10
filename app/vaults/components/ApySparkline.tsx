"use client";

type ApySparklineProps = {
  data: number[]; // Array of APY values (30 days)
  currentApy: number; // Current/latest APY to display
  showLabel?: boolean; // Whether to show the APY label (default: true)
  fillHeight?: boolean; // Whether to fill parent height (default: false)
};

export default function ApySparkline({ data, currentApy, showLabel = true, fillHeight = false }: ApySparklineProps) {
  // Chart dimensions - using viewBox for responsive scaling
  const width = 180;
  const height = 48;
  const padding = { top: 8, right: 8, bottom: 8, left: 4 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate Y-axis range from data
  const minY = Math.min(...data);
  const maxY = Math.max(...data);
  const range = maxY - minY;
  const isFlat = range === 0; // All values are the same

  // Generate path points
  const points = data.map((value, index) => {
    const x = padding.left + (index / (data.length - 1 || 1)) * chartWidth;
    // If flat (all same values), center the line vertically
    const y = isFlat
      ? padding.top + chartHeight / 2
      : padding.top + chartHeight - ((value - minY) / range) * chartHeight;
    return { x, y };
  });

  // Create SVG path
  const pathD = points.length > 0
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
    : '';

  // Last point for the pulsating dot - calculate percentage positions
  const lastPoint = points[points.length - 1] || { x: padding.left + chartWidth, y: padding.top + chartHeight / 2 };
  const lastPointXPercent = (lastPoint.x / width) * 100;
  const lastPointYPercent = (lastPoint.y / height) * 100;

  return (
    <div className={`flex flex-col items-end gap-1 w-full ${fillHeight ? 'h-full' : ''}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">
        30-day APY
      </div>
      <div className={`relative w-full ${fillHeight ? 'flex-1' : 'h-12'}`}>
        {/* Chart line - stretches to fill available width */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full text-[color:var(--sf-info-green-title)]"
        >
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Pulsating dot - positioned at last data point */}
        <div
          className="absolute w-2 h-2 rounded-full bg-[color:var(--sf-info-green-title)] animate-pulse -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${lastPointXPercent}%`, top: `${lastPointYPercent}%` }}
        />

        {/* APY label - right-aligned, positioned at bottom */}
        {showLabel && (
          <div className="absolute right-0 bottom-0 text-xs font-bold text-[color:var(--sf-text)]/60 whitespace-nowrap">
            {currentApy.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}
