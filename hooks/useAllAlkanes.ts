import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from './useApiProvider';
import type { AlkanesTokensResult } from '@/lib/api-provider/apiclient/types';

export function useAllAlkanes(params?: {
  limit?: number;
  offset?: number;
  sort_by?: 'price' | 'fdv' | 'marketcap' | 'volume1d' | 'volume30d' | 'volume7d' | 'volumeAllTime' | 'holders' | 'change1d' | 'change7d' | 'change30d' | 'changeAllTime';
  order?: 'asc' | 'desc';
  searchQuery?: string;
}) {
  const provider = useApiProvider();

  return useQuery<AlkanesTokensResult>({
    queryKey: ['allAlkanes', params],
    queryFn: async () => {
      if (!provider) throw new Error('Provider not available');
      
      return await provider.getAlkanesTokens({
        limit: params?.limit ?? 100,
        offset: params?.offset ?? 0,
        sort_by: params?.sort_by,
        order: params?.order ?? 'desc',
        searchQuery: params?.searchQuery,
      });
    },
    enabled: Boolean(provider),
    staleTime: 60_000, // 1 minute
    refetchInterval: 120_000, // Refetch every 2 minutes
  });
}
