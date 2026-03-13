'use client';

import { useEffect, useRef, useMemo } from 'react';
import { generateEmissionChartData, FIRE_EMISSION_POOL, formatCompact } from '@/utils/fireCalculations';

interface EmissionScheduleChartProps {
  numYears?: number;
  height?: number;
}

export default function EmissionScheduleChart({
  numYears = 10,
  height = 250,
}: EmissionScheduleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const chartData = useMemo(() => {
    const raw = generateEmissionChartData(numYears);
    const baseDate = new Date();
    return raw.map((d) => {
      const date = new Date(baseDate);
      date.setMonth(date.getMonth() + d.month);
      return {
        time: date.toISOString().split('T')[0],
        value: d.emitted,
      };
    });
  }, [numYears]);

  useEffect(() => {
    if (!containerRef.current || chartData.length === 0) return;

    let chart: any = null;

    const initChart = async () => {
      const { createChart, AreaSeries } = await import('lightweight-charts');
      if (!containerRef.current) return;

      chart = createChart(containerRef.current, {
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
      });

      const series = chart.addSeries(AreaSeries, {
        lineColor: '#f97316',
        topColor: 'rgba(249,115,22,0.25)',
        bottomColor: 'rgba(249,115,22,0.01)',
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `${(price / 1000).toFixed(0)}K`,
        },
      });

      series.setData(chartData);
      chart.timeScale().fitContent();
      chartRef.current = chart;
    };

    initChart();

    return () => {
      if (chart) {
        chart.remove();
        chart = null;
      }
    };
  }, [chartData, height]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
          Emission Schedule
        </span>
        <span className="text-[10px] text-[color:var(--sf-muted)]">
          Pool: {formatCompact(FIRE_EMISSION_POOL)} FIRE
        </span>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
