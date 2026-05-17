/**
 * `metashrew_view protorunesbyoutpoint` — canonical lower-level path for
 * per-outpoint protorune (alkane) balance fetches.
 *
 * Why this exists alongside `getProtorunesByOutpoint` in rpc.ts:
 *
 *   - `alkanes_protorunesbyoutpoint` (the JSON-RPC convenience wrapper) is
 *     fine for casual reads but takes `latest` implicitly and depends on
 *     the wrapper being maintained.
 *   - `metashrew_view protorunesbyoutpoint` is the canonical low-level
 *     read used by `subfrost-mobile` (`fetch_wallet_state`) and the
 *     alkanes-cli-common provider — same path the indexer team treats as
 *     the contract surface.
 *   - **Block-tag explicit**: we can pin reads to a specific height to
 *     keep a snapshot reorg-safe across an entire wallet's fan-out.
 *     The wrapper has no way to do that.
 *
 * Reference implementation:
 *   - Rust:   ~/alkanes-rs/crates/alkanes-cli-common/src/provider.rs:2944
 *             `get_protorunes_by_outpoint()` — uses `metashrew_view_call`
 *   - Mobile: ~/subfrost-mobile/crates/subfrost-mobile-api/src/upstream.rs:807
 *             `fetch_wallet_state_at()` — threads `at_height` through every
 *             per-outpoint call
 *
 * Wire format `OutpointWithProtocol`:
 *   message OutpointWithProtocol {
 *     bytes  txid     = 1;   // 32 bytes, LITTLE-ENDIAN (NOT reversed)
 *     uint32 vout     = 2;
 *     Uint128 protocol = 3;  // { lo: u64, hi: u64 } — pass {1,0} for alkanes
 *   }
 *
 * `Uint128` is itself a nested message:
 *   message Uint128 { uint64 lo = 1; uint64 hi = 2; }
 *
 * Response wire format `OutpointResponse` (CORRECT — verified against
 * alkanes-rs/crates/protorune-support/proto/protorune.proto on 2026-05-17):
 *   message OutpointResponse {
 *     BalanceSheet balances = 1;   // ← field 1 (NOT Output)
 *     Outpoint outpoint   = 2;     // (we don't need it; we already have the
 *                                  //  txid/vout we asked for, ignored on decode)
 *     Output output       = 3;     // ← field 3 (NOT field 1)
 *     uint32 height       = 4;
 *     uint32 txindex      = 5;
 *   }
 *   message Output { bytes script = 1; uint64 value = 2; }
 *   message BalanceSheet { repeated BalanceSheetItem entries = 1; }
 *   message BalanceSheetItem { Rune rune = 1; Uint128 balance = 2; }
 *   message Rune { RuneId rune_id = 1; }
 *   message RuneId { Uint128 height = 1; Uint128 txindex = 2; }
 *
 * History (2026-05-17): an earlier version of this docstring had `Output`
 * at field 1 and `BalanceSheet` at field 2 — fully inverted. The decoder
 * below faithfully implemented that wrong schema, so every per-outpoint
 * call against subfrost.io's metashrew_view returned `balances: []` even
 * when the outpoint genuinely held DIESEL/METHANE/frBTC. Symptom on prod:
 * the Liquidity tab showed `Balance: 0` for the alkane side of every
 * pair even when the wallet provably held the token (mork1e reported
 * this; verified live by comparing legacy `alkanes_protorunesbyoutpoint`
 * — which decodes correctly inside the SDK — against our route's empty
 * output). The fix is purely a field-number swap in `decodeOutpointResponse`.
 * The test fixtures were also wrong (manually crafted from the wrong doc),
 * so they passed the broken impl; the new fixture is a captured real-wire
 * response from mainnet outpoint
 * 8c0c67a612dff64a4b305a9a73b798751d1eb6b9f94908f7ed8a107aa2c632e5:0.
 */

import { metashrewView } from './rpc';
import type { ProtoruneOutpointResponse } from './rpc';

/**
 * Balance entry — `amount` is a DECIMAL STRING (not bigint or number) so it
 * survives JSON serialization without precision loss. DIESEL supply is
 * ~10^18 which exceeds Number.MAX_SAFE_INTEGER, and JSON.parse can't roundtrip
 * bigint. Mirrors the mobile services.rs JSON shape exactly so consumers
 * can swap from the legacy `alkanes_protorunesbyoutpoint` wrapper to this
 * helper without code changes.
 */
export interface ProtoruneOutpointBalance {
  block: number;
  tx: number;
  amount: string;
}

/**
 * Return shape mirrors the existing `getProtorunesByOutpoint` in rpc.ts so
 * callers can swap one helper for the other without other code changes —
 * the only difference is `blockTag` is now explicit.
 *
 * `outpoint`/`output` are populated only when the upstream returned data;
 * `balance_sheet.cached.balances = []` is the "no alkanes here" signal.
 */
