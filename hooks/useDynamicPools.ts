/**
 * useDynamicPools - Fetches pools dynamically via ts-sdk
 *
 * Priority order for pool data:
 * 1. dataApiGetAllPoolsDetails — single REST call to /get-all-pools-details (fastest)
 * 2. espoGetPools — Espo service REST call (structured pool data)
 * 3. alkanesGetAllPoolsWithDetails — N+1 alkanes_simulate RPC calls (slowest, always works)
 *
 * JOURNAL ENTRY (2026-02-11): Added dataApi and Espo as preferred sources over
 * alkanes_simulate. Previously only used alkanesGetAllPoolsWithDetails which makes
 * N+1 RPC calls. dataApiGetAllPoolsDetails is a single REST call when supported.
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

      // Timeout wrapper to prevent infinite hangs from CORS-blocked internal SDK fetches
      const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)),
        ]);

      let rawPools: any[] = [];

      // Method 1: dataApiGetAllPoolsDetails — single REST call (preferred)
      if (rawPools.length === 0) {
        try {
          const dataApiResult = await withTimeout(provider!.dataApiGetAllPoolsDetails(factoryId), 15000, 'dataApiGetAllPoolsDetails');
          const parsed = typeof dataApiResult === 'string' ? JSON.parse(dataApiResult) : dataApiResult;
          // Handle {pools: [...]}, {data: {pools: [...]}}, {data: [...]}, or raw array
          const pools = parsed?.pools
            || parsed?.data?.pools
            || (Array.isArray(parsed?.data) ? parsed.data : null)
            || (Array.isArray(parsed) ? parsed : []);
          if (Array.isArray(pools) && pools.length > 0) {
            rawPools = pools.map((p: any) => {
              // Pool ID: handle poolId.block/tx (data API) and flat fields (RPC)
              const pBlock = p.pool_block_id ?? p.pool_id_block ?? p.poolId?.block ?? 0;
              const pTx = p.pool_tx_id ?? p.pool_id_tx ?? p.poolId?.tx ?? 0;
              // Token IDs: handle token0.block/tx, token0.alkaneId.block/tx (data API)
              const t0Block = p.token0_block_id ?? p.details?.token_a_block ?? p.token0?.alkaneId?.block ?? p.token0?.block ?? 0;
              const t0Tx = p.token0_tx_id ?? p.details?.token_a_tx ?? p.token0?.alkaneId?.tx ?? p.token0?.tx ?? 0;
              const t1Block = p.token1_block_id ?? p.details?.token_b_block ?? p.token1?.alkaneId?.block ?? p.token1?.block ?? 0;
              const t1Tx = p.token1_tx_id ?? p.details?.token_b_tx ?? p.token1?.alkaneId?.tx ?? p.token1?.tx ?? 0;
              return {
                pool_id_block: pBlock,
                pool_id_tx: pTx,
                pool_id: p.pool_id || `${pBlock}:${pTx}`,
                details: {
                  token_a_block: t0Block,
                  token_a_tx: t0Tx,
                  token_b_block: t1Block,
                  token_b_tx: t1Tx,
                  token_a_name: p.token0_name ?? p.token0?.name ?? p.details?.token_a_name ?? '',
                  token_b_name: p.token1_name ?? p.token1?.name ?? p.details?.token_b_name ?? '',
                  reserve_a: p.token0_amount ?? p.reserve0 ?? p.token0?.token0Amount ?? p.details?.reserve_a ?? '0',
                  reserve_b: p.token1_amount ?? p.reserve1 ?? p.token1?.token1Amount ?? p.details?.reserve_b ?? '0',
                  pool_name: p.pool_name ?? p.poolName ?? p.details?.pool_name ?? '',
                },
              };
            });
            console.log('[useDynamicPools] dataApiGetAllPoolsDetails returned', rawPools.length, 'pools');
          }
        } catch (e) {
          console.warn('[useDynamicPools] dataApiGetAllPoolsDetails failed:', e);
        }
      }

      // Method 2: espoGetPools — Espo service REST call
      if (rawPools.length === 0) {
        try {
          const espoResult = await withTimeout(provider!.espoGetPools(), 15000, 'espoGetPools');
          const parsed = typeof espoResult === 'string' ? JSON.parse(espoResult) : espoResult;
          const pools = parsed?.pools
            || parsed?.data?.pools
            || (Array.isArray(parsed?.data) ? parsed.data : null)
            || (Array.isArray(parsed) ? parsed : []);
          if (Array.isArray(pools) && pools.length > 0) {
            rawPools = pools.map((p: any) => {
              const pBlock = p.pool_block_id ?? p.pool_id_block ?? p.poolId?.block ?? 0;
              const pTx = p.pool_tx_id ?? p.pool_id_tx ?? p.poolId?.tx ?? 0;
              const t0Block = p.token0_block_id ?? p.details?.token_a_block ?? p.token0?.alkaneId?.block ?? p.token0?.block ?? 0;
              const t0Tx = p.token0_tx_id ?? p.details?.token_a_tx ?? p.token0?.alkaneId?.tx ?? p.token0?.tx ?? 0;
              const t1Block = p.token1_block_id ?? p.details?.token_b_block ?? p.token1?.alkaneId?.block ?? p.token1?.block ?? 0;
              const t1Tx = p.token1_tx_id ?? p.details?.token_b_tx ?? p.token1?.alkaneId?.tx ?? p.token1?.tx ?? 0;
              return {
                pool_id_block: pBlock,
                pool_id_tx: pTx,
                pool_id: p.pool_id || `${pBlock}:${pTx}`,
                details: {
                  token_a_block: t0Block,
                  token_a_tx: t0Tx,
                  token_b_block: t1Block,
                  token_b_tx: t1Tx,
                  token_a_name: p.token0_name ?? p.token0?.name ?? p.details?.token_a_name ?? '',
                  token_b_name: p.token1_name ?? p.token1?.name ?? p.details?.token_b_name ?? '',
                  reserve_a: p.token0_amount ?? p.reserve0 ?? p.token0?.token0Amount ?? p.details?.reserve_a ?? '0',
                  reserve_b: p.token1_amount ?? p.reserve1 ?? p.token1?.token1Amount ?? p.details?.reserve_b ?? '0',
                  pool_name: p.pool_name ?? p.poolName ?? p.details?.pool_name ?? '',
                },
              };
            });
            console.log('[useDynamicPools] espoGetPools returned', rawPools.length, 'pools');
          }
        } catch (e) {
          console.warn('[useDynamicPools] espoGetPools failed:', e);
        }
      }

      // Method 3: alkanesGetAllPoolsWithDetails — N+1 alkanes_simulate RPC calls (fallback)
      if (rawPools.length === 0) {
        try {
          const rpcResult = await withTimeout(provider!.alkanesGetAllPoolsWithDetails(factoryId), 30000, 'alkanesGetAllPoolsWithDetails');
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          rawPools = parsed?.pools || [];
          console.log('[useDynamicPools] alkanesGetAllPoolsWithDetails returned', rawPools.length, 'pools');
        } catch (e) {
          console.warn('[useDynamicPools] alkanesGetAllPoolsWithDetails failed:', e);
        }
      }

      // If all methods failed, throw error for React Query to handle
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
