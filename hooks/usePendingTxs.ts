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
 * Phase 3-lite scope (what this hook predicts):
 *   - Edict-driven alkane deltas (alkane-send / transfer) are
 *     predicted deterministically by calling the SDK's
 *     `predictBalanceDelta` bridge with prevout context fetched
 *     from the Esplora proxy.
 *   - Tx with cellpack-bearing protostones (swaps, addLiquidity)
 *     report input-side losses and set
 *     `contractOutputsUncertain=true`; the UI shows "+? TOKEN
 *     pending" instead of a concrete number for the receive side.
 *   - Phase 3-full (deferred): fork state + run the alkane VM to
 *     predict exact swap output amounts.
 *
 *   - Does not replace the confirmed-balance source of truth.
 *     Optimistic state is layered on top, never instead of.
 */

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { pendingTxStore } from '@/lib/alkanes/pendingTxStore';

// Phase 3-lite: alkane delta prediction.
//
// For each pending tx we call the SDK's `predictBalanceDelta` JS
// bridge. It needs:
//   - tx hex (already in our store)
//   - prevout context (address + value per input) — fetched from the
//     Esplora proxy on demand and cached by react-query
//   - per-output decoded addresses (we already compute these here for
//     BTC delta)
//   - our addresses (taproot + segwit)
//
// The bridge reconstructs protostones from the tx OP_RETURN inside
// the WASM. For protostones with edicts only, we get accurate alkane
// deltas. For cellpack-bearing protostones (swaps, addLiquidity) it
// reports `contract_outputs_uncertain=true` and we surface that with
// a "+? TOKEN pending" affordance instead of a concrete number.

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
  /**
   * True if the tx has a cellpack-bearing protostone (swap, addLiquidity,
   * etc.). Phase 3-lite reports input-side losses but skips output-side
   * accounting since the contract decides those. UI surfaces this as
   * "+? TOKEN pending" instead of a hard number.
   */
  contractOutputsUncertain: boolean;
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
  /**
   * True if any pending tx flagged contract_outputs_uncertain. UI uses
   * this to switch from "+1000 DIESEL" to "+? DIESEL" labels.
   */
  contractOutputsUncertain: boolean;
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
  const { account, network } = useWallet();
  const { provider } = useAlkanesSDK();
  const queryClient = useQueryClient();

  const ourAddresses = useMemo(() => {
    const set = new Set<string>();
    if (account?.taproot?.address) set.add(account.taproot.address);
    if (account?.nativeSegwit?.address) set.add(account.nativeSegwit.address);
    return set;
  }, [account?.taproot?.address, account?.nativeSegwit?.address]);

  // Query both the IndexedDB store (cross-reload persistence — BTC
  // send mutation pushes here) and the WASM in-memory store (every
  // broadcast through `alkanesExecuteTyped` auto-pushes — wrap, swap,
  // addLiquidity, alkane-send, etc.). Merge + dedupe by txid.
  //
  // Then sweep: for every txid in the merged list, query the esplora
  // proxy for status. Drop+evict from IDB any tx that:
  //   - confirmed (chain says so), OR
  //   - returns 404 = not in mempool AND not in chain. This catches
  //     RBF-replaced txs (the bumped child evicted the original from
  //     mempool, original never confirms) AND failed-broadcast txs
  //     (UI showed "submitted" but the network never accepted it).
  // Without this sweep, each broadcast accumulates a stale entry forever
  // and the UI's "X pending" count diverges from on-chain reality.
  const { data, isLoading, refetch } = useQuery<string[]>({
    queryKey: ['pendingTxs', !!provider, network],
    enabled: typeof window !== 'undefined' && ourAddresses.size > 0,
    queryFn: async () => {
      const seen = new Set<string>();
      const merged: { txid: string; hex: string }[] = [];
      try {
        const idbList = await pendingTxStore.list();
        for (const hex of idbList) {
          try {
            const txid = bitcoin.Transaction.fromHex(hex).getId();
            if (!seen.has(txid)) {
              seen.add(txid);
              merged.push({ txid, hex });
            }
          } catch {
            /* skip malformed */
          }
        }
      } catch (e) {
        console.warn('[usePendingTxs] idb list failed:', e);
      }
      if (provider && typeof (provider as any).pendingTxStoreList === 'function') {
        try {
          const wasmList = await (provider as any).pendingTxStoreList();
          if (Array.isArray(wasmList)) {
            for (const hex of wasmList) {
              if (typeof hex !== 'string') continue;
              try {
                const txid = bitcoin.Transaction.fromHex(hex).getId();
                if (!seen.has(txid)) {
                  seen.add(txid);
                  merged.push({ txid, hex });
                }
              } catch {
                /* skip malformed */
              }
            }
          }
        } catch (e) {
          console.warn('[usePendingTxs] wasm list failed:', e);
        }
      }

      // Eviction sweep — chain check + IDB prune.
      const networkArg = network ?? 'mainnet';
      const aliveHexes: string[] = [];
      const toEvict: string[] = [];
      await Promise.all(
        merged.map(async ({ txid, hex }) => {
          try {
            const r = await fetch(
              `/api/esplora/tx/${txid}/status?network=${encodeURIComponent(networkArg)}`,
            );
            if (r.status === 404) {
              // Not in mempool, not in a block → RBF-replaced or
              // never-broadcast. Evict.
              toEvict.push(txid);
              return;
            }
            if (!r.ok) {
              // Indexer error (e.g. esplora 5xx mid-outage) — be
              // CONSERVATIVE and keep the entry. The next sweep will
              // re-check; better a temporary stale entry than to
              // wrongly evict a real pending tx.
              aliveHexes.push(hex);
              return;
            }
            const status = await r.json();
            if (status?.confirmed === true) {
              toEvict.push(txid);
              return;
            }
            // Still in mempool, unconfirmed → keep.
            aliveHexes.push(hex);
          } catch {
            // Network/parse failure — same conservative path.
            aliveHexes.push(hex);
          }
        }),
      );
      if (toEvict.length > 0) {
        try {
          await pendingTxStore.evict(toEvict);
        } catch (e) {
          console.warn('[usePendingTxs] idb evict failed:', e);
        }
        // Also evict from the WASM in-memory pending store, otherwise
        // pendingTxStoreList() re-surfaces the same txids on every poll
        // and the HUD count never goes to zero. The HUD reads from this
        // hook, but the wallet history page's row list is driven by
        // /esplora — that's why the discrepancy "HUD says 1, history
        // says 0" appears: the WASM store keeps emitting a phantom.
        if (provider && typeof (provider as any).pendingTxStoreEvict === 'function') {
          try {
            await (provider as any).pendingTxStoreEvict(toEvict);
          } catch (e) {
            console.warn('[usePendingTxs] wasm evict failed:', e);
          }
        }
        console.log(
          `[usePendingTxs] evicted ${toEvict.length} stale pending tx(s):`,
          toEvict,
        );
      }
      return aliveHexes;
    },
    staleTime: 5_000, // re-poll occasionally so newly-broadcast WASM-side txs surface
    refetchInterval: 8_000,
    refetchOnWindowFocus: false,
  });

  // BTC-side summary (output-only — see decodeHex docs).
  const baseSummaries = useMemo<PendingTxSummary[]>(() => {
    if (!data) return [];
    return data
      .map((hex) => decodeHex(hex, ourAddresses))
      .filter((s): s is PendingTxSummary => s !== null);
  }, [data, ourAddresses]);

  // Phase 3-lite alkane prediction. Calls the SDK's
  // `predictBalanceDelta` JS bridge for each pending tx. Cached by
  // (txid, ourAddresses) so we don't re-fetch prevouts on every render.
  const ourAddressList = useMemo(() => [...ourAddresses].sort(), [ourAddresses]);
  const { data: predictions } = useQuery<Map<string, PredictResult>>({
    queryKey: ['pendingTxsPredict', baseSummaries.map((s) => s.txid).sort(), ourAddressList, network],
    enabled:
      typeof window !== 'undefined' &&
      provider != null &&
      baseSummaries.length > 0 &&
      ourAddressList.length > 0,
    queryFn: async () => {
      const out = new Map<string, PredictResult>();
      for (const s of baseSummaries) {
        try {
          const result = await predictForTx(s.hex, ourAddressList, network ?? 'mainnet', provider);
          if (result) out.set(s.txid, result);
        } catch (e) {
          console.warn('[usePendingTxs] predict failed for', s.txid, e);
        }
      }
      return out;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Merge the BTC-side summary with the alkane prediction.
  // The predict bridge gives an INPUT-AWARE BTC delta (subtracts our
  // inputs by their prevout values). decodeHex's output-only delta
  // is left as a transitional fallback for txs whose predict result
  // hasn't loaded yet (e.g. during the prevout fetch round-trip).
  const summaries = useMemo<PendingTxSummary[]>(() => {
    return baseSummaries.map((s) => {
      const pred = predictions?.get(s.txid);
      if (!pred) return s;
      return {
        ...s,
        btcDelta: pred.btcDeltaFromPredict,
        alkaneDeltas: pred.alkanes,
        contractOutputsUncertain: pred.uncertain,
      };
    });
  }, [baseSummaries, predictions]);

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

  const contractOutputsUncertain = useMemo(
    () => summaries.some((s) => s.contractOutputsUncertain),
    [summaries],
  );

  // Re-export refetch so callers can force-invalidate after manual
  // broadcasts. The HeightPoller already invalidates on tip change;
  // explicit refetch is for the broadcast path.
  const stableRefetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pendingTxs'] });
    queryClient.invalidateQueries({ queryKey: ['pendingTxsPredict'] });
  }, [queryClient]);

  return {
    pendingTxs: summaries,
    btcDelta,
    alkaneDeltas,
    contractOutputsUncertain,
    isLoading,
    refetch: stableRefetch,
  };
}