export type ProtoruneOutpointResponseMV = ProtoruneOutpointResponse & {
  /** Block tag the read was pinned to ('latest' or a decimal height string). */
  blockTag: string;
};

/**
 * Hex-encode the `OutpointWithProtocol` protobuf for a (txid, vout, protocol_tag) tuple.
 * Exposed for tests; callers should normally use `getProtorunesByOutpointMV`.
 */
export function encodeOutpointWithProtocol(
  txid: string,
  vout: number,
  protocolTag: bigint = 1n,
): string {
  const hex = txid.startsWith('0x') ? txid.slice(2) : txid;
  if (hex.length !== 64) throw new Error(`txid must be 32 bytes hex (got ${hex.length})`);
  // Indexer expects LITTLE-ENDIAN bytes — bitcoin::Txid::to_byte_array() is
  // already LE in alkanes-cli-common (provider.rs:2954). Bitcoin RPCs return
  // txids in display order (big-endian); we reverse here to match the LE wire.
  const txidBytesLE = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    txidBytesLE[i] = parseInt(hex.slice((31 - i) * 2, (31 - i) * 2 + 2), 16);
  }

  const out: number[] = [];

  // field 1, wire-type 2 (length-delimited) — txid
  out.push(0x0a);            // (1 << 3) | 2 = 0x0a
  out.push(0x20);            // length = 32
  for (let i = 0; i < 32; i++) out.push(txidBytesLE[i]);

  // field 2, wire-type 0 (varint) — vout
  out.push(0x10);            // (2 << 3) | 0 = 0x10
  pushVarint(out, BigInt(vout));

  // field 3, wire-type 2 (length-delimited) — Uint128 protocol
  // Uint128 wire: field1=lo (varint), field2=hi (varint)
  const uint128Bytes: number[] = [];
  uint128Bytes.push(0x08); pushVarint(uint128Bytes, protocolTag & ((1n << 64n) - 1n));
  uint128Bytes.push(0x10); pushVarint(uint128Bytes, protocolTag >> 64n);
  out.push(0x1a);            // (3 << 3) | 2 = 0x1a
  pushVarint(out, BigInt(uint128Bytes.length));
  for (const b of uint128Bytes) out.push(b);

  return '0x' + Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decode the hex-encoded `OutpointResponse` protobuf. Tolerates missing
 * fields (returns empty balances rather than throwing) so callers can
 * treat "no alkanes" and "no response" symmetrically.
 *
 * Returns the same JSON shape the legacy `alkanes_protorunesbyoutpoint`
 * wrapper produces, so consumers don't need to learn a new schema.
 */
export function decodeOutpointResponse(hex: string): ProtoruneOutpointResponse {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean) {
    return { balance_sheet: { cached: { balances: [] } } };
  }
  const data = new Uint8Array(clean.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  let outputValue: number | null = null;
  const balances: ProtoruneOutpointBalance[] = [];

  let pos = 0;
  while (pos < data.length) {
    const field = readField(data, pos);
    if (!field) break;
    const [fn, wt, val, next] = field;
    pos = next;
    if (fn === 1 && wt === 2) {
      // BalanceSheet { repeated BalanceSheetItem entries = 1; } — field 1.
      balances.push(...parseBalanceSheet(val as Uint8Array));
    } else if (fn === 3 && wt === 2) {
      // Output { bytes script = 1; uint64 value = 2; } — field 3.
      outputValue = parseOutputValue(val as Uint8Array);
    }
    // field 2 (Outpoint), field 4 (height), field 5 (txindex) — intentionally
    // ignored; we already have the outpoint we asked about, and height/txindex
    // aren't currently consumed by any caller.
  }

  return {
    balance_sheet: { cached: { balances } },
    ...(outputValue !== null ? { output: { value: outputValue } } : {}),
  };
}

/**
 * Fetch alkane balances at one outpoint via `metashrew_view protorunesbyoutpoint`.
 * Pass `blockTag` to pin the read to a specific height (string number or
 * `"latest"`); omit for the indexer's current tip.
 */
export async function getProtorunesByOutpointMV(
  network: string,
  txid: string,
  vout: number,
  blockTag: string = 'latest',
  protocolTag: bigint = 1n,
  signal?: AbortSignal,
): Promise<ProtoruneOutpointResponseMV> {
  const hexInput = encodeOutpointWithProtocol(txid, vout, protocolTag);
  const responseHex = await metashrewView(
    network,
    'protorunesbyoutpoint',
    hexInput,
    blockTag,
    signal,
  );
  const decoded = decodeOutpointResponse(responseHex ?? '');
  return {
    ...decoded,
    outpoint: { txid, vout },
    blockTag,
  };
}

