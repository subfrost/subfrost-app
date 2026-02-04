'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { fetchCandles, NETWORK_ESPO_URLS, type CandleData } from '@/hooks/usePoolCandleVolumes';
import type { CandleDataPoint } from '@/app/swap/components/CandleChart';

export type CandleTimeframe = '1h' | '4h' | '1d' | '1w';

// Map UI timeframes to Espo API timeframes
const ESPO_TIMEFRAME_MAP: Record<CandleTimeframe, 'd1' | 'h1' | '10m' | 'w1' | 'M1'> = {
  '1h': 'h1',
  '4h': 'h1', // Fetch h1 and aggregate client-side
  '1d': 'd1',
  '1w': 'w1',
};

// Number of candles to fetch in a single request
// Using 500 to ensure users have enough data when scrolling the chart
const CANDLE_LIMIT = 500;

/**
 * Convert Espo CandleData to CandleDataPoint.
 * CandleChart expects `timestamp` in milliseconds (it divides by 1000 internally).
 * Auto-detect whether Espo returns seconds or milliseconds based on magnitude.
 */
function toCandleDataPoint(candle: CandleData): CandleDataPoint {
  const timestampMs = candle.ts < 1e12 ? candle.ts * 1000 : candle.ts;
  return {
    timestamp: timestampMs,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

/**
 * Aggregate h1 candles into 4h candles.
 * Groups every 4 consecutive hourly candles by flooring timestamps to 4-hour boundaries.
 */
function aggregateTo4h(h1Candles: CandleDataPoint[]): CandleDataPoint[] {
  if (h1Candles.length === 0) return [];

  const sorted = [...h1Candles].sort((a, b) => a.timestamp - b.timestamp);

  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const groups = new Map<number, CandleDataPoint[]>();

  for (const candle of sorted) {
    const bucket = Math.floor(candle.timestamp / FOUR_HOURS_MS) * FOUR_HOURS_MS;
    const group = groups.get(bucket);
    if (group) {
      group.push(candle);
    } else {
      groups.set(bucket, [candle]);
    }
  }

  const result: CandleDataPoint[] = [];
  for (const [bucket, candles] of groups) {
    result.push({
      timestamp: bucket,
      open: candles[0].open,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      close: candles[candles.length - 1].close,
      volume: candles.reduce((sum, c) => sum + (c.volume || 0), 0),
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch candles from Espo API in a single request.
 * Uses CANDLE_LIMIT (500) to ensure enough data for chart scrolling.
 */
async function fetchCandlesSimple(
  espoUrl: string,
  poolId: string,
  espoTimeframe: 'd1' | 'h1' | '10m' | 'w1' | 'M1',
  side: 'base' | 'quote'
): Promise<CandleData[]> {
  const response = await fetchCandles(espoUrl, poolId, espoTimeframe, side, CANDLE_LIMIT, 1);

  if (!response?.candles || response.candles.length === 0) {
    return [];
  }

  return response.candles;
}

interface UsePoolEspoCandlesOptions {
  poolId?: string;
  timeframe?: CandleTimeframe;
  enabled?: boolean;
}

/**
 * Hook to fetch candlestick data for a pool from the Espo API (ammdata.get_candles).
 * Fetches up to 500 candles to ensure enough data for chart scrolling.
 * For 4h timeframe, fetches h1 candles and aggregates them client-side.
 */
export function usePoolEspoCandles({
  poolId,
  timeframe = '1d',
  enabled = true,
}: UsePoolEspoCandlesOptions) {
  const { network } = useWallet();
  const espoUrl = NETWORK_ESPO_URLS[network] || NETWORK_ESPO_URLS.mainnet;

  return useQuery({
    queryKey: ['pool-espo-candles', poolId, timeframe, network],
    queryFn: async (): Promise<CandleDataPoint[]> => {
      if (!poolId) return [];

      const espoTimeframe = ESPO_TIMEFRAME_MAP[timeframe];

      const rawCandles = await fetchCandlesSimple(espoUrl, poolId, espoTimeframe, 'base');

      if (rawCandles.length === 0) {
        return [];
      }

      // Filter out zero-volume candles — the Espo API generates synthetic
      // carry-forward entries for periods with no trades (same OHLC, volume 0).
      // These create long flat lines that misrepresent actual trading activity.
      const tradedCandles = rawCandles.filter(c => c.volume > 0);

      let points = (tradedCandles.length > 0 ? tradedCandles : rawCandles).map(toCandleDataPoint);

      if (timeframe === '4h') {
        points = aggregateTo4h(points);
      }

      return points.sort((a, b) => a.timestamp - b.timestamp);
    },
    enabled: enabled && !!poolId,
    gcTime: 5 * 60_000,
    retry: 2,
    // Keep previous timeframe's data visible while new timeframe loads
    placeholderData: (prev) => prev,
  });
}
