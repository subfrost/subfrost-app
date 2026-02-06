/**
 * useDynamicPools - Fetches pools dynamically via ts-sdk
 *
 * Uses ts-sdk methods exclusively with a fallback chain:
 * 1. dataApiGetPools (Data API - more reliable)
 * 2. alkanesGetAllPoolsWithDetails (RPC simulate)
 *
 * @see Blueprint: Phase 2 - Pool Data Migration
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { queryKeys } from '@/queries/keys';

export type DynamicPool = {
  pool_id: string;
  pool_id_block: number;
  pool_id_tx: number;
  details: {
    token_a_block?: number;
    token_a_tx?: number;
    token_b_block?: number;
    token_b_tx?: number;
    token_a_name?: string;
    token_b_name?: string;
    reserve_a?: string;
    reserve_b?: string;
    pool_name?: string;
    [key: string]: any;
  };
};

export type DynamicPoolsResult = {
  total: number;
  count: number;
  pools: DynamicPool[];
};

/**
 * Extract pools array from various response formats (object, Map, array)
 */
function extractPoolsArray(response: any): any[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (response instanceof Map) {
    const pools = response.get('pools');
    return Array.isArray(pools) ? pools : [];
  }
  if (response.pools && Array.isArray(response.pools)) return response.pools;
  if (response.data?.pools && Array.isArray(response.data.pools)) return response.data.pools;
  if (response.data && Array.isArray(response.data)) return response.data;
  return [];
}

/**
 * Fetch all pools from factory using ts-sdk
 */
export function useDynamicPools(options?: {
  chunk_size?: number;
  max_concurrent?: number;
  enabled?: boolean;
}) {
  const { network } = useWallet();
  const config = getConfig(network);
  const factoryId = config.ALKANE_FACTORY_ID; // e.g., "4:65522"
  const { provider } = useAlkanesSDK();

  const { enabled = true } = options || {};

  return useQuery<DynamicPoolsResult>({
    queryKey: queryKeys.pools.dynamic(network, factoryId),
    enabled: enabled && !!factoryId && !!network && !!provider,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      console.log('[useDynamicPools] Fetching pools via ts-sdk for factory:', factoryId);

      let rawPools: any[] = [];

      // =====================================================================
      // Method 1: dataApiGetPools (Data API - more reliable)
      // =====================================================================
      try {
        console.log('[useDynamicPools] Trying dataApiGetPools...');
        const dataApiResult = await provider!.dataApiGetPools(factoryId);
        rawPools = extractPoolsArray(dataApiResult);
        console.log('[useDynamicPools] dataApiGetPools returned', rawPools.length, 'pools');
      } catch (e) {
        console.warn('[useDynamicPools] dataApiGetPools failed:', e);
      }

      // =====================================================================
      // Method 2: alkanesGetAllPoolsWithDetails (RPC simulate)
      // =====================================================================
      if (rawPools.length === 0) {
        try {
          console.log('[useDynamicPools] Trying alkanesGetAllPoolsWithDetails...');
          const rpcResult = await provider!.alkanesGetAllPoolsWithDetails(factoryId);
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          rawPools = parsed?.pools || [];
          console.log('[useDynamicPools] alkanesGetAllPoolsWithDetails returned', rawPools.length, 'pools');
        } catch (e) {
          console.warn('[useDynamicPools] alkanesGetAllPoolsWithDetails failed:', e);
        }
      }

      // If both methods failed, throw error for React Query to handle
      if (rawPools.length === 0) {
        console.error('[useDynamicPools] All ts-sdk methods failed to return pools');
        throw new Error('Failed to fetch pools from ts-sdk');
      }

      // Process raw pools into DynamicPool format
      const pools: DynamicPool[] = [];

      for (const p of rawPools) {
        // Handle Data API format (pool_block_id, pool_tx_id, token0_*, token1_*)
        // and RPC format (pool_id_block, pool_id_tx, details: { token_a_*, token_b_* })
        const details = p.details || {};

        // Determine pool ID
        const poolIdBlock = p.pool_id_block ?? p.pool_block_id ?? 0;
        const poolIdTx = p.pool_id_tx ?? p.pool_tx_id ?? 0;
        const poolId = p.pool_id || `${poolIdBlock}:${poolIdTx}`;

        // Get token info - handle both formats
        const tokenABlock = details.token_a_block ?? p.token0_block_id ?? 0;
        const tokenATx = details.token_a_tx ?? p.token0_tx_id ?? 0;
        const tokenBBlock = details.token_b_block ?? p.token1_block_id ?? 0;
        const tokenBTx = details.token_b_tx ?? p.token1_tx_id ?? 0;

        // Get token names
        let tokenAName = (details.token_a_name || p.token0_name || '').replace('SUBFROST BTC', 'frBTC');
        let tokenBName = (details.token_b_name || p.token1_name || '').replace('SUBFROST BTC', 'frBTC');

        // Try to parse from pool_name if names not available
        const poolName = details.pool_name || p.pool_name || '';
        if ((!tokenAName || !tokenBName) && poolName) {
          const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
          if (match) {
            tokenAName = tokenAName || match[1].trim().replace('SUBFROST BTC', 'frBTC');
            tokenBName = tokenBName || match[2].trim().replace('SUBFROST BTC', 'frBTC');
          }
        }

        pools.push({
          pool_id: poolId,
          pool_id_block: poolIdBlock,
          pool_id_tx: poolIdTx,
          details: {
            token_a_block: tokenABlock,
            token_a_tx: tokenATx,
            token_b_block: tokenBBlock,
            token_b_tx: tokenBTx,
            token_a_name: tokenAName,
            token_b_name: tokenBName,
            reserve_a: details.reserve_a || p.token0_amount || '0',
            reserve_b: details.reserve_b || p.token1_amount || '0',
            pool_name: poolName,
          },
        });
      }

      console.log('[useDynamicPools] Processed', pools.length, 'pools');

      return {
        total: pools.length,
        count: pools.length,
        pools,
      };
    },
  });
}

/**
 * Get filtered pools based on a token whitelist
 */
export function useFilteredDynamicPools(
  tokenWhitelist: Set<string>,
  options?: {
    chunk_size?: number;
    max_concurrent?: number;
    enabled?: boolean;
  }
) {
  const poolsQuery = useDynamicPools(options);

  const filteredPools = poolsQuery.data?.pools.filter((pool) => {
    // Parse pool details to check if tokens are in whitelist
    // This would need to be adapted based on the actual response format
    // For now, we'll just return all pools and let the UI filter
    return true;
  });

  return {
    ...poolsQuery,
    filteredPools: filteredPools || [],
  };
}
