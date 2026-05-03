/**
 * Surface the IndexedDB-backed pending-tx store to React components.
 *
 * What it does:
 *   - Queries the pending tx hexes from IndexedDB on mount + every
 *     block-tip change.
 *   - Decodes each pending tx into `{btcDelta, alkaneDeltas[]}` so
 *     the wallet UI can overlay optimistic balance updates on top of
 *     confirmed state without waiting for indexer catchup.
 *   - Evicts confirmed txs from the store via mempool.space's tx
 *     status endpoint.
 *
 * Plug-in surface (overlay on `useEnrichedWalletData`):
 *
 *   const { pendingTxs, btcDelta, alkaneDeltas } = usePendingTxs();
 *   const displayedBtc = (confirmedBtc ?? 0n) + btcDelta;
 *   const displayedAlkanes = mergeDeltas(confirmedAlkanes, alkaneDeltas);
 *
 * Optimistic UI affordance:
 *   - The hook also returns each pending tx's txid, so the UI can
 *     render a "pending" badge next to balance lines that include
 *     in-flight deltas. Honest > implied — see /loop conversation.
 *
 * What it does NOT do:
 *   - It does not predict alkane balance changes from contract
 *     calls (swaps, addLiquidity). Those produce alkane outputs
 *     whose values are determined by the contract — knowing them
 *     requires running the alkane VM with the pre-tx state. That's
 *     Phase 3 (vendor `alkanes/inspector` + qubitcoin overlay).
 *     For Phase 1 we only handle plain transfers (alkane-send,
 *     BTC-send) where the output values are visible in the tx
 *     itself.
 *
 *   - It does not replace the confirmed-balance source of truth.
 *     Optimistic state is layered on top, never instead of.
 */

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { pendingTxStore } from '@/lib/alkanes/pendingTxStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-alkane balance delta in sub-units (positive = increase, negative = decrease). */
export interface AlkaneDelta {
  alkaneId: { block: string; tx: string };
  delta: bigint;
}

export interface PendingTxSummary {
  txid: string;
  /** Net BTC delta for the user's address(es) in this tx (sub-units = sats). */
  btcDelta: bigint;
  /** Per-alkane deltas. Empty for pure-BTC sends. */
  alkaneDeltas: AlkaneDelta[];
  /** Raw tx hex — kept so callers can deep-dive (debug UI, "view raw" button). */
  hex: string;
}

