'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAmmTotalVolume, type AmmVolumePoint } from '@/hooks/useAmmTotalVolume';

const ASSUMED_SECONDS_PER_BLOCK = 600;

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Convert sparse (height, valueUsd) points into a sorted, dedup'd
 * (time, value) series suitable for lightweight-charts.
 *
 * Espo only emits per-block-event points (no timestamps), so we estimate
 * each point's time by anchoring the latest point to "now" and walking
 * backward at 600s/block. Drift over a 30-day window is small enough for
 * a marketing-quality landing-page chart; precision isn't the goal.
 */
function pointsToSeries(
  points: AmmVolumePoint[],
  latest: { height: number; valueUsd: number } | null,
): { time: string; value: number }[] {
  if (!points.length) return [];

  const anchorHeight = latest?.height ?? points[points.length - 1]!.height;
  const anchorMs = Date.now();

  const heightToDate = (h: number): string => {
    const blocksAgo = anchorHeight - h;
    const ms = anchorMs - blocksAgo * ASSUMED_SECONDS_PER_BLOCK * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  };

  // Bucket per ISO date, keeping the *highest* cumulative value seen on that
  // date — cumulative volume is monotonic so the last point in a bucket wins.
  const byDate = new Map<string, number>();
  for (const p of points) {
    const t = heightToDate(p.height);
    const cur = byDate.get(t);
    if (cur === undefined || p.valueUsd > cur) byDate.set(t, p.valueUsd);
  }

  // If `latest` exists and isn't already in the series, append today's value
  // — important when the indexed series ends mid-day on a low-volume block.
  if (latest) {
    const today = heightToDate(latest.height);
    if (!byDate.has(today) || byDate.get(today)! < latest.valueUsd) {
      byDate.set(today, latest.valueUsd);
    }
  }

  return Array.from(byDate.entries())
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export default function CumulativeAmmVolume() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const { data, isLoading, isError } = useAmmTotalVolume(1000);

  const series = useMemo(
    () => (data ? pointsToSeries(data.points, data.latest) : []),
    [data],
  );

  const isDark = theme === 'dark';
  const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
  const lineColor = '#22c55e';
  const crosshairColor = 'rgba(34, 197, 94, 0.2)';

  useEffect(() => {
    if (!containerRef.current || series.length === 0) return;

    let cancelled = false;

    const initChart = async () => {
      const { createChart, AreaSeries } = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        height: containerRef.current.clientHeight || 220,
        layout: {
          background: { color: 'transparent' },
          textColor,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        rightPriceScale: { borderColor },
        timeScale: { borderColor },
        crosshair: {
          horzLine: { color: crosshairColor },
          vertLine: { color: crosshairColor },
        },
        handleScale: false,
        handleScroll: false,
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor,
        lineWidth: 2,
        topColor: 'rgba(34, 197, 94, 0.4)',
        bottomColor: 'rgba(34, 197, 94, 0.0)',
        priceFormat: {
          type: 'custom',
          formatter: formatUsd,
          minMove: 1,
        },
        lastValueVisible: true,
        priceLineVisible: false,
      });

      areaSeries.setData(series);
      chart.timeScale().fitContent();

      chartRef.current = chart;
    };

    initChart();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [series, textColor, gridColor, borderColor, lineColor, crosshairColor]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 220,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const latestUsd = data?.latest?.valueUsd;
  const headerSuffix = latestUsd != null ? ` — ${formatUsd(latestUsd)}` : '';

  return (
    <div className="sf-card h-full flex flex-col">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">
          Total AMM Volume{headerSuffix}
        </h3>
      </div>
      <div className="p-4 flex-1 min-h-0 relative">
        <div ref={containerRef} className="h-full w-full" />
        {isLoading && series.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-[color:var(--sf-text)]/60">
            Loading…
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-500/80">
            Volume data unavailable
          </div>
        )}
      </div>
    </div>
  );
}
