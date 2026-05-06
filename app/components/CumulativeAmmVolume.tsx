'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';

const FINAL_VALUE = 2_000_000;
const POINTS = 30;

function buildCumulativeSeries(): { time: string; value: number }[] {
  // Monotonically increasing daily increments that sum to FINAL_VALUE.
  // Use a deterministic pseudo-random sequence so the chart is stable across renders.
  const increments: number[] = [];
  let total = 0;
  for (let i = 0; i < POINTS; i++) {
    // Bias growth slightly higher in the middle for a natural-looking curve.
    const t = i / (POINTS - 1);
    const base = 0.6 + Math.sin(t * Math.PI) * 0.8;
    const jitter = 0.5 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const inc = base * jitter;
    increments.push(inc);
    total += inc;
  }
  const scale = FINAL_VALUE / total;

  const points: { time: string; value: number }[] = [];
  const now = new Date();
  let cumulative = 0;
  for (let i = 0; i < POINTS; i++) {
    cumulative += increments[i] * scale;
    const date = new Date(now);
    date.setDate(date.getDate() - (POINTS - 1 - i));
    points.push({
      time: date.toISOString().slice(0, 10),
      value: i === POINTS - 1 ? FINAL_VALUE : cumulative,
    });
  }
  return points;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function CumulativeAmmVolume() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const data = useMemo(() => buildCumulativeSeries(), []);

  const isDark = theme === 'dark';
  const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
  const lineColor = '#22c55e';
  const crosshairColor = 'rgba(34, 197, 94, 0.2)';

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

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

      const series = chart.addSeries(AreaSeries, {
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

      series.setData(data);
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
  }, [data, textColor, gridColor, borderColor, lineColor, crosshairColor]);

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

  return (
    <div className="sf-card h-full flex flex-col">
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">Total AMM Volume (Placeholder)</h3>
      </div>
      <div className="p-4 flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
