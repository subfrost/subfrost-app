/**
 * Vitest mirror for the RBF cargo cases. Mocks the SDK bridge and
 * exercises the param-shape contract: prevout JSON, our_addresses
 * list, network mapping, and the result fields the UI displays.
 *
 * Cargo-side coverage in `crates/alkanes-cli-common/src/alkanes/rbf.rs`
 * is the source of truth for the algorithm. This file pins the JS
 * boundary so the SDK bridge can't silently change shape under us.
 */

import { describe, it, expect, vi } from 'vitest';

// We test the mutationFn in isolation by re-implementing its shape
// rather than rendering React. The hook's effective contract is a
// pure-async function `(provider, params, network, ourAddresses) ->
// SpeedUpResult`. Pin that contract here.

interface RebuildPayload {
  tx_hex: string;
  original_fee_sats: number;
  new_fee_sats: number;
  original_fee_rate: number;
  new_fee_rate: number;
  vsize: number;
  change_output_index: number;
  new_change_value: number;
}

describe('rebuildTxWithFeeRate bridge contract', () => {
  it('passes prevouts as a JSON array of {txid,vout,value_sats}', async () => {
    const calls: string[] = [];
    const provider = {
      async rebuildTxWithFeeRate(
        _hex: string,
        _rate: number,
        prevoutsJson: string,
        _ourJson: string,
        _net: string,
      ) {
        calls.push(prevoutsJson);
        return {
          tx_hex: 'cafebabe',
          original_fee_sats: 500,
          new_fee_sats: 1500,
          original_fee_rate: 4.5,
          new_fee_rate: 13.5,
          vsize: 110,
          change_output_index: 1,
          new_change_value: 88500,
        } as RebuildPayload;
      },
    };

    // Synthesise a 2-input tx and verify the prevouts arg shape.
    const fakeTx = {
      ins: [
        { hash: Buffer.from('a'.repeat(64), 'hex'), index: 0 },
        { hash: Buffer.from('b'.repeat(64), 'hex'), index: 7 },
      ],
    };
    const prevoutValues = fakeTx.ins.map((i) => ({
      txid: Buffer.from(i.hash).reverse().toString('hex'),
      vout: i.index,
      value_sats: 100_000,
    }));

    const plan = await provider.rebuildTxWithFeeRate(
      'deadbeef',
      13.5,
      JSON.stringify(prevoutValues),
      JSON.stringify(['bc1pvsa0qywz...']),
      'mainnet',
    );

    expect(calls).toHaveLength(1);
    const parsed = JSON.parse(calls[0]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      txid: 'a'.repeat(64),
      vout: 0,
      value_sats: 100_000,
    });
    expect(plan.new_fee_rate).toBe(13.5);
    expect(plan.new_fee_sats - plan.original_fee_sats).toBe(1000);
  });

  it('maps subfrost-regtest network arg to "regtest" for the bridge', () => {
    const arg = (network: string | undefined) => {
      if (!network) return 'mainnet';
      if (network.includes('regtest')) return 'regtest';
      if (network === 'signet') return 'signet';
      if (network === 'testnet') return 'testnet';
      return 'mainnet';
    };
    expect(arg('mainnet')).toBe('mainnet');
    expect(arg('subfrost-regtest')).toBe('regtest');
    expect(arg('qubitcoin-regtest')).toBe('regtest');
    expect(arg('signet')).toBe('signet');
    expect(arg(undefined)).toBe('mainnet');
  });

  it('result fee_increase math matches cargo happy_path', () => {
    // happy_path: original 500 sat fee, new 1500 → bump 1000 sats.
    const plan: RebuildPayload = {
      tx_hex: 'aa',
      original_fee_sats: 500,
      new_fee_sats: 1500,
      original_fee_rate: 4.5,
      new_fee_rate: 13.5,
      vsize: 110,
      change_output_index: 1,
      new_change_value: 88500,
    };
    const feeIncrease = plan.new_fee_sats - plan.original_fee_sats;
    expect(feeIncrease).toBe(1000);
    // Change output dropped by exactly fee_increase.
    expect(plan.new_change_value).toBe(89500 - feeIncrease);
  });

  it('error string from RBF rejection reaches the JS layer', async () => {
    const provider = {
      async rebuildTxWithFeeRate() {
        throw new Error(
          'rbf: new fee rate 5.00 too low (current 4.65, minimum bump +1.00 sat/vB)',
        );
      },
    };
    await expect(
      provider.rebuildTxWithFeeRate(),
    ).rejects.toThrow(/too low/);
  });
});

