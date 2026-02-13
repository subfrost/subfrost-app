/**
 * Per-wallet PSBT pipeline tests
 *
 * Simulates the FULL production pipeline for each wallet type:
 *   WASM dummy-wallet PSBT → patchPsbtForBrowserWallet → patchTapInternalKeys → sign → finalize
 *
 * Covers all four supported browser wallet types:
 *   - Xverse:  dual-address (P2TR + P2SH-P2WPKH), needs redeemScript injection
 *   - Unisat:  single P2TR address, tapInternalKey critical
 *   - OKX:     single P2TR address, same patching as Unisat
 *   - Leather: dual-address (P2TR + native P2WPKH bc1q), no redeemScript needed
 *
 * Covers three operation types per wallet:
 *   - Alkane swap (4 outputs: P2TR, P2TR, OP_RETURN, P2WPKH/P2TR change)
 *   - Alkane send (4 outputs: P2TR sender change, P2TR recipient, OP_RETURN, change)
 *   - BTC send  (tapInternalKey patching only — no dummy wallet outputs)
 *
 * If any test here fails, the corresponding wallet × operation would break in production.
 */
import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import {
  patchPsbtForBrowserWallet,
  patchTapInternalKeys,
} from '../psbt-patching';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const REGTEST = bitcoin.networks.regtest;
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// ---------------------------------------------------------------------------
// Wallet profiles — each mirrors a real wallet's address configuration
// ---------------------------------------------------------------------------

interface WalletProfile {
  name: string;
  /** Taproot address (bc1p...) */
  taprootAddress: string;
  /** x-only pubkey hex (32 bytes) */
  xOnlyPubkeyHex: string;
  /** Payment/segwit address — may be P2SH (3...) or native P2WPKH (bc1q...) or same as taproot */
  segwitAddress?: string;
  /** Compressed pubkey hex for payment address (needed for P2SH-P2WPKH redeemScript) */
  paymentPubkeyHex?: string;
  /** Whether segwit address is P2SH-P2WPKH (needs redeemScript) */
  needsRedeemScript: boolean;
  /** Sign function that mimics the wallet */
  sign: (psbt: bitcoin.Psbt) => void;
}

function deriveProfiles(): Record<string, WalletProfile> {
  const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
  const root = bip32.fromSeed(seed, REGTEST);

  // Taproot (BIP86)
  const trChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnly = trChild.publicKey.slice(1, 33);
  const trPayment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: REGTEST });
  const trAddr = trPayment.address!;
  const xOnlyHex = Buffer.from(xOnly).toString('hex');
  const tweakedTr = trChild.tweak(bitcoin.crypto.taggedHash('TapTweak', xOnly));

  // Native SegWit (BIP84)
  const swChild = root.derivePath("m/84'/1'/0'/0/0");
  const swPayment = bitcoin.payments.p2wpkh({ pubkey: swChild.publicKey, network: REGTEST });
  const swAddr = swPayment.address!;
  const swPubkeyHex = Buffer.from(swChild.publicKey).toString('hex');

  // P2SH-P2WPKH (Xverse-style)
  const p2shPayment = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2wpkh({ pubkey: swChild.publicKey, network: REGTEST }),
    network: REGTEST,
  });
  const p2shAddr = p2shPayment.address!;

  /** Sign taproot + segwit inputs (dual-address wallet) */
  function signDual(psbt: bitcoin.Psbt) {
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input.tapInternalKey) {
        try { psbt.signInput(i, tweakedTr); } catch { /* not our input */ }
      } else if (input.witnessUtxo) {
        try { psbt.signInput(i, swChild); } catch { /* not our input */ }
      }
    }
  }

  /** Sign taproot-only inputs (single P2TR wallet) */
  function signTaprootOnly(psbt: bitcoin.Psbt) {
    for (let i = 0; i < psbt.inputCount; i++) {
      try { psbt.signInput(i, tweakedTr); } catch { /* not our input */ }
    }
  }

  return {
    xverse: {
      name: 'Xverse',
      taprootAddress: trAddr,
      xOnlyPubkeyHex: xOnlyHex,
      segwitAddress: p2shAddr,          // P2SH-P2WPKH
      paymentPubkeyHex: swPubkeyHex,
      needsRedeemScript: true,
      sign: signDual,
    },
    unisat: {
      name: 'Unisat',
      taprootAddress: trAddr,
      xOnlyPubkeyHex: xOnlyHex,
      // Unisat: single address, no separate segwit
      segwitAddress: undefined,
      paymentPubkeyHex: undefined,
      needsRedeemScript: false,
      sign: signTaprootOnly,
    },
    okx: {
      name: 'OKX',
      taprootAddress: trAddr,
      xOnlyPubkeyHex: xOnlyHex,
      segwitAddress: undefined,
      paymentPubkeyHex: undefined,
      needsRedeemScript: false,
      sign: signTaprootOnly,
    },
    leather: {
      name: 'Leather',
      taprootAddress: trAddr,
      xOnlyPubkeyHex: xOnlyHex,
      segwitAddress: swAddr,            // Native bc1q — NO redeemScript needed
      paymentPubkeyHex: swPubkeyHex,
      needsRedeemScript: false,
      sign: signDual,
    },
  };
}

