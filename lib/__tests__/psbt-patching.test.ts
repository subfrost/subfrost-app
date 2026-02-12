/**
 * Unit tests for lib/psbt-patching.ts
 *
 * Tests the wallet-specific PSBT patching layer that replaces dummy wallet
 * outputs/inputs with real user addresses before signing. This eliminates
 * the need for manual QA of:
 *   - Output scriptPubKey replacement (P2TR, P2WPKH)
 *   - Input witnessUtxo script patching
 *   - P2SH-P2WPKH redeemScript injection (Xverse)
 *   - tapInternalKey patching (all browser wallets)
 *   - Fixed output overrides (signer address)
 *   - OP_RETURN preservation
 */
import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import {
  patchOutputs,
  patchInputWitnessScripts,
  injectRedeemScripts,
  patchPsbtForBrowserWallet,
  patchTapInternalKeys,
} from '../psbt-patching';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// ---------------------------------------------------------------------------
// Test fixtures — deterministic keys from standard test mnemonic
// ---------------------------------------------------------------------------
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const REGTEST = bitcoin.networks.regtest;

function deriveKeys() {
  const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
  const root = bip32.fromSeed(seed, REGTEST);

  // "User" keys — these are the REAL wallet keys
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnlyPubkey = taprootChild.publicKey.slice(1, 33);
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network: REGTEST,
  });
  const taprootAddress = taprootPayment.address!;
  const taprootScript = taprootPayment.output!;

  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const segwitPayment = bitcoin.payments.p2wpkh({
    pubkey: segwitChild.publicKey,
    network: REGTEST,
  });
  const segwitAddress = segwitPayment.address!;
  const segwitScript = segwitPayment.output!;

  // P2SH-P2WPKH (Xverse-style) — wraps P2WPKH inside P2SH
  const p2shPayment = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2wpkh({
      pubkey: segwitChild.publicKey,
      network: REGTEST,
    }),
    network: REGTEST,
  });
  const p2shAddress = p2shPayment.address!;
  const p2shScript = p2shPayment.output!;
  const redeemScript = p2shPayment.redeem!.output!;

  // "Dummy" keys — simulate the SDK's dummy wallet (different derivation)
  const dummyTaprootChild = root.derivePath("m/86'/1'/0'/0/99");
  const dummyXOnly = dummyTaprootChild.publicKey.slice(1, 33);
  const dummyTaprootPayment = bitcoin.payments.p2tr({
    internalPubkey: dummyXOnly,
    network: REGTEST,
  });
  const dummyTaprootScript = dummyTaprootPayment.output!;

  const dummySegwitChild = root.derivePath("m/84'/1'/0'/0/99");
  const dummySegwitPayment = bitcoin.payments.p2wpkh({
    pubkey: dummySegwitChild.publicKey,
    network: REGTEST,
  });
  const dummySegwitScript = dummySegwitPayment.output!;

  return {
    // User (real) addresses & scripts
    taprootAddress,
    taprootScript,
    xOnlyPubkey,
    segwitAddress,
    segwitScript,
    segwitPubkeyHex: Buffer.from(segwitChild.publicKey).toString('hex'),
    p2shAddress,
    p2shScript,
    redeemScript,
    // Dummy (SDK) scripts
    dummyTaprootScript,
    dummySegwitScript,
    dummyXOnly,
  };
}

const KEYS = deriveKeys();

/** Create a mock OP_RETURN script */
function makeOpReturn(data: Buffer): Buffer {
  return Buffer.from(bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, data]));
}

/** Helper to read output script from a PSBT */
function getOutputScript(psbt: bitcoin.Psbt, index: number): Buffer {
  return Buffer.from((psbt.data.globalMap.unsignedTx as any).tx.outs[index].script);
}

