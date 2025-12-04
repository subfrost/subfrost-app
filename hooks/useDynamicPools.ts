/**
 * useDynamicPools - Fetches pools dynamically from the factory contract using WASM
 *
 * This hook uses the alkanesGetAllPoolsWithDetails method to fetch all pools
 * with parallel optimization, giving us the correct alkane IDs for each network.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';

export type DynamicPool = {
  pool_id: string;
  pool_id_block: number;
  pool_id_tx: number;
  details: {
    data?: string;
    [key: string]: any;
  };
};

export type DynamicPoolsResult = {
  total: number;
  count: number;
  pools: DynamicPool[];
};

/**
 * Fetch all pools from factory with details using parallelized WASM calls
 */
export function useDynamicPools(options?: {
  chunk_size?: number;
  max_concurrent?: number;
  enabled?: boolean;
}) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const config = getConfig(network);
  const factoryId = config.ALKANE_FACTORY_ID; // e.g., "4:65522"

  const {
    chunk_size = 30,
    max_concurrent = 10,
    enabled = true,
  } = options || {};

  return useQuery<DynamicPoolsResult>({
    queryKey: ['dynamic-pools', network, factoryId, chunk_size, max_concurrent],
    enabled: enabled && !!factoryId && isInitialized && !!provider,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      // Call the parallelized pool fetching method
      const result = await provider.alkanesGetAllPoolsWithDetails(
        factoryId,
        chunk_size,
        max_concurrent
      );

      return result as DynamicPoolsResult;
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
