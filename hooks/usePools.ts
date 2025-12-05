import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';

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
  vol7dUsd?: number;
  vol30dUsd?: number;
  apr?: number;
};

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
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
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) {
        return { items: [], total: 0 };
      }

      try {
        // Use WASM provider's dataApiGetPools method
        const poolsResult = await provider.dataApiGetPools(ALKANE_FACTORY_ID);

        console.log('[usePools] Got pools result:', poolsResult);

        const items: PoolsListItem[] = [];

        // dataApiGetPools returns { data: [...pools] } or an array directly
        const poolsArray = poolsResult?.data || poolsResult?.pools || poolsResult || [];

        if (Array.isArray(poolsArray)) {
          for (const p of poolsArray) {
            // dataApiGetPools returns pool data with different field names
            const poolId = p.pool_id || p.poolId || p.id || '';
            const token0Id = p.token0_id || p.token0Id || p.token0?.id || '';
            const token1Id = p.token1_id || p.token1Id || p.token1?.id || '';
            const token0Symbol = p.token0_symbol || p.token0Symbol || p.token0?.symbol || '';
            const token1Symbol = p.token1_symbol || p.token1Symbol || p.token1?.symbol || '';
            const token0Name = (p.token0_name || p.token0Name || p.token0?.name || token0Symbol).replace('SUBFROST BTC', 'frBTC');
            const token1Name = (p.token1_name || p.token1Name || p.token1?.name || token1Symbol).replace('SUBFROST BTC', 'frBTC');

            // Parse token IDs for icon URLs
            const [t0Block, t0Tx] = token0Id.split(':');
            const [t1Block, t1Tx] = token1Id.split(':');
            const token0IconUrl = t0Block && t0Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t0Block}-${t0Tx}.png`
              : '';
            const token1IconUrl = t1Block && t1Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t1Block}-${t1Tx}.png`
              : '';

            // Get TVL and volume data from API response
            const tvlUsd = p.tvl_usd || p.tvlUsd || (p.token0_tvl_usd ?? 0) + (p.token1_tvl_usd ?? 0) || 0;
            const vol24hUsd = p.volume_1d_usd || p.volume1dUsd || p.poolVolume1dInUsd || 0;
            const vol30dUsd = p.volume_30d_usd || p.volume30dUsd || p.poolVolume30dInUsd || 0;
            const apr = p.apr || p.poolApr || 0;

            items.push({
              id: poolId,
              pairLabel: `${token0Name} / ${token1Name} LP`,
              token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: token0IconUrl },
              token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: token1IconUrl },
              tvlUsd,
              vol24hUsd,
              vol7dUsd: 0,
              vol30dUsd,
              apr,
            });
          }
        }

        // Apply search filter if specified
        let filtered = items;
        if (params.search) {
          const searchLower = params.search.toLowerCase();
          filtered = items.filter(
            (p) =>
              p.pairLabel.toLowerCase().includes(searchLower) ||
              p.token0.symbol.toLowerCase().includes(searchLower) ||
              p.token1.symbol.toLowerCase().includes(searchLower)
          );
        }

        // Sort by TVL desc unless specified otherwise
        const sorted = [...filtered].sort((a, b) =>
          params.order === 'asc'
            ? (a.tvlUsd ?? 0) - (b.tvlUsd ?? 0)
            : (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)
        );

        // Apply pagination
        const start = params.offset ?? 0;
        const end = start + (params.limit ?? 100);
        const paginated = sorted.slice(start, end);

        return { items: paginated, total: sorted.length };
      } catch (error) {
        console.error('[usePools] Error fetching pools:', error);
        return { items: [], total: 0 };
      }
    },
  });
}
