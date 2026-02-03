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

// Set to true to use mock data for demo purposes
const USE_MOCK_DATA = true;

interface UsePoolCandlesOptions {
  poolId?: string;
  poolKey?: string;
  timeframe?: CandleTimeframe;
  enabled?: boolean;
}

// Timeframe durations in milliseconds
const TIMEFRAME_MS: Record<CandleTimeframe, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

/**
 * Get appropriate decimal precision based on price magnitude
 */
function getPrecision(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 8;
}

/**
 * Generate realistic mock candlestick data
 */
function generateMockCandles(
  basePrice: number,
  volatility: number,
  timeframe: CandleTimeframe,
  count: number = 100
): CandleData[] {
  const candles: CandleData[] = [];
  const now = Date.now();
  const interval = TIMEFRAME_MS[timeframe];
  const precision = getPrecision(basePrice);

  let price = basePrice;

  // Create a trend pattern (slight upward bias with cycles)
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - (i * interval);

    // Add some trend and mean reversion
    const trendBias = Math.sin(i / 20) * volatility * 0.3;
    const randomWalk = (Math.random() - 0.48) * volatility; // Slight upward bias

    const change = price * (trendBias + randomWalk);
    const open = price;
    price = price + change;
    const close = price;

    // Generate high/low with realistic wicks
    const range = Math.abs(close - open);
    const wickSize = range * (0.5 + Math.random() * 1.5);

    const high = Math.max(open, close) + wickSize * Math.random();
    const low = Math.min(open, close) - wickSize * Math.random();

    candles.push({
      timestamp,
      open: Number(open.toFixed(precision)),
      high: Number(high.toFixed(precision)),
      low: Number(low.toFixed(precision)),
      close: Number(close.toFixed(precision)),
      volume: Math.floor(1000000 + Math.random() * 5000000),
    });
  }

  return candles;
}

/**
 * Get mock data config for different pairs
 */
function getMockConfig(pairKey?: string): { basePrice: number; volatility: number } {
  const configs: Record<string, { basePrice: number; volatility: number }> = {
    'BTC_USDT': { basePrice: 97500, volatility: 0.02 },
    'DIESEL_FRBTC': { basePrice: 0.00045, volatility: 0.05 },
    'DIESEL_BUSD': { basePrice: 42.50, volatility: 0.04 },
    'BUSD_FRBTC': { basePrice: 97000, volatility: 0.015 },
    'GOLDDUST_FRBTC': { basePrice: 0.0012, volatility: 0.08 },
  };

  return configs[pairKey || 'BTC_USDT'] || { basePrice: 100, volatility: 0.03 };
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
    queryKey: ['pool-candles', resolvedPoolKey, timeframe, network, USE_MOCK_DATA],
    queryFn: async (): Promise<CandleData[]> => {
      if (!resolvedPoolKey) {
        return [];
      }

      // Use mock data for demo
      if (USE_MOCK_DATA) {
        const { basePrice, volatility } = getMockConfig(resolvedPoolKey);
        return generateMockCandles(basePrice, volatility, timeframe);
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
    queryKey: ['btc-usdt-candles', timeframe, USE_MOCK_DATA],
    queryFn: async (): Promise<CandleData[]> => {
      // Use mock data for demo
      if (USE_MOCK_DATA) {
        const { basePrice, volatility } = getMockConfig('BTC_USDT');
        return generateMockCandles(basePrice, volatility, timeframe);
      }

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
