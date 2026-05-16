/**
 * Pre-warmed wallet UTXO + alkane balance-sheet cache.
 *
 * Reroute (2026-05-16): this hook is now a thin adapter on top of
 * `useWalletState()`. The legacy `walletUtxoCacheQueryOptions` query
 * (with its own RPC fan-out via the convenience `alkanes_protorunesbyoutpoint`
 * wrapper) is replaced by the server-side `/api/wallet-state` route that:
 *   - uses the canonical `metashrew_view protorunesbyoutpoint` primitive
 *     (the legacy wrapper is "Method not found" on the in-cluster jsonrpc
 *     upstream — subfrost-mobile fixed the same bug 2026-05-11)
 *   - pins every per-outpoint read to the snapshot's tip-hash so the
 *     fan-out is reorg-safe by construction
 *   - is Redis-cached server-side so cold hits land sub-second
 *   - height-annotates every UTXO so callers can refuse to spend
 *     metashrew-unindexed outpoints via `filterMetashrewSafe`
 *
 * The 9 mutation hooks (useSwapMutation, useAddLiquidityMutation, etc.)
 * call this hook to seed their `cachedUtxos` payload into
 * `alkanesExecuteTyped`. Routing them through `useWalletState` means
 * they all get the canonical/height-annotated cache for free — no
 * per-hook code change.
 *
 * Public API preserved 1:1 — same `WalletUtxoCache` shape, same
 * `useAlkaneUtxos` + `useAlkaneCachedBalance` helpers, same `useSyncStatus`.
 * Re-exports the types so existing imports keep working.
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import {
  syncStatusQueryOptions,
  type WalletUtxoCache,
  type CachedUtxo,
  type SyncStatus,
} from '@/queries/account';
import { useWalletState } from '@/hooks/useWalletState';
import type { WalletState, WalletUtxo } from '@/lib/walletState/fetchWalletState';

export type { WalletUtxoCache, CachedUtxo, SyncStatus };

const EMPTY_CACHE: WalletUtxoCache = {
  utxos: [],
  byOutpoint: new Map(),
  byAlkane: new Map(),
  balances: new Map(),
  height: 0,
};

/**
 * Convert a `WalletState` snapshot (from the new `/api/wallet-state`
 * route) into the `WalletUtxoCache` shape mutation hooks have always
 * consumed. The two shapes differ in two places:
 *
 *   - alkane `amount`: `string` in WalletState (JSON-round-trip safe
 *     for DIESEL-scale > 2^53), `bigint` in WalletUtxoCache (load-bearing
 *     for the byAlkane index + balance aggregation arithmetic the
 *     mutation hooks already do)
 *   - WalletState carries `blockHeight` + `confirmations` per UTXO;
 *     CachedUtxo carries an optional `blockHeight` field — preserved
 *
 * The derived indexes (`byOutpoint`, `byAlkane`, `balances`) are
 * recomputed in TS — these were already in-process and never RPC'd.
 */
export function walletStateToCache(state: WalletState | null): WalletUtxoCache {
  if (!state || state.utxos.length === 0) {
    return state
      ? { ...EMPTY_CACHE, height: state.metashrewHeight }
      : EMPTY_CACHE;
  }

  const utxos: CachedUtxo[] = state.utxos.map((u: WalletUtxo) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    address: u.address,
    scriptPubKeyHex: u.scriptPubKeyHex,
    blockHeight: u.blockHeight,
    confirmations: u.confirmations,
    runes: [],
    alkanes: u.alkanes.map((a) => ({
      block: a.block,
      tx: a.tx,
      amount: BigInt(a.amount),
    })),
  }));

  const byOutpoint = new Map<string, CachedUtxo>();
  const byAlkane = new Map<string, CachedUtxo[]>();
  const balances = new Map<string, bigint>();

  for (const u of utxos) {
    byOutpoint.set(`${u.txid}:${u.vout}`, u);
    for (const a of u.alkanes) {
      const id = `${a.block}:${a.tx}`;
      if (!byAlkane.has(id)) byAlkane.set(id, []);
      byAlkane.get(id)!.push(u);
      balances.set(id, (balances.get(id) ?? 0n) + a.amount);
    }
  }

  return {
    utxos,
    byOutpoint,
    byAlkane,
    balances,
    height: state.metashrewHeight,
  };
}

/**
 * The prefetched UTXO snapshot — adapter shape over `useWalletState`.
 * Returns the empty placeholder until the wallet-state query resolves
 * so call sites can read fields without null-checking the top level.
 */
export function useWalletUtxoCache(): WalletUtxoCache {
  const { data: state } = useWalletState();
  return useMemo(() => walletStateToCache(state), [state]);
}

/**
 * Indexer-vs-bitcoind sync status. Unchanged — this query was always
 * independent of the wallet UTXO cache.
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