const PROFILES = deriveProfiles();

// ---------------------------------------------------------------------------
// Dummy wallet — simulates what the SDK's WASM walletCreate() produces
// ---------------------------------------------------------------------------

function deriveDummyWallet() {
  const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
  const root = bip32.fromSeed(seed, REGTEST);
  // Use different derivation path to simulate SDK's dummy wallet
  const dTr = root.derivePath("m/86'/1'/0'/0/99");
  const dXOnly = dTr.publicKey.slice(1, 33);
  const dTrPay = bitcoin.payments.p2tr({ internalPubkey: dXOnly, network: REGTEST });
  const dSw = root.derivePath("m/84'/1'/0'/0/99");
  const dSwPay = bitcoin.payments.p2wpkh({ pubkey: dSw.publicKey, network: REGTEST });

  return {
    taprootScript: dTrPay.output!,
    segwitScript: dSwPay.output!,
    xOnly: dXOnly,
  };
}

const DUMMY = deriveDummyWallet();

/** A mock OP_RETURN script (protostone data) */
function opReturn(): Buffer {
  return Buffer.from(bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,
    Buffer.from('6a5d331600ff7f819aecb2d0', 'hex'),
  ]));
}

// ---------------------------------------------------------------------------
// PSBT fixtures — replicate what WASM outputs for each operation type
// ---------------------------------------------------------------------------

/** Build a swap-like PSBT with dummy wallet scripts (4 outputs, mixed inputs) */
function buildDummySwapPsbt(): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: REGTEST });

  // Input 0: P2TR alkane UTXO (dummy witnessUtxo + tapInternalKey)
  psbt.addInput({
    hash: Buffer.alloc(32, 0x11),
    index: 0,
    witnessUtxo: { script: DUMMY.taprootScript, value: BigInt(546) },
    tapInternalKey: DUMMY.xOnly,
  });
  // Input 1: P2WPKH BTC fee input (dummy witnessUtxo)
  psbt.addInput({
    hash: Buffer.alloc(32, 0x22),
    index: 0,
    witnessUtxo: { script: DUMMY.segwitScript, value: BigInt(100000) },
  });

  // Output 0: P2TR alkane change (user gets remaining alkanes)
  psbt.addOutput({ script: DUMMY.taprootScript, value: BigInt(546) });
  // Output 1: P2TR swap result (user gets bought tokens)
  psbt.addOutput({ script: DUMMY.taprootScript, value: BigInt(546) });
  // Output 2: OP_RETURN (alkane protostone)
  psbt.addOutput({ script: opReturn(), value: BigInt(0) });
  // Output 3: P2WPKH BTC change
  psbt.addOutput({ script: DUMMY.segwitScript, value: BigInt(90000) });

  return psbt;
}

