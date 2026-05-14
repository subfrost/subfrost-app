/**
 * Vitest mirror of the alkanes-rs `PendingTxStore` trait + memory impl.
 *
 * Background — closes the runtime gap from atomic / chained mempool
 * flows on mainnet (2026-05-03). The Rust side now owns the
 * canonical store, this file pins the JS contract for the eventual
 * IndexedDB-backed `PendingTxStore` impl that lives in the wallet
 * UI. By writing the spec at the trait level we can:
 *
 *   1. Implement the IndexedDB version without round-tripping
 *      through the SDK — tests run in jsdom.
 *   2. Provide a memory implementation parallel to the Rust one for
 *      tests that don't want to load `idb` / fake-indexeddb.
 *
 * The Rust side has 12 cargo tests covering the same surface. Source
 * file: alkanes-rs/crates/alkanes-cli-common/src/pending_tx_store.rs
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared trait surface — kept aligned with Rust's `PendingTxStore`.
// IndexedDB-backed impl will conform to this same interface.
// ---------------------------------------------------------------------------

export interface PendingTxStore {
  add(txHex: string): Promise<void>;
  list(): Promise<string[]>;
  remove(txid: string): Promise<void>;
  evict(confirmedTxids: string[]): Promise<void>;
  clear(): Promise<void>;
  len(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Memory impl — mirrors `MemoryPendingTxStore` in alkanes-cli-common.
// Used in tests + as a fallback when IndexedDB isn't available
// (server-side render, vitest environment without fake-indexeddb).
// ---------------------------------------------------------------------------

export class MemoryPendingTxStore implements PendingTxStore {
  private inner: Map<string, string> = new Map();

  async add(txHex: string): Promise<void> {
    const txid = await computeTxid(txHex);
    this.inner.set(txid, normalizeHex(txHex));
  }

  async list(): Promise<string[]> {
    return [...this.inner.values()];
  }

  async remove(txid: string): Promise<void> {
    this.inner.delete(txid);
  }

  async evict(confirmedTxids: string[]): Promise<void> {
    for (const txid of confirmedTxids) this.inner.delete(txid);
  }

  async clear(): Promise<void> {
    this.inner.clear();
  }

  async len(): Promise<number> {
    return this.inner.size;
  }
}

// ---------------------------------------------------------------------------
// Cheap txid hash — double SHA-256 over the serialized tx, reversed
// to match Bitcoin's display order. Covers the segwit witness-stripping
// rules: txid is computed over the legacy-serialized form (no witness).
//
// We use Node's built-in `crypto` for the hash to keep this file
// dependency-free in the vitest environment. For browser
// production code the SDK's WASM-side `decode_tx_hex_to_mempool_json`
// derives the txid via `bitcoin::Transaction::compute_txid()` —
// exact same algorithm.
// ---------------------------------------------------------------------------

function normalizeHex(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

async function computeTxid(txHex: string): Promise<string> {
  const hex = normalizeHex(txHex);
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('invalid hex');
  }
  const buf = Buffer.from(hex, 'hex');

  // Strip witness if present (segwit marker 0x00 + flag 0x01 right after version).
  const stripped = stripWitness(buf);

  const { createHash } = await import('node:crypto');
  const h1 = createHash('sha256').update(stripped).digest();
  const h2 = createHash('sha256').update(h1).digest();
  // Reverse for display order.
  return Buffer.from(h2).reverse().toString('hex');
}

function stripWitness(buf: Buffer): Buffer {
  // version (4) + marker (1) + flag (1)?
  if (buf.length < 6) return buf;
  if (buf[4] === 0x00 && buf[5] === 0x01) {
    // Segwit. Need to walk inputs/outputs and drop witness data.
    return parseSegwitToLegacy(buf);
  }
  return buf;
}

function parseSegwitToLegacy(buf: Buffer): Buffer {
  let offset = 0;
  const out: Buffer[] = [];

  // version (4 bytes)
  out.push(buf.subarray(offset, offset + 4));
  offset += 4;

  // skip marker + flag
  offset += 2;

  // input count (varint)
  const { value: inputCount, size: inSize } = readVarint(buf, offset);
  offset += inSize;
  const inputCountBuf = buf.subarray(offset - inSize, offset);
  out.push(inputCountBuf);

  // inputs
  for (let i = 0; i < Number(inputCount); i++) {
    out.push(buf.subarray(offset, offset + 36));
    offset += 36;
    const { value: scriptLen, size: slSize } = readVarint(buf, offset);
    out.push(buf.subarray(offset, offset + slSize + Number(scriptLen) + 4));
    offset += slSize + Number(scriptLen) + 4;
  }

  // output count
  const { value: outputCount, size: outSize } = readVarint(buf, offset);
  out.push(buf.subarray(offset, offset + outSize));
  offset += outSize;

  // outputs
  for (let i = 0; i < Number(outputCount); i++) {
    out.push(buf.subarray(offset, offset + 8));
    offset += 8;
    const { value: scriptLen, size: slSize } = readVarint(buf, offset);
    out.push(buf.subarray(offset, offset + slSize + Number(scriptLen)));
    offset += slSize + Number(scriptLen);
  }

  // skip witness data
  for (let i = 0; i < Number(inputCount); i++) {
    const { value: stackLen, size: stkSize } = readVarint(buf, offset);
    offset += stkSize;
    for (let j = 0; j < Number(stackLen); j++) {
      const { value: itemLen, size: itSize } = readVarint(buf, offset);
      offset += itSize + Number(itemLen);
    }
  }

  // locktime (4 bytes)
  out.push(buf.subarray(offset, offset + 4));

  return Buffer.concat(out);
}

function readVarint(buf: Buffer, offset: number): { value: bigint; size: number } {
  const first = buf[offset];
  if (first < 0xfd) return { value: BigInt(first), size: 1 };
  if (first === 0xfd) return { value: BigInt(buf.readUInt16LE(offset + 1)), size: 3 };
  if (first === 0xfe) return { value: BigInt(buf.readUInt32LE(offset + 1)), size: 5 };
  return { value: buf.readBigUInt64LE(offset + 1), size: 9 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TX_A_HEX =
  '02000000000102c0b16477f5a5ab2d2b1ed826138bf6d1d91338428880df1b35499a11800f1a600100000000fdffffff22de02b77e503167665374f9161999ced057d093e453753372901f61a3f0b8c60200000000fdffffff043075000000000000225120a7f90b8256f58c1074fe085d37b73dff3040774babc216dae106e281e020638b22020000000000002251207ab57455a9be2f87f4d3dfc3ddf2ac2a3ebc0163159f36130f7ceb9e527fa2c34cbc0000000000002251207ab57455a9be2f87f4d3dfc3ddf2ac2a3ebc0163159f36130f7ceb9e527fa2c30000000000000000136a5d101600ff7f818cec8ad0abc0a8a081d2150140300f852484bcd16e2d5c2850f8c3bc1bd861a033971994f621fb589deb3edf8225dfbbdb969abb738b4ba2e1c119c7c3f860d77095b150b058a89170b2d532ad01408e1f00dd1c42ee3c073f256395d5b74d7c8366a52d29b72832a1ebec3bda4048f3a86f41625ec8736cf97051796b20961e05e11291aa65737cbf0ddb243f450f00000000';

const TX_A_TXID =
  'c5520bb64d1a742a6bd62999267f683e1f0756481220ff2155d2be841a3d7b92';

describe('MemoryPendingTxStore — basic semantics', () => {
  let store: MemoryPendingTxStore;

  beforeEach(() => {
    store = new MemoryPendingTxStore();
  });

  it('starts empty', async () => {
    expect(await store.len()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('add then list returns the added hex', async () => {
    await store.add(TX_A_HEX);
    expect(await store.len()).toBe(1);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(TX_A_HEX);
  });

  it('add is idempotent on txid', async () => {
    // Re-adding the same tx must not double-count — guards against
    // retry / double-broadcast loops.
    await store.add(TX_A_HEX);
    await store.add(TX_A_HEX);
    expect(await store.len()).toBe(1);
  });

  it('add strips optional 0x prefix', async () => {
    await store.add(`0x${TX_A_HEX}`);
    expect(await store.len()).toBe(1);
    expect((await store.list())[0]).toBe(TX_A_HEX);
  });

  it('add rejects invalid hex', async () => {
    await expect(store.add('not-actually-hex')).rejects.toThrow();
  });

  it('remove by txid drops the entry', async () => {
    await store.add(TX_A_HEX);
    await store.remove(TX_A_TXID);
    expect(await store.len()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('remove unknown txid is noop', async () => {
    await store.add(TX_A_HEX);
    await store.remove(
      '0000000000000000000000000000000000000000000000000000000000000000',
    );
    expect(await store.len()).toBe(1);
  });

  it('evict handles partial match', async () => {
    await store.add(TX_A_HEX);
    await store.evict([
      TX_A_TXID,
      'deadbeef00000000000000000000000000000000000000000000000000000000',
    ]);
    expect(await store.len()).toBe(0);
  });

  it('clear wipes the store', async () => {
    await store.add(TX_A_HEX);
    await store.clear();
    expect(await store.len()).toBe(0);
  });
});

describe('PendingTxStore txid computation matches Bitcoin convention', () => {
  it('computes the correct txid for the mainnet Tx A fixture', async () => {
    // Cross-check against the on-chain txid of Tx A
    // (c5520bb64d1a742a6bd62999267f683e1f0756481220ff2155d2be841a3d7b92,
    // confirmed in mainnet block 947766). If this assertion ever
    // breaks the segwit witness-stripping logic regressed.
    const computed = await (async () => {
      const store = new MemoryPendingTxStore();
      await store.add(TX_A_HEX);
      // The store keys by txid internally. Round-trip via remove
      // to confirm it matches the published txid.
      await store.remove(TX_A_TXID);
      return await store.len();
    })();
    expect(computed).toBe(0);
  });
});

describe('integration: chained pending broadcasts', () => {
  it('two distinct broadcasts produce two store entries', async () => {
    const store = new MemoryPendingTxStore();

    // Tx A from the mainnet fixture.
    await store.add(TX_A_HEX);

    // A different (synthetic) tx — same shape but with one byte
    // flipped in the locktime so the txid differs. Any byte change
    // in the non-witness portion produces a different txid; we use
    // the locktime tail (last 4 bytes) for clarity.
    const txB = TX_A_HEX.slice(0, -8) + '01000000';
    await store.add(txB);

    expect(await store.len()).toBe(2);
    const list = await store.list();
    expect(list).toContain(TX_A_HEX);
    expect(list).toContain(txB);
  });

  it('eviction removes only the txids handed in', async () => {
    const store = new MemoryPendingTxStore();
    await store.add(TX_A_HEX);
    const txB = TX_A_HEX.slice(0, -8) + '01000000';
    await store.add(txB);

    // Evict only Tx A — Tx B must remain.
    await store.evict([TX_A_TXID]);
    expect(await store.len()).toBe(1);
    expect((await store.list())[0]).toBe(txB);
  });
});
