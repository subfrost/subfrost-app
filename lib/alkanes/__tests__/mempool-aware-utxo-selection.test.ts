/**
 * Vitest mirror of the alkanes-rs `apply_mempool_adjustment` cargo
 * tests. The SDK fix is in Rust at
 * `crates/alkanes-cli-common/src/alkanes/execute.rs::apply_mempool_adjustment`
 * and is unit-tested there with six cases. This file replicates the
 * reasoning at the JS layer so a regression in the SDK's mempool
 * handling surfaces here too — e.g. if the published WASM ever stops
 * applying the adjustment (e.g. a refactor calls `select_utxos`
 * without mempool data), this assertion-style file documents the
 * expected end-state shape and is the natural place to add an
 * integration test that exercises the WASM via a fixture mempool.
 *
 * The pure aggregator below mirrors the Rust impl byte-for-byte so we
 * can pin the contract without a WASM round-trip.
 *
 * Real-world repro: 2026-05-03 mainnet split-tx run.
 *   Tx A wrap c6b8f0a3611f9072337553e493d057d0ce991916f97453666731507eb702de22
 *   landed in mempool. Tx B re-picked Tx A's same 4 prevouts and was
 *   rejected as a BIP125 RBF replacement
 *   ("insufficient fee, rejecting replacement ba90bff1..., 0.00000376
 *    < 0.00000403"). The fix strips Tx A's prevouts from Tx B's
 *   candidate set and adds Tx A's pay-to-us outputs (the alkane
 *   carrier and BTC change) so Tx B becomes a real CPFP child.
 */

import { describe, it, expect } from 'vitest';

interface UtxoCandidate {
  txid: string;
  vout: number;
  amount: number;
  address: string;
  confirmations: number;
}

interface MempoolTx {
  txid: string;
  vin: { txid: string; vout: number }[];
  vout: { scriptpubkey_address?: string | null; value: number }[];
}

interface AdjustmentReport {
  stripped: number;
  added: number;
}

function applyMempoolAdjustment(
  spendable: UtxoCandidate[],
  mempoolPayloads: MempoolTx[][],
  addresses: string[],
): { spendable: UtxoCandidate[]; report: AdjustmentReport } {
  const addressSet = new Set(addresses);
  const spentOutpoints = new Set<string>();
  const newOutputs: UtxoCandidate[] = [];

  for (const txs of mempoolPayloads) {
    for (const tx of txs) {
      if (!tx.txid) continue;
      for (const vin of tx.vin) {
        if (vin.txid) {
          spentOutpoints.add(`${vin.txid}:${vin.vout}`);
        }
      }
      tx.vout.forEach((out, idx) => {
        if (!out.scriptpubkey_address || !addressSet.has(out.scriptpubkey_address)) return;
        if (out.value <= 0) return;
        newOutputs.push({
          txid: tx.txid,
          vout: idx,
          amount: out.value,
          address: out.scriptpubkey_address,
          confirmations: 0,
        });
      });
    }
  }

  const before = spendable.length;
  let next = spendable.filter((u) => !spentOutpoints.has(`${u.txid}:${u.vout}`));
  const stripped = before - next.length;

  const existing = new Set(next.map((u) => `${u.txid}:${u.vout}`));
  let added = 0;
  for (const out of newOutputs) {
    const key = `${out.txid}:${out.vout}`;
    if (!existing.has(key)) {
      next.push(out);
      added += 1;
    }
  }

  return { spendable: next, report: { stripped, added } };
}

const TXID_A = 'c6b8f0a3611f9072337553e493d057d0ce991916f97453666731507eb702de22';
const TXID_OLD_1 = '2255b42e4b984e3b7c4a2828302385422dddfe58e76de3595d7f466657b4fc80';
const TXID_OLD_2 = 'e7006c4c14cc5527f2d3b231144cb280caee7b87b3a2fd514a3ecd347e5b54df';
const TXID_OLD_3 = '601a0f80119a49351bdf8088423813d9d1f68b1326d81e2b2daba5f57764b1c0';
const USER_ADDR = 'bc1p026hg4dfhchc0axnmlpamu4v9gltcqtrzk0nvyc00n4eu5nl5tpsrh7zkm';
const SIGNER_ADDR = 'bc1p5lushqjk7kxpqa87ppwn0dealu999';

