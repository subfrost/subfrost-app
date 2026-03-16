'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface ApyTradingChartProps {
  data: number[]; // Array of APY values (30 days)
  currentApy: number;
  boostActive?: boolean;
}

function buildTimeSeriesData(raw: number[]): { time: string; value: number }[] {
  const points: { time: string; value: number }[] = [];
  const now = new Date();

  for (let i = 0; i < raw.length; i++) {
    const dayOffset = raw.length - 1 - i;
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().slice(0, 10);
    points.push({ time: dateStr, value: raw[i] });
  }

  return points;
}

export default function ApyTradingChart({ data, currentApy, boostActive = false }: ApyTradingChartProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [shimmerPath, setShimmerPath] = useState<string>('');
  const [shimmerSize, setShimmerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const chartData = boostActive ? data.map(v => v * 1.5) : data;
  const timeSeriesData = buildTimeSeriesData(chartData);

  const lineColor = boostActive ? '#a855f7' : '#22c55e';
  const crosshairColor = boostActive ? 'rgba(168, 85, 247, 0.2)' : 'rgba(34, 197, 94, 0.2)';

  const isDark = theme === 'dark';
  const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.10)';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';

  /**
   * Read pixel coordinates from the lightweight-charts coordinate APIs
   * and build an SVG path string that traces the visible line.
   */
  const updateShimmerPath = () => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!chart || !series || !el) return;

    const timeScale = chart.timeScale();
    const coords: { x: number; y: number }[] = [];

    for (const pt of timeSeriesData) {
      const x = timeScale.timeToCoordinate(pt.time);
      const y = series.priceToCoordinate(pt.value);
      if (x !== null && y !== null) {
        coords.push({ x, y });
      }
    }

    if (coords.length < 2) {
      setShimmerPath('');
      return;
    }

    const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x},${c.y}`).join(' ');
    setShimmerPath(d);
    setShimmerSize({ w: el.clientWidth, h: el.clientHeight });
  };

  // Create chart once
  useEffect(() => {
    if (!containerRef.current || timeSeriesData.length === 0) return;

    let cancelled = false;

    const initChart = async () => {
      const { createChart, LineSeries } = await import('lightweight-charts');
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

      const series = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${price.toFixed(1)}%`,
        },
        lastValueVisible: true,
        priceLineVisible: false,
      });

      series.setData(timeSeriesData);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      seriesRef.current = series;

      // Wait one frame for layout to settle, then compute shimmer path
      requestAnimationFrame(() => {
        if (!cancelled) updateShimmerPath();
      });
    };

    initChart();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
    // Recreate chart when theme changes so grid/text colors update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textColor, gridColor, borderColor]);

  // Update colors, data & shimmer path when boostActive or data changes
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    seriesRef.current.applyOptions({ color: lineColor });
    seriesRef.current.setData(timeSeriesData);

    chartRef.current.applyOptions({
      crosshair: {
        horzLine: { color: crosshairColor },
        vertLine: { color: crosshairColor },
      },
    });

    chartRef.current.timeScale().fitContent();

    // Recompute shimmer coordinates after data update
    requestAnimationFrame(() => updateShimmerPath());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boostActive, lineColor, crosshairColor, JSON.stringify(timeSeriesData)]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 220,
        });
        requestAnimationFrame(() => updateShimmerPath());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* SVG shimmer overlay — traces only the chart line */}
      {boostActive && shimmerPath && shimmerSize.w > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={shimmerSize.w}
          height={shimmerSize.h}
          viewBox={`0 0 ${shimmerSize.w} ${shimmerSize.h}`}
        >
          <defs>
            <linearGradient id="apy-boost-shimmer" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0">
                <animate attributeName="offset" values="-0.3;1" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="15%" stopColor="white" stopOpacity="0.7">
                <animate attributeName="offset" values="-0.15;1.15" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="30%" stopColor="white" stopOpacity="0">
                <animate attributeName="offset" values="0;1.3" dur="2s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          <path
            d={shimmerPath}
            fill="none"
            stroke="url(#apy-boost-shimmer)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
