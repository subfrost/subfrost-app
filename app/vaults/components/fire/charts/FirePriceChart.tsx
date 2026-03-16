'use client';

import { useEffect, useRef } from 'react';
import type { PricePoint } from '@/hooks/fire/useFireMockData';

interface FirePriceChartProps {
  data: PricePoint[];
  height?: number;
}

export default function FirePriceChart({ data, height = 260 }: FirePriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    let cancelled = false;

    const initChart = async () => {
      const { createChart, LineSeries } = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        height,
        layout: {
          background: { color: 'transparent' },
          textColor: 'rgba(255,255,255,0.4)',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.04)' },
          horzLines: { color: 'rgba(255,255,255,0.04)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.06)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.06)',
        },
        crosshair: {
          horzLine: { color: 'rgba(249,115,22,0.2)' },
          vertLine: { color: 'rgba(249,115,22,0.2)' },
        },
      });

      const series = chart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 8,
          minMove: 0.00000001,
        },
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
  }, [data, height]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} className="w-full" />;
}
