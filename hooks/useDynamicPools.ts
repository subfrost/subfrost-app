/**
 * useDynamicPools - Fetches pools dynamically from the REST API
 *
 * This hook uses the /v4/api/get-pools endpoint to fetch all pools
 * with their details including token IDs and names.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

// Network to API base URL mapping for REST API
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/api',
  testnet: 'https://testnet.subfrost.io/v4/api',
  signet: 'https://signet.subfrost.io/v4/api',
  regtest: 'https://regtest.subfrost.io/v4/api',
  oylnet: 'https://regtest.subfrost.io/v4/api',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/api',
};

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
 * Fetch all pools from factory using REST API
 */
export function useDynamicPools(options?: {
  chunk_size?: number;
  max_concurrent?: number;
  enabled?: boolean;
}) {
  const { network } = useWallet();
  const config = getConfig(network);
  const factoryId = config.ALKANE_FACTORY_ID; // e.g., "4:65522"

  const { enabled = true } = options || {};

  return useQuery<DynamicPoolsResult>({
    queryKey: ['dynamic-pools', network, factoryId],
    enabled: enabled && !!factoryId && !!network,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      // Parse factory ID into block and tx components
      const [factoryBlock, factoryTx] = factoryId.split(':');

      // Use REST API directly
      const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
      const response = await fetch(`${apiUrl}/get-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId: { block: factoryBlock, tx: factoryTx }
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('[useDynamicPools] Got pools result:', result);

      // Transform REST API response to DynamicPoolsResult format
      const rawPools = result?.data?.pools || result?.pools || result?.data || [];
      const pools: DynamicPool[] = [];

      for (const p of rawPools) {
        // Extract pool name parts for token names
        let tokenAName = '';
        let tokenBName = '';
        const poolName = p.pool_name || '';
        if (poolName) {
          const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
          if (match) {
            tokenAName = match[1].trim();
            tokenBName = match[2].trim();
          }
        }

        pools.push({
          pool_id: `${p.pool_block_id}:${p.pool_tx_id}`,
          pool_id_block: parseInt(p.pool_block_id) || 0,
          pool_id_tx: parseInt(p.pool_tx_id) || 0,
          details: {
            token_a_block: parseInt(p.token0_block_id) || 0,
            token_a_tx: parseInt(p.token0_tx_id) || 0,
            token_b_block: parseInt(p.token1_block_id) || 0,
            token_b_tx: parseInt(p.token1_tx_id) || 0,
            token_a_name: tokenAName,
            token_b_name: tokenBName,
            reserve_a: p.token0_amount || '0',
            reserve_b: p.token1_amount || '0',
            pool_name: poolName,
          },
        });
      }

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
