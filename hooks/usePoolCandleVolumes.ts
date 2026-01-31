/**
 * Hook to fetch pool volumes using ammdata.get_candles from the espo API
 *
 * Uses the Alkanode API endpoint to get candle data with volume information.
 * Docs: https://api.alkanode.com/
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
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

// ============================================================================
// Network Configuration
// ============================================================================

// Temporary: using api.alkanode.com until subfrost espo resyncs
export const NETWORK_ESPO_URLS: Record<string, string> = {
  mainnet: 'https://api.alkanode.com/rpc-staging',
  testnet: 'https://api.alkanode.com/rpc-staging',
  signet: 'https://api.alkanode.com/rpc-staging',
  regtest: 'https://api.alkanode.com/rpc-staging',
  oylnet: 'https://api.alkanode.com/rpc-staging',
  'subfrost-regtest': 'https://api.alkanode.com/rpc-staging',
};

// Known quote tokens with USD values
const USD_STABLE_TOKENS = new Set(['2:56801']); // bUSD
const BTC_TOKENS = new Set(['32:0']); // frBTC

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch candles from the espo API using ammdata.get_candles
 */
export async function fetchCandles(
  espoUrl: string,
  poolId: string,
  timeframe: 'd1' | 'M1' | 'h1' | '10m' | 'w1',
  side: 'base' | 'quote' = 'quote',
  limit: number = 50,
  page: number = 1
): Promise<CandleResponse | null> {
  try {
    const response = await fetch(espoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ammdata.get_candles',
        params: {
          pool: poolId,
          timeframe,
          side,
          limit,
          page,
        },
      }),
    });

    const json = await response.json();

    if (json?.result?.ok) {
      return json.result as CandleResponse;
    }

    // Some APIs return result directly without the wrapper
    if (json?.ok !== undefined) {
      return json as CandleResponse;
    }

    console.warn(`[usePoolCandleVolumes] No candle data for pool ${poolId}:`, json);
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
  espoUrl: string,
  poolId: string,
  token1Id: string,
  btcPrice: number | undefined
): Promise<PoolCandleVolume | null> {
  try {
    // Fetch 30d volume (30 daily candles) - this includes the 24h data as the first candle
    const candles30d = await fetchCandles(espoUrl, poolId, 'd1', 'quote', 30);

    if (!candles30d || !candles30d.candles || candles30d.candles.length === 0) {
      return null;
    }

    // Get 24h volume from the most recent candle
    const volume24h = candles30d.candles[0]?.volume || 0;

    // Sum all candle volumes for 30d
    const volume30d = sumCandleVolume(candles30d.candles);

    // Convert to USD based on quote token type
    // API returns volume already in decimal format (not satoshis)
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
 * Fetch volume data for a single pool using ammdata.get_candles
 */
export function usePoolCandleVolume(
  poolId: string | undefined,
  token1Id: string | undefined
): UseQueryResult<PoolCandleVolume | null> {
  const { network } = useWallet();
  const { data: btcPrice } = useBtcPrice();
  const espoUrl = NETWORK_ESPO_URLS[network] || NETWORK_ESPO_URLS.mainnet;

  return useQuery({
    queryKey: ['pool-candle-volume', poolId, token1Id, network, btcPrice],
    queryFn: async () => {
      if (!poolId || !token1Id) return null;
      return fetchPoolVolume(espoUrl, poolId, token1Id, btcPrice);
    },
    staleTime: 5 * 60_000, // 5 minutes
    refetchInterval: 5 * 60_000,
    enabled: !!poolId && !!token1Id && !!network,
  });
}

/**
 * Fetch volume data for multiple pools using ammdata.get_candles
 * Returns a map of poolId -> PoolCandleVolume
 */
export function useAllPoolCandleVolumes(
  pools: Array<{ id: string; token1Id: string }> | undefined
): UseQueryResult<Record<string, PoolCandleVolume>> {
  const { network } = useWallet();
  const { data: btcPrice } = useBtcPrice();
  const espoUrl = NETWORK_ESPO_URLS[network] || NETWORK_ESPO_URLS.mainnet;

  return useQuery({
    queryKey: ['all-pool-candle-volumes', pools?.map(p => p.id).join(','), network, btcPrice],
    queryFn: async () => {
      if (!pools || pools.length === 0) return {};

      const results: Record<string, PoolCandleVolume> = {};

      // Fetch volumes for all pools in parallel
      const volumePromises = pools.map(async (pool) => {
        const volume = await fetchPoolVolume(espoUrl, pool.id, pool.token1Id, btcPrice);
        if (volume) {
          results[pool.id] = volume;
        }
      });

      await Promise.all(volumePromises);

      return results;
    },
    staleTime: 5 * 60_000, // 5 minutes
    refetchInterval: 5 * 60_000,
    enabled: !!pools && pools.length > 0 && !!network,
  });
}

/**
 * Standalone function to fetch volume for a single pool (for testing/debugging)
 */
export async function getPoolCandleVolume(
  poolId: string,
  token1Id: string,
  network: string = 'mainnet',
  btcPrice?: number
): Promise<PoolCandleVolume | null> {
  const espoUrl = NETWORK_ESPO_URLS[network] || NETWORK_ESPO_URLS.mainnet;
  return fetchPoolVolume(espoUrl, poolId, token1Id, btcPrice);
}

/**
 * Direct function to fetch raw candle data (useful for debugging)
 */
export async function getRawCandles(
  poolId: string,
  timeframe: 'd1' | 'M1' | 'h1' | '10m' | 'w1',
  network: string = 'mainnet',
  limit: number = 30
): Promise<CandleResponse | null> {
  const espoUrl = NETWORK_ESPO_URLS[network] || NETWORK_ESPO_URLS.mainnet;
  return fetchCandles(espoUrl, poolId, timeframe, 'quote', limit);
}