describe('apply_mempool_adjustment: split-tx Tx-B repro', () => {
  it('strips Tx A prevouts and adds Tx A pay-to-us outputs', () => {
    const spendable: UtxoCandidate[] = [
      { txid: TXID_OLD_1, vout: 1, amount: 546, address: USER_ADDR, confirmations: 1 },
      { txid: TXID_OLD_2, vout: 1, amount: 546, address: USER_ADDR, confirmations: 1 },
      { txid: TXID_OLD_2, vout: 2, amount: 846, address: USER_ADDR, confirmations: 1 },
      { txid: TXID_OLD_3, vout: 0, amount: 546, address: USER_ADDR, confirmations: 1 },
    ];
    const mempool: MempoolTx[] = [
      {
        txid: TXID_A,
        vin: [
          { txid: TXID_OLD_1, vout: 1 },
          { txid: TXID_OLD_2, vout: 1 },
          { txid: TXID_OLD_2, vout: 2 },
          { txid: TXID_OLD_3, vout: 0 },
        ],
        vout: [
          { scriptpubkey_address: SIGNER_ADDR, value: 50000 },
          { scriptpubkey_address: USER_ADDR, value: 546 },
          { scriptpubkey_address: USER_ADDR, value: 78462 },
          { scriptpubkey_address: null, value: 0 },
        ],
      },
    ];
    const { spendable: out, report } = applyMempoolAdjustment(spendable, [mempool], [USER_ADDR]);
    expect(report.stripped).toBe(4);
    expect(report.added).toBe(2);
    expect(out).toHaveLength(2);
    expect(out.find((u) => u.txid === TXID_A && u.vout === 1)?.amount).toBe(546);
    expect(out.find((u) => u.txid === TXID_A && u.vout === 2)?.amount).toBe(78462);
    expect(out.find((u) => u.txid === TXID_A && u.vout === 0)).toBeUndefined();
  });

  it('returns no-op when mempool is empty', () => {
    const spendable: UtxoCandidate[] = [
      { txid: TXID_OLD_1, vout: 1, amount: 546, address: USER_ADDR, confirmations: 1 },
    ];
    const { spendable: out, report } = applyMempoolAdjustment(spendable, [], [USER_ADDR]);
    expect(report).toEqual({ stripped: 0, added: 0 });
    expect(out).toEqual(spendable);
  });

  it('skips OP_RETURN and value=0 outputs', () => {
    const mempool: MempoolTx[] = [
      {
        txid: TXID_A,
        vin: [],
        vout: [
          { scriptpubkey_address: USER_ADDR, value: 0 },
          { scriptpubkey_address: null, value: 0 },
          { scriptpubkey_address: USER_ADDR, value: 1000 },
        ],
      },
    ];
    const { spendable: out, report } = applyMempoolAdjustment([], [mempool], [USER_ADDR]);
    expect(report.added).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(1000);
  });

  it('ignores outputs paying addresses we don\'t own', () => {
    const mempool: MempoolTx[] = [
      {
        txid: TXID_A,
        vin: [],
        vout: [
          { scriptpubkey_address: 'bc1qsomeoneelse9999999', value: 10000 },
          { scriptpubkey_address: USER_ADDR, value: 546 },
        ],
      },
    ];
    const { spendable: out, report } = applyMempoolAdjustment([], [mempool], [USER_ADDR]);
    expect(report.added).toBe(1);
    expect(out[0].address).toBe(USER_ADDR);
  });

  it('strip is partial when an outpoint isn\'t in our set', () => {
    const spendable: UtxoCandidate[] = [
      { txid: TXID_OLD_1, vout: 1, amount: 546, address: USER_ADDR, confirmations: 1 },
    ];
    const mempool: MempoolTx[] = [
      {
        txid: TXID_A,
        vin: [
          { txid: TXID_OLD_1, vout: 1 },
          { txid: TXID_OLD_2, vout: 1 },
        ],
        vout: [],
      },
    ];
    const { spendable: out, report } = applyMempoolAdjustment(spendable, [mempool], [USER_ADDR]);
    expect(report.stripped).toBe(1);
    expect(out).toHaveLength(0);
  });

  it('aggregates per-address mempool fetches', () => {
    const addrA = USER_ADDR;
    const addrB = 'bc1qcoldwalletsegwit9999';
    const spendable: UtxoCandidate[] = [
      { txid: TXID_OLD_1, vout: 0, amount: 1000, address: addrA, confirmations: 1 },
      { txid: TXID_OLD_2, vout: 0, amount: 2000, address: addrB, confirmations: 1 },
    ];
    const mempoolA: MempoolTx[] = [{
      txid: TXID_A,
      vin: [{ txid: TXID_OLD_1, vout: 0 }],
      vout: [{ scriptpubkey_address: addrA, value: 800 }],
    }];
    const mempoolB: MempoolTx[] = [{
      txid: 'deadbeef00000000000000000000000000000000000000000000000000000000',
      vin: [{ txid: TXID_OLD_2, vout: 0 }],
      vout: [{ scriptpubkey_address: addrB, value: 1500 }],
    }];
    const { spendable: out, report } = applyMempoolAdjustment(
      spendable, [mempoolA, mempoolB], [addrA, addrB],
    );
    expect(report.stripped).toBe(2);
    expect(report.added).toBe(2);
    expect(out.find((u) => u.address === addrA && u.amount === 800)).toBeDefined();
    expect(out.find((u) => u.address === addrB && u.amount === 1500)).toBeDefined();
  });
});
