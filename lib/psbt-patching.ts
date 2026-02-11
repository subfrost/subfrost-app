/**
 * Centralized PSBT patching for browser wallets.
 *
 * WHY THIS EXISTS:
 * The OYL SDK's WASM builds PSBTs using a dummy wallet (walletCreate() in
 * AlkanesSDKContext). All symbolic addresses (p2tr:0, p2wpkh:0) resolve to
 * the dummy wallet's keys, so every output scriptPubKey and every input
 * witnessUtxo.script contains the dummy wallet's hashes — not the user's.
 *
 * Before signing, we must rewrite:
 *   1. OUTPUTS: replace dummy scriptPubKeys with the user's real addresses
 *   2. INPUTS (witnessUtxo): replace dummy witnessUtxo.script on P2TR and
 *      P2WPKH inputs with the user's real scriptPubKey — required for correct
 *      sighash computation AND for wallets that validate witnessUtxo (UniSat)
 *   3. INPUTS (P2SH): for P2SH-P2WPKH wallets (Xverse), inject redeemScript
 *
 * Matching is by SCRIPT TYPE PATTERN (opcode + length), never by exact
 * bytes, because the dummy wallet's hashes differ from the user's.
 *
 * WALLET GENERALIZATION:
 * - Xverse: P2SH-P2WPKH payment (starts with '3'). Needs redeemScript.
 * - UniSat/OKX: single-address (P2TR or P2WPKH). Need witnessUtxo patching.
 * - Leather/OYL/Phantom/etc: native P2WPKH (bc1q). Need witnessUtxo patching.
 * - Keystore: different code path entirely (real mnemonic loaded).
 *
 * JOURNAL (2026-02-11): Added patchInputWitnessScripts step. Previously only
 * outputs were patched, leaving input witnessUtxo.script with the dummy wallet's
 * keys. UniSat's PSBT decoder fails with "Cannot read properties of undefined
 * (reading 'scriptPk')" when it encounters inputs with mismatched/missing
 * witnessUtxo data. Additionally, incorrect witnessUtxo.script causes wrong
 * sighash computation for all wallets. Now all P2TR/P2WPKH input scripts are
 * patched to the user's actual addresses.
 *
 * First proven on mainnet: tx f9e7eaf2c548647f99f5a1b72ef37fed5771191b9f30adab2
 * (Xverse P2SH-P2WPKH input 0 signed correctly with injected redeemScript)
 */
import * as bitcoin from 'bitcoinjs-lib';

// ---------------------------------------------------------------------------
// Script type detection helpers
// ---------------------------------------------------------------------------

/** OP_RETURN: starts with 0x6a */
function isOpReturn(script: Buffer): boolean {
  return script.length > 0 && script[0] === 0x6a;
}

/** P2TR: OP_1 <32-byte x-only pubkey> → [0x51, ...32 bytes] = 34 bytes */
function isP2TR(script: Buffer): boolean {
  return script[0] === 0x51 && script.length === 34;
}

/** P2WPKH: OP_0 <20-byte pubkey hash> → [0x00, 0x14, ...20 bytes] = 22 bytes */
function isP2WPKH(script: Buffer): boolean {
  return script[0] === 0x00 && script.length === 22;
}

// ---------------------------------------------------------------------------
// Output patching
// ---------------------------------------------------------------------------

export interface OutputPatchConfig {
  /** User's taproot address (bc1p...) — always required */
  taprootAddress: string;
  /** User's segwit/payment address (bc1q... or 3...) — optional */
  segwitAddress?: string;
  /** Bitcoin network for address→script conversion */
  network: bitcoin.Network;
  /** Fixed output overrides: { outputIndex: address }. Applied regardless
   *  of isBrowserWallet (e.g., signer at output 0 for wrap). */
  fixedOutputs?: Record<number, string>;
}

/**
 * Patch PSBT outputs from dummy/symbolic scriptPubKeys to real addresses.
 *
 * For browser wallets, replaces ALL non-OP_RETURN outputs by script type:
 *   - P2TR → taprootAddress
 *   - P2WPKH → segwitAddress (or taprootAddress if no segwit provided)
 *
 * fixedOutputs are always applied (even for keystore wallets) and are
 * excluded from the browser-wallet sweep.
 */
