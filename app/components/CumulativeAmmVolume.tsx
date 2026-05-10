'use client';

/**
 * Cumulative AMM Volume — landing-page chart of total swap volume over time.
 *
 * 2026-05-10 — Replaced synthetic `buildCumulativeSeries()` (30 sin-wave
 * points ending at a $2M ceiling) with real data from `useAmmTotalVolume()`,
 * which proxies `ammdata.get_total_volume_amm` via `/api/amm-volume`.
 * The route buckets by day and forward-fills, with a 2025-08-01 floor so
 * the chart always covers from the launch month onward (per user request:
 * "at minimum one value for each day since the beginning of August 2025
 * through today"). Reference implementation cherry-picked from commit
 * `58d09106` ("home page chart data, pool value consistency across app").
 */

import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAmmTotalVolume } from '@/hooks/useAmmTotalVolume';

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function CumulativeAmmVolume() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const { data, isLoading, isError } = useAmmTotalVolume();

  const series = useMemo(
    () => data?.points?.map((p) => ({ time: p.time, value: p.valueUsd })) ?? [],
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