// ===========================================================================
// patchOutputs
// ===========================================================================
describe('patchOutputs', () => {
  it('replaces dummy P2TR outputs with user taproot address', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // Dummy P2TR output (from SDK's dummy wallet)
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(50000) });

    patchOutputs(
      psbt,
      { taprootAddress: KEYS.taprootAddress, network: REGTEST },
      true,
    );

    const patched = getOutputScript(psbt, 0);
    expect(patched.equals(Buffer.from(KEYS.taprootScript))).toBe(true);
  });

  it('replaces dummy P2WPKH outputs with user segwit address', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(30000) });

    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        segwitAddress: KEYS.segwitAddress,
        network: REGTEST,
      },
      true,
    );

    const patched = getOutputScript(psbt, 0);
    expect(patched.equals(Buffer.from(KEYS.segwitScript))).toBe(true);
  });

  it('does not modify OP_RETURN outputs', () => {
    const opReturnData = Buffer.from('6a5d331600ff7f', 'hex');
    const opReturnScript = makeOpReturn(opReturnData);

    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addOutput({ script: opReturnScript, value: BigInt(0) });

    patchOutputs(
      psbt,
      { taprootAddress: KEYS.taprootAddress, network: REGTEST },
      true,
    );

    const output = getOutputScript(psbt, 0);
    expect(output.equals(opReturnScript)).toBe(true);
  });

  it('applies fixedOutputs regardless of isBrowserWallet', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(50000) });

    // Even with isBrowserWallet=false, fixedOutputs should apply
    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        network: REGTEST,
        fixedOutputs: { 0: KEYS.segwitAddress },
      },
      false,
    );

    const patched = getOutputScript(psbt, 0);
    expect(patched.equals(Buffer.from(KEYS.segwitScript))).toBe(true);
  });

  it('skips fixedOutput indices during browser wallet sweep', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // output 0: will be fixed to segwit address (e.g., signer)
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(10000) });
    // output 1: P2TR, should be swept to user taproot
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(40000) });
    // output 2: OP_RETURN, should be preserved
    psbt.addOutput({ script: makeOpReturn(Buffer.from('test')), value: BigInt(0) });

    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        segwitAddress: KEYS.segwitAddress,
        network: REGTEST,
        fixedOutputs: { 0: KEYS.segwitAddress },
      },
      true,
    );

    // output 0: fixed to segwit
    expect(getOutputScript(psbt, 0).equals(Buffer.from(KEYS.segwitScript))).toBe(true);
    // output 1: swept to taproot
    expect(getOutputScript(psbt, 1).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    // output 2: OP_RETURN preserved
    expect(getOutputScript(psbt, 2)[0]).toBe(0x6a);
  });

  it('does not modify outputs when isBrowserWallet=false and no fixedOutputs', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(50000) });

    const originalScript = Buffer.from(getOutputScript(psbt, 0));

    patchOutputs(
      psbt,
      { taprootAddress: KEYS.taprootAddress, network: REGTEST },
      false,
    );

    expect(getOutputScript(psbt, 0).equals(originalScript)).toBe(true);
  });

  it('handles mixed output types in a realistic swap PSBT', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // v0: P2TR change (user gets back remaining alkanes)
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    // v1: P2TR swap result
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    // v2: OP_RETURN (protostone)
    psbt.addOutput({ script: makeOpReturn(Buffer.from('protostone')), value: BigInt(0) });
    // v3: P2WPKH BTC change
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(45000) });

    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        segwitAddress: KEYS.segwitAddress,
        network: REGTEST,
      },
      true,
    );

    expect(getOutputScript(psbt, 0).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(getOutputScript(psbt, 1).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(getOutputScript(psbt, 2)[0]).toBe(0x6a); // OP_RETURN preserved
    expect(getOutputScript(psbt, 3).equals(Buffer.from(KEYS.segwitScript))).toBe(true);
  });
});

