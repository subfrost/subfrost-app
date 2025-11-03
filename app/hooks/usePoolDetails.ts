import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from '@/app/hooks/useApiProvider';
import { useWallet } from '@/app/contexts/WalletContext';
import { getConfig } from '@/app/utils/getConfig';

type AlkaneId = { block: string; tx: string };
function parseAlkaneId(id: string): AlkaneId {
  const [block, tx] = (id || '').split(':');
  return { block: block || '0', tx: tx || '0' } as AlkaneId;
}

export function usePoolDetails(poolId?: string) {
  const api = useApiProvider();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery({
    queryKey: ['pool-details', network, poolId],
    enabled: !!poolId && poolId.includes(':'),
    queryFn: async () => {
      if (!poolId) return null;
      const pool = await api.getAlkanesTokenPoolDetails({
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
        poolId: parseAlkaneId(poolId),
      });
      if (!pool) return null;
      const [n0, n1] = String(pool.poolName || '').replace(' LP','').split(' / ');
      const token0Id = `${pool.token0.block}:${pool.token0.tx}`;
      const token1Id = `${pool.token1.block}:${pool.token1.tx}`;
      const token0TvlUsd = pool.token0TvlInUsd ?? 0;
      const token1TvlUsd = pool.token1TvlInUsd ?? 0;
      const tvl = (pool.poolTvlInUsd ?? (token0TvlUsd + token1TvlUsd)) || 0;
      return {
        id: `${pool.poolId.block}:${pool.poolId.tx}`,
        poolName: `${n0} / ${n1}`,
        currencyA: { id: token0Id, name: n0 || token0Id, amount: pool.token0Amount, tvlInUsd: token0TvlUsd },
        currencyB: { id: token1Id, name: n1 || token1Id, amount: pool.token1Amount, tvlInUsd: token1TvlUsd },
        tvl,
        volume24h: pool.poolVolume1dInUsd ?? 0,
        volume30d: pool.poolVolume30dInUsd ?? 0,
      } as const;
    },
  });
}


