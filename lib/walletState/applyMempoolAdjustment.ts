/**
 * Pending-tx-aware UTXO adjustment.
 *
 * Ports `subfrost-mobile-core::pending::apply_mempool_adjustment`
 * (crates/subfrost-mobile-core/src/pending.rs:115-202) to the
 * subfrost-app server-side `WalletState` shape.
 *
 * Closes the chain-spend gap on the wallet's broadcast-but-unconfirmed
 * outputs:
 *
 *   - Strip every confirmed UTXO at a prevout consumed by a pending
 *     mempool tx — otherwise the next tx we build re-picks that prevout
 *     and bitcoind rejects it with `bad-txns-spends-conflicting-tx`.
 *   - Add every pending output paying one of our addresses as a fresh
 *     unconfirmed spendable UTXO so the user can chain wrap → swap →
 *     send without waiting for the indexer.
 *
 * Load-bearing safety invariant: every pending-output UTXO MUST carry
 * `alkanes: []`. We never trust mempool alkane provenance — the
 * protorune state for an unconfirmed output isn't authoritative until
 * the indexer has actually processed the protostones in the block that
 * contains it. The matching Rust comment is at pending.rs:182.
 *
 * The SDK already consumes pending tx hexes via
 * `options.known_pending_tx_hexes` (the FILTER half — strips prevouts
 * spent by our own mempool txs from coin selection). This module
 * complements that by ADDING the chained outputs back as spendable
 * BTC — the half the SDK can't do on its own because it doesn't know
 * which addresses are ours.
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { WalletUtxo } from './fetchWalletState';
import type { PendingTxStore } from './pendingTxStorePort';

/**
 * Esplora-shaped mempool payload — the subset of fields
 * `apply_mempool_adjustment` actually consumes. Matches the JSON
 * envelope that `decodeTxHexToMempoolPayload` produces, AND the
 * shape `esplora_address::txs:mempool` returns from the upstream
 * indexer.
 */
export interface MempoolTxPayload {
  txid: string;
  vin: Array<{ txid: string; vout: number }>;
  vout: Array<{
    vout: number;
    value: number;
    scriptpubkey: string;
    scriptpubkey_address: string | null;
  }>;
}

export interface MempoolAdjustmentReport {
  /** Confirmed UTXOs removed because they're spent by a pending tx. */
  stripped: number;
  /** New unconfirmed outputs added because they pay one of our addresses. */
  added: number;
}

export interface MempoolAdjustmentResult {
  utxos: WalletUtxo[];
  report: MempoolAdjustmentReport;
}

/** Map our supported network names → bitcoinjs network constants. */
function networkFromName(
  network: 'mainnet' | 'signet' | 'regtest',
): bitcoin.Network {
  switch (network) {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'signet':
    case 'regtest':
      // bitcoinjs-lib's `testnet` covers signet HRPs (tb1...);
      // for regtest we use the dedicated regtest network so bcrt1...
      // addresses round-trip correctly. The caller passes the bare
      // word so signet vs testnet doesn't matter at the UTXO layer
      // (both produce tb1... outputs).
      return network === 'regtest'
        ? bitcoin.networks.regtest
        : bitcoin.networks.testnet;
  }
}

/**
 * Decode a raw broadcast tx hex into the same envelope shape
 * `esplora_address::txs:mempool` produces. Used as the input to
 * `applyMempoolAdjustment`.
 *
 * Mirrors `decode_tx_hex_to_mempool_json` from
 * subfrost-mobile-core::pending (pending.rs:52-84). Output addresses
 * are derived via `bitcoin.address.fromOutputScript`; OP_RETURN and
 * other non-standard scripts that can't be coerced to an address
 * become `scriptpubkey_address: null` and are skipped by the
 * adjustment.
 *
 * Throws on invalid hex / undecodable tx. Callers that consume from
 * the IndexedDB store (`withPendingAdjustment`) catch + warn so one
 * malformed entry can't poison the whole report.
 */
export function decodeTxHexToMempoolPayload(
  txHex: string,
  network: 'mainnet' | 'signet' | 'regtest',
): MempoolTxPayload {
  const cleanHex = txHex.startsWith('0x') ? txHex.slice(2) : txHex;
  const tx = bitcoin.Transaction.fromHex(cleanHex);
  const btcNetwork = networkFromName(network);

  const vin = tx.ins.map((input) => ({
    txid: Buffer.from(input.hash).reverse().toString('hex'),
    vout: input.index,
  }));

  const vout = tx.outs.map((output, idx) => {
    let addr: string | null = null;
    try {
      addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
    } catch {
      // OP_RETURN, P2PK, malformed — leave null and the adjustment
      // step skips this output.
    }
    // bitcoinjs-lib v7 returns `bigint` for Transaction output values;
    // narrow to `number` here so the `WalletUtxo.value: number`
    // contract holds. UTXO values in sats fit comfortably in 53 bits
    // (max bitcoin supply is ~21e14 sats), so the Number() coercion
    // is lossless for any real value.
    const value =
      typeof output.value === 'bigint' ? Number(output.value) : output.value;
    return {
      vout: idx,
      value,
      scriptpubkey: Buffer.from(output.script).toString('hex'),
      scriptpubkey_address: addr,
    };
  });

  return {
    txid: tx.getId(),
    vin,
    vout,
  };
}