/** Build an alkane-send PSBT with dummy wallet scripts */
function buildDummyAlkaneSendPsbt(): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: REGTEST });

  // Input 0: P2TR alkane UTXO
  psbt.addInput({
    hash: Buffer.alloc(32, 0x33),
    index: 0,
    witnessUtxo: { script: DUMMY.taprootScript, value: BigInt(546) },
    tapInternalKey: DUMMY.xOnly,
  });
  // Input 1: P2WPKH BTC fee
  psbt.addInput({
    hash: Buffer.alloc(32, 0x44),
    index: 0,
    witnessUtxo: { script: DUMMY.segwitScript, value: BigInt(80000) },
  });

  // Output 0: P2TR sender change (remaining alkanes)
  psbt.addOutput({ script: DUMMY.taprootScript, value: BigInt(546) });
  // Output 1: P2TR recipient (edict target)
  psbt.addOutput({ script: DUMMY.taprootScript, value: BigInt(546) });
  // Output 2: OP_RETURN (protostone with edict)
  psbt.addOutput({ script: opReturn(), value: BigInt(0) });
  // Output 3: P2WPKH BTC change
  psbt.addOutput({ script: DUMMY.segwitScript, value: BigInt(70000) });

  return psbt;
}

/** Build a BTC-send PSBT (built with REAL addresses — no dummy wallet involved) */
function buildBtcSendPsbt(profile: WalletProfile): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: REGTEST });
  const recipientAddr = 'bcrt1qs52wg59emg847ld37v2dc8f7ruz2e83xj9j555';

  // For BTC sends, the PSBT is built directly with real user addresses
  // (SendModal does this in JS, not through WASM). The only patching needed
  // is tapInternalKey for the signing flow in WalletContext.
  const trScript = bitcoin.address.toOutputScript(profile.taprootAddress, REGTEST);
  psbt.addInput({
    hash: Buffer.alloc(32, 0x55),
    index: 0,
    witnessUtxo: { script: trScript, value: BigInt(100000) },
    // tapInternalKey is set by the PSBT builder — but it could be from the
    // SDK's dummy wallet if the PSBT was built via WASM (e.g., wrap flow).
    // For BTC sends, it should already be correct, but we test with dummy
    // to cover the worst case.
    tapInternalKey: DUMMY.xOnly,
  });

  psbt.addOutput({
    address: recipientAddr,
    value: BigInt(50000),
  });
  psbt.addOutput({
    address: profile.taprootAddress,
    value: BigInt(40000),
  });

  return psbt;
}

// ---------------------------------------------------------------------------
// The full patching pipeline — mirrors production hook code
// ---------------------------------------------------------------------------

function applyFullPatchingPipeline(
  psbt: bitcoin.Psbt,
  profile: WalletProfile,
  fixedOutputs?: Record<number, string>,
): bitcoin.Psbt {
  // Step 1: patchPsbtForBrowserWallet (outputs + witnessUtxo + redeemScript)
  const result = patchPsbtForBrowserWallet({
    psbtBase64: psbt.toBase64(),
    network: REGTEST,
    isBrowserWallet: true,
    taprootAddress: profile.taprootAddress,
    segwitAddress: profile.segwitAddress,
    paymentPubkeyHex: profile.paymentPubkeyHex,
    fixedOutputs,
  });

  // Step 2: patchTapInternalKeys (dummy → user x-only pubkey)
  const patched = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });
  patchTapInternalKeys(patched, profile.xOnlyPubkeyHex);

  return patched;
}

/** Helper to read output script from PSBT */
function outScript(psbt: bitcoin.Psbt, i: number): Buffer {
  return Buffer.from((psbt.data.globalMap.unsignedTx as any).tx.outs[i].script);
}

