'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface Stats {
  totalCodes: number;
  activeCodes: number;
  inactiveCodes: number;
  totalRedemptions: number;
  totalUsers: number;
  recentRedemptions: Array<{
    id: string;
    taprootAddress: string;
    redeemedAt: string;
    inviteCode: { code: string };
  }>;
  redemptionsByDay: Array<{
    date: string;
    count: number;
  }>;
  topParents: Array<{
    id: string;
    code: string;
    description: string | null;
    isActive: boolean;
    totalRedemptions: number;
  }>;
}

function formatLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${d}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function CumulativeRedemptionsGraph({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const updateSize = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, []);

  useEffect(() => {
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateSize]);

  // Build daily map from raw data
  const dailyMap: Record<string, number> = {};
  for (const { date, count } of data) {
    dailyMap[date] = count;
  }

  // Date range: day before first redemption → today
  const firstDate = data[0].date;
  const startDate = addDays(firstDate, -1);
  const today = new Date().toISOString().slice(0, 10);

  // Build cumulative data points for every day
  const points: Array<{ date: string; cumulative: number }> = [];
  let cumulative = 0;
  let current = startDate;
  while (current <= today) {
    cumulative += dailyMap[current] || 0;
    points.push({ date: current, cumulative });
    current = addDays(current, 1);
  }

  const maxY = points[points.length - 1]?.cumulative || 1;
  const totalDays = points.length;

  // Chart dimensions
  const height = containerHeight > 40 ? containerHeight : 200;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const chartW = Math.max(width - padLeft - padRight, 1);
  const chartH = height - padTop - padBottom;

  // Map data to SVG coords
  const svgPoints = points.map((p, i) => ({
    x: padLeft + (totalDays > 1 ? (i / (totalDays - 1)) * chartW : chartW / 2),
    y: padTop + chartH - (maxY > 0 ? (p.cumulative / maxY) * chartH : 0),
    ...p,
  }));

  const linePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${svgPoints[svgPoints.length - 1].x},${padTop + chartH} L${svgPoints[0].x},${padTop + chartH} Z`;

  // X-axis labels every 7 days
  const xLabels: Array<{ x: number; label: string }> = [];
  for (let i = 0; i < points.length; i += 7) {
    xLabels.push({
      x: svgPoints[i].x,
      label: formatLabel(points[i].date),
    });
  }
  // Always include today if it's not already included
  const lastIdx = points.length - 1;
  if (lastIdx % 7 !== 0) {
    xLabels.push({
      x: svgPoints[lastIdx].x,
      label: formatLabel(points[lastIdx].date),
    });
  }

  // Y-axis labels (0 and a few intermediate ticks)
  const yTicks: number[] = [];
  if (maxY <= 5) {
    for (let i = 0; i <= maxY; i++) yTicks.push(i);
  } else {
    const step = Math.ceil(maxY / 4);
    for (let v = 0; v <= maxY; v += step) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== maxY) yTicks.push(maxY);
  }

  return (
    <div ref={containerRef} className="w-full flex-1">
      {width > 0 && containerHeight > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines */}
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxY > 0 ? (v / maxY) * chartH : 0);
            return (
              <line
                key={v}
                x1={padLeft}
                y1={y}
                x2={padLeft + chartW}
                y2={y}
                stroke="var(--sf-glass-border)"
                strokeDasharray="3,3"
              />
            );
          })}
          {/* Area fill */}
          <path d={areaPath} fill="rgb(59,130,246)" opacity={0.1} />
          {/* Line */}
          <path d={linePath} fill="none" stroke="rgb(59,130,246)" strokeWidth={2} />
          {/* Data point dots (only at start/end for cleanliness) */}
          {svgPoints.length > 0 && (
            <circle
              cx={svgPoints[svgPoints.length - 1].x}
              cy={svgPoints[svgPoints.length - 1].y}
              r={3}
              fill="rgb(59,130,246)"
            />
          )}
          {/* Y-axis labels */}
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxY > 0 ? (v / maxY) * chartH : 0);
            return (
              <text
                key={v}
                x={padLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--sf-muted)"
                fontSize={10}
              >
                {v}
              </text>
            );
          })}
          {/* X-axis labels */}
          {xLabels.map(({ x, label }, i) => (
            <text
              key={i}
              x={x}
              y={padTop + chartH + 16}
              textAnchor="middle"
              fill="var(--sf-muted)"
              fontSize={10}
            >
              {label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

interface CommunityFuel {
  community: string;
  total: number;
  addressCount: number;
  amounts: number[];
}

type FuelAggMode = 'total' | 'average' | 'median';

function computeMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function CommunityFuelChart({ data, mode, heightScale = 1 }: { data: CommunityFuel[]; mode: FuelAggMode; heightScale?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateWidth]);

  const withValue = data.map((item) => {
    let value: number;
    if (mode === 'average') {
      value = item.addressCount > 0 ? item.total / item.addressCount : 0;
    } else if (mode === 'median') {
      value = computeMedian(item.amounts);
    } else {
      value = item.total;
    }
    return { ...item, value: Math.round(value * 100) / 100 };
  });

  const sorted = [...withValue].sort((a, b) => b.value - a.value);
  const maxVal = sorted.length > 0 ? sorted[0].value : 1;

  const height = Math.round(220 * heightScale);
  const padLeft = 50;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 60;
  const chartW = Math.max(width - padLeft - padRight, 1);
  const chartH = height - padTop - padBottom;

  const barCount = sorted.length;
  const gap = Math.max(4, chartW * 0.02);
  const barWidth = barCount > 0 ? Math.max(8, (chartW - gap * (barCount + 1)) / barCount) : 0;

  // Y-axis ticks
  const yTicks: number[] = [];
  if (maxVal <= 5) {
    for (let i = 0; i <= maxVal; i++) yTicks.push(i);
  } else {
    const step = Math.ceil(maxVal / 4);
    for (let v = 0; v <= maxVal; v += step) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== maxVal) yTicks.push(maxVal);
  }

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines */}
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            return (
              <line
                key={v}
                x1={padLeft}
                y1={y}
                x2={padLeft + chartW}
                y2={y}
                stroke="var(--sf-glass-border)"
                strokeDasharray="3,3"
              />
            );
          })}
          {/* Y-axis labels */}
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            return (
              <text
                key={v}
                x={padLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--sf-muted)"
                fontSize={10}
              >
                {v.toLocaleString()}
              </text>
            );
          })}
          {/* Bars */}
          {sorted.map((item, i) => {
            const barH = maxVal > 0 ? (item.value / maxVal) * chartH : 0;
            const x = padLeft + gap + i * (barWidth + gap);
            const y = padTop + chartH - barH;
            return (
              <g key={item.community}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill="rgb(59,130,246)"
                  rx={2}
                />
                {/* Value label on top of bar */}
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fill="var(--sf-text)"
                  fontSize={9}
                  fontWeight="bold"
                >
                  {item.value.toLocaleString()}
                </text>
                {/* Community label below bar (with address count) */}
                <text
                  x={x + barWidth / 2}
                  y={padTop + chartH + 12}
                  textAnchor="end"
                  dominantBaseline="hanging"
                  fill="var(--sf-muted)"
                  fontSize={10}
                  transform={`rotate(-45, ${x + barWidth / 2}, ${padTop + chartH + 12})`}
                >
                  {item.community} ({item.addressCount})
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

const PIE_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#f43f5e', '#84cc16', '#a855f7', '#14b8a6',
  '#e879f9', '#fb923c', '#38bdf8', '#4ade80', '#fbbf24',
];

function CommunityFuelPie({ data, showValues, sizeScale = 1 }: { data: CommunityFuel[]; showValues?: boolean; sizeScale?: number }) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((s, d) => s + d.total, 0);
  if (grandTotal === 0) return null;

  const size = Math.round(200 * sizeScale);
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.round(70 * sizeScale);

  // Build slices
  let cumAngle = -Math.PI / 2;
  const slices = sorted.map((item, i) => {
    const frac = item.total / grandTotal;
    const startAngle = cumAngle;
    const endAngle = cumAngle + frac * 2 * Math.PI;
    cumAngle = endAngle;
    return { ...item, frac, startAngle, endAngle, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => {
          const largeArc = s.frac > 0.5 ? 1 : 0;
          const x1 = cx + r * Math.cos(s.startAngle);
          const y1 = cy + r * Math.sin(s.startAngle);
          const x2 = cx + r * Math.cos(s.endAngle);
          const y2 = cy + r * Math.sin(s.endAngle);

          // For 100% case
          if (s.frac >= 0.9999) {
            return (
              <circle key={s.community} cx={cx} cy={cy} r={r} fill={s.color} />
            );
          }

          const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
          return <path key={s.community} d={d} fill={s.color} />;
        })}
        {/* Percentage labels on slices */}
        {slices.map((s) => {
          if (s.frac < 0.04) return null;
          const midAngle = (s.startAngle + s.endAngle) / 2;
          const labelR = r * 0.6;
          const lx = cx + labelR * Math.cos(midAngle);
          const ly = cy + labelR * Math.sin(midAngle);
          return (
            <text
              key={s.community}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={10}
              fontWeight="bold"
            >
              {Math.round(s.frac * 100)}%{showValues ? `, ${Math.round(s.total).toLocaleString()}` : ''}
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {slices.map((s) => (
          <div key={s.community} className="flex items-center gap-1 text-[10px] text-[color:var(--sf-muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.community}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopParentsBarChart({ data, heightScale = 1 }: { data: Stats['topParents']; heightScale?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateWidth]);

  const sorted = [...data].sort((a, b) => b.totalRedemptions - a.totalRedemptions);
  const maxVal = sorted.length > 0 ? sorted[0].totalRedemptions : 1;

  const height = Math.round(220 * heightScale);
  const padLeft = 50;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 60;
  const chartW = Math.max(width - padLeft - padRight, 1);
  const chartH = height - padTop - padBottom;

  const barCount = sorted.length;
  const gap = Math.max(4, chartW * 0.02);
  const barWidth = barCount > 0 ? Math.max(8, (chartW - gap * (barCount + 1)) / barCount) : 0;

  const yTicks: number[] = [];
  if (maxVal <= 5) {
    for (let i = 0; i <= maxVal; i++) yTicks.push(i);
  } else {
    const step = Math.ceil(maxVal / 4);
    for (let v = 0; v <= maxVal; v += step) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== maxVal) yTicks.push(maxVal);
  }

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            return (
              <line
                key={v}
                x1={padLeft}
                y1={y}
                x2={padLeft + chartW}
                y2={y}
                stroke="var(--sf-glass-border)"
                strokeDasharray="3,3"
              />
            );
          })}
          {yTicks.map((v) => {
            const y = padTop + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            return (
              <text
                key={v}
                x={padLeft - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--sf-muted)"
                fontSize={10}
              >
                {v}
              </text>
            );
          })}
          {sorted.map((item, i) => {
            const barH = maxVal > 0 ? (item.totalRedemptions / maxVal) * chartH : 0;
            const x = padLeft + gap + i * (barWidth + gap);
            const y = padTop + chartH - barH;
            return (
              <g key={item.id}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill="rgb(59,130,246)"
                  rx={2}
                />
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fill="var(--sf-text)"
                  fontSize={9}
                  fontWeight="bold"
                >
                  {item.totalRedemptions}
                </text>
                <text
                  x={x + barWidth / 2}
                  y={padTop + chartH + 12}
                  textAnchor="end"
                  dominantBaseline="hanging"
                  fill="var(--sf-muted)"
                  fontSize={10}
                  transform={`rotate(-45, ${x + barWidth / 2}, ${padTop + chartH + 12})`}
                >
                  {item.code}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

type DashboardView = 'FUEL' | 'CODES' | 'BOTH';

export default function DashboardTab() {
  const adminFetch = useAdminFetch();
  const [stats, setStats] = useState<Stats | null>(null);
  const [communityFuel, setCommunityFuel] = useState<CommunityFuel[]>([]);
  const [fuelAggMode, setFuelAggMode] = useState<FuelAggMode>('total');
  const [dashboardView, setDashboardView] = useState<DashboardView>('BOTH');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [statsRes, fuelRes] = await Promise.all([
          adminFetch('/api/admin/stats'),
          adminFetch('/api/admin/fuel'),
        ]);
        if (!statsRes.ok) throw new Error('Failed to fetch stats');
        const statsData = await statsRes.json();
        if (!cancelled) setStats(statsData);

        if (fuelRes.ok) {
          const fuelData = await fuelRes.json();
          const communityMap: Record<string, { total: number; amounts: number[] }> = {};
          for (const alloc of fuelData.allocations || []) {
            const community = (alloc.note || 'Unknown').trim();
            if (!communityMap[community]) communityMap[community] = { total: 0, amounts: [] };
            communityMap[community].total += alloc.amount;
            communityMap[community].amounts.push(alloc.amount);
          }
          const result = Object.entries(communityMap).map(([community, { total, amounts }]) => ({
            community,
            total: Math.round(total * 100) / 100,
            addressCount: amounts.length,
            amounts,
          }));
          if (!cancelled) setCommunityFuel(result);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminFetch]);

  if (loading) return <div className="text-[color:var(--sf-muted)]">Loading...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!stats) return null;

  // Compute FUEL metrics from communityFuel data
  const totalFuel = communityFuel.reduce((s, c) => s + c.total, 0);
  const totalAddresses = communityFuel.reduce((s, c) => s + c.addressCount, 0);
  const averageFuel = totalAddresses > 0 ? Math.round((totalFuel / totalAddresses) * 100) / 100 : 0;
  const allAmounts = communityFuel.flatMap((c) => c.amounts);
  const medianFuel = computeMedian(allAmounts);

  const showFuel = dashboardView === 'FUEL' || dashboardView === 'BOTH';
  const showCodes = dashboardView === 'CODES' || dashboardView === 'BOTH';

  const fuelCards = [
    { label: 'Total FUEL', value: totalFuel },
    { label: 'Average FUEL', value: averageFuel },
    { label: 'Median FUEL', value: medianFuel },
    { label: 'Total Addresses', value: totalAddresses },
  ];

  const codeCards = [
    { label: 'Total Codes', value: stats.totalCodes },
    { label: 'Total Redemptions', value: stats.totalRedemptions },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard view toggle */}
      <div className="flex items-center gap-2">
        {(['FUEL', 'CODES', 'BOTH'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setDashboardView(view)}
            className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
              dashboardView === view
                ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* FUEL section */}
      {showFuel && (
        <>
          {/* FUEL stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {fuelCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4"
              >
                <div className="text-xs text-[color:var(--sf-muted)]">{card.label}</div>
                <div className="mt-1 text-2xl font-bold text-[color:var(--sf-text)]">
                  {card.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Community FUEL Allocation charts */}
          <div className="flex flex-col gap-6 md:flex-row">
            {/* Bar chart */}
            <div className={`w-full ${dashboardView === 'BOTH' ? 'md:w-[60%]' : 'md:w-[50%]'} rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6`}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--sf-text)]">
                  FUEL Allocated by Community
                </h3>
                <div className="flex gap-1 rounded-lg border border-[color:var(--sf-glass-border)] p-0.5">
                  {(['total', 'average', 'median'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setFuelAggMode(m)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        fuelAggMode === m
                          ? 'bg-blue-500 text-white'
                          : 'text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]'
                      }`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {communityFuel.length === 0 ? (
                <div className="text-sm text-[color:var(--sf-muted)]">No allocations yet</div>
              ) : (
                <CommunityFuelChart data={communityFuel} mode={fuelAggMode} heightScale={dashboardView === 'BOTH' ? 1.5 : 1.875} />
              )}
            </div>
            {/* Pie chart */}
            <div className={`w-full ${dashboardView === 'BOTH' ? 'md:w-[40%]' : 'md:w-[50%]'} rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6`}>
              <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
                FUEL Allocations
              </h3>
              {communityFuel.length === 0 ? (
                <div className="text-sm text-[color:var(--sf-muted)]">No allocations yet</div>
              ) : (
                <div className="flex items-center justify-center">
                  <CommunityFuelPie data={communityFuel} showValues={dashboardView === 'FUEL'} sizeScale={dashboardView === 'BOTH' ? 1.5 : 1.875} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* CODES section */}
      {showCodes && (
        <>
          {/* Code stat cards */}
          <div className="grid grid-cols-2 gap-4">
            {codeCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4"
              >
                <div className="text-xs text-[color:var(--sf-muted)]">{card.label}</div>
                <div className="mt-1 text-2xl font-bold text-[color:var(--sf-text)]">
                  {card.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6 md:flex-row">
            {/* Top parents bar chart */}
            <div className={`w-full ${dashboardView === 'BOTH' ? 'md:w-[60%]' : 'md:w-[50%]'} rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6`}>
              <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
                Top Parents by Code Redemptions
              </h3>
              {stats.topParents.length === 0 ? (
                <div className="text-sm text-[color:var(--sf-muted)]">No codes yet</div>
              ) : (
                <TopParentsBarChart data={stats.topParents} heightScale={dashboardView === 'BOTH' ? 1.5 : 1.875} />
              )}
            </div>

            {/* Cumulative redemptions graph */}
            <div className={`flex w-full ${dashboardView === 'BOTH' ? 'md:w-[40%]' : 'md:w-[50%]'} flex-col rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6`} style={{ minHeight: dashboardView !== 'BOTH' ? 250 * 1.875 : 250 * 1.5 }}>
              <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
                Cumulative Code Redemptions
              </h3>
              {stats.redemptionsByDay.length === 0 ? (
                <div className="text-sm text-[color:var(--sf-muted)]">No redemptions yet</div>
              ) : (
                <CumulativeRedemptionsGraph data={stats.redemptionsByDay} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