// ===========================================================================
// patchInputWitnessScripts
// ===========================================================================
describe('patchInputWitnessScripts', () => {
  it('patches P2TR witnessUtxo.script from dummy to real taproot', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xaa),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummyTaprootScript,
        value: BigInt(100000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    const patched = patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      network: REGTEST,
    });

    expect(patched).toBe(1);
    const inputScript = Buffer.from(psbt.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(Buffer.from(KEYS.taprootScript))).toBe(true);
  });

  it('patches P2WPKH witnessUtxo.script from dummy to real segwit', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xbb),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(80000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    const patched = patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.segwitAddress,
      network: REGTEST,
    });

    expect(patched).toBe(1);
    const inputScript = Buffer.from(psbt.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(Buffer.from(KEYS.segwitScript))).toBe(true);
  });

  it('preserves witnessUtxo.value while patching script', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xcc),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummyTaprootScript,
        value: BigInt(123456),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      network: REGTEST,
    });

    expect(psbt.data.inputs[0].witnessUtxo!.value).toBe(BigInt(123456));
  });

  it('does not patch P2WPKH inputs when no segwit address provided', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xdd),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(50000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(30000) });

    const originalScript = Buffer.from(KEYS.dummySegwitScript);

    const patched = patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      // no segwitAddress
      network: REGTEST,
    });

    expect(patched).toBe(0);
    const inputScript = Buffer.from(psbt.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(originalScript)).toBe(true);
  });

  it('patches multiple inputs of mixed types', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // P2TR input
    psbt.addInput({
      hash: Buffer.alloc(32, 0x11),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(60000) },
    });
    // P2WPKH input
    psbt.addInput({
      hash: Buffer.alloc(32, 0x22),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(40000) },
    });
    // Another P2TR input
    psbt.addInput({
      hash: Buffer.alloc(32, 0x33),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(20000) },
    });

    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(100000) });

    const patched = patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.segwitAddress,
      network: REGTEST,
    });

    expect(patched).toBe(3);
    expect(Buffer.from(psbt.data.inputs[0].witnessUtxo!.script).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(Buffer.from(psbt.data.inputs[1].witnessUtxo!.script).equals(Buffer.from(KEYS.segwitScript))).toBe(true);
    expect(Buffer.from(psbt.data.inputs[2].witnessUtxo!.script).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
  });

  it('does not patch segwit when segwitAddress equals taprootAddress (single-addr wallets)', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xee),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(50000) },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(30000) });

    // UniSat-style: segwit = taproot (single-address wallet)
    const patched = patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.taprootAddress,
      network: REGTEST,
    });

    // Should skip P2WPKH patching since segwitAddress === taprootAddress
    expect(patched).toBe(0);
  });
});

// ===========================================================================
// injectRedeemScripts
// ===========================================================================
describe('injectRedeemScripts', () => {
  it('injects redeemScript for P2SH-P2WPKH inputs (Xverse-style)', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // Input with P2WPKH witnessUtxo (dummy wallet's script)
    psbt.addInput({
      hash: Buffer.alloc(32, 0xaa),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(100000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    const patched = injectRedeemScripts(psbt, {
      paymentAddress: KEYS.p2shAddress,
      pubkeyHex: KEYS.segwitPubkeyHex,
      network: REGTEST,
    });

    expect(patched).toBe(1);
    expect(psbt.data.inputs[0].redeemScript).toBeDefined();
    expect(Buffer.from(psbt.data.inputs[0].redeemScript!).equals(Buffer.from(KEYS.redeemScript))).toBe(true);
  });

  it('replaces witnessUtxo.script with P2SH scriptPubKey during injection', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xbb),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(80000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    injectRedeemScripts(psbt, {
      paymentAddress: KEYS.p2shAddress,
      pubkeyHex: KEYS.segwitPubkeyHex,
      network: REGTEST,
    });

    // witnessUtxo.script should now be the P2SH scriptPubKey
    const inputScript = Buffer.from(psbt.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(Buffer.from(KEYS.p2shScript))).toBe(true);
  });

  it('is a no-op for native segwit addresses (bc1q...)', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xcc),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(50000),
      },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(30000) });

    const patched = injectRedeemScripts(psbt, {
      paymentAddress: KEYS.segwitAddress, // bc1q... address
      pubkeyHex: KEYS.segwitPubkeyHex,
      network: REGTEST,
    });

    expect(patched).toBe(0);
    expect(psbt.data.inputs[0].redeemScript).toBeUndefined();
  });

  it('skips inputs that already have a redeemScript', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    const existingRedeemScript = Buffer.from('deadbeef', 'hex');

    psbt.addInput({
      hash: Buffer.alloc(32, 0xdd),
      index: 0,
      witnessUtxo: {
        script: KEYS.dummySegwitScript,
        value: BigInt(50000),
      },
      redeemScript: existingRedeemScript,
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(30000) });

    const patched = injectRedeemScripts(psbt, {
      paymentAddress: KEYS.p2shAddress,
      pubkeyHex: KEYS.segwitPubkeyHex,
      network: REGTEST,
    });

    expect(patched).toBe(0);
    // Original redeemScript should be preserved
    expect(Buffer.from(psbt.data.inputs[0].redeemScript!).equals(existingRedeemScript)).toBe(true);
  });

  it('handles multiple inputs, only patching P2WPKH ones', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // P2WPKH input (should get redeemScript)
    psbt.addInput({
      hash: Buffer.alloc(32, 0x11),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(50000) },
    });
    // P2TR input (should be skipped)
    psbt.addInput({
      hash: Buffer.alloc(32, 0x22),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(50000) },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(80000) });

    const patched = injectRedeemScripts(psbt, {
      paymentAddress: KEYS.p2shAddress,
      pubkeyHex: KEYS.segwitPubkeyHex,
      network: REGTEST,
    });

    expect(patched).toBe(1);
    expect(psbt.data.inputs[0].redeemScript).toBeDefined();
    expect(psbt.data.inputs[1].redeemScript).toBeUndefined();
  });
});

