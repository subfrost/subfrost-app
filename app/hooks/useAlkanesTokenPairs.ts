import { useQuery } from '@tanstack/react-query';

import type { AlkanesTokenPairsResult } from '@oyl/api-provider/lib/apiclient/types';
import { useApiProvider } from './useApiProvider';
import { useWallet } from '@/app/contexts/WalletContext';
import { getConfig } from '@/app/utils/getConfig';

type AlkaneId = { block: string; tx: string };

function parseAlkaneId(id: string): AlkaneId {
  const [block, tx] = (id || '').split(':');
  return { block: block || '0', tx: tx || '0' };
}

export type AlkanesTokenPair = {
  token0: { id: string };
  token1: { id: string };
} & AlkanesTokenPairsResult;

export function useAlkanesTokenPairs(
  alkaneId: string,
  limit?: number,
  offset?: number,
  sortBy?: 'tvl' | undefined,
  searchQuery?: string,
) {
  const api = useApiProvider();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  return useQuery({
    enabled: !!alkaneId,
    queryKey: ['alkanesTokenPairs', alkaneId, limit, offset, sortBy, searchQuery, network],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!alkaneId) return [] as AlkanesTokenPair[];
      const response = await api.getAlkanesTokenPairs({
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
        alkaneId: parseAlkaneId(alkaneId),
        limit,
        offset,
        sort_by: sortBy,
        searchQuery,
      });
      return response.map((pair) => ({
        ...pair,
        token0: { ...pair.token0, id: `${pair.token0.alkaneId.block}:${pair.token0.alkaneId.tx}` },
        token1: { ...pair.token1, id: `${pair.token1.alkaneId.block}:${pair.token1.alkaneId.tx}` },
      }));
    },
  });
}


