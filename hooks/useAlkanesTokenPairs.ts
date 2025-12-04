import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';

export type AlkanesTokenPair = {
  token0: { id: string };
  token1: { id: string };
  poolId?: { block: number | string; tx: number | string };
} & AlkanesTokenPairsResult;

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
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      // Use the WASM provider to get token pairs
      const alkaneIdParsed = parseAlkaneId(normalizedId);
      const contractId = `${alkaneIdParsed.block}:${alkaneIdParsed.tx}`;

      // Get all pools from factory with details
      const poolsResult = await provider.alkanesGetAllPoolsWithDetails(
        ALKANE_FACTORY_ID,
        30, // chunk_size
        10 // max_concurrent
      );

      // Filter pools that contain this token
      const matchingPools: AlkanesTokenPair[] = [];

      if (poolsResult && poolsResult.pools) {
        for (const pool of poolsResult.pools) {
          // Parse pool details to check if it contains the token
          // The pool details should include token0 and token1 info
          const details = pool.details;
          if (!details) continue;

          // Check if this pool contains the requested token
          // Pool format depends on WASM implementation
          const poolId = pool.pool_id;
          const token0Id = details.token0_id || details.token0?.id;
          const token1Id = details.token1_id || details.token1?.id;

          if (token0Id === contractId || token1Id === contractId ||
            token0Id === normalizedId || token1Id === normalizedId) {
            matchingPools.push({
              ...details,
              token0: {
                ...details.token0,
                id: token0Id || '',
                alkaneId: details.token0?.alkaneId || parseAlkaneId(token0Id || '0:0'),
                token0Amount: details.token0?.reserve || details.reserve0 || '0',
              },
              token1: {
                ...details.token1,
                id: token1Id || '',
                alkaneId: details.token1?.alkaneId || parseAlkaneId(token1Id || '0:0'),
                token1Amount: details.token1?.reserve || details.reserve1 || '0',
              },
              poolId: {
                block: pool.pool_id_block,
                tx: pool.pool_id_tx,
              },
            } as AlkanesTokenPair);
          }
        }
      }

      return matchingPools;
    },
  });
}
