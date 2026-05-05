/**
 * Pool simulation: replay our own pending swaps against the live
 * pool state so subsequent quotes account for chained dependencies.
 *
 * Why this exists (2026-05-05):
 * `useSwapQuotes` reads pool reserves from the live state-trie. That
 * snapshot only reflects *confirmed* swaps. If the user broadcasts
 * Swap #1 and immediately submits Swap #2 against the same pool, the
 * state trie still reports pre-Swap-#1 reserves — and the quote
 * (and its slippage `amount_out_min`) is computed against the wrong
 * baseline. When both txs mine in the same block the indexer applies
 * Swap #1 first, the pool moves, and Swap #2's predicate reverts
 * with `insufficient output`. Both reverts on mainnet 2026-05-05
 * (`2c51b734…` / `c52ef600…`) match this pattern exactly.
 *
 * Scope: we only adjust for **the user's own pending txs**. We can't
 * predict third-party ordering — the mempool is miner-policy. Our
 * dependent txs (where Swap #2 spends a UTXO created by Swap #1) are
 * topologically forced to mine in order, so applying them deterministic.
 *
 * For non-chained pending swaps (independent dust UTXOs), applying
 * them is still safe-conservative — if they mine before us we
 * predicted correctly; if they mine after us we under-quoted (asked
 * for less than the pool would deliver), which fails-safe to a
 * successful swap with a small unexpected upside.
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { PendingTxSummary } from '@/hooks/usePendingTxs';

const PROTOCOL_TAG = 22n;       // outer Runestone tag for the alkanes protostone protocol marker
const PROTOSTONE_TAG = 16383n;  // inner Runestone tag carrying u128 chunks of the protostone payload
const FACTORY_SWAP_OPCODE = 13n;
const FACTORY_SWAP_EXACT_OUTPUT_OPCODE = 14n;

// ---------------------------------------------------------------------------
// LEB128 varint reader
// ---------------------------------------------------------------------------

function readVarint(buf: Uint8Array, off: number): { value: bigint; next: number } {
  let v = 0n;
  let shift = 0n;
  let cur = off;
  while (cur < buf.length) {
    const byte = buf[cur++];
    v |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: v, next: cur };
    shift += 7n;
    if (shift > 130n) throw new Error('varint exceeds u128');
  }
  throw new Error('varint truncated');
}

/**
 * Serialize a u128 as 15 LE bytes — matches `snap_to_15_bytes` in
 * protorune-support's byte_utils.rs. Runes can't safely round-trip the
 * top 2 bits of a u128 through LEB128, so the encoder reserves the
 * top byte; reconstruction must drop it too. (See alkanes-rs commit
 * for the rationale.)
 */
