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
 *
 * Ordinals (2026-05-15): also subscribes the ordinal-state prefetch
 * (`useOrdinalSkipOutpoints`) and mirrors its result into a module-level
 * store (`lib/alkanes/ordinalSkipStore`) that `alkanesExecuteTyped` reads
 * during PSBT construction. Per the e2e requirement: NO ord round-trip
 * happens at click time — the skip set is always populated ahead of time,
 * refreshed by HeightPoller per block.
 */

'use client';

import { useEffect } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useWalletUtxoCache, useSyncStatus } from '@/hooks/useWalletUtxoCache';
import { useOrdinalSkipOutpoints } from '@/hooks/useOrdinalSkipOutpoints';
import { setOrdinalSkipOutpoints } from '@/lib/alkanes/ordinalSkipStore';

export function WalletStatePrewarmer() {
  // Just calling the hooks subscribes them — the queries fire as soon
  // as their `enabled` predicates pass (wallet connected, SDK ready).
  // Mutations consume the same caches via direct hook reads in their
  // own components, so no prop-drilling is needed here.
  useWalletUtxoCache();
  useSyncStatus();

  const { network } = useWallet();
  const skipOutpoints = useOrdinalSkipOutpoints(network);
  useEffect(() => {
    setOrdinalSkipOutpoints(skipOutpoints);
  }, [skipOutpoints]);

  return null;
}