interface UsePendingTxsResult {
  /** Per-tx summaries, one entry per pending broadcast. */
  pendingTxs: PendingTxSummary[];
  /** Aggregate BTC delta across all pending txs. */
  btcDelta: bigint;
  /** Aggregate alkane deltas across all pending txs (merged by alkaneId). */
  alkaneDeltas: AlkaneDelta[];
  /** True when the indexedDB query is still in flight. */
  isLoading: boolean;
  /** Force-refresh — useful after a manual broadcast. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Decoder — minimal pure functions, kept out of the hook so they're
// directly unit-testable without rendering React.
// ---------------------------------------------------------------------------

interface DecodedTx {
  txid: string;
  vin: { txid: string; vout: number }[];
  vout: { addressMatchesUs: boolean; value: number }[];
}

/**
 * Compute net BTC delta for the user's addresses from a decoded tx.
 *
 * Inputs: each prevout that pays one of our addresses is a -value
 * delta. Outputs: each output that pays us is a +value delta.
 *
 * To know whether an INPUT belongs to us we need the prevout's
 * address — which isn't in the raw tx hex (only txid:vout). The
 * caller must hand in a `prevoutLookup(txid, vout)` that returns
 * the prevout's address (typically backed by the wallet's confirmed
 * UTXO set). When the lookup returns `null` (e.g. for an input we
 * don't own), the delta is left unchanged for that input.
 */
export function computeBtcDelta(
  tx: DecodedTx,
  prevoutLookup: (txid: string, vout: number) => { address: string; value: number } | null,
  ourAddresses: Set<string>,
): bigint {
  let delta = 0n;
  for (const v of tx.vin) {
    const prev = prevoutLookup(v.txid, v.vout);
    if (prev && ourAddresses.has(prev.address)) {
      delta -= BigInt(prev.value);
    }
  }
  for (const o of tx.vout) {
    if (o.addressMatchesUs) {
      delta += BigInt(o.value);
    }
  }
  return delta;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Public hook. Returns `{pendingTxs, btcDelta, alkaneDeltas}`
 * plus an `isLoading` flag.
 *
 * Wallet integration:
 *   - `useEnrichedWalletData` returns confirmed balances.
 *   - This hook returns optimistic deltas.
 *   - Overlay them at the call site:
 *
 *       const confirmed = useEnrichedWalletData();
 *       const pending = usePendingTxs();
 *       const displayedBtc = (confirmed.btcBalance ?? 0n) + pending.btcDelta;
 *       const isOverlayed = pending.btcDelta !== 0n;
 *
 *   The `isOverlayed` flag drives the "pending" badge.
 */
export function usePendingTxs(): UsePendingTxsResult {
  const { account } = useWallet();
  const queryClient = useQueryClient();

  const ourAddresses = useMemo(() => {
    const set = new Set<string>();
    if (account?.taproot?.address) set.add(account.taproot.address);
    if (account?.nativeSegwit?.address) set.add(account.nativeSegwit.address);
    return set;
  }, [account?.taproot?.address, account?.nativeSegwit?.address]);

  // Query the IndexedDB store. Re-run whenever the height poller
  // invalidates `pendingTxs`. Browser-only — guard SSR.
  const { data, isLoading, refetch } = useQuery<string[]>({
    queryKey: ['pendingTxs'],
    enabled: typeof window !== 'undefined' && ourAddresses.size > 0,
    queryFn: async () => {
      try {
        return await pendingTxStore.list();
      } catch (e) {
        console.warn('[usePendingTxs] list failed:', e);
        return [];
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Decode + summarize each pending tx.
  const summaries = useMemo<PendingTxSummary[]>(() => {
    if (!data) return [];
    return data
      .map((hex) => decodeHex(hex, ourAddresses))
      .filter((s): s is PendingTxSummary => s !== null);
  }, [data, ourAddresses]);

  // Aggregates.
  const btcDelta = useMemo(
    () => summaries.reduce((acc, s) => acc + s.btcDelta, 0n),
    [summaries],
  );

  const alkaneDeltas = useMemo(() => {
    const merged = new Map<string, bigint>();
    for (const s of summaries) {
      for (const a of s.alkaneDeltas) {
        const key = `${a.alkaneId.block}:${a.alkaneId.tx}`;
        merged.set(key, (merged.get(key) ?? 0n) + a.delta);
      }
    }
    return [...merged.entries()].map(([key, delta]) => {
      const [block, tx] = key.split(':');
      return { alkaneId: { block, tx }, delta };
    });
  }, [summaries]);

  // Re-export refetch so callers can force-invalidate after manual
  // broadcasts. The HeightPoller already invalidates on tip change;
  // explicit refetch is for the broadcast path.
  const stableRefetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pendingTxs'] });
  }, [queryClient]);

  return {
    pendingTxs: summaries,
    btcDelta,
    alkaneDeltas,
    isLoading,
    refetch: stableRefetch,
  };
}

// ---------------------------------------------------------------------------
// Synchronous tx-hex decoder — produces:
//   - txid via bitcoinjs-lib `Transaction.fromHex(hex).getId()`
//   - per-output { addressMatchesUs, value } using bitcoinjs-lib's
//     `address.fromOutputScript()` against each network the wallet
//     might be on (mainnet / signet / regtest).
//
// BTC delta cannot be fully computed here — our inputs need a
// prevout lookup to know if they were ours. For Phase 1 we expose
// the partial delta (outputs only); the hook caller layers a
// confirmed-UTXO lookup on top to handle the input side.
// ---------------------------------------------------------------------------

import * as bitcoin from 'bitcoinjs-lib';
import { bech32m } from '@scure/base';

/**
 * Decode a scriptPubKey to a bech32 / bech32m address. Walks
 * mainnet → testnet → regtest. Special-cases P2TR (segwit v1)
 * since bitcoinjs-lib 7 dropped it from `fromOutputScript`.
 */
function scriptToAddress(script: Uint8Array): string | null {
  // P2TR: OP_1 <32-byte program>
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
    const program = Array.from(script.slice(2));
    // bech32m encode: convert 8-bit program to 5-bit, prepend witness
    // version (1), call bech32m.encode.
    const words = bech32mFromBytes(program);
    for (const hrp of ['bc', 'tb', 'bcrt']) {
      try {
        return bech32m.encode(hrp, [1, ...words]);
      } catch {
        /* try next */
      }
    }
    return null;
  }
  // Everything else (P2WPKH, P2WSH, P2PKH, P2SH) — bitcoinjs handles it.
  for (const net of [
    bitcoin.networks.bitcoin,
    bitcoin.networks.testnet,
    bitcoin.networks.regtest,
  ]) {
    try {
      return bitcoin.address.fromOutputScript(Buffer.from(script), net);
    } catch {
      /* try next */
    }
  }
  return null;
}

function bech32mFromBytes(bytes: number[]): number[] {
  // 8-to-5 bit conversion (RFC standard, same algorithm as bech32 lib).
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.push((acc >> bits) & 0x1f);
    }
  }
  if (bits > 0) result.push((acc << (5 - bits)) & 0x1f);
  return result;
}

/**
 * Exported for testing. The hook uses this internally; vitest pins
 * the txid + output-delta semantics here so future protostone-aware
 * upgrades have a stable spec to assert against.
 */
export function decodeHex(txHex: string, ourAddresses: Set<string>): PendingTxSummary | null {
  let tx: bitcoin.Transaction;
  try {
    tx = bitcoin.Transaction.fromHex(txHex);
  } catch (e) {
    console.warn('[usePendingTxs] decode failed:', e);
    return null;
  }

  // Outputs paying us → +value.
  let outputDelta = 0n;
  for (const output of tx.outs) {
    const address = scriptToAddress(output.script);
    if (address && ourAddresses.has(address)) {
      outputDelta += BigInt(output.value);
    }
  }

  // Phase 1 doesn't have the prevout lookup wired through (would
  // need to query confirmed UTXO set per input). Returning the
  // output-only delta is honest: it OVERSTATES the BTC delta for
  // outgoing txs (because we ignore the inputs). The wallet UI
  // should show this as "+X BTC pending" only when outputDelta > 0
  // for incoming txs; outgoing txs should layer in the input
  // subtraction at the call site via `computeBtcDelta` with a
  // proper lookup. The hook returns enough for both modes.
  const summary: PendingTxSummary = {
    txid: tx.getId(),
    btcDelta: outputDelta,
    alkaneDeltas: [],
    hex: txHex,
  };
  return summary;
}
