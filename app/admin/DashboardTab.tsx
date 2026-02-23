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
  const height = 200;
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
    <div ref={containerRef} className="w-full">
      {width > 0 && (
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

export default function DashboardTab() {
  const adminFetch = useAdminFetch();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await adminFetch('/api/admin/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        if (!cancelled) setStats(data);
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

  const cards = [
    { label: 'Total Codes', value: stats.totalCodes },
    { label: 'Active Codes', value: stats.activeCodes },
    { label: 'Inactive Codes', value: stats.inactiveCodes },
    { label: 'Total Redemptions', value: stats.totalRedemptions },
    { label: 'Total Users', value: stats.totalUsers },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cumulative redemptions graph */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
            Cumulative Redemptions
          </h3>
          {stats.redemptionsByDay.length === 0 ? (
            <div className="text-sm text-[color:var(--sf-muted)]">No redemptions yet</div>
          ) : (
            <CumulativeRedemptionsGraph data={stats.redemptionsByDay} />
          )}
        </div>

        {/* Top parents */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
            Top Parents by Redemptions
          </h3>
          {stats.topParents.length === 0 ? (
            <div className="text-sm text-[color:var(--sf-muted)]">No codes yet</div>
          ) : (
            <div className="space-y-3">
              {stats.topParents.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[color:var(--sf-text)]">{c.code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        c.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <span className="font-medium text-[color:var(--sf-text)]">
                    {c.totalRedemptions}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
