/**
 * Hook to fetch pool volumes using the SDK's dataApiGetCandles.
 *
 * All candle data routes through @alkanes/ts-sdk which is configured
 * with subfrost endpoints. No external services (alkanode/Espo) are used.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';

// ============================================================================
// Types
// ============================================================================

export interface CandleData {
  ts: number;       // Timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;   // Volume in the base/quote token
}

export interface CandleResponse {
  ok: boolean;
  candles: CandleData[];
  total: number;
  page: number;
  has_more: boolean;
}

export interface PoolCandleVolume {
  poolId: string;
  volume24h: number;        // Raw volume from candles (in token units)
  volume24hUsd: number;     // Volume in USD
  volume30d: number;        // Raw volume from candles
  volume30dUsd: number;     // Volume in USD
  lastUpdated: number;
}

// Known quote tokens with USD values
const USD_STABLE_TOKENS = new Set(['2:56801']); // bUSD
const BTC_TOKENS = new Set(['32:0']); // frBTC

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch candles via the SDK's dataApiGetCandles method.
 */
export async function fetchCandles(
  provider: any,
  poolId: string,
  timeframe: 'd1' | 'M1' | 'h1' | '10m' | 'w1',
  side: 'base' | 'quote' = 'quote',
  limit: number = 50,
  page: number = 1
): Promise<CandleResponse | null> {
  try {
    const result = await provider.dataApiGetCandles(poolId, timeframe, side, page, BigInt(limit));

    // Handle various response formats
    if (result?.ok !== undefined) {
      return result as CandleResponse;
    }
    if (result?.result?.ok) {
      return result.result as CandleResponse;
    }

    console.warn(`[usePoolCandleVolumes] No candle data for pool ${poolId}:`, result);
    return null;
  } catch (error) {
    console.error(`[usePoolCandleVolumes] Error fetching candles for ${poolId}:`, error);
    return null;
  }
}

/**
 * Calculate total volume from candles array
 */
function sumCandleVolume(candles: CandleData[]): number {
  return candles.reduce((sum, candle) => sum + (candle.volume || 0), 0);
}

/**
 * Fetch volume data for a single pool using candles
 *
 * Note: The API returns volume already in the quote token's decimal format.
 * For bUSD pools, this is already in USD ($1 per bUSD).
 * For frBTC pools, we multiply by BTC price to get USD.
 */
async function fetchPoolVolume(
  provider: any,
  poolId: string,
  token1Id: string,
  btcPrice: number | undefined
): Promise<PoolCandleVolume | null> {
  try {
    // Fetch 30d volume (30 daily candles) - this includes the 24h data as the first candle
    const candles30d = await fetchCandles(provider, poolId, 'd1', 'quote', 30);

    if (!candles30d || !candles30d.candles || candles30d.candles.length === 0) {
      return null;
    }

    // Get 24h volume from the most recent candle
    const volume24h = candles30d.candles[0]?.volume || 0;

    // Sum all candle volumes for 30d
    const volume30d = sumCandleVolume(candles30d.candles);

    // Convert to USD based on quote token type
    let volume24hUsd = 0;
    let volume30dUsd = 0;

    if (USD_STABLE_TOKENS.has(token1Id)) {
      // Quote token is bUSD ($1 each) - volume is already in USD
      volume24hUsd = volume24h;
      volume30dUsd = volume30d;
    } else if (BTC_TOKENS.has(token1Id) && btcPrice) {
      // Quote token is frBTC - multiply by BTC price
      volume24hUsd = volume24h * btcPrice;
      volume30dUsd = volume30d * btcPrice;
    } else {
      // Unknown quote token, try to use BTC price as fallback
      if (btcPrice) {
        volume24hUsd = volume24h * btcPrice;
        volume30dUsd = volume30d * btcPrice;
      } else {
        // No price available, use raw values
        volume24hUsd = volume24h;
        volume30dUsd = volume30d;
      }
    }

    return {
      poolId,
      volume24h,
      volume24hUsd,
      volume30d,
      volume30dUsd,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error(`[usePoolCandleVolumes] Error processing pool ${poolId}:`, error);
    return null;
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch volume data for a single pool using SDK's dataApiGetCandles
 */
export function usePoolCandleVolume(
  poolId: string | undefined,
  token1Id: string | undefined
): UseQueryResult<PoolCandleVolume | null> {
  const { network } = useWallet();
  const { provider } = useAlkanesSDK();
  const { data: btcPrice } = useBtcPrice();

  return useQuery({
    queryKey: ['pool-candle-volume', poolId, token1Id, network, btcPrice],
    queryFn: async () => {
      if (!poolId || !token1Id || !provider) return null;
      return fetchPoolVolume(provider, poolId, token1Id, btcPrice);
    },
    enabled: !!poolId && !!token1Id && !!network && !!provider,
  });
}

/**
 * Fetch volume data for multiple pools using SDK's dataApiGetCandles
 * Returns a map of poolId -> PoolCandleVolume
 */
export function useAllPoolCandleVolumes(
  pools: Array<{ id: string; token1Id: string }> | undefined
): UseQueryResult<Record<string, PoolCandleVolume>> {
  const { network } = useWallet();
  const { provider } = useAlkanesSDK();
  const { data: btcPrice } = useBtcPrice();

  return useQuery({
    queryKey: ['all-pool-candle-volumes', pools?.map(p => p.id).join(','), network, btcPrice],
    queryFn: async () => {
      if (!pools || pools.length === 0 || !provider) return {};

      const results: Record<string, PoolCandleVolume> = {};

      // Fetch volumes for all pools in parallel
      const volumePromises = pools.map(async (pool) => {
        const volume = await fetchPoolVolume(provider, pool.id, pool.token1Id, btcPrice);
        if (volume) {
          results[pool.id] = volume;
        }
      });

      await Promise.all(volumePromises);

      return results;
    },
    enabled: !!pools && pools.length > 0 && !!network && !!provider,
  });
}

/**
 * Standalone function to fetch volume for a single pool (for testing/debugging)
 */
export async function getPoolCandleVolume(
  provider: any,
  poolId: string,
  token1Id: string,
  btcPrice?: number
): Promise<PoolCandleVolume | null> {
  return fetchPoolVolume(provider, poolId, token1Id, btcPrice);
}

/**
 * Direct function to fetch raw candle data (useful for debugging)
 */
export async function getRawCandles(
  provider: any,
  poolId: string,
  timeframe: 'd1' | 'M1' | 'h1' | '10m' | 'w1',
  limit: number = 30
): Promise<CandleResponse | null> {
  return fetchCandles(provider, poolId, timeframe, 'quote', limit);
}
