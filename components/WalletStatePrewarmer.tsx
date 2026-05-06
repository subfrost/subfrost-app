/**
 * Headless component — mounts the wallet UTXO cache + sync status
 * queries the moment the wallet connects, so by the time the user
 * clicks Swap / Send / Add Liquidity the data is already resolved.
 *
 * This is the consumer side of the "prefetch instead of fetch on
 * demand" architecture. The query options live in queries/account.ts
 * and are HeightPoller-invalidated like everything else.
 *
 * Mounted in providers.tsx alongside HeightPoller, INSIDE
 * WalletProvider so it has access to `useWallet()`.
 */

'use client';

import { useWalletUtxoCache, useSyncStatus } from '@/hooks/useWalletUtxoCache';

export function WalletStatePrewarmer() {
  // Just calling the hooks subscribes them — the queries fire as soon
  // as their `enabled` predicates pass (wallet connected, SDK ready).
  // Mutations consume the same caches via direct hook reads in their
  // own components, so no prop-drilling is needed here.
  useWalletUtxoCache();
  useSyncStatus();
  return null;
}
