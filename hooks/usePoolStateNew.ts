/**
 * usePoolStateNew — Redis-cached pool reserves via the
 * `/api/pool-state/[poolId]` route.
 *
 * Mirrors `usePoolStateLive` (`hooks/usePoolStateLive.ts`) but reads
 * the centralized server cache instead of running an `alkanes_simulate`
 * round-trip per client. Collapses N concurrent slippage-quote clients
 * to one upstream call per (block, pool).
 *
 * `staleTime: Infinity` so HeightPoller controls invalidation. Same
 * pattern as `useWalletState`.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import type { PoolState } from '@/lib/walletState/fetchPoolState';

export type { PoolState } from '@/lib/walletState/fetchPoolState';

export interface UsePoolStateNewOptions {
  enabled?: boolean;
}

async function fetchPoolStateRoute(
  network: string,
  poolId: string,
): Promise<PoolState> {
  const params = new URLSearchParams({ network });
  const res = await fetch(`/api/pool-state/${poolId}?${params.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`pool-state HTTP ${res.status}`);
  }
  return (await res.json()) as PoolState;
}

export function usePoolStateNew(
  poolId: string | null | undefined,
  options: UsePoolStateNewOptions = {},
) {
  const { network } = useWallet();
  const net = network || 'mainnet';
  const enabled = (options.enabled ?? true) && !!poolId;

  return useQuery<PoolState | null>({
    queryKey: ['pool-state-new', net, poolId ?? ''],
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!poolId) return null;
      return fetchPoolStateRoute(net, poolId);
    },
  });
}
