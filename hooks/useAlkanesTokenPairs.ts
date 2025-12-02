import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useApiProvider } from '@/hooks/useApiProvider';
import { useWallet } from '@/context/WalletContext';

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
  const normalizedId = alkaneId === 'btc' ? '32:0' : alkaneId;
  const api = useApiProvider();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery({
    enabled: !!normalizedId,
    queryKey: ['alkanesTokenPairs', normalizedId, limit, offset, sortBy, searchQuery],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const response = await api.getAlkanesTokenPairs({
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
        alkaneId: parseAlkaneId(normalizedId),
        limit,
        offset,
        sort_by: sortBy,
        searchQuery,
      });

      return response.map((tokenPair: any): AlkanesTokenPair => ({
        ...tokenPair,
        token0: {
          ...tokenPair.token0,
          id: `${tokenPair.token0.alkaneId.block}:${tokenPair.token0.alkaneId.tx}`,
        },
        token1: {
          ...tokenPair.token1,
          id: `${tokenPair.token1.alkaneId.block}:${tokenPair.token1.alkaneId.tx}`,
        },
      }));
    },
  });
}


