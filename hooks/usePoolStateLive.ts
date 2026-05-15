/**
 * usePoolStateLive — reactive live pool state (reserves + LP supply).
 *
 * Reads pool reserves through the app-level alkanes data source. Mainnet
 * defaults to ESPO (`essentials.*` reserve/supply reads); metashrew simulate
 * remains available for non-ESPO networks and explicit configuration.
 *
 * ## Refresh model
 *
 * `staleTime: Infinity` + no `refetchInterval`. The simulate view returns
 * the indexer's latest committed state, so polling between blocks would
 * always return identical data. Instead we rely on:
 *   - **HeightPoller** (`queries/height.ts`) invalidates ALL queries when the
 *     metashrew height advances — handles the "new block" trigger.
 *   - **refetchOnWindowFocus** picks up missed blocks if the user was away.
 *   - Mount with no cached data triggers the initial fetch automatically.
 *
 * One request per block per active subscription, zero waste.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { fetchPoolStateFromDataSource, type LivePoolState } from '@/lib/alkanes/poolState';
import { queryKeys } from '@/queries/keys';
import { getAlkanesDataSource, type AlkanesDataSource } from '@/lib/alkanes/dataSource';

export interface UsePoolStateLiveOptions {
  /** Disable the query (e.g. amount empty, modal closed). Default: true. */
  enabled?: boolean;
  /** Token IDs are required by the Espo reserve path. */
  token0Id?: string;
  token1Id?: string;
  /** Override for callers that must force one backend. Defaults to app-level source. */
  dataSource?: AlkanesDataSource;
}

export function usePoolStateLive(
  poolId: string | null | undefined,
  options: UsePoolStateLiveOptions = {},
) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const dataSource = options.dataSource ?? getAlkanesDataSource(network);
  const enabled = (options.enabled ?? true) && !!poolId && !!ALKANE_FACTORY_ID;

  return useQuery<LivePoolState | null>({
    queryKey: queryKeys.pools.liveState(
      network,
      poolId ?? '',
      dataSource,
      options.token0Id,
      options.token1Id,
    ),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!poolId || !ALKANE_FACTORY_ID) return null;
      return fetchPoolStateFromDataSource(
        network,
        ALKANE_FACTORY_ID,
        poolId,
        options.token0Id,
        options.token1Id,
        dataSource,
      );
    },
  });
}