// ===========================================================================
// patchTapInternalKeys
// ===========================================================================
describe('patchTapInternalKeys', () => {
  it('replaces dummy tapInternalKey with user x-only pubkey', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xaa),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(100000) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    const xOnlyHex = Buffer.from(KEYS.xOnlyPubkey).toString('hex');
    const patched = patchTapInternalKeys(psbt, xOnlyHex);

    expect(patched).toBe(1);
    expect(
      Buffer.from(psbt.data.inputs[0].tapInternalKey!).equals(Buffer.from(KEYS.xOnlyPubkey)),
    ).toBe(true);
  });

  it('handles compressed pubkey (strips 02/03 prefix)', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xbb),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(100000) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(50000) });

    // Pass full compressed pubkey (33 bytes with 02 prefix)
    const compressedHex = '02' + Buffer.from(KEYS.xOnlyPubkey).toString('hex');
    const patched = patchTapInternalKeys(psbt, compressedHex);

    expect(patched).toBe(1);
    // Should have stripped the prefix
    expect(psbt.data.inputs[0].tapInternalKey!.length).toBe(32);
    expect(
      Buffer.from(psbt.data.inputs[0].tapInternalKey!).equals(Buffer.from(KEYS.xOnlyPubkey)),
    ).toBe(true);
  });

  it('skips inputs without tapInternalKey', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    // P2WPKH input (no tapInternalKey)
    psbt.addInput({
      hash: Buffer.alloc(32, 0xcc),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(80000) },
    });
    // P2TR input (has tapInternalKey)
    psbt.addInput({
      hash: Buffer.alloc(32, 0xdd),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(100000) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(150000) });

    const xOnlyHex = Buffer.from(KEYS.xOnlyPubkey).toString('hex');
    const patched = patchTapInternalKeys(psbt, xOnlyHex);

    expect(patched).toBe(1);
    expect(psbt.data.inputs[0].tapInternalKey).toBeUndefined();
    expect(
      Buffer.from(psbt.data.inputs[1].tapInternalKey!).equals(Buffer.from(KEYS.xOnlyPubkey)),
    ).toBe(true);
  });

  it('returns 0 when no inputs have tapInternalKey', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xee),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(50000) },
    });
    psbt.addOutput({ address: KEYS.taprootAddress, value: BigInt(30000) });

    const xOnlyHex = Buffer.from(KEYS.xOnlyPubkey).toString('hex');
    const patched = patchTapInternalKeys(psbt, xOnlyHex);

    expect(patched).toBe(0);
  });
});

