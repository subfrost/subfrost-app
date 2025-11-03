'use client';

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';

import type { AllPoolsDetailsResult } from '@/app/api-provider/apiclient/types';
import { useApiProvider } from '@/app/hooks/useApiProvider';
import { useWallet } from '@/app/contexts/WalletContext';
import { getConfig } from '@/app/utils/getConfig';

type UsePoolsParams = {
  sort_by?: 'tvl' | 'volume1d' | 'volume30d' | 'apr';
  order?: 'asc' | 'desc';
  address?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
};

type AlkaneId = { block: string; tx: string };
function parseAlkaneId(id: string): AlkaneId {
  const [block, tx] = (id || '').split(':');
  return { block: block || '0', tx: tx || '0' } as AlkaneId;
}

export function usePools({
  sort_by,
  order,
  address,
  searchQuery,
  limit = 50,
  offset = 0,
}: UsePoolsParams = {}) {
  const api = useApiProvider();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  return useQuery<AllPoolsDetailsResult>({
    queryKey: [
      'pools',
      sort_by,
      order,
      address,
      debouncedSearchQuery,
      limit,
      offset,
      network,
    ],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const response = await api.getAlkanesTokenPools({
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
        limit,
        offset,
        sort_by,
        order,
        address,
        searchQuery: debouncedSearchQuery,
      });
      return response;
    },
  });
}


