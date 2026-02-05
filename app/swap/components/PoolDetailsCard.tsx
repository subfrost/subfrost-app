'use client';

import { useEffect, useState } from 'react';
import type { PoolSummary } from "../types";
import CandleChart from "./CandleChart";
import { useTranslation } from '@/hooks/useTranslation';
import { usePoolEspoCandles, type CandleTimeframe } from '@/hooks/usePoolEspoCandles';

type Props = {
  pool?: PoolSummary;
};

const TIMEFRAME_OPTIONS: { value: CandleTimeframe; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

// Number of bars to show initially for each timeframe (user can scroll/zoom to see more)
const INITIAL_VISIBLE_BARS: Record<CandleTimeframe, number> = {
  '1h': 720,   // Show last 720 hours (30 days)
  '4h': 360,   // Show last 360 4H segments (60 days)
  '1d': 90,    // Show last 90 days
  '1w': 18,    // Show last 18 weeks
};

export default function PoolDetailsCard({ pool }: Props) {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState<CandleTimeframe>('1d');
  const [isTimeframeLoading, setIsTimeframeLoading] = useState(false);

  const {
    data: candles = [],
    isLoading,
    isFetching,
  } = usePoolEspoCandles({
    poolId: pool?.id,
    timeframe,
    enabled: !!pool,
  });

  const isInitialLoading = isLoading && candles.length === 0;

  useEffect(() => {
    if (isTimeframeLoading && !isFetching) {
      setIsTimeframeLoading(false);
    }
  }, [isTimeframeLoading, isFetching]);

  const pairLabel = pool
    ? `${pool.token0.symbol}/${pool.token1.symbol}`
    : undefined;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      {pool ? (
        <>
          {/* Timeframe selector */}
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs font-semibold text-[color:var(--sf-text)]/60 uppercase tracking-wider">
              {t('pool.priceChart')}
            </div>
            <div className="flex gap-1">
              {TIMEFRAME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (timeframe === opt.value) return;
                    setIsTimeframeLoading(true);
                    setTimeframe(opt.value);
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    timeframe === opt.value
                      ? 'bg-[color:var(--sf-primary)] text-white'
                      : 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-text)]/60 hover:bg-[color:var(--sf-primary)]/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Candle Chart */}
          <CandleChart
            data={candles}
            height={300}
            loading={isInitialLoading}
            overlayLoading={isTimeframeLoading}
            pairLabel={pairLabel}
            onLoadMore={undefined}
            canLoadMore={false}
            resetKey={`${pool?.id ?? 'no-pool'}-${timeframe}`}
            initialVisibleBars={INITIAL_VISIBLE_BARS[timeframe]}
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--sf-text)]/20 mb-3">
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          <p className="text-sm text-[color:var(--sf-text)]/50">
            {t('pool.selectMarket')}
          </p>
        </div>
      )}
    </div>
  );
}
