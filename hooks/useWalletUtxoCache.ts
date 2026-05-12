/**
 * Pre-warmed wallet UTXO + alkane balance-sheet cache.
 *
 * What it is: a single TanStack Query, invalidated by HeightPoller on
 * every block-tip change, that owns the wallet's UTXO snapshot plus
 * per-outpoint alkane balance sheets. In ESPO mode this is one batched
 * `essentials.get_address_spendable_outpoints` call to Alkanode; in
 * Metashrew mode it falls back to `alkanes_protorunesbyoutpoint` for
 * every dust UTXO. Mounted
 * eagerly when the wallet connects via `<WalletStatePrewarmer/>` in
 * providers.tsx — by the time the user clicks Swap, the data is
 * already in cache and PSBT construction is synchronous.
 *
 * Why this is the right shape: alkane PSBT building doesn't need the
 * SDK's per-call fanout, it needs O(1) lookups for "which UTXOs carry
 * alkane X" and "what's the BTC balance available". The cache provides
 * both. The SDK's WASM `select_utxos` still does its own coin
 * selection — this layer feeds it the candidate set instead of making
 * the JS wrapper re-fetch every time.
 *
 * Reading on-demand at click time, especially for wallets with >100
 * UTXOs, was a real UX complaint (user feedback, 2026-05-05): each
 * `protorunesbyoutpoint` is ~50ms × N dust outputs = 5+ seconds
 * between click and signing popup. Prefetching cuts that to ~0.
 *
 * `protorunesbyaddress` is forbidden here too — same phantom-balance
 * bug as everywhere else. The fanout is per-outpoint by construction.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import {
  walletUtxoCacheQueryOptions,
  syncStatusQueryOptions,
  type WalletUtxoCache,
  type CachedUtxo,
  type SyncStatus,
} from '@/queries/account';

export type { WalletUtxoCache, CachedUtxo, SyncStatus };

/**
 * The prefetched snapshot. Returns the empty-cache placeholder
 * (`{utxos:[], byOutpoint:Map(), ...}`) until the first fetch
 * resolves — call sites can read fields without null-checking the
 * top-level result.
 */
export function useWalletUtxoCache(): WalletUtxoCache {
  const { account, network, isConnected } = useWallet();
  const { isInitialized } = useAlkanesSDK();
  const { data } = useQuery(
    walletUtxoCacheQueryOptions({
      network: network ?? 'mainnet',
      isInitialized,
      account,
      isConnected,
    }),
  );
  return data ?? {
    utxos: [],
    byOutpoint: new Map(),
    byAlkane: new Map(),
    balances: new Map(),
    height: 0,
  };
}

/**
 * Indexer-vs-bitcoind sync status. Used by mutation hooks as a
 * pre-flight gate — alkane operations refuse to submit while
 * `!inSync` because the SDK's broadcast path validates this and
 * errors with "Indexer sync timed out" otherwise. Surfacing it up
 * front gives the UI a chance to disable buttons / show "indexer
 * catching up…" instead of a mid-flight failure toast.
 */
export function useSyncStatus(): SyncStatus {
  const { network } = useWallet();
  const { data } = useQuery(syncStatusQueryOptions(network ?? 'mainnet'));
  return data ?? { metashrewHeight: 0, bitcoindHeight: 0, inSync: false, lag: 0 };
}

/**
 * Read-only convenience: candidate dust UTXOs that carry the given
 * alkane id. Used by mutation hooks to seed the SDK's `payment_utxos`
 * / `inputRequirements` arguments.
 */
export function useAlkaneUtxos(alkaneId: string | undefined): CachedUtxo[] {
  const cache = useWalletUtxoCache();
  if (!alkaneId) return [];
  return cache.byAlkane.get(alkaneId) ?? [];
}

/**
 * Read-only convenience: aggregated balance for a single alkane id.
 */
export function useAlkaneCachedBalance(alkaneId: string | undefined): bigint {
  const cache = useWalletUtxoCache();
  if (!alkaneId) return 0n;
  return cache.balances.get(alkaneId) ?? 0n;
}
