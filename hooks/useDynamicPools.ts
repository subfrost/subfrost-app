/**
 * useDynamicPools - Fetches pools dynamically via ts-sdk
 *
 * Uses only alkanesGetAllPoolsWithDetails (alkanes_simulate RPC through /api/rpc proxy).
 * dataApiGetPools was removed — subfrost /get-pools returns bare pool IDs {block,tx}
 * without token info or reserves, and the SDK's follow-up calls to /get-pool-details (422)
 * and /get-all-pools-with-details (404) are unsupported. This caused the perpetual loading
 * spinner: ExchangeContext (which wraps all pages) blocked indefinitely.
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

      // alkanesGetAllPoolsWithDetails: alkanes_simulate RPC calls through /api/rpc proxy.
      // Makes N+1 calls (1 factory opcode 3 + N pool opcode 999). 30s timeout for mainnet.
      // This is the only reliable method — dataApiGetPools calls subfrost /get-pools which
      // returns bare pool IDs without token/reserve data, then tries unsupported endpoints.
      try {
        const rpcResult = await withTimeout(provider!.alkanesGetAllPoolsWithDetails(factoryId), 30000, 'alkanesGetAllPoolsWithDetails');
        const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
        rawPools = parsed?.pools || [];
        console.log('[useDynamicPools] alkanesGetAllPoolsWithDetails returned', rawPools.length, 'pools');
      } catch (e) {
        console.warn('[useDynamicPools] alkanesGetAllPoolsWithDetails failed:', e);
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
