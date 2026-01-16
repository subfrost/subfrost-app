'use client';

import { useState, useMemo } from 'react';
import CandleChart from "./CandleChart";

type CandleTimeframe = '1h' | '4h' | '1d' | '1w';

const TIMEFRAME_OPTIONS: { value: CandleTimeframe; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const TIMEFRAME_MS: Record<CandleTimeframe, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

// Fixed current price - this should be the same regardless of timeframe
const CURRENT_PRICE = 97500;

// Generate mock BTC/USDT candle data working backwards from current price
function generateMockCandles(timeframe: CandleTimeframe) {
  const candles = [];
  const now = Date.now();
  const interval = TIMEFRAME_MS[timeframe];

  // Use a seeded random based on timeframe to get consistent results
  // but different patterns for each timeframe
  const seed = timeframe === '1h' ? 1 : timeframe === '4h' ? 2 : timeframe === '1d' ? 3 : 4;
  const seededRandom = (i: number) => {
    const x = Math.sin(seed * 1000 + i * 9999) * 10000;
    return x - Math.floor(x);
  };

  // Generate prices backwards from current price
  const prices: number[] = [CURRENT_PRICE];
  for (let i = 1; i < 100; i++) {
    const prevPrice = prices[i - 1];
    // Random movement going backwards (so we subtract to go back in time)
    const change = prevPrice * (seededRandom(i) - 0.48) * 0.02;
    prices.push(prevPrice - change);
  }

  // Reverse so oldest is first
  prices.reverse();

  for (let i = 0; i < 100; i++) {
    const timestamp = now - ((99 - i) * interval);
    const close = prices[i];
    const nextClose = i < 99 ? prices[i + 1] : close;

    // Open is closer to previous close for continuity
    const open = i > 0 ? prices[i - 1] + (close - prices[i - 1]) * 0.1 : close * (1 - (seededRandom(i + 100) - 0.5) * 0.01);

    const high = Math.max(open, close) * (1 + seededRandom(i + 200) * 0.01);
    const low = Math.min(open, close) * (1 - seededRandom(i + 300) * 0.01);

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
    });
  }

  return candles;
}

export default function PoolDetailsCard() {
  const [timeframe, setTimeframe] = useState<CandleTimeframe>('1d');

  // Generate mock data directly
  const mockCandles = useMemo(() => generateMockCandles(timeframe), [timeframe]);

  // Always show chart with BTC/USDT for now
  return (
    <div className="hidden md:block rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      {/* Timeframe selector */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-semibold text-[color:var(--sf-text)]/60 uppercase tracking-wider">
          Price Chart
        </div>
        <div className="flex gap-1">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeframe(opt.value)}
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
        data={mockCandles}
        height={300}
        loading={false}
        pairLabel="BTC/USDT"
      />
    </div>
  );
}
