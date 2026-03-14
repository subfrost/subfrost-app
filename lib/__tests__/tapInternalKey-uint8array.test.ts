/**
 * Tests for tapInternalKey Buffer vs Uint8Array issue.
 *
 * Bug: patchTapInternalKeys uses Buffer.from(hex, 'hex') which produces a Buffer.
 * Buffer is a Node.js subclass of Uint8Array, but wallet signing code may check
 * instanceof Uint8Array and JSON serialization differs:
 *   Buffer  -> {"type":"Buffer","data":[...]}
 *   Uint8Array -> plain byte array
 *
 * The fix: wrap with `new Uint8Array(Buffer.from(...))` to get a pure Uint8Array.
 */
import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchTapInternalKeys } from '../psbt-patching';
import { patchTapInternalKeys as patchTapInternalKeysBrowser } from '../wallet/browserWalletSigning';

bitcoin.initEccLib(ecc);

const DUMMY_XONLY_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const REAL_XONLY_HEX = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function makePsbtWithTapInput(): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });
  // Create a P2TR script: OP_1 (0x51) + PUSH32 (0x20) + 32-byte key
  const p2trScript = new Uint8Array([
    0x51, 0x20,
    ...Buffer.from(DUMMY_XONLY_HEX, 'hex'),
  ]);
  psbt.addInput({
    hash: new Uint8Array(32).fill(0x01),
    index: 0,
    witnessUtxo: { script: p2trScript, value: BigInt(10000) },
    tapInternalKey: new Uint8Array(Buffer.from(DUMMY_XONLY_HEX, 'hex')),
  });
  return psbt;
}

describe('tapInternalKey Buffer vs Uint8Array', () => {
  it('demonstrates the Buffer vs Uint8Array difference', () => {
    const bufferKey = Buffer.from(REAL_XONLY_HEX, 'hex');
    const uint8Key = new Uint8Array(Buffer.from(REAL_XONLY_HEX, 'hex'));

    // Both are instanceof Uint8Array (Buffer extends Uint8Array)
    expect(bufferKey instanceof Uint8Array).toBe(true);
    expect(uint8Key instanceof Uint8Array).toBe(true);

    // Only Buffer passes Buffer.isBuffer
    expect(Buffer.isBuffer(bufferKey)).toBe(true);
    expect(Buffer.isBuffer(uint8Key)).toBe(false);

    // JSON serialization differs
    const bufferJson = JSON.stringify(bufferKey);
    expect(bufferJson).toContain('"type":"Buffer"');

    const uint8Json = JSON.stringify(uint8Key);
    expect(uint8Json).not.toContain('"type":"Buffer"');
  });

  it('patchTapInternalKeys (psbt-patching) produces Buffer, not pure Uint8Array', () => {
    const psbt = makePsbtWithTapInput();
    patchTapInternalKeys(psbt, REAL_XONLY_HEX);

    const key = psbt.data.inputs[0].tapInternalKey!;
    expect(key).toBeDefined();
    expect(key.length).toBe(32);
    // Must produce pure Uint8Array, NOT Buffer (wallets reject Buffer)
    expect(Buffer.isBuffer(key)).toBe(false);
    expect(key instanceof Uint8Array).toBe(true);
    expect(JSON.stringify(key)).not.toContain('"type":"Buffer"');
  });

  it('patchTapInternalKeys (browserWalletSigning) produces pure Uint8Array', () => {
    const psbt = makePsbtWithTapInput();
    patchTapInternalKeysBrowser(psbt, REAL_XONLY_HEX);

    const key = psbt.data.inputs[0].tapInternalKey!;
    expect(key).toBeDefined();
    expect(key.length).toBe(32);
    // Must produce pure Uint8Array, NOT Buffer (wallets reject Buffer)
    expect(Buffer.isBuffer(key)).toBe(false);
    expect(key instanceof Uint8Array).toBe(true);
    expect(JSON.stringify(key)).not.toContain('"type":"Buffer"');
  });

  it('pure Uint8Array conversion produces correct bytes without Buffer wrapper', () => {
    const original = Buffer.from(REAL_XONLY_HEX, 'hex');
    const converted = new Uint8Array(original);

    expect(Buffer.isBuffer(converted)).toBe(false);
    expect(converted instanceof Uint8Array).toBe(true);
    expect(converted.length).toBe(32);
    // Bytes match
    expect(Buffer.from(converted).toString('hex')).toBe(REAL_XONLY_HEX);
    // JSON does not contain Buffer marker
    expect(JSON.stringify(converted)).not.toContain('"type":"Buffer"');
  });
});