/**
 * Two-pass adjustment over a confirmed UTXO set:
 *
 *   1. Collect every prevout consumed by any pending tx; strip
 *      matching entries from `spendable`.
 *   2. Collect every pending output paying one of `addresses`; append
 *      as fresh `WalletUtxo` entries with `confirmations: 0`,
 *      `blockHeight: null`, `alkanes: []`, `isPending: true`.
 *
 * Returns a NEW list (does not mutate the input) plus a report so
 * callers can log the stripped/added counts without re-walking.
 *
 * Each `mempoolPayloads[i]` may be either:
 *   - A single `MempoolTxPayload` object, or
 *   - An array of `MempoolTxPayload` objects (matches the
 *     `esplora_address::txs:mempool` response shape).
 *
 * Non-object / non-array entries are silently skipped — the function
 * is total and tolerant.
 */
export function applyMempoolAdjustment(
  spendable: WalletUtxo[],
  mempoolPayloads: unknown[],
  addresses: Set<string>,
): MempoolAdjustmentResult {
  const spentOutpoints = new Set<string>();
  const newOutputs: WalletUtxo[] = [];

  for (const payload of mempoolPayloads) {
    const txs = normalizePayload(payload);
    if (!txs) continue;

    for (const tx of txs) {
      if (!tx || typeof tx !== 'object') continue;
      const candidate = tx as Partial<MempoolTxPayload>;
      const txid = typeof candidate.txid === 'string' ? candidate.txid : '';
      if (!txid) continue;

      // (1) Inputs — every prevout this tx spends becomes off-limits.
      if (Array.isArray(candidate.vin)) {
        for (const vin of candidate.vin) {
          if (!vin || typeof vin !== 'object') continue;
          const prevTxid = typeof vin.txid === 'string' ? vin.txid : '';
          const prevVout =
            typeof vin.vout === 'number' && Number.isFinite(vin.vout)
              ? vin.vout
              : -1;
          if (prevTxid && prevVout >= 0) {
            spentOutpoints.add(`${prevTxid}:${prevVout}`);
          }
        }
      }

      // (2) Outputs — every output paying one of our addresses becomes
      //     a candidate UTXO (unconfirmed, alkanes: []).
      if (Array.isArray(candidate.vout)) {
        for (let idx = 0; idx < candidate.vout.length; idx++) {
          const out = candidate.vout[idx];
          if (!out || typeof out !== 'object') continue;
          const addr =
            typeof out.scriptpubkey_address === 'string'
              ? out.scriptpubkey_address
              : null;
          if (!addr || !addresses.has(addr)) continue;
          const value =
            typeof out.value === 'number' && Number.isFinite(out.value)
              ? out.value
              : 0;
          if (value <= 0) continue; // OP_RETURN-shaped / zero-value
          const spk =
            typeof out.scriptpubkey === 'string' ? out.scriptpubkey : undefined;

          newOutputs.push({
            txid,
            // out.vout may be present from esplora; trust the array
            // position as the canonical index either way (esplora
            // returns vouts in order).
            vout: idx,
            value,
            address: addr,
            scriptPubKeyHex: spk,
            blockHeight: null,
            confirmations: 0,
            // ⚠️ Load-bearing: alkane provenance for unconfirmed
            // outputs is NEVER trusted at this layer. Even a
            // dust-shaped output stays `alkanes: []` until the
            // indexer has actually processed the protostones.
            alkanes: [],
            isPending: true,
          });
        }
      }
    }
  }

  const beforeLen = spendable.length;
  const filtered = spendable.filter(
    (u) => !spentOutpoints.has(`${u.txid}:${u.vout}`),
  );
  const stripped = beforeLen - filtered.length;
  const utxos = filtered.concat(newOutputs);

  return {
    utxos,
    report: { stripped, added: newOutputs.length },
  };
}

/** Normalise a payload entry to a homogeneous array of tx objects. */
function normalizePayload(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') return [payload];
  return null;
}

/**
 * One-shot helper: load every pending tx hex from `store`, decode each
 * into a `MempoolTxPayload`, and apply the adjustment.
 *
 * Tolerates malformed hex entries (skip + warn) so a single bad blob
 * in IndexedDB can't poison the rest of the adjustment. Matches the
 * Rust `with_pending_adjustment` semantics (pending.rs:212-233).
 */
export async function withPendingAdjustment(
  confirmed: WalletUtxo[],
  addresses: string[],
  network: 'mainnet' | 'signet' | 'regtest',
  store: PendingTxStore,
): Promise<MempoolAdjustmentResult> {
  const addressSet = new Set(addresses);
  let pendingHexes: string[];
  try {
    pendingHexes = await store.list();
  } catch (err) {
    console.warn('[withPendingAdjustment] store.list failed:', err);
    return { utxos: confirmed.slice(), report: { stripped: 0, added: 0 } };
  }

  if (pendingHexes.length === 0) {
    return { utxos: confirmed.slice(), report: { stripped: 0, added: 0 } };
  }

  const payloads: MempoolTxPayload[] = [];
  for (const hex of pendingHexes) {
    try {
      payloads.push(decodeTxHexToMempoolPayload(hex, network));
    } catch (err) {
      console.warn(
        '[withPendingAdjustment] skipping malformed pending tx hex:',
        err,
      );
    }
  }

  return applyMempoolAdjustment(confirmed, payloads, addressSet);
}