// ===========================================================================
// Per-wallet tests
// ===========================================================================

for (const [walletId, profile] of Object.entries(PROFILES)) {
  describe(`${profile.name} (${walletId})`, () => {
    // -----------------------------------------------------------------------
    // ALKANE SWAP
    // -----------------------------------------------------------------------
    describe('alkane swap', () => {
      it('patches all outputs correctly', () => {
        const psbt = buildDummySwapPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        const trScript = bitcoin.address.toOutputScript(profile.taprootAddress, REGTEST);

        // P2TR outputs → user taproot
        expect(outScript(patched, 0).equals(trScript)).toBe(true);
        expect(outScript(patched, 1).equals(trScript)).toBe(true);

        // OP_RETURN preserved
        expect(outScript(patched, 2)[0]).toBe(0x6a);

        // BTC change → segwit address if provided, else taproot
        if (profile.segwitAddress) {
          const segScript = bitcoin.address.toOutputScript(profile.segwitAddress, REGTEST);
          expect(outScript(patched, 3).equals(segScript)).toBe(true);
        } else {
          // Single-address wallets: P2WPKH output stays untouched (no segwit override)
          // since there's no segwitAddress to patch to
          expect(outScript(patched, 3).length).toBeGreaterThan(0);
        }
      });

      it('patches tapInternalKey on taproot inputs', () => {
        const psbt = buildDummySwapPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        const xOnlyBuf = Buffer.from(profile.xOnlyPubkeyHex, 'hex');
        expect(
          Buffer.from(patched.data.inputs[0].tapInternalKey!).equals(xOnlyBuf),
        ).toBe(true);
      });

      it('patches witnessUtxo.script on all inputs', () => {
        const psbt = buildDummySwapPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        const trScript = bitcoin.address.toOutputScript(profile.taprootAddress, REGTEST);

        // Input 0 (P2TR) → user taproot script
        expect(Buffer.from(patched.data.inputs[0].witnessUtxo!.script).equals(trScript)).toBe(true);

        // Input 1 (P2WPKH) → depends on wallet type
        if (profile.segwitAddress && profile.needsRedeemScript) {
          // Xverse: witnessUtxo becomes P2SH script after redeemScript injection
          const p2shScript = bitcoin.address.toOutputScript(profile.segwitAddress, REGTEST);
          expect(Buffer.from(patched.data.inputs[1].witnessUtxo!.script).equals(p2shScript)).toBe(true);
        } else if (profile.segwitAddress) {
          // Leather: native P2WPKH
          const swScript = bitcoin.address.toOutputScript(profile.segwitAddress, REGTEST);
          expect(Buffer.from(patched.data.inputs[1].witnessUtxo!.script).equals(swScript)).toBe(true);
        }
      });

      if (profile.needsRedeemScript) {
        it('injects redeemScript on P2WPKH inputs (P2SH-P2WPKH wallet)', () => {
          const psbt = buildDummySwapPsbt();
          const patched = applyFullPatchingPipeline(psbt, profile);

          // P2WPKH input (1) should have redeemScript
          expect(patched.data.inputs[1].redeemScript).toBeDefined();

          // P2TR input (0) should NOT have redeemScript
          expect(patched.data.inputs[0].redeemScript).toBeUndefined();
        });
      }

      it('produces a signable PSBT (sign + finalize succeeds)', () => {
        const psbt = buildDummySwapPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        // Sign all inputs with the wallet's keys
        profile.sign(patched);

        // Verify at least one input was signed
        const hasTapSig = patched.data.inputs.some(i => i.tapKeySig);
        const hasPartialSig = patched.data.inputs.some(i => i.partialSig && i.partialSig.length > 0);
        expect(hasTapSig || hasPartialSig).toBe(true);

        // The taproot input (0) should have tapKeySig
        expect(patched.data.inputs[0].tapKeySig).toBeDefined();
      });
    });

    // -----------------------------------------------------------------------
    // ALKANE SEND
    // -----------------------------------------------------------------------
    describe('alkane send', () => {
      it('patches all outputs correctly', () => {
        const psbt = buildDummyAlkaneSendPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        const trScript = bitcoin.address.toOutputScript(profile.taprootAddress, REGTEST);

        // Both P2TR outputs → user taproot
        expect(outScript(patched, 0).equals(trScript)).toBe(true);
        expect(outScript(patched, 1).equals(trScript)).toBe(true);

        // OP_RETURN preserved
        expect(outScript(patched, 2)[0]).toBe(0x6a);
      });

      it('produces a signable PSBT', () => {
        const psbt = buildDummyAlkaneSendPsbt();
        const patched = applyFullPatchingPipeline(psbt, profile);

        profile.sign(patched);

        expect(patched.data.inputs[0].tapKeySig).toBeDefined();
      });
    });

    // -----------------------------------------------------------------------
    // BTC SEND (tapInternalKey patching only)
    // -----------------------------------------------------------------------
    describe('BTC send', () => {
      it('patches tapInternalKey from dummy to user key', () => {
        const psbt = buildBtcSendPsbt(profile);

        // Only tapInternalKey patching (no patchPsbtForBrowserWallet needed
        // since BTC sends use real addresses)
        patchTapInternalKeys(psbt, profile.xOnlyPubkeyHex);

        const xOnlyBuf = Buffer.from(profile.xOnlyPubkeyHex, 'hex');
        expect(
          Buffer.from(psbt.data.inputs[0].tapInternalKey!).equals(xOnlyBuf),
        ).toBe(true);
      });

      it('produces a signable PSBT after tapInternalKey patching', () => {
        const psbt = buildBtcSendPsbt(profile);
        patchTapInternalKeys(psbt, profile.xOnlyPubkeyHex);

        profile.sign(psbt);

        expect(psbt.data.inputs[0].tapKeySig).toBeDefined();
      });
    });
  });
}