function u128ToLeBytes15(v: bigint): Uint8Array {
  const out = new Uint8Array(15);
  let n = v;
  for (let i = 0; i < 15; i++) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Protostone payload extraction from a runestone OP_RETURN
// ---------------------------------------------------------------------------

/**
 * Parse the Runestone payload bytes (after the OP_RETURN OP_PUSHNUM_13
 * push prefix) into a sequence of (tag, value) varint pairs. Returns
 * the list of u128 values carried under PROTOSTONE_TAG (16383), in
 * order; concatenating their LE byte representations reconstructs the
 * raw protostone payload. Any other tag is ignored.
 */
function extractProtostoneU128s(payload: Uint8Array): bigint[] {
  const chunks: bigint[] = [];
  let off = 0;
  while (off < payload.length) {
    const tagRead = readVarint(payload, off);
    if (tagRead.next >= payload.length) break;  // dangling tag
    const valueRead = readVarint(payload, tagRead.next);
    off = valueRead.next;
    if (tagRead.value === PROTOSTONE_TAG) {
      chunks.push(valueRead.value);
    }
  }
  return chunks;
}

/**
 * Reconstruct the protostone byte payload from a runestone OP_RETURN
 * scriptPubKey and decode it as a flat list of varints. Returns null
 * if the script doesn't look like a runestone or has no protostone
 * data.
 */
export function extractProtostoneVarints(opReturnScript: Uint8Array): bigint[] | null {
  // Runestone prefix: OP_RETURN (0x6a) + OP_PUSHNUM_13 (0x5d) + push.
  // 0x5d is OP_PUSHNUM_13 — the standard runestone marker.
  if (opReturnScript.length < 3) return null;
  if (opReturnScript[0] !== 0x6a) return null;
  if (opReturnScript[1] !== 0x5d) return null;

  // Decode the push opcode → payload.
  let payloadStart: number;
  let payloadLen: number;
  const pushOp = opReturnScript[2];
  if (pushOp >= 0x01 && pushOp <= 0x4b) {
    payloadStart = 3;
    payloadLen = pushOp;
  } else if (pushOp === 0x4c) {
    payloadStart = 4;
    payloadLen = opReturnScript[3];
  } else if (pushOp === 0x4d) {
    payloadStart = 5;
    payloadLen = opReturnScript[3] | (opReturnScript[4] << 8);
  } else {
    return null;  // unsupported push op
  }
  if (payloadStart + payloadLen > opReturnScript.length) return null;
  const payload = opReturnScript.slice(payloadStart, payloadStart + payloadLen);

  const chunks = extractProtostoneU128s(payload);
  if (chunks.length === 0) return null;

  // Concat 15 LE bytes per u128 chunk (matching `snap_to_15_bytes` in
  // alkanes-rs/protorune-support/byte_utils.rs). The top byte of each
  // u128 is unused on encoder side, so we must skip it on decode.
  const buf = new Uint8Array(chunks.length * 15);
  chunks.forEach((c, i) => buf.set(u128ToLeBytes15(c), i * 15));
  // Trim trailing zeros from the final chunk.
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  const trimmed = buf.slice(0, end);

  // Decode as varints.
  const varints: bigint[] = [];
  let o = 0;
  while (o < trimmed.length) {
    const r = readVarint(trimmed, o);
    varints.push(r.value);
    o = r.next;
  }
  return varints;
}

// ---------------------------------------------------------------------------
// Protostone → swap detection
// ---------------------------------------------------------------------------

/**
 * Decoded swap targeting a specific pool. Swap math is symmetric in
 * direction so we record `sellsToken0` to apply the constant-product
 * formula correctly.
 */
export interface DecodedSwap {
  factoryId: string;        // "block:tx"
  poolPath: Array<{ block: bigint; tx: bigint }>;  // [from, to] for direct swaps
  amountIn: bigint;
  amountOutMin: bigint;
  /** Direction relative to a target pool's (token0, token1) order. */
  sellsToken0?: boolean;
  /** True for opcode 13 (exact-in), false for opcode 14 (exact-out). */
  isExactIn: boolean;
}

// Tag values per alkanes-rs/crates/ordinals/src/runestone/tag.rs.
const TAG_BODY = 0n;
const TAG_MESSAGE = 81n;

/**
 * Parse the protostone payload (as decoded varints from the runestone
 * Protocol field) into a `(tag → values[])` map. Mirrors
 * `Protostone::decipher` + `to_fields` from
 * `alkanes-rs/crates/protorune-support/src/protostone.rs`.
 *
 * Format:
 *   [protocol_tag, length, body_v0, body_v1, ..., body_v(length-1), <next protostone…>]
 *   body interpreted as (tag, value) pairs by `to_fields`.
 *
 * Returns the first protostone's fields (we only emit one for the
 * subfrost-app's swap path; multi-protostone atomic flows have a
 * different shape that we don't quote against).
 */
function parseProtostoneFields(varints: bigint[]): Map<bigint, bigint[]> | null {
  if (varints.length < 2) return null;
  const protocolTag = varints[0];
  const length = varints[1];
  if (protocolTag === 0n) return null;
  const bodyEnd = 2 + Number(length);
  if (bodyEnd > varints.length) return null;
  const body = varints.slice(2, bodyEnd);
  const fields = new Map<bigint, bigint[]>();
  for (let i = 0; i + 1 < body.length; i += 2) {
    const tag = body[i];
    const value = body[i + 1];
    const arr = fields.get(tag) ?? [];
    arr.push(value);
    fields.set(tag, arr);
    if (tag === TAG_BODY) {
      // After Tag::Body all remaining body values are edicts (raw u128
      // sequence). We don't care about edicts for swap decoding.
      break;
    }
  }
  return fields;
}

/**
 * Reconstruct the message bytes from a protostone's Tag::Message
 * chunks. Each chunk is a u128 carrying 15 bytes of the message stream
 * (top byte unused — see `snap_to_15_bytes` in alkanes-rs).
 */
function joinMessageBytes(chunks: bigint[]): Uint8Array {
  const buf = new Uint8Array(chunks.length * 15);
  chunks.forEach((c, i) => buf.set(u128ToLeBytes15(c), i * 15));
  // Trim trailing zero pad from the final chunk.
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return buf.slice(0, end);
}

/**
 * Try to decode a runestone payload's protostone as a factory swap.
 * Path:
 *   1. parseProtostoneFields → fields map
 *   2. fields[Tag::Message] → message bytes
 *   3. LEB128-decode message bytes → cellpack varints
 *   4. cellpack is [factory_block, factory_tx, opcode, path_len, ...path, amount_in, amount_out_min, deadline]
 *
 * Returns null on any decode failure or if the cellpack doesn't target
 * the requested factory with a recognised swap opcode.
 */
export function decodeSwapProtostone(varints: bigint[], factoryId: string): DecodedSwap | null {
  const fields = parseProtostoneFields(varints);
  if (!fields) return null;
  const messageChunks = fields.get(TAG_MESSAGE);
  if (!messageChunks || messageChunks.length === 0) return null;

  const messageBytes = joinMessageBytes(messageChunks);
  // Decode message bytes as varints to recover the cellpack.
  const cellpack: bigint[] = [];
  let off = 0;
  while (off < messageBytes.length) {
    try {
      const r = readVarint(messageBytes, off);
      cellpack.push(r.value);
      off = r.next;
    } catch {
      return null;
    }
  }
  if (cellpack.length < 9) return null;

  const [factoryBlockStr, factoryTxStr] = factoryId.split(':');
  const fBlock = BigInt(factoryBlockStr);
  const fTx = BigInt(factoryTxStr);
  if (cellpack[0] !== fBlock || cellpack[1] !== fTx) return null;

  const op = cellpack[2];
  if (op !== FACTORY_SWAP_OPCODE && op !== FACTORY_SWAP_EXACT_OUTPUT_OPCODE) return null;

  const pathLen = cellpack[3];
  if (pathLen < 2n || pathLen > 8n) return null;
  const pathLenN = Number(pathLen);
  const pathStart = 4;
  const pathEnd = pathStart + pathLenN * 2;
  if (pathEnd + 1 >= cellpack.length) return null;

  const path: Array<{ block: bigint; tx: bigint }> = [];
  for (let j = 0; j < pathLenN; j++) {
    path.push({ block: cellpack[pathStart + j * 2], tx: cellpack[pathStart + j * 2 + 1] });
  }
  const amountIn = cellpack[pathEnd];
  const amountOutMin = cellpack[pathEnd + 1];
  return {
    factoryId,
    poolPath: path,
    amountIn,
    amountOutMin,
    isExactIn: op === FACTORY_SWAP_OPCODE,
  };
}

// ---------------------------------------------------------------------------
// Pool token-order detection (for sellsToken0)
// ---------------------------------------------------------------------------

/**
 * Apply the live pool's known (token0, token1) ordering to a decoded
 * swap so we know which reserve to add and which to subtract.
 */
export function annotateSellsToken0(
  swap: DecodedSwap,
  poolToken0Id: string,  // "block:tx"
): DecodedSwap {
  // For a direct 2-hop swap, path[0] is the sell token.
  const sell = swap.poolPath[0];
  const sellId = `${sell.block}:${sell.tx}`;
  return { ...swap, sellsToken0: sellId === poolToken0Id };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Decode pending txs from `usePendingTxs().pendingTxs` into the swaps
 * targeting a specific pool via the given factory. Order is preserved
 * (pendingTxs already arrives in broadcast order).
 *
 * Decoding errors are swallowed — they just mean we conservatively
 * don't simulate that tx's effect on the reserves. The next swap will
 * still get a quote, just a slightly stale one.
 */
export function decodePendingSwapsOnPool(
  pendingTxs: PendingTxSummary[],
  factoryId: string,
  poolToken0Id: string,  // "block:tx"
  poolToken1Id: string,
): DecodedSwap[] {
  const out: DecodedSwap[] = [];
  for (const pt of pendingTxs) {
    if (!pt.contractOutputsUncertain) continue;  // not a cellpack tx → skip
    let tx: bitcoin.Transaction;
    try {
      tx = bitcoin.Transaction.fromHex(pt.hex);
    } catch (e) {
      continue;
    }
    for (const o of tx.outs) {
      const script = o.script as Uint8Array;
      if (!script || script.length === 0 || script[0] !== 0x6a) continue;
      const varints = extractProtostoneVarints(script);
      if (!varints) continue;
      const swap = decodeSwapProtostone(varints, factoryId);
      if (!swap) continue;
      // Filter to swaps that touch this pool (path uses our token0/token1).
      const pathIds = swap.poolPath.map(p => `${p.block}:${p.tx}`);
      if (!pathIds.includes(poolToken0Id) || !pathIds.includes(poolToken1Id)) continue;
      out.push(annotateSellsToken0(swap, poolToken0Id));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reserves simulation
// ---------------------------------------------------------------------------

export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
}

/**
 * Replay a decoded exact-in swap against the given reserves using the
 * same Uniswap V2 constant-product formula the on-chain pool applies.
 * `feePer1000` is the contract's fee tier (e.g. 10n for 1%, 3n for 0.3%).
 */
export function simulateExactInSwap(
  reserves: PoolReserves,
  swap: DecodedSwap,
  feePer1000: bigint,
): PoolReserves {
  if (!swap.isExactIn || swap.sellsToken0 === undefined) return reserves;
  const amountInWithFee = (swap.amountIn * (1000n - feePer1000)) / 1000n;
  if (swap.sellsToken0) {
    const reserveIn = reserves.reserve0;
    const reserveOut = reserves.reserve1;
    if (reserveIn <= 0n || reserveOut <= 0n) return reserves;
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    return {
      reserve0: reserves.reserve0 + swap.amountIn,
      reserve1: reserves.reserve1 - amountOut,
    };
  } else {
    const reserveIn = reserves.reserve1;
    const reserveOut = reserves.reserve0;
    if (reserveIn <= 0n || reserveOut <= 0n) return reserves;
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    return {
      reserve0: reserves.reserve0 - amountOut,
      reserve1: reserves.reserve1 + swap.amountIn,
    };
  }
}

/**
 * Apply a list of pending swaps in order, returning the projected
 * post-mempool reserves. Caller should pass `feePer1000` from
 * `TOTAL_PROTOCOL_FEE * 1000` (10 for 1%).
 *
 * Exact-out swaps (opcode 14) are skipped for now — they're harder to
 * simulate without knowing the actual delivered amount; the input is
 * adjusted by the contract dynamically. Conservative omission means
 * we don't reorient reserves for them; the user's next quote stays
 * based on un-shifted reserves for that direction. For mainnet usage
 * exact-out is uncommon (UI defaults to exact-in), so this is
 * acceptable until we revisit.
 */
export function applyPendingSwapsToReserves(
  reserves: PoolReserves,
  pendingSwaps: DecodedSwap[],
  feePer1000: bigint,
): PoolReserves {
  let r = reserves;
  for (const s of pendingSwaps) {
    r = simulateExactInSwap(r, s, feePer1000);
  }
  return r;
}
