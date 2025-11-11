import { useQuery } from '@tanstack/react-query';
import type { AllPoolsDetailsResult } from '@/lib/api-provider/apiclient/types';

import { useWallet } from '@/context/WalletContext';
import { useApiProvider } from '@/hooks/useApiProvider';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';

export type UsePoolsParams = {
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'tvl' | 'volume1d' | 'volume30d' | 'apr';
  order?: 'asc' | 'desc';
};

export type PoolsListItem = {
  id: string;
  pairLabel: string;
  token0: { id: string; symbol: string; name?: string; iconUrl?: string };
  token1: { id: string; symbol: string; name?: string; iconUrl?: string };
  tvlUsd?: number;
  vol24hUsd?: number;
  apr?: number;
};

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const api = useApiProvider();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery<{ items: PoolsListItem[]; total: number }>({
    queryKey: [
      'pools',
      network,
      params.search ?? '',
      params.limit ?? 100,
      params.offset ?? 0,
      params.sortBy ?? 'tvl',
      params.order ?? 'desc',
    ],
    staleTime: 120_000,
    queryFn: async () => {
      const res: AllPoolsDetailsResult = await api.getAlkanesTokenPools({
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
        sort_by: params.sortBy ?? 'tvl',
        order: params.order ?? 'desc',
        searchQuery: params.search,
      });

      const items: PoolsListItem[] = (res.pools ?? []).map((p) => {
        // poolName like "TOKEN0 / TOKEN1"
        const [rawA, rawB] = (p.poolName ?? '').split(' / ');
        const token0Name = (rawA ?? '').replace('SUBFROST BTC', 'frBTC');
        const token1Name = (rawB ?? '').replace('SUBFROST BTC', 'frBTC');
        const token0Id = `${p.token0.block}:${p.token0.tx}`;
        const token1Id = `${p.token1.block}:${p.token1.tx}`;
        
        // Generate Oyl asset URLs for alkane tokens (note: asset.oyl.gg, not assets)
        const token0IconUrl = `https://asset.oyl.gg/alkanes/${network}/${p.token0.block}-${p.token0.tx}.png`;
        const token1IconUrl = `https://asset.oyl.gg/alkanes/${network}/${p.token1.block}-${p.token1.tx}.png`;
        
        const tvlUsd = (p.token0TvlInUsd ?? 0) + (p.token1TvlInUsd ?? 0);
        const vol24hUsd = p.poolVolume1dInUsd ?? 0;
        return {
          id: `${p.poolId.block}:${p.poolId.tx}`,
          pairLabel: `${token0Name} / ${token1Name} LP`,
          token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: token0IconUrl },
          token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: token1IconUrl },
          tvlUsd,
          vol24hUsd,
          apr: undefined,
        };
      });

      // Ensure sort by TVL desc unless specified otherwise
      const sorted = [...items].sort((a, b) => (params.order === 'asc' ? (a.tvlUsd ?? 0) - (b.tvlUsd ?? 0) : (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)));

      return { items: sorted, total: res.total ?? sorted.length };
    },
  });
}