// ===========================================================================
// patchPsbtForBrowserWallet — end-to-end orchestration
// ===========================================================================
describe('patchPsbtForBrowserWallet', () => {
  it('patches outputs + input witnessUtxo + redeemScript in one call', () => {
    // Build a PSBT that simulates SDK output with dummy wallet
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Input with dummy P2WPKH witnessUtxo
    psbt.addInput({
      hash: Buffer.alloc(32, 0xaa),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(100000) },
    });

    // Outputs: dummy P2TR + OP_RETURN
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    psbt.addOutput({ script: makeOpReturn(Buffer.from('protostone')), value: BigInt(0) });
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(90000) });

    const result = patchPsbtForBrowserWallet({
      psbtBase64: psbt.toBase64(),
      network: REGTEST,
      isBrowserWallet: true,
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.p2shAddress, // Xverse P2SH address
      paymentPubkeyHex: KEYS.segwitPubkeyHex,
    });

    // Parse the result
    const patched = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Verify outputs were patched
    const out0 = getOutputScript(patched, 0);
    expect(out0.equals(Buffer.from(KEYS.taprootScript))).toBe(true);

    // OP_RETURN preserved
    expect(getOutputScript(patched, 1)[0]).toBe(0x6a);

    // redeemScript injected (Xverse P2SH-P2WPKH)
    expect(result.inputsPatched).toBe(1);
    expect(patched.data.inputs[0].redeemScript).toBeDefined();
  });

  it('applies fixedOutputs for signer address (wrap flow)', () => {
    const signerAddress = 'bcrt1qs52wg59emg847ld37v2dc8f7ruz2e83xj9j555';

    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xbb),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(200000) },
    });
    // output 0: signer (should be fixed)
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(10000) });
    // output 1: user change
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(180000) });

    const result = patchPsbtForBrowserWallet({
      psbtBase64: psbt.toBase64(),
      network: REGTEST,
      isBrowserWallet: true,
      taprootAddress: KEYS.taprootAddress,
      fixedOutputs: { 0: signerAddress },
    });

    const patched = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // output 0: signer address (fixed)
    const signerScript = bitcoin.address.toOutputScript(signerAddress, REGTEST);
    expect(getOutputScript(patched, 0).equals(signerScript)).toBe(true);

    // output 1: user taproot (swept)
    expect(getOutputScript(patched, 1).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
  });

  it('skips input patching when isBrowserWallet=false', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0xcc),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(100000) },
    });
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(50000) });

    const originalInputScript = Buffer.from(KEYS.dummyTaprootScript);

    const result = patchPsbtForBrowserWallet({
      psbtBase64: psbt.toBase64(),
      network: REGTEST,
      isBrowserWallet: false,
      taprootAddress: KEYS.taprootAddress,
    });

    const patched = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Input should NOT be patched (keystore wallet)
    const inputScript = Buffer.from(patched.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(originalInputScript)).toBe(true);
    expect(result.inputsPatched).toBe(0);
  });

  it('handles realistic 4-output swap PSBT with all patching layers', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // 2 P2TR inputs + 1 P2WPKH input (mixed wallet like Xverse)
    psbt.addInput({
      hash: Buffer.alloc(32, 0x11),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(546) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addInput({
      hash: Buffer.alloc(32, 0x22),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(546) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addInput({
      hash: Buffer.alloc(32, 0x33),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(100000) },
    });

    // 4 outputs: P2TR, P2TR, OP_RETURN, P2WPKH
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    psbt.addOutput({ script: makeOpReturn(Buffer.from('alkanes protostone data')), value: BigInt(0) });
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(98000) });

    const result = patchPsbtForBrowserWallet({
      psbtBase64: psbt.toBase64(),
      network: REGTEST,
      isBrowserWallet: true,
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.p2shAddress,
      paymentPubkeyHex: KEYS.segwitPubkeyHex,
    });

    const patched = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Outputs patched correctly
    expect(getOutputScript(patched, 0).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(getOutputScript(patched, 1).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(getOutputScript(patched, 2)[0]).toBe(0x6a); // OP_RETURN
    // P2WPKH output patched to P2SH (Xverse payment address)
    expect(getOutputScript(patched, 3).equals(Buffer.from(KEYS.p2shScript))).toBe(true);

    // Input witnessUtxo scripts patched
    expect(Buffer.from(patched.data.inputs[0].witnessUtxo!.script).equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(Buffer.from(patched.data.inputs[1].witnessUtxo!.script).equals(Buffer.from(KEYS.taprootScript))).toBe(true);

    // P2SH-P2WPKH input: redeemScript injected
    expect(result.inputsPatched).toBe(1);
    expect(patched.data.inputs[2].redeemScript).toBeDefined();
  });
});

// ===========================================================================
// Full signing round-trip: patch → sign → verify
// ===========================================================================
describe('Full patch-then-sign round-trip', () => {
  it('P2TR: patched PSBT can be signed with real keys', () => {
    // Build PSBT with dummy taproot keys
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0x01),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(100000) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(90000) });

    // Step 1: Patch outputs
    patchOutputs(
      psbt,
      { taprootAddress: KEYS.taprootAddress, network: REGTEST },
      true,
    );

    // Step 2: Patch input witnessUtxo
    patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      network: REGTEST,
    });

    // Step 3: Patch tapInternalKey
    const xOnlyHex = Buffer.from(KEYS.xOnlyPubkey).toString('hex');
    patchTapInternalKeys(psbt, xOnlyHex);

    // Verify the PSBT is now consistent with real keys
    const inputScript = Buffer.from(psbt.data.inputs[0].witnessUtxo!.script);
    expect(inputScript.equals(Buffer.from(KEYS.taprootScript))).toBe(true);
    expect(
      Buffer.from(psbt.data.inputs[0].tapInternalKey!).equals(Buffer.from(KEYS.xOnlyPubkey)),
    ).toBe(true);

    // Step 4: Sign with real key
    const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
    const root = bip32.fromSeed(seed, REGTEST);
    const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
    const xOnly = taprootChild.publicKey.slice(1, 33);
    const tweaked = taprootChild.tweak(
      bitcoin.crypto.taggedHash('TapTweak', xOnly),
    );

    psbt.signInput(0, tweaked);
    expect(psbt.data.inputs[0].tapKeySig).toBeDefined();
  });

  it('P2WPKH: patched PSBT can be signed with real segwit key', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });
    psbt.addInput({
      hash: Buffer.alloc(32, 0x02),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(80000) },
    });
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(70000) });

    // Patch outputs + input
    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        segwitAddress: KEYS.segwitAddress,
        network: REGTEST,
      },
      true,
    );
    patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.segwitAddress,
      network: REGTEST,
    });

    // Sign with real segwit key
    const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
    const root = bip32.fromSeed(seed, REGTEST);
    const segwitChild = root.derivePath("m/84'/1'/0'/0/0");

    psbt.signInput(0, segwitChild);
    expect(psbt.data.inputs[0].partialSig).toBeDefined();
    expect(psbt.data.inputs[0].partialSig!.length).toBeGreaterThan(0);
  });

  it('Xverse dual-address: patched PSBT can be signed with both keys', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Taproot input (alkane UTXO)
    psbt.addInput({
      hash: Buffer.alloc(32, 0x03),
      index: 0,
      witnessUtxo: { script: KEYS.dummyTaprootScript, value: BigInt(546) },
      tapInternalKey: KEYS.dummyXOnly,
    });
    // Segwit input (BTC fee funding)
    psbt.addInput({
      hash: Buffer.alloc(32, 0x04),
      index: 0,
      witnessUtxo: { script: KEYS.dummySegwitScript, value: BigInt(100000) },
    });

    // Outputs
    psbt.addOutput({ script: KEYS.dummyTaprootScript, value: BigInt(546) });
    psbt.addOutput({ script: makeOpReturn(Buffer.from('protostone')), value: BigInt(0) });
    psbt.addOutput({ script: KEYS.dummySegwitScript, value: BigInt(90000) });

    // Full patching pipeline (mimics what hooks do)
    patchOutputs(
      psbt,
      {
        taprootAddress: KEYS.taprootAddress,
        segwitAddress: KEYS.segwitAddress,
        network: REGTEST,
      },
      true,
    );
    patchInputWitnessScripts(psbt, {
      taprootAddress: KEYS.taprootAddress,
      segwitAddress: KEYS.segwitAddress,
      network: REGTEST,
    });
    patchTapInternalKeys(psbt, Buffer.from(KEYS.xOnlyPubkey).toString('hex'));

    // Sign with both keys
    const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
    const root = bip32.fromSeed(seed, REGTEST);

    const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
    const xOnly = taprootChild.publicKey.slice(1, 33);
    const tweaked = taprootChild.tweak(
      bitcoin.crypto.taggedHash('TapTweak', xOnly),
    );
    psbt.signInput(0, tweaked);

    const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
    psbt.signInput(1, segwitChild);

    // Both inputs signed
    expect(psbt.data.inputs[0].tapKeySig).toBeDefined();
    expect(psbt.data.inputs[1].partialSig).toBeDefined();
    expect(psbt.data.inputs[1].partialSig!.length).toBeGreaterThan(0);
  });
});