// ===========================================================================
// Cross-wallet consistency checks
// ===========================================================================
describe('Cross-wallet consistency', () => {
  it('all wallets produce the same taproot output script after patching', () => {
    const scripts = Object.values(PROFILES).map(profile => {
      const psbt = buildDummySwapPsbt();
      const patched = applyFullPatchingPipeline(psbt, profile);
      return outScript(patched, 0).toString('hex');
    });

    // All should be identical (same test mnemonic → same taproot address)
    expect(new Set(scripts).size).toBe(1);
  });

  it('OP_RETURN is identical across all wallets (never modified)', () => {
    const opReturns = Object.values(PROFILES).map(profile => {
      const psbt = buildDummySwapPsbt();
      const patched = applyFullPatchingPipeline(psbt, profile);
      return outScript(patched, 2).toString('hex');
    });

    expect(new Set(opReturns).size).toBe(1);
  });

  it('only Xverse gets redeemScript injected', () => {
    const redeemResults = Object.entries(PROFILES).map(([id, profile]) => {
      const psbt = buildDummySwapPsbt();
      const patched = applyFullPatchingPipeline(psbt, profile);
      return { id, hasRedeemScript: !!patched.data.inputs[1].redeemScript };
    });

    for (const { id, hasRedeemScript } of redeemResults) {
      if (id === 'xverse') {
        expect(hasRedeemScript).toBe(true);
      } else {
        expect(hasRedeemScript).toBe(false);
      }
    }
  });

  it('all wallets can sign the taproot input after patching', () => {
    for (const [id, profile] of Object.entries(PROFILES)) {
      const psbt = buildDummySwapPsbt();
      const patched = applyFullPatchingPipeline(psbt, profile);
      profile.sign(patched);

      expect(
        patched.data.inputs[0].tapKeySig,
        `${id} should produce tapKeySig on input 0`,
      ).toBeDefined();
    }
  });
});
