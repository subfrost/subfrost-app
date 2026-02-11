'use client';

import { useState } from 'react';
import type { PoolSummary } from "../types";
import { useTranslation } from '@/hooks/useTranslation';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useQuery } from '@tanstack/react-query';

type Props = {
  pool?: PoolSummary;
};

type ChartTimeframe = '1h' | '4h' | '1d' | '1w';

const TIMEFRAME_OPTIONS: { value: ChartTimeframe; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

/**
 * Resolve the pizza.fun series ID (symbol) for a given alkane ID.
 * Calls pizzafun.get_series_id_from_alkane_id via the SDK's Espo wrapper.
 */
function usePizzaFunSymbol(alkaneId?: string) {
  const { provider } = useAlkanesSDK();

  return useQuery({
    queryKey: ['pizzafun-series-id', alkaneId],
    queryFn: async (): Promise<string | null> => {
      if (!provider || !alkaneId) return null;
      try {
        const result = await provider.espoGetSeriesIdFromAlkaneId(alkaneId);
        // The SDK returns the series ID string (e.g. "DIESEL")
        if (typeof result === 'string') return result;
        // Handle object responses (e.g. { series_id: "DIESEL" })
        if (result?.series_id) return result.series_id;
        if (result?.seriesId) return result.seriesId;
        console.warn('[PoolDetailsCard] Unexpected series ID response:', result);
        return null;
      } catch (err) {
        console.warn('[PoolDetailsCard] Failed to fetch series ID for', alkaneId, err);
        return null;
      }
    },
    enabled: !!provider && !!alkaneId,
    gcTime: 30 * 60_000, // Cache for 30 min — series IDs don't change
    staleTime: 30 * 60_000,
    retry: 2,
  });
}

function buildIframeUrl(symbol: string, timeframe: ChartTimeframe): string {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    type: 'mcap',
    pool: 'all',
    quote: 'usd',
    metaprotocol: 'alkanes',
    theme: 'subfrost',
  });
  return `https://tv.pizza.fun/?${params.toString()}`;
}

export default function PoolDetailsCard({ pool }: Props) {
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1d');

  // Get the series ID for the base token (token0) of the pool
  const { data: symbol, isLoading: isSymbolLoading } = usePizzaFunSymbol(pool?.token0?.id);

  const iframeUrl = symbol ? buildIframeUrl(symbol, timeframe) : null;

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

          {/* Chart iframe */}
          <div className="relative rounded-xl overflow-hidden" style={{ height: 300 }}>
            {isSymbolLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 rounded-xl">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--sf-primary)] border-t-transparent" />
              </div>
            )}
            {iframeUrl ? (
              <iframe
                key={`${symbol}-${timeframe}`}
                src={iframeUrl}
                className="w-full h-full border-0 rounded-xl"
                style={{ height: 300 }}
                allow="clipboard-write"
                loading="lazy"
                title={`${pool.token0.symbol} price chart`}
              />
            ) : !isSymbolLoading ? (
              <div className="flex items-center justify-center h-full rounded-xl bg-[color:var(--sf-primary)]/5">
                <div className="flex flex-col items-center gap-2 text-center">
                  <svg
                    className="h-10 w-10 text-[color:var(--sf-text)]/20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                  <span className="text-xs text-[color:var(--sf-text)]/40">
                    No chart data for {pool.token0.symbol}/{pool.token1.symbol}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
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
