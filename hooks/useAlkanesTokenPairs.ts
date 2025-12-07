import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';

export type AlkanesTokenPair = {
  token0: { id: string; token0Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  token1: { id: string; token1Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  poolId?: { block: number | string; tx: number | string };
} & Partial<AlkanesTokenPairsResult>;

/**
 * Helper to extract pools array from WASM provider response
 * The WASM binding may return Map, object, or array depending on serialization
 */
function extractPoolsArray(response: any): any[] {
  if (!response) return [];

  // Handle Map response - serde_wasm_bindgen serializes objects as Maps
  if (response instanceof Map) {
    // Check for nested data.pools structure
    const data = response.get('data');
    if (data instanceof Map) {
      const pools = data.get('pools');
      if (Array.isArray(pools)) {
        return pools;
      }
    }

    // Check for direct pools key
    const directPools = response.get('pools');
    if (Array.isArray(directPools)) {
      return directPools;
    }

    return [];
  }

  // Handle plain object
  if (response.data?.pools && Array.isArray(response.data.pools)) {
    return response.data.pools;
  }
  if (response.pools && Array.isArray(response.pools)) {
    return response.pools;
  }
  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

/**
 * Helper to get value from pool object (may be Map or plain object)
 */
function getPoolValue(pool: any, key: string): any {
  if (pool instanceof Map) return pool.get(key);
  return pool?.[key];
}

/**
 * Convert pool object to plain object
 */
function poolToObject(pool: any): any {
  if (pool instanceof Map) {
    const obj: any = {};
    pool.forEach((value: any, key: string) => {
      obj[key] = value;
    });
    return obj;
  }
  return pool;
}

export function useAlkanesTokenPairs(
  alkaneId: string,
  limit?: number,
  offset?: number,
  sortBy?: 'tvl' | undefined,
  searchQuery?: string,
) {
  const normalizedId = alkaneId === 'btc' ? '32:0' : alkaneId;
  const { provider, isInitialized } = useAlkanesSDK();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery({
    enabled: !!normalizedId && isInitialized && !!provider,
    queryKey: ['alkanesTokenPairs', normalizedId, limit, offset, sortBy, searchQuery, network],
    staleTime: 30_000, // 30 seconds - poll more frequently for realtime quotes
    refetchInterval: 30_000, // Auto-refresh every 30s for up-to-date reserves
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      // Use the WASM provider's dataApiGetPools to get pools via JSON-RPC
      // This uses the same endpoint as our tests: https://regtest.subfrost.io/v4/subfrost
      const poolsResponse = await provider.dataApiGetPools(ALKANE_FACTORY_ID);
      const poolsArray = extractPoolsArray(poolsResponse);

      console.log('[useAlkanesTokenPairs] Got', poolsArray.length, 'pools for token:', normalizedId);

      // Filter pools that contain this token
      const matchingPools: AlkanesTokenPair[] = [];

      for (const p of poolsArray) {
        const pool = poolToObject(p);

        // Extract token IDs from response
        // API returns: token0_block_id, token0_tx_id, token1_block_id, token1_tx_id
        const token0Id = pool.token0_id ||
          (pool.token0_block_id && pool.token0_tx_id ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '');
        const token1Id = pool.token1_id ||
          (pool.token1_block_id && pool.token1_tx_id ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '');

        // Check if this pool contains the requested token
        if (token0Id === normalizedId || token1Id === normalizedId) {
          // Extract reserves (token amounts)
          const token0Amount = pool.token0_amount || pool.reserve0 || '0';
          const token1Amount = pool.token1_amount || pool.reserve1 || '0';

          // Extract token names from pool_name (format: "TOKEN0 / TOKEN1 LP")
          let token0Name = '';
          let token1Name = '';
          const poolName = pool.pool_name || '';
          if (poolName) {
            const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
            if (match) {
              token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
              token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
            }
          }

          // Parse pool ID
          const poolIdBlock = pool.pool_block_id || pool.pool_id?.split(':')[0] || 0;
          const poolIdTx = pool.pool_tx_id || pool.pool_id?.split(':')[1] || 0;

          matchingPools.push({
            token0: {
              id: token0Id,
              token0Amount,
              alkaneId: parseAlkaneId(token0Id || '0:0'),
              name: token0Name,
              symbol: token0Name,
            },
            token1: {
              id: token1Id,
              token1Amount,
              alkaneId: parseAlkaneId(token1Id || '0:0'),
              name: token1Name,
              symbol: token1Name,
            },
            poolId: {
              block: poolIdBlock,
              tx: poolIdTx,
            },
            poolName,
          } as AlkanesTokenPair);

          console.log('[useAlkanesTokenPairs] Found matching pool:', {
            poolId: `${poolIdBlock}:${poolIdTx}`,
            token0: { id: token0Id, amount: token0Amount },
            token1: { id: token1Id, amount: token1Amount },
          });
        }
      }

      return matchingPools;
    },
  });
}
