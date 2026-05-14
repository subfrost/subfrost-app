'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import {
  fetchPoolDataPoints,
  buildCandlesFromDataPoints,
  getCurrentHeight,
  type CandleData,
} from '@/lib/pools/candle-fetcher';
import { getPools, type PoolConfig } from '@/lib/alkanes-client';

export type CandleTimeframe = '1h' | '4h' | '1d' | '1w';

interface UsePoolCandlesOptions {
  poolId?: string;
  poolKey?: string;
  timeframe?: CandleTimeframe;
  enabled?: boolean;
}

// Blocks per timeframe (Bitcoin ~10 min blocks)
const BLOCKS_PER_TIMEFRAME: Record<CandleTimeframe, number> = {
  '1h': 6,     // 6 blocks per hour
  '4h': 24,    // 24 blocks per 4 hours
  '1d': 144,   // 144 blocks per day
  '1w': 1008,  // 1008 blocks per week
};

// How many candles to fetch
const CANDLES_TO_FETCH = 100;

// Sampling interval - fetch data points more frequently than candle size
const SAMPLE_DIVISOR = 4;

/**
 * Map pool ID to pool key
 */
function getPoolKeyFromId(poolId: string, network?: string): string | null {
  const pools = getPools(network);
  for (const [key, config] of Object.entries(pools)) {
    if (config.id === poolId) {
      return key;
    }
  }
  return null;
}

/**
 * Hook to fetch candlestick data for a pool
 */
export function usePoolCandles({
  poolId,
  poolKey,
  timeframe = '1d',
  enabled = true,
}: UsePoolCandlesOptions) {
  const { network } = useWallet();

  // Resolve pool key from ID if needed
  const resolvedPoolKey = poolKey || (poolId ? getPoolKeyFromId(poolId, network) : null);

  return useQuery({
    queryKey: ['pool-candles', resolvedPoolKey, timeframe, network],
    queryFn: async (): Promise<CandleData[]> => {
      if (!resolvedPoolKey) {
        return [];
      }

      const pools = getPools(network);
      const poolConfig = pools[resolvedPoolKey];

      if (!poolConfig) {
        console.warn(`[usePoolCandles] Pool not found: ${resolvedPoolKey}`);
        return [];
      }

      // Get current block height
      const currentHeight = await getCurrentHeight(network);

      // Calculate block range
      const candleBlocks = BLOCKS_PER_TIMEFRAME[timeframe];
      const totalBlocks = candleBlocks * CANDLES_TO_FETCH;
      const startHeight = Math.max(0, currentHeight - totalBlocks);

      // Sample interval for data points
      const sampleInterval = Math.max(1, Math.floor(candleBlocks / SAMPLE_DIVISOR));

      // Fetch historical data points
      const dataPoints = await fetchPoolDataPoints(
        resolvedPoolKey,
        startHeight,
        currentHeight,
        sampleInterval,
        network
      );

      if (dataPoints.length === 0) {
        console.warn(`[usePoolCandles] No data points returned for ${resolvedPoolKey}`);
        return [];
      }

      // Build candles from data points
      const candles = buildCandlesFromDataPoints(dataPoints, poolConfig, candleBlocks);

      return candles;
    },
    enabled: enabled && !!resolvedPoolKey,
    gcTime: 5 * 60_000,
    retry: 2,
  });
}

/**
 * Get pool configuration by ID or key
 */
export function usePoolConfig(poolIdOrKey?: string) {
  const { network } = useWallet();

  if (!poolIdOrKey) return null;

  const pools = getPools(network);

  // Try direct key lookup first
  if (pools[poolIdOrKey]) {
    return pools[poolIdOrKey];
  }

  // Try ID lookup
  for (const config of Object.values(pools)) {
    if (config.id === poolIdOrKey) {
      return config;
    }
  }

  return null;
}

/**
 * Hook to fetch BTC/USDT candlestick data from external API (Binance)
 */
export function useBtcUsdtCandles({
  timeframe = '1d',
  enabled = true,
}: {
  timeframe?: CandleTimeframe;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['btc-usdt-candles', timeframe],
    queryFn: async (): Promise<CandleData[]> => {
      const response = await fetch(`/api/btc-candles?interval=${timeframe}&limit=100`);

      if (!response.ok) {
        throw new Error('Failed to fetch BTC/USDT candles');
      }

      const data = await response.json();

      if (data.error || !data.candles) {
        return [];
      }

      return data.candles;
    },
    enabled,
    gcTime: 5 * 60_000,
    retry: 2,
  });
}

export type { CandleData };
