/**
 * useWalletState — single React Query hook that consumes the
 * `/api/wallet-state` route.
 *
 * This is the new canonical wallet snapshot. It replaces the
 * `useWalletUtxoCache` + `useEnrichedWalletData` per-outpoint client
 * fanout. The server route returns:
 *
 *   - All wallet UTXOs with per-outpoint alkane balance sheets
 *   - BTC totals split by address type (p2wpkh vs p2tr)
 *   - Aggregate alkane balances
 *   - METASHREW height + bitcoind height (for sync-status display)
 *   - Tip hash (used by HeightPoller invalidation logic)
 *
 * Refresh model: `staleTime: Infinity` — HeightPoller invalidates this
 * key on every metashrew block change, so the only refetch happens
 * when there's actually new data to fetch. One backend call per block
 * per connected wallet (and N clients share the Redis cache, so it's
 * actually one METASHREW call per block per wallet across the whole
 * fleet).
 *
 * Migration note: `useWalletUtxoCache` and the existing
 * `useEnrichedWalletData` still work in parallel during the rollout.
 * Migrate consumers one at a time; the legacy hooks can be deleted
 * once nothing reads them.
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getWalletBalanceAddresses } from '@/queries/account';
import type { WalletState } from '@/lib/walletState/fetchWalletState';

export type { WalletState } from '@/lib/walletState/fetchWalletState';

export interface UseWalletStateResult {
  data: WalletState | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

async function fetchWalletStateRoute(
  network: string,
  addresses: string[],
): Promise<WalletState> {
  const params = new URLSearchParams({
    addresses: addresses.join(','),
    network,
  });
  const res = await fetch(`/api/wallet-state?${params.toString()}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`wallet-state HTTP ${res.status}`);
  }
  return (await res.json()) as WalletState;
}

export function useWalletState(): UseWalletStateResult {
  const { account, network, isConnected } = useWallet();
  const addresses = useMemo(() => {
    return getWalletBalanceAddresses(account).sort();
  }, [account]);
  const addressKey = addresses.join(',');
  const net = network || 'mainnet';

  const query = useQuery<WalletState>({
    queryKey: ['wallet-state', net, addressKey],
    enabled: isConnected && addresses.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () => fetchWalletStateRoute(net, addresses),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