// ---------------------------------------------------------------------------
// Predict bridge — SDK call + prevout fetch helpers.
// ---------------------------------------------------------------------------

interface PredictResult {
  alkanes: AlkaneDelta[];
  uncertain: boolean;
  btcDeltaFromPredict: bigint;
}

interface ProviderLike {
  predictBalanceDelta(
    txHex: string,
    prevoutLookupsJson: string,
    outputAddressesJson: string,
    ourAddressesJson: string,
  ): Promise<unknown>;
}

async function predictForTx(
  hex: string,
  ourAddresses: string[],
  network: string,
  provider: unknown,
): Promise<PredictResult | null> {
  if (!provider || typeof (provider as ProviderLike).predictBalanceDelta !== 'function') {
    return null;
  }

  let tx: bitcoin.Transaction;
  try {
    tx = bitcoin.Transaction.fromHex(hex);
  } catch {
    return null;
  }

  // Resolve each input's prevout (txid:vout → address+value) via the
  // esplora proxy. We only care about the inputs that pay one of OUR
  // addresses — those are the ones that contribute to the BTC delta
  // and carry alkanes we owned. For inputs we don't own, we still
  // need to NOT subtract them from our balance, so a missing entry
  // is the safe default (predict treats missing prevout as foreign).
  const prevoutLookups: PrevoutLookup[] = [];
  await Promise.all(
    tx.ins.map(async (input) => {
      const prevTxid = Buffer.from(input.hash).reverse().toString('hex');
      try {
        const res = await fetch(
          `/api/esplora/tx/${prevTxid}?network=${encodeURIComponent(network)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        const prevout = json?.vout?.[input.index];
        if (!prevout?.scriptpubkey_address) return;
        prevoutLookups.push({
          txid: prevTxid,
          vout: input.index,
          address: prevout.scriptpubkey_address,
          value_sats: prevout.value,
          alkane_balances: [],
        });
      } catch {
        /* skip — predict treats as foreign */
      }
    }),
  );

  const outputAddresses: (string | null)[] = tx.outs.map((o) => scriptToAddress(o.script));

  const raw = await (provider as ProviderLike).predictBalanceDelta(
    hex,
    JSON.stringify(prevoutLookups),
    JSON.stringify(outputAddresses),
    JSON.stringify(ourAddresses),
  );

  const parsed = parsePredictResult(raw);
  return parsed;
}

interface PrevoutLookup {
  txid: string;
  vout: number;
  address: string;
  value_sats: number;
  alkane_balances: { block: number; tx: number; amount: string }[];
}

/**
 * Parse the raw JS object the WASM bridge returns. Shape:
 *   {btc:{delta_sats:string|number},
 *    alkanes:[{alkane_id:{block,tx}, delta:string}],
 *    contract_outputs_uncertain:bool}
 *
 * Numbers may arrive as strings (i128 via serde_wasm_bindgen). We
 * normalize to bigint here.
 */
export function parsePredictResult(raw: unknown): PredictResult {
  const r = raw as {
    btc?: { delta_sats?: string | number };
    alkanes?: { alkane_id?: { block?: string | number; tx?: string | number }; delta?: string | number }[];
    contract_outputs_uncertain?: boolean;
  };
  const alkanes: AlkaneDelta[] = (r?.alkanes ?? []).map((a) => ({
    alkaneId: {
      block: String(a.alkane_id?.block ?? '0'),
      tx: String(a.alkane_id?.tx ?? '0'),
    },
    delta: BigInt(a.delta ?? 0),
  }));
  return {
    alkanes,
    uncertain: !!r?.contract_outputs_uncertain,
    btcDeltaFromPredict: BigInt(r?.btc?.delta_sats ?? 0),
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
    contractOutputsUncertain: false,
    hex: txHex,
  };
  return summary;
}
