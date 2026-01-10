"use client";

type ApySparklineProps = {
  data: number[]; // Array of APY values (30 days)
  currentApy: number; // Current/latest APY to display
};

export default function ApySparkline({ data, currentApy }: ApySparklineProps) {
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

  // Last point for the pulsating dot
  const lastPoint = points[points.length - 1] || { x: padding.left + chartWidth, y: padding.top + chartHeight / 2 };

  return (
    <div className="flex flex-col items-end gap-1 w-full">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">
        30-day APY
      </div>
      <div className="relative w-full h-12 flex items-center">
        {/* Chart line - stretches to fill available width */}
        <div className="flex-1 h-full min-w-0">
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
            />
          </svg>
        </div>

        {/* Pulsating dot - separate element to maintain perfect circle */}
        <div className="w-2 h-2 rounded-full bg-[color:var(--sf-info-green-title)] animate-pulse flex-shrink-0 -ml-1" />

        {/* APY label */}
        <div className="text-xs font-bold text-[color:var(--sf-text)]/60 whitespace-nowrap animate-pulse flex-shrink-0 ml-2">
          {currentApy.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
