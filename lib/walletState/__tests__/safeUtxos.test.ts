/**
 * filterMetashrewSafe — asserts the load-bearing height gate.
 */

import { describe, it, expect } from 'vitest';

import { filterMetashrewSafe } from '../safeUtxos';
import type { WalletUtxo } from '../fetchWalletState';

function utxo(blockHeight: number | null, txid = 'aa'.repeat(32)): WalletUtxo {
  return {
    txid,
    vout: 0,
    value: 546,
    address: 'bc1ptest',
    blockHeight,
    confirmations: 0,
    alkanes: [],
  };
}

describe('filterMetashrewSafe', () => {
  it('excludes UTXOs at heights metashrew has not seen yet', async () => {
    const utxos = [utxo(101, 'a'.repeat(64)), utxo(99, 'b'.repeat(64))];
    const safe = filterMetashrewSafe(utxos, 100);
    expect(safe).toHaveLength(1);
    expect(safe[0].txid).toBe('b'.repeat(64));
  });

  it('includes UTXOs at the same height as metashrew', async () => {
    const utxos = [utxo(100, 'a'.repeat(64))];
    const safe = filterMetashrewSafe(utxos, 100);
    expect(safe).toHaveLength(1);
  });

  it('excludes mempool UTXOs (blockHeight === null)', async () => {
    const utxos = [utxo(null, 'a'.repeat(64)), utxo(99, 'b'.repeat(64))];
    const safe = filterMetashrewSafe(utxos, 100);
    expect(safe).toHaveLength(1);
    expect(safe[0].blockHeight).toBe(99);
  });

  it('returns empty when metashrew height is 0 (unknown indexer state)', async () => {
    const utxos = [utxo(99, 'a'.repeat(64))];
    expect(filterMetashrewSafe(utxos, 0)).toEqual([]);
    expect(filterMetashrewSafe(utxos, Number.NaN)).toEqual([]);
    expect(filterMetashrewSafe(utxos, -1)).toEqual([]);
  });
});