// ---------------------------------------------------------------------------
// Protobuf wire helpers — hand-rolled so we don't pull in protobufjs.
// ---------------------------------------------------------------------------

function pushVarint(out: number[], n: bigint): void {
  let v = n;
  if (v < 0n) throw new Error('negative varint');
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
}

function readVarintBig(data: Uint8Array, pos: number): [bigint, number] {
  let val = 0n;
  let shift = 0n;
  while (pos < data.length) {
    const b = data[pos++];
    val |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return [val, pos];
}

function readField(
  data: Uint8Array,
  pos: number,
): [number, number, Uint8Array | bigint, number] | null {
  if (pos >= data.length) return null;
  const [tag, p1] = readVarintBig(data, pos);
  const fieldNum = Number(tag >> 3n);
  const wireType = Number(tag & 7n);
  if (wireType === 0) {
    const [val, p2] = readVarintBig(data, p1);
    return [fieldNum, wireType, val, p2];
  } else if (wireType === 2) {
    const [len, p2] = readVarintBig(data, p1);
    const lenNum = Number(len);
    return [fieldNum, wireType, data.subarray(p2, p2 + lenNum), p2 + lenNum];
  }
  // Unknown wire types — skip 1 byte (best-effort).
  return [fieldNum, wireType, 0n, p1 + 1];
}

function parseOutputValue(buf: Uint8Array): number | null {
  // Output { bytes script = 1; uint64 value = 2; }
  // We only need value (field 2) — script is ignored.
  let pos = 0;
  while (pos < buf.length) {
    const f = readField(buf, pos);
    if (!f) break;
    const [fn, wt, val, next] = f;
    pos = next;
    if (fn === 2 && wt === 0) return Number(val as bigint);
  }
  return null;
}

function parseBalanceSheet(buf: Uint8Array): ProtoruneOutpointBalance[] {
  const out: ProtoruneOutpointBalance[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const f = readField(buf, pos);
    if (!f) break;
    const [fn, wt, val, next] = f;
    pos = next;
    if (fn === 1 && wt === 2) {
      const item = parseBalanceSheetItem(val as Uint8Array);
      if (item) out.push(item);
    }
  }
  return out;
}

function parseBalanceSheetItem(buf: Uint8Array): ProtoruneOutpointBalance | null {
  let block = -1n;
  let tx = -1n;
  let amount = 0n;
  let pos = 0;
  while (pos < buf.length) {
    const f = readField(buf, pos);
    if (!f) break;
    const [fn, wt, val, next] = f;
    pos = next;
    if (fn === 1 && wt === 2) {
      // Rune { RuneId rune_id = 1 }
      const inner = readField(val as Uint8Array, 0);
      if (inner && inner[0] === 1 && inner[1] === 2) {
        const ids = parseRuneId(inner[2] as Uint8Array);
        if (ids) { block = ids.block; tx = ids.tx; }
      }
    } else if (fn === 2 && wt === 2) {
      // Uint128 balance — `(hi << 64) | lo`. Mirror mobile's
      // `((m.hi as u128) << 64) | (m.lo as u128)` exactly so we don't
      // silently truncate DIESEL-sized totals (~10^18 fits in lo but
      // future contracts could overflow into hi).
      amount = parseUint128(val as Uint8Array);
    }
  }
  if (block < 0n) return null;
  // Alkane block/tx are practically bounded by Bitcoin block size — Number is
  // safe and matches the existing rpc.ts shape. Amount stays as a decimal
  // string to preserve precision across JSON.
  return { block: Number(block), tx: Number(tx), amount: amount.toString() };
}

function parseRuneId(buf: Uint8Array): { block: bigint; tx: bigint } | null {
  let height = -1n;
  let txindex = -1n;
  let pos = 0;
  while (pos < buf.length) {
    const f = readField(buf, pos);
    if (!f) break;
    const [fn, wt, val, next] = f;
    pos = next;
    if (wt === 2) {
      const u128 = parseUint128(val as Uint8Array);
      if (fn === 1) height = u128;
      else if (fn === 2) txindex = u128;
    }
  }
  if (height < 0n || txindex < 0n) return null;
  return { block: height, tx: txindex };
}

/** Parse a `Uint128 { uint64 lo = 1; uint64 hi = 2; }` from its proto bytes. */
function parseUint128(buf: Uint8Array): bigint {
  let lo = 0n;
  let hi = 0n;
  let pos = 0;
  while (pos < buf.length) {
    const f = readField(buf, pos);
    if (!f) break;
    const [fn, wt, val, next] = f;
    pos = next;
    if (wt === 0) {
      if (fn === 1) lo = val as bigint;
      else if (fn === 2) hi = val as bigint;
    }
  }
  return (hi << 64n) | lo;
}
