'use client';

import { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  ColorType,
  CandlestickData,
  Time,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
} from 'lightweight-charts';
import { useTheme } from '@/context/ThemeContext';

export interface CandleDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type Props = {
  data: CandleDataPoint[];
  height?: number;
  loading?: boolean;
  pairLabel?: string;
};

export default function CandleChart({ data, height = 300, loading = false, pairLabel }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const { theme } = useTheme();

  // Theme-aware colors matching CSS variables
  // Dark: --sf-primary: #5b9cff, --sf-text: #e8f0ff
  // Light: --sf-primary: #284372, --sf-text: #284372
  const isDark = theme === 'dark';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(40, 67, 114, 0.6)';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(40, 67, 114, 0.1)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(40, 67, 114, 0.15)';
  const crosshairColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(40, 67, 114, 0.2)';

  // Convert data to lightweight-charts format
  // When candle OHLC values are all identical (flat/no trading), add a small spread
  // so the candles and price axis remain visible.
  const chartData: CandlestickData<Time>[] = useMemo(() => {
    if (!data || data.length === 0) return [];

    const filtered = data.filter(
      d => d.timestamp && d.open != null && d.high != null && d.low != null && d.close != null
    );
    if (filtered.length === 0) return [];

    // Detect if all candles are flat (identical OHLC)
    const allFlat = filtered.every(d => d.open === d.high && d.high === d.low && d.low === d.close);

    return filtered
      .map(d => {
        let { open, high, low, close } = d;
        if (allFlat && open !== 0) {
          // Add 0.1% spread so candles are visible on the price scale
          const spread = open * 0.001;
          high = open + spread;
          low = open - spread;
        }
        return {
          time: Math.floor(d.timestamp / 1000) as Time,
          open,
          high,
          low,
          close,
        };
      })
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      crosshair: {
        vertLine: {
          color: crosshairColor,
          width: 1,
          style: 2,
        },
        horzLine: {
          color: crosshairColor,
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    // Add candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, textColor, gridColor, borderColor, crosshairColor]);

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && chartData.length > 0) {
      seriesRef.current.setData(chartData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [chartData]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-[color:var(--sf-primary)]/5"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--sf-primary)] border-t-transparent" />
          <span className="text-xs text-[color:var(--sf-text)]/50">Loading chart data...</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-[color:var(--sf-primary)]/5"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <svg className="h-10 w-10 text-[color:var(--sf-text)]/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span className="text-xs text-[color:var(--sf-text)]/40">
            {pairLabel ? `No chart data for ${pairLabel}` : 'No chart data available'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      {pairLabel && (
        <div className="absolute left-3 top-3 z-10 rounded-md bg-[color:var(--sf-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--sf-text)]/60">
          {pairLabel}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full rounded-xl" style={{ height }} />
    </div>
  );
}
