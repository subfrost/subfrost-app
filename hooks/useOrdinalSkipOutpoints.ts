/**
 * Frontend prefetch hook — returns the list of "known clean" outpoints
 * (no inscriptions, no runes) that the alkanes-rs SDK should skip its
 * own unisat-ord round-trip for.
 *
 * Flow:
 *   1. Read wallet UTXO cache (prewarmed on connect via useWalletUtxoCache).
 *   2. Filter to dust (≤1000 sats) — only dust can carry inscriptions/runes.
 *   3. Batch-POST those outpoints to /api/ord/outputs (proxied unisat-ord).
 *   4. Derive subset with empty `inscriptions` + empty `runes` → return as
 *      `string[]` of "txid:vout".
 *
 * Consumed by `WalletContext.txContext.skipOutpoints` so every mutation
 * picks it up without per-hook plumbing. Fallback when the backend is
 * unavailable: empty array — SDK falls back to per-UTXO ord queries
 * (still correct, just slower).
 *
 * Devnet / regtest / local networks have no ord backend wired up; the
 * query is disabled there.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  deriveCleanOutpoints,
  ordinalStateQueryOptions,
} from '@/queries/ordinalState';
import { useWalletUtxoCache } from './useWalletUtxoCache';

const ORD_ENABLED_NETWORKS = new Set(['mainnet']);

/**
 * `network` is passed as a param (rather than read via `useWallet()`) so the
 * hook can be safely called from inside WalletProvider's render body — calling
 * `useWallet()` there would read the unmounted default context, not the
 * locally-being-computed state.
 */
export function useOrdinalSkipOutpoints(network: string | undefined | null): string[] {
  const cache = useWalletUtxoCache();
  const net = network ?? 'mainnet';

  // Dust UTXOs are the only candidates for inscriptions/runes; bypassing the
  // ord query on non-dust BTC UTXOs avoids burning quota on cache misses.
  const dustOutpoints = useMemo(() => {
    if (!ORD_ENABLED_NETWORKS.has(net)) return [];
    return cache.utxos
      .filter((u) => u.value <= 1000)
      .map((u) => `${u.txid}:${u.vout}`);
  }, [cache.utxos, net]);

  const { data } = useQuery(
    ordinalStateQueryOptions({
      network: net,
      outpoints: dustOutpoints,
      enabled: ORD_ENABLED_NETWORKS.has(net),
    }),
  );

  return useMemo(
    () => deriveCleanOutpoints(dustOutpoints, data),
    [dustOutpoints, data],
  );
}
