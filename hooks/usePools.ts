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
        // Use WASM provider to get all pools with details
        const poolsResult = await provider.alkanesGetAllPoolsWithDetails(
          ALKANE_FACTORY_ID,
          30, // chunk_size
          10 // max_concurrent
        );

        const items: PoolsListItem[] = [];

        if (poolsResult && poolsResult.pools) {
          for (const p of poolsResult.pools) {
            const details = p.details;
            if (!details) continue;

            // Extract token info from pool details
            const token0Id = details.token0_id || details.token0?.id || '';
            const token1Id = details.token1_id || details.token1?.id || '';
            const poolName = details.name || details.poolName || '';
            const poolNameClean = poolName.replace(/ LP$/, '');
            const [rawA, rawB] = poolNameClean.split(' / ');
            const token0Name = (rawA ?? '').replace('SUBFROST BTC', 'frBTC');
            const token1Name = (rawB ?? '').replace('SUBFROST BTC', 'frBTC');

            // Parse token IDs for icon URLs
            const [t0Block, t0Tx] = token0Id.split(':');
            const [t1Block, t1Tx] = token1Id.split(':');
            const token0IconUrl = t0Block && t0Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t0Block}-${t0Tx}.png`
              : '';
            const token1IconUrl = t1Block && t1Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t1Block}-${t1Tx}.png`
              : '';

            const tvlUsd = (details.token0TvlInUsd ?? 0) + (details.token1TvlInUsd ?? 0);
            const vol24hUsd = details.poolVolume1dInUsd ?? 0;
            const vol30dUsd = details.poolVolume30dInUsd ?? 0;
            const apr = details.poolApr ?? 0;

            items.push({
              id: p.pool_id,
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
