'use client';

import type { PoolSummary } from "../types";
import { useTranslation } from '@/hooks/useTranslation';
import { useQuery } from '@tanstack/react-query';

type Props = {
  pool?: PoolSummary;
};

const ALKANODE_RPC_URL = 'https://api.alkanode.com/rpc';

/**
 * Resolve the pizza.fun series ID (symbol) for a given alkane ID.
 * Calls pizzafun.get_series_id_from_alkane_id on the Espo RPC at api.alkanode.com.
 * The SDK's espoGetSeriesIdFromAlkaneId routes through data_api_url (subfrost.io)
 * which doesn't support the pizzafun namespace — must call alkanode directly.
 */
function usePizzaFunSymbol(alkaneId?: string) {
  return useQuery({
    queryKey: ['pizzafun-series-id', alkaneId],
    queryFn: async (): Promise<string | null> => {
      if (!alkaneId) return null;
      try {
        const res = await fetch(ALKANODE_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'pizzafun.get_series_id_from_alkane_id',
            params: { alkane_id: alkaneId },
            id: 1,
          }),
        });
        const data = await res.json();
        const seriesId = data?.result?.series_id;
        if (typeof seriesId === 'string' && seriesId) return seriesId;
        console.warn('[PoolDetailsCard] No series_id in response for', alkaneId, data);
        return null;
      } catch (err) {
        console.warn('[PoolDetailsCard] Failed to fetch series ID for', alkaneId, err);
        return null;
      }
    },
    enabled: !!alkaneId,
    gcTime: 30 * 60_000, // Cache for 30 min — series IDs don't change
    staleTime: 30 * 60_000,
    retry: 2,
  });
}

function buildIframeUrl(symbol: string): string {
  const params = new URLSearchParams({
    symbol,
    timeframe: '1d',
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

  // Get the series ID for the base token (token0) of the pool
  const { data: symbol, isLoading: isSymbolLoading } = usePizzaFunSymbol(pool?.token0?.id);

  const iframeUrl = symbol ? buildIframeUrl(symbol) : null;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)] overflow-hidden">
      {pool ? (
        <div className="relative" style={{ height: 680 }}>
          {isSymbolLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--sf-primary)] border-t-transparent" />
            </div>
          )}
          {iframeUrl ? (
            <iframe
              key={symbol}
              src={iframeUrl}
              className="w-full h-full border-0"
              style={{ height: 680 }}
              allow="clipboard-write"
              loading="lazy"
              title={`${pool.token0.symbol} price chart`}
            />
          ) : !isSymbolLoading ? (
            <div className="flex items-center justify-center h-full bg-[color:var(--sf-primary)]/5">
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
