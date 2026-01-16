'use client';

import { useState, useMemo } from 'react';
import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";
import CandleChart from "./CandleChart";

type Props = {
  pool?: PoolSummary;
};

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

export default function PoolDetailsCard({ pool }: Props) {
  const { network } = useWallet();
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

      {/* Show pool details if selected, otherwise hint */}
      {pool ? (
        <>
          {/* Token pair and stats row */}
          <div className="mt-5 flex items-center gap-3 mb-4">
            <div className="flex -space-x-2">
              <TokenIcon key={pool.token0.id} symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="lg" network={network} />
              <TokenIcon key={pool.token1.id} symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="lg" network={network} />
            </div>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">{pool.pairLabel}</span>
            <div className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">
              {formatPercent(pool.apr)} APY
            </div>
          </div>

          {/* Stats columns: TVL | 24h Volume | 30d Volume */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">TVL</div>
              <div className="text-lg font-bold text-[color:var(--sf-primary)]">
                {formatUsd(pool.tvlUsd)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">24h Volume</div>
              <div className="text-lg font-bold text-[color:var(--sf-text)]">
                {formatUsd(pool.vol24hUsd)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">30d Volume</div>
              <div className="text-lg font-bold text-[color:var(--sf-text)]">
                {formatUsd(pool.vol30dUsd)}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-center text-xs text-[color:var(--sf-text)]/50">
          Select a market below to view pool details
        </p>
      )}
    </div>
  );
}

function formatUsd(v?: number) {
  if (v == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatPercent(v?: number) {
  if (v == null) return "-";
  return `${v.toFixed(1)}%`;
}
