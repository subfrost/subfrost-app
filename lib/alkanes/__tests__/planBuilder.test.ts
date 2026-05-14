/**
 * Pin the contract for `buildPlanFromTx` — the helper that mutation
 * hooks call to convert (unsigned PSBT/tx hex + cached UTXO snapshot)
 * into the rich `TxPlan` the keystore confirm modal renders.
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { buildPlanFromTx } from '@/lib/alkanes/planBuilder';
import type { WalletUtxoCache, CachedUtxo } from '@/queries/account';

const TAPROOT_PROGRAM = '5e08b59b69acdc8900eb220e92a7c86d07390f8ea4f952d4095e684798470b3e';
const RECIPIENT_PROGRAM = 'aa'.repeat(32);

function buildScript(programHex: string): Buffer {
  return Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.from(programHex, 'hex')]);
}

function buildTx(): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  // Two inputs: one known to our cache, one foreign.
  tx.addInput(Buffer.from('aa'.repeat(32), 'hex'), 0, 0xfdffffff);
  tx.addInput(Buffer.from('bb'.repeat(32), 'hex'), 1, 0xfdffffff);
  // Three outputs: recipient, our change, and an OP_RETURN protostone.
  tx.addOutput(buildScript(RECIPIENT_PROGRAM), BigInt(10_000));
  tx.addOutput(buildScript(TAPROOT_PROGRAM), BigInt(50_000));
  tx.addOutput(Buffer.from('6a5d0a1600ff7f818cec8ad0', 'hex'), BigInt(0));
  return tx;
}

function buildCache(): WalletUtxoCache {
  const utxos: CachedUtxo[] = [
    {
      txid: 'aa'.repeat(32),
      vout: 0,
      value: 60_000,
      address: 'bc1pselftap',
      alkanes: [{ block: 2, tx: 0, amount: BigInt(1000) }],
    },
  ];
  const byOutpoint = new Map<string, CachedUtxo>();
  for (const u of utxos) byOutpoint.set(`${u.txid}:${u.vout}`, u);
  return {
    utxos,
    byOutpoint,
    byAlkane: new Map(),
    balances: new Map(),
    height: 0,
  };
}

const OURS = ['bc1pselftap'];

describe('buildPlanFromTx', () => {
  it('annotates inputs from the cache, leaving foreign inputs at value=0', () => {
    const tx = buildTx();
    const plan = buildPlanFromTx({
      txHex: tx.toHex(),
      cache: buildCache(),
      ourAddresses: OURS,
      network: bitcoin.networks.bitcoin,
    });
    expect(plan.inputs).toHaveLength(2);
    expect(plan.inputs[0].address).toBe('bc1pselftap');
    expect(plan.inputs[0].isOurs).toBe(true);
    expect(plan.inputs[0].valueSats).toBe(60_000);
    expect(plan.inputs[0].alkanes).toHaveLength(1);
    expect(plan.inputs[0].alkanes![0].alkaneId).toBe('2:0');
    // Foreign input has no cache entry → value 0, no address, isOurs false.
    expect(plan.inputs[1].valueSats).toBe(0);
    expect(plan.inputs[1].isOurs).toBe(false);
    expect(plan.inputs[1].address).toBeUndefined();
  });

  it('decodes outputs, identifies isOurs by address, marks OP_RETURN', () => {
    const tx = buildTx();
    const plan = buildPlanFromTx({
      txHex: tx.toHex(),
      cache: buildCache(),
      ourAddresses: OURS,
      network: bitcoin.networks.bitcoin,
    });
    expect(plan.outputs).toHaveLength(3);
    // Output 0 — recipient (not ours).
    expect(plan.outputs[0].isOurs).toBe(false);
    expect(plan.outputs[0].valueSats).toBe(10_000);
    expect(plan.outputs[0].isOpReturn).toBe(false);
    // Output 1 — our change.
    expect(plan.outputs[1].valueSats).toBe(50_000);
    // Output 2 — OP_RETURN protostone.
    expect(plan.outputs[2].isOpReturn).toBe(true);
    expect(plan.outputs[2].address).toBeNull();
  });

  it('computes fee = totalIn - totalOut (only known inputs counted)', () => {
    const tx = buildTx();
    const plan = buildPlanFromTx({
      txHex: tx.toHex(),
      cache: buildCache(),
      ourAddresses: OURS,
      network: bitcoin.networks.bitcoin,
    });
    // 60000 - (10000 + 50000 + 0) = 0 (because foreign input value is 0).
    expect(plan.feeSats).toBe(0);
  });

  it('propagates feeRateSatVb, label, and summary onto the plan', () => {
    const tx = buildTx();
    const plan = buildPlanFromTx({
      txHex: tx.toHex(),
      cache: buildCache(),
      ourAddresses: OURS,
      network: bitcoin.networks.bitcoin,
      feeRateSatVb: 5,
      label: 'Split (alkane sweep)',
      summary: 'Sweeps the alkane carrier to a clean output.',
    });
    expect(plan.feeRateSatVb).toBe(5);
    expect(plan.label).toBe('Split (alkane sweep)');
    expect(plan.summary).toContain('Sweeps');
  });

  it('honors outputAlkaneOverrides for cellpack-derived predictions', () => {
    const tx = buildTx();
    const plan = buildPlanFromTx({
      txHex: tx.toHex(),
      cache: buildCache(),
      ourAddresses: OURS,
      network: bitcoin.networks.bitcoin,
      outputAlkaneOverrides: {
        1: [
          { alkaneId: '2:0', symbol: 'DIESEL', amount: BigInt(580_000_000), uncertain: true },
        ],
      },
    });
    expect(plan.outputs[1].alkanes).toBeDefined();
    expect(plan.outputs[1].alkanes![0].uncertain).toBe(true);
    expect(plan.outputs[1].alkanes![0].amount).toBe(BigInt(580_000_000));
    // Output 0 still has no overrides.
    expect(plan.outputs[0].alkanes).toBeUndefined();
  });

  it('throws when neither psbtBase64 nor txHex is provided', () => {
    expect(() =>
      buildPlanFromTx({
        cache: buildCache(),
        ourAddresses: OURS,
        network: bitcoin.networks.bitcoin,
      }),
    ).toThrow(/psbtBase64 or txHex/);
  });
});
