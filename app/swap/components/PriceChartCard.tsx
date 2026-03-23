'use client';

import { useState } from 'react';
import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";
import CandleChart from "./CandleChart";
import { useBtcUsdtCandles, type CandleTimeframe } from '@/hooks/usePoolCandles';

type Props = {
  pool?: PoolSummary;
};

const TIMEFRAME_OPTIONS: { value: CandleTimeframe; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

export default function PriceChartCard({ pool }: Props) {
  const { network } = useWallet();
  const [timeframe, setTimeframe] = useState<CandleTimeframe>('1d');

  // Fetch real BTC/USDT candle data from Binance API
  const { data: candles, isLoading } = useBtcUsdtCandles({ timeframe });

  return (
    <div className="hidden lg:block rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
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
        data={candles ?? []}
        height={300}
        loading={isLoading}
        pairLabel="BTC/USDT"
        resetKey={timeframe}
      />

      {/* Token Pair Icons and Label */}
      {pool && (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="lg" network={network} />
            <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="lg" network={network} />
          </div>
          <span className="text-sm font-bold text-[color:var(--sf-text)]">{pool.pairLabel.replace(/ LP$/, '')}</span>
        </div>
      )}
    </div>
  );
}