export function patchOutputs(
  psbt: bitcoin.Psbt,
  config: OutputPatchConfig,
  isBrowserWallet: boolean,
): void {
  const { taprootAddress, segwitAddress, network, fixedOutputs } = config;
  const outs = (psbt.data.globalMap.unsignedTx as any).tx.outs;
  const fixedIndices = new Set(
    fixedOutputs ? Object.keys(fixedOutputs).map(Number) : [],
  );

  // Apply fixed outputs first (signer address, recipient, etc.)
  if (fixedOutputs) {
    for (const [idx, addr] of Object.entries(fixedOutputs)) {
      const i = Number(idx);
      if (i < outs.length) {
        outs[i].script = bitcoin.address.toOutputScript(addr, network);
      }
    }
  }

  // For browser wallets, sweep remaining outputs by type
  if (isBrowserWallet) {
    const taprootScript = bitcoin.address.toOutputScript(taprootAddress, network);
    const segwitScript = segwitAddress
      ? bitcoin.address.toOutputScript(segwitAddress, network)
      : null;

    for (let i = 0; i < outs.length; i++) {
      if (fixedIndices.has(i)) continue;
      const script = Buffer.from(outs[i].script);
      if (isOpReturn(script)) continue;
      if (isP2TR(script)) {
        outs[i].script = taprootScript;
      } else if (isP2WPKH(script) && segwitScript) {
        outs[i].script = segwitScript;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Input witnessUtxo script patching
// ---------------------------------------------------------------------------

/**
 * Patch witnessUtxo.script on PSBT inputs from the dummy wallet's keys to
 * the user's real scriptPubKeys.
 *
 * The WASM SDK builds inputs using a dummy wallet, so witnessUtxo.script
 * contains the dummy's P2TR or P2WPKH scriptPubKey. This causes:
 *   - UniSat: "Failed to decode PSBT data: Cannot read properties of
 *     undefined (reading 'scriptPk')" — UniSat validates witnessUtxo
 *     consistency and fails on the dummy keys
 *   - All wallets: incorrect sighash because BIP 341 sighash includes
 *     the previous output scriptPubKey from witnessUtxo
 *
 * For each input with witnessUtxo, replaces the script by type:
 *   - P2TR (0x51, 34 bytes) → user's taproot scriptPubKey
 *   - P2WPKH (0x00, 22 bytes) → user's segwit scriptPubKey
 *
 * Also handles inputs missing witnessUtxo entirely by reconstructing
 * from nonWitnessUtxo when available, with the correct user script.
 *
 * @returns number of inputs patched (for logging)
 */
export function patchInputWitnessScripts(
  psbt: bitcoin.Psbt,
  config: OutputPatchConfig,
): number {
  const { taprootAddress, segwitAddress, network } = config;
  const taprootScript = bitcoin.address.toOutputScript(taprootAddress, network);

  // Only use segwitScript for P2WPKH patching if the address is actually
  // a P2WPKH/P2SH address (not a taproot address). For single-address wallets
  // like UniSat, segwitAddress may be the same as taprootAddress.
  const segwitScript = (() => {
    if (!segwitAddress || segwitAddress === taprootAddress) return null;
    const s = bitcoin.address.toOutputScript(segwitAddress, network);
    const buf = Buffer.from(s);
    // Only use for P2WPKH patching if the script type matches segwit/P2SH
    return isP2WPKH(buf) || (buf.length === 23 && buf[0] === 0xa9) ? s : null;
  })();

  let patched = 0;

  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];

    // If witnessUtxo exists, patch the script
    if (input.witnessUtxo) {
      const script = Buffer.from(input.witnessUtxo.script);
      if (isP2TR(script)) {
        input.witnessUtxo = { ...input.witnessUtxo, script: taprootScript };
        patched++;
      } else if (isP2WPKH(script) && segwitScript) {
        input.witnessUtxo = { ...input.witnessUtxo, script: segwitScript };
        patched++;
      }
      continue;
    }

    // witnessUtxo is missing — try to reconstruct from nonWitnessUtxo
    if (input.nonWitnessUtxo) {
      const prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
      const txIn = (psbt.data.globalMap.unsignedTx as any).tx.ins[i];
      if (txIn && prevTx.outs[txIn.index]) {
        const prevOut = prevTx.outs[txIn.index];
        const prevScript = Buffer.from(prevOut.script);
        // Reconstruct witnessUtxo with the user's script
        let newScript: Buffer | Uint8Array | null = null;
        if (isP2TR(prevScript)) {
          newScript = taprootScript;
        } else if (isP2WPKH(prevScript) && segwitScript) {
          newScript = segwitScript;
        }
        if (newScript) {
          input.witnessUtxo = {
            value: prevOut.value,
            script: Buffer.from(newScript),
          };
          patched++;
        }
      }
      continue;
    }

    // Neither witnessUtxo nor nonWitnessUtxo — reconstruct from input type
    // Use tapInternalKey presence as a heuristic for P2TR inputs
    if (input.tapInternalKey) {
      // P2TR input without witnessUtxo — we can't know the value, so we
      // can only log a warning. The wallet will likely fail on this input.
      console.warn(`[patchInputWitnessScripts] Input ${i} has tapInternalKey but no witnessUtxo or nonWitnessUtxo`);
    }
  }

  return patched;
}

// ---------------------------------------------------------------------------
// Input patching (P2SH-P2WPKH redeemScript injection)
// ---------------------------------------------------------------------------

export interface InputPatchConfig {
  /** User's payment address (the P2SH '3...' or native segwit 'bc1q...') */
  paymentAddress: string;
  /** Compressed public key hex for the payment address */
  pubkeyHex: string;
  /** Bitcoin network */
  network: bitcoin.Network;
}

/**
 * Inject redeemScript into PSBT inputs for P2SH-P2WPKH wallets.
 *
 * Only runs when paymentAddress is P2SH (starts with '3' or '2').
 * For native segwit wallets (bc1q), this is a no-op.
 *
 * For each input, determines the previous output script from either
 * witnessUtxo or nonWitnessUtxo. If the script matches the P2WPKH
 * type pattern (0x00, 22 bytes) or the exact P2SH scriptPubKey, it:
 *   1. Replaces witnessUtxo.script with the P2SH scriptPubKey
 *   2. Injects the P2WPKH redeemScript
 *
 * Uses direct property assignment (not psbt.updateInput) to avoid
 * "Can not add duplicate data to input" errors from bitcoinjs-lib.
 *
 * @returns number of inputs patched (for logging)
 */
export function injectRedeemScripts(
  psbt: bitcoin.Psbt,
  config: InputPatchConfig,
): number {
  const { paymentAddress, pubkeyHex, network } = config;

  // Only P2SH addresses need redeemScript injection
  const needsRedeemScript =
    paymentAddress.startsWith('3') || paymentAddress.startsWith('2');
  if (!needsRedeemScript) return 0;

  const pubkey = Buffer.from(pubkeyHex, 'hex');
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network });
  const redeemScript = Buffer.from(p2wpkh.output!);
  const p2shScriptPubKey = Buffer.from(
    bitcoin.address.toOutputScript(paymentAddress, network),
  );

  let patched = 0;

  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (input.redeemScript) continue; // Already has redeemScript

    const prevScript = getPrevOutputScript(psbt, i);
    if (!prevScript) continue;

    // Match by script type pattern OR exact P2SH scriptPubKey.
    // The dummy wallet's P2WPKH hash differs from the user's, so
    // exact-byte matching on P2WPKH scripts would fail — we match
    // by type pattern instead (same approach used for output patching).
    if (isP2WPKH(prevScript) || prevScript.equals(p2shScriptPubKey)) {
      if (input.witnessUtxo) {
        input.witnessUtxo = { ...input.witnessUtxo, script: p2shScriptPubKey };
      }
      psbt.data.inputs[i].redeemScript = redeemScript;
      patched++;
    }
  }

  return patched;
}

