/**
 * usePoolStateLive — reactive live pool state (reserves + LP supply).
 *
 * Reads espo's `/get-pool-details` endpoint, which serves a per-block snapshot
 * written by the indexer on every block (no TTL cache, just whatever the
 * indexer wrote latest). Bypasses the bulk `/get-all-pools-details` aggregate
 * that we cache for the markets list.
 *
 * ## Refresh model
 *
 * `staleTime: Infinity` + no `refetchInterval`. Espo writes a fresh snapshot
 * per block, so polling between blocks would always return identical data.
 * Instead we rely on:
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
import { fetchLivePoolState, type LivePoolState } from '@/lib/alkanes/poolState';
import { queryKeys } from '@/queries/keys';

export interface UsePoolStateLiveOptions {
  /** Disable the query (e.g. amount empty, modal closed). Default: true. */
  enabled?: boolean;
}

export function usePoolStateLive(
  poolId: string | null | undefined,
  options: UsePoolStateLiveOptions = {},
) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const enabled = (options.enabled ?? true) && !!poolId && !!ALKANE_FACTORY_ID;

  return useQuery<LivePoolState | null>({
    queryKey: queryKeys.pools.liveState(network, poolId ?? ''),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!poolId || !ALKANE_FACTORY_ID) return null;
      return fetchLivePoolState(network, ALKANE_FACTORY_ID, poolId);
    },
  });
}
