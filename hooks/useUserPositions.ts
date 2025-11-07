import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from './useApiProvider';
import { getConfig } from '@/utils/getConfig';
import type { AddressPositionsResult } from '@/lib/api-provider/apiclient/types';

export function useUserPositions(address?: string, network?: string) {
  const provider = useApiProvider();
  const config = getConfig(network || 'mainnet');

  return useQuery<AddressPositionsResult[]>({
    queryKey: ['userPositions', address, network],
    queryFn: async () => {
      if (!address || !provider) return [];
      
      // Parse factory ID from string format "block:tx" to object
      const [block, tx] = config.ALKANE_FACTORY_ID.split(':');
      
      const positions = await provider.getPoolPositionsByAddress({
        address,
        factoryId: { block, tx },
      });
      
      return positions || [];
    },
    enabled: Boolean(address && provider),
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
}