// ---------------------------------------------------------------------------
// Convenience: single-call patching for mutation hooks
// ---------------------------------------------------------------------------

export interface PatchPsbtParams {
  psbtBase64: string;
  network: bitcoin.Network;
  isBrowserWallet: boolean;
  /** User's taproot address */
  taprootAddress: string;
  /** User's segwit/payment address */
  segwitAddress?: string;
  /** Compressed public key hex for the payment address (for redeemScript) */
  paymentPubkeyHex?: string;
  /** Fixed output overrides: { outputIndex: address } */
  fixedOutputs?: Record<number, string>;
}

/**
 * One-call PSBT patching: outputs + input witnessUtxo + redeemScripts.
 *
 * Parses the PSBT, patches outputs, patches input witnessUtxo scripts,
 * injects redeemScripts if needed, and returns the updated base64 string.
 */
export function patchPsbtForBrowserWallet(params: PatchPsbtParams): {
  psbtBase64: string;
  inputsPatched: number;
} {
  const {
    psbtBase64,
    network,
    isBrowserWallet,
    taprootAddress,
    segwitAddress,
    paymentPubkeyHex,
    fixedOutputs,
  } = params;

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });

  // 1. Patch outputs (dummy scriptPubKeys → user's real addresses)
  patchOutputs(psbt, { taprootAddress, segwitAddress, network, fixedOutputs }, isBrowserWallet);

  let inputsPatched = 0;

  if (isBrowserWallet) {
    // 2. Patch input witnessUtxo scripts (dummy → user's real scriptPubKeys)
    // This must run BEFORE redeemScript injection since it handles P2TR and P2WPKH,
    // while redeemScript injection handles the P2SH-wrapped P2WPKH case.
    const witnessPatched = patchInputWitnessScripts(psbt, {
      taprootAddress,
      segwitAddress,
      network,
    });
    if (witnessPatched > 0) {
      console.log(`[patchPsbtForBrowserWallet] Patched witnessUtxo.script on ${witnessPatched} input(s)`);
    }

    // 3. Inject redeemScripts for P2SH-P2WPKH inputs (Xverse)
    if (paymentPubkeyHex && segwitAddress) {
      inputsPatched = injectRedeemScripts(psbt, {
        paymentAddress: segwitAddress,
        pubkeyHex: paymentPubkeyHex,
        network,
      });
    }
  }

  return { psbtBase64: psbt.toBase64(), inputsPatched };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the previous output script for a PSBT input.
 * Checks witnessUtxo first, falls back to nonWitnessUtxo.
 */
function getPrevOutputScript(psbt: bitcoin.Psbt, inputIndex: number): Buffer | null {
  const input = psbt.data.inputs[inputIndex];

  if (input.witnessUtxo) {
    return Buffer.from(input.witnessUtxo.script);
  }

  if (input.nonWitnessUtxo) {
    const prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
    const txIn = (psbt.data.globalMap.unsignedTx as any).tx.ins[inputIndex];
    if (txIn && prevTx.outs[txIn.index]) {
      return Buffer.from(prevTx.outs[txIn.index].script);
    }
  }

  return null;
}
