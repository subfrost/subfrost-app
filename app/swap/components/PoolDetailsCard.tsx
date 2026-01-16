'use client';

import { useState, useMemo } from 'react';
import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";
import CandleChart from "./CandleChart";

type VolumePeriod = '24h' | '30d';

type Props = {
  pool?: PoolSummary;
  volumePeriod?: VolumePeriod;
  onVolumePeriodChange?: (period: VolumePeriod) => void;
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

// Generate mock BTC/USDT candle data
function generateMockCandles(timeframe: CandleTimeframe) {
  const candles = [];
  const now = Date.now();
  const interval = TIMEFRAME_MS[timeframe];
  const basePrice = 97500;
  let price = basePrice;

  for (let i = 99; i >= 0; i--) {
    const timestamp = now - (i * interval);

    // Random price movement
    const change = price * (Math.random() - 0.48) * 0.02;
    const open = price;
    price = price + change;
    const close = price;

    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);

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

export default function PoolDetailsCard({ pool, volumePeriod = '24h', onVolumePeriodChange }: Props) {
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
          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">Total Value Locked</div>
              <div className="text-3xl font-extrabold text-[color:var(--sf-primary)]">
                {formatUsd(pool.tvlUsd)}
              </div>
              <div className="mt-1.5 flex flex-col items-start gap-1.5">
                <div className="inline-flex items-center gap-2">
                  <TokenIcon key={pool.token0.id} symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="sm" network={network} />
                  <span className="text-[color:var(--sf-text)]">/</span>
                  <TokenIcon key={pool.token1.id} symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="sm" network={network} />
                </div>
                <span className="text-sm font-bold text-[color:var(--sf-text)]">{pool.pairLabel}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md">
              <div className="mb-2">
                <span className="text-xs font-semibold text-[color:var(--sf-text)]/60">
                  Volume ({volumePeriod === '24h' ? '24H' : '30D'})
                </span>
              </div>
              <div className="text-lg font-bold text-[color:var(--sf-text)]">
                {volumePeriod === '24h' ? formatUsd(pool.vol24hUsd) : formatUsd(pool.vol30dUsd)}
              </div>
              <div className="mt-3 text-xs font-semibold text-[color:var(--sf-text)]/60">APY</div>
              <div className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">
                {formatPercent(pool.apr)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Pool Balance Distribution</div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[color:var(--sf-outline)]/20 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-[color:var(--sf-primary)] to-blue-500 transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                style={{ width: `${getToken0Percentage(pool)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--sf-primary)]" />
                <span className="font-semibold text-[color:var(--sf-text)]">{pool.token0.symbol} {formatPercent(getToken0Percentage(pool))}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[color:var(--sf-text)]">{pool.token1.symbol} {formatPercent(getToken1Percentage(pool))}</span>
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
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

function getToken0Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token0TvlUsd / total) * 100;
}

function getToken1Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token1TvlUsd / total) * 100;
}
