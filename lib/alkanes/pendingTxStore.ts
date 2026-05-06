/**
 * IndexedDB-backed `PendingTxStore` for the browser wallet.
 *
 * Mirrors the alkanes-rs `pending_tx_store::PendingTxStore` trait
 * (alkanes-cli-common, commit `48152a7b`). The Rust SDK owns the
 * canonical version that `select_utxos` reads on every call; this
 * file is the JS-side cache the wallet UI uses to compute optimistic
 * balance deltas + survive page reloads.
 *
 * Why both layers exist:
 *
 *   - The SDK's WASM-side store is in-memory and lives for the
 *     lifetime of the `WebProvider`. That's enough to cover chained
 *     mempool flows within a single React session (atomic
 *     wrap+swap → immediate alkane-send before the indexer catches
 *     up).
 *
 *   - This IndexedDB store survives page reloads. A user broadcasts
 *     a tx, refreshes the tab, and on the next render the wallet UI
 *     can still overlay the pending state on top of confirmed
 *     balances — no waiting for the indexer.
 *
 * Eviction:
 *   - On every block-tip change (HeightPoller invalidates queries)
 *     the wallet calls `evictConfirmedTxs(currentTip)` which queries
 *     each pending tx's confirmation status and drops anything that
 *     made it into a block.
 *   - Manual `clear()` exposed for the wallet "reset" path.
 */

import type { PendingTxStore } from './__tests__/pending-tx-store.test';

const DB_NAME = 'subfrost-wallet';
const DB_VERSION = 1;
const STORE_NAME = 'pending-txs';

interface PendingTxRecord {
  txid: string;
  hex: string;
  /** Unix-ms timestamp the tx was added. Useful for stale-tx eviction. */
  addedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'txid' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeHex(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Compute Bitcoin txid from raw tx hex.
 *
 * Mirrors `bitcoin::Transaction::compute_txid()` — double-SHA256
 * over the legacy-serialized form (no witness). We strip the
 * segwit marker + witness data before hashing.
 *
 * Browser path uses `crypto.subtle.digest('SHA-256')`. The
 * resulting 32-byte hash is reversed for display order.
 */
async function computeTxid(txHex: string): Promise<string> {
  const hex = normalizeHex(txHex);
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('invalid hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  const stripped = stripWitness(bytes);

  // ArrayBuffer copy keeps the type checker happy (Uint8Array's
  // generic ArrayBufferLike isn't assignable to crypto.subtle's
  // ArrayBuffer constraint).
  const strippedBuffer = new ArrayBuffer(stripped.length);
  new Uint8Array(strippedBuffer).set(stripped);
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', strippedBuffer));
  const h1Buffer = new ArrayBuffer(h1.length);
  new Uint8Array(h1Buffer).set(h1);
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1Buffer));
  // Reverse for Bitcoin display order.
  return Array.from(h2.slice().reverse())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stripWitness(buf: Uint8Array): Uint8Array {
  if (buf.length < 6) return buf;
  if (buf[4] === 0x00 && buf[5] === 0x01) {
    return parseSegwitToLegacy(buf);
  }
  return buf;
}

function parseSegwitToLegacy(buf: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [];
  let offset = 0;

  // version (4 bytes)
  out.push(buf.subarray(offset, offset + 4));
  offset += 4;

  // skip marker + flag
  offset += 2;

  // input count
  const inSV = readVarint(buf, offset);
  out.push(buf.subarray(offset, offset + inSV.size));
  offset += inSV.size;

  // inputs
  for (let i = 0; i < Number(inSV.value); i++) {
    out.push(buf.subarray(offset, offset + 36));
    offset += 36;
    const scriptLen = readVarint(buf, offset);
    out.push(buf.subarray(offset, offset + scriptLen.size + Number(scriptLen.value) + 4));
    offset += scriptLen.size + Number(scriptLen.value) + 4;
  }

  // output count
  const outSV = readVarint(buf, offset);
  out.push(buf.subarray(offset, offset + outSV.size));
  offset += outSV.size;

  // outputs
  for (let i = 0; i < Number(outSV.value); i++) {
    out.push(buf.subarray(offset, offset + 8));
    offset += 8;
    const scriptLen = readVarint(buf, offset);
    out.push(buf.subarray(offset, offset + scriptLen.size + Number(scriptLen.value)));
    offset += scriptLen.size + Number(scriptLen.value);
  }

  // skip witness data
  for (let i = 0; i < Number(inSV.value); i++) {
    const stackLen = readVarint(buf, offset);
    offset += stackLen.size;
    for (let j = 0; j < Number(stackLen.value); j++) {
      const itemLen = readVarint(buf, offset);
      offset += itemLen.size + Number(itemLen.value);
    }
  }

  // locktime (4 bytes)
  out.push(buf.subarray(offset, offset + 4));

  // Concat
  const total = out.reduce((acc, x) => acc + x.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of out) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function readVarint(buf: Uint8Array, offset: number): { value: bigint; size: number } {
  const first = buf[offset];
  if (first < 0xfd) return { value: BigInt(first), size: 1 };
  if (first === 0xfd) {
    return {
      value: BigInt(buf[offset + 1] | (buf[offset + 2] << 8)),
      size: 3,
    };
  }
  if (first === 0xfe) {
    return {
      value: BigInt(
        buf[offset + 1] |
          (buf[offset + 2] << 8) |
          (buf[offset + 3] << 16) |
          (buf[offset + 4] << 24),
      ),
      size: 5,
    };
  }
  // 0xff: 8 bytes
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(buf[offset + 1 + i]) << BigInt(8 * i);
  }
  return { value: v, size: 9 };
}

// ---------------------------------------------------------------------------
// IndexedDB impl
// ---------------------------------------------------------------------------

export class IndexedDbPendingTxStore implements PendingTxStore {
  async add(txHex: string): Promise<void> {
    const normalized = normalizeHex(txHex);
    const txid = await computeTxid(normalized);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: PendingTxRecord = {
        txid,
        hex: normalized,
        addedAt: Date.now(),
      };
      const request = store.put(record);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async list(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        db.close();
        const records = request.result as PendingTxRecord[];
        resolve(records.map((r) => r.hex));
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async remove(txid: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(txid);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async evict(confirmedTxids: string[]): Promise<void> {
    if (confirmedTxids.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let pending = confirmedTxids.length;
      let errored = false;
      for (const txid of confirmedTxids) {
        const r = store.delete(txid);
        r.onsuccess = () => {
          pending -= 1;
          if (pending === 0 && !errored) {
            db.close();
            resolve();
          }
        };
        r.onerror = () => {
          if (!errored) {
            errored = true;
            db.close();
            reject(r.error);
          }
        };
      }
    });
  }

  async clear(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  async len(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }
}

/**
 * Singleton instance for app-wide use. Re-exported as the default.
 *
 * Browser-only — server-side rendering must not import this file
 * (no IndexedDB on Node). Component code that may run in SSR should
 * guard via `typeof window !== 'undefined'` and only call methods
 * inside `useEffect`.
 */
export const pendingTxStore = new IndexedDbPendingTxStore();