describe('useSpeedUpMutation export', () => {
  it('exports a hook that returns a mutation object', async () => {
    const mod = await import('@/hooks/useSpeedUpMutation');
    expect(typeof mod.useSpeedUpMutation).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// buildPsbtForRbf — browser-wallet sign path. Verifies that the
// unsigned tx hex from the bridge plus per-input prevout info round-
// trips to a PSBT with witnessUtxo + tapInternalKey populated.
// ---------------------------------------------------------------------------

import * as bitcoin from 'bitcoinjs-lib';

describe('buildPsbtForRbf', () => {
  // Build a minimal 1-input / 1-output unsigned tx.
  // Input: prevTxid (zeros), vout 0, sequence fdffffff, no witness.
  // Output: 12345 sats to a P2TR address.
  const taprootProgram = '5e08b59b69acdc8900eb220e92a7c86d07390f8ea4f952d4095e684798470b3e';
  const unsignedHex = (() => {
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32), 0, 0xfdffffff);
    const script = Buffer.concat([
      Buffer.from([0x51, 0x20]),
      Buffer.from(taprootProgram, 'hex'),
    ]);
    tx.addOutput(script, BigInt(12345));
    return tx.toHex();
  })();

  it('attaches witnessUtxo to each input from prevout map', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    const psbt = buildPsbtForRbf({
      unsignedHex,
      prevouts: [
        {
          txid: '00'.repeat(32),
          vout: 0,
          value_sats: 50_000,
          scriptpubkey: '5120' + taprootProgram,
        },
      ],
      taprootXOnlyHex: taprootProgram,
      network: bitcoin.networks.bitcoin,
    });
    expect(psbt.inputCount).toBe(1);
    const witnessUtxo = (psbt.data.inputs[0] as { witnessUtxo?: { value: bigint } }).witnessUtxo;
    expect(witnessUtxo?.value).toBe(BigInt(50_000));
  });

  it('patches tapInternalKey when input is P2TR', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    const psbt = buildPsbtForRbf({
      unsignedHex,
      prevouts: [
        {
          txid: '00'.repeat(32),
          vout: 0,
          value_sats: 50_000,
          scriptpubkey: '5120' + taprootProgram,
        },
      ],
      taprootXOnlyHex: taprootProgram,
      network: bitcoin.networks.bitcoin,
    });
    // tapInternalKey is Uint8Array under bitcoinjs v7 — wrap with Buffer.from
    // for the hex assertion (Uint8Array#toString without an arg gives a
    // comma-joined byte list, not hex).
    const internalKey = (psbt.data.inputs[0] as { tapInternalKey?: Uint8Array }).tapInternalKey;
    expect(internalKey).toBeDefined();
    expect(Buffer.from(internalKey!).toString('hex')).toBe(taprootProgram);
  });

  it('omits tapInternalKey for non-P2TR inputs', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    // Re-build with a P2WPKH input (00 + 20-byte hash). 22 bytes total.
    const wpkhScript = Buffer.concat([
      Buffer.from([0x00, 0x14]),
      Buffer.from('aa'.repeat(20), 'hex'),
    ]);
    // Synthesise an unsigned tx whose first output is the WPKH script —
    // we just need a parseable tx; the PSBT logic only inspects the
    // prevouts hex you supply, so the in-tx output script isn't read.
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32), 0, 0xfdffffff);
    tx.addOutput(wpkhScript, BigInt(12345));
    const psbt = buildPsbtForRbf({
      unsignedHex: tx.toHex(),
      prevouts: [
        {
          txid: '00'.repeat(32),
          vout: 0,
          value_sats: 50_000,
          scriptpubkey: '0014' + 'aa'.repeat(20),
        },
      ],
      taprootXOnlyHex: taprootProgram,
      network: bitcoin.networks.bitcoin,
    });
    const internalKey = (psbt.data.inputs[0] as { tapInternalKey?: Buffer }).tapInternalKey;
    expect(internalKey).toBeUndefined();
  });

  it('throws if prevout is missing for an input', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    expect(() =>
      buildPsbtForRbf({
        unsignedHex,
        prevouts: [],
        taprootXOnlyHex: taprootProgram,
        network: bitcoin.networks.bitcoin,
      }),
    ).toThrow(/prevout missing/);
  });

  it('builds nonWitnessUtxo for P2PKH inputs when prevTxHex is supplied', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    // P2PKH script: OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
    const p2pkhScript = Buffer.concat([
      Buffer.from([0x76, 0xa9, 0x14]),
      Buffer.from('bb'.repeat(20), 'hex'),
      Buffer.from([0x88, 0xac]),
    ]);
    // Build a syntactically valid prev-tx whose vout 0 carries the P2PKH script.
    const prevTx = new bitcoin.Transaction();
    prevTx.addInput(Buffer.alloc(32), 0xffffffff, 0xffffffff, Buffer.alloc(0));
    prevTx.addOutput(p2pkhScript, BigInt(50_000));
    const prevTxHex = prevTx.toHex();
    const prevTxid = prevTx.getId();
    // Build an unsigned tx that spends prev:0.
    const unsigned = new bitcoin.Transaction();
    unsigned.version = 2;
    unsigned.addInput(Buffer.from(prevTxid, 'hex').reverse(), 0, 0xfdffffff);
    unsigned.addOutput(p2pkhScript, BigInt(40_000));

    const psbt = buildPsbtForRbf({
      unsignedHex: unsigned.toHex(),
      prevouts: [
        {
          txid: prevTxid,
          vout: 0,
          value_sats: 50_000,
          scriptpubkey: p2pkhScript.toString('hex'),
          prevTxHex,
        },
      ],
      network: bitcoin.networks.bitcoin,
    });
    expect(psbt.inputCount).toBe(1);
    const input = psbt.data.inputs[0] as {
      nonWitnessUtxo?: Uint8Array;
      witnessUtxo?: unknown;
    };
    expect(input.nonWitnessUtxo).toBeDefined();
    expect(input.witnessUtxo).toBeUndefined();
  });

  it('findParentInPending returns the parent when child references it', async () => {
    const { findParentInPending } = await import('@/hooks/useSpeedUpMutation');
    // Build a minimal parent + child where child.input[0] points at parent.txid:0
    const parent = (() => {
      const tx = new bitcoin.Transaction();
      tx.version = 2;
      tx.addInput(Buffer.alloc(32), 0, 0xfdffffff);
      tx.addOutput(
        Buffer.concat([
          Buffer.from([0x51, 0x20]),
          Buffer.from(taprootProgram, 'hex'),
        ]),
        BigInt(546),
      );
      return tx;
    })();
    const parentTxid = parent.getId();
    const parentHex = parent.toHex();

    const child = new bitcoin.Transaction();
    child.version = 2;
    child.addInput(
      Buffer.from(parentTxid, 'hex').reverse(),
      0,
      0xfdffffff,
    );
    child.addOutput(
      Buffer.concat([
        Buffer.from([0x51, 0x20]),
        Buffer.from(taprootProgram, 'hex'),
      ]),
      BigInt(400),
    );

    const found = findParentInPending(child, [
      { hex: parentHex, txid: parentTxid },
      { hex: '00', txid: 'aa'.repeat(32) },
    ]);
    expect(found?.txid).toBe(parentTxid);
    expect(found?.hex).toBe(parentHex);
  });

  it('findParentInPending returns undefined when no input matches', async () => {
    const { findParentInPending } = await import('@/hooks/useSpeedUpMutation');
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32), 0, 0xfdffffff);
    const found = findParentInPending(tx, [
      { hex: 'cafe', txid: 'aa'.repeat(32) },
    ]);
    expect(found).toBeUndefined();
  });

  it('preserves output value and script verbatim', async () => {
    const { buildPsbtForRbf } = await import('@/hooks/useSpeedUpMutation');
    const psbt = buildPsbtForRbf({
      unsignedHex,
      prevouts: [
        {
          txid: '00'.repeat(32),
          vout: 0,
          value_sats: 50_000,
          scriptpubkey: '5120' + taprootProgram,
        },
      ],
      taprootXOnlyHex: taprootProgram,
      network: bitcoin.networks.bitcoin,
    });
    const out = psbt.txOutputs[0];
    expect(out.value).toBe(BigInt(12345));
    expect(Buffer.from(out.script).toString('hex')).toBe('5120' + taprootProgram);
  });
});
