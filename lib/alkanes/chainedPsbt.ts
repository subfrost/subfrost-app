/**
 * Chained PSBT Utilities for Single-Signature BTC ↔ Token Swaps
 *
 * ## Overview
 *
 * This module enables single-popup signing for BTC → Token (wrap+swap) and
 * Token → BTC (swap+unwrap) flows by pre-computing txids and creating virtual UTXOs.
 *
 * ## Key Functions
 *
 * - `getUnfinalizedPsbtTxId()` - Pre-compute txid from unsigned PSBT
 * - `getRemainingUtxosAfterPsbt()` - Filter out UTXOs consumed by first PSBT
 * - `getVirtualChangeUtxos()` - Create synthetic UTXOs from change outputs
 * - `addFrBtcWrapOutputToPsbt()` - Add chained input from wrap output to swap PSBT
 *
 * ## OYL SDK Reference
 *
 * Implementation ported from oyl-sdk/src/alkanes/alkanes.ts:
 * - Lines 63-94: addFrBtcWrapOutToPsbt()
 * - Lines 1311-1519: executeWithBtcWrapUnwrap()
 * - oyl-sdk/src/shared/utils.ts line 887-894: getUnfinalizedPsbtTxId()
 *
 * ## Flow
 *
 * BTC → Token (wrap+swap):
 * 1. Build wrap PSBT (SDK)
 * 2. Pre-compute wrap txid
 * 3. Filter remaining UTXOs (not consumed by wrap)
 * 4. Create virtual UTXOs from wrap change outputs
 * 5. Build swap PSBT:
 *    - Input 0: Chained from wrap output 0 (frBTC)
 *    - Inputs 1..N: Fee inputs (remaining + virtual UTXOs)
 * 6. Batch sign [wrap, swap]
 * 7. Broadcast wrap, then swap
 *
 * Token → BTC (swap+unwrap):
 * 1. Build swap PSBT (SDK) - outputs frBTC
 * 2. Pre-compute swap txid
 * 3. Filter remaining UTXOs
 * 4. Create virtual UTXOs from swap change
 * 5. Build unwrap PSBT:
 *    - Input 0: Chained from swap output 0 (frBTC)
 *    - Inputs 1..N: Fee inputs
 * 6. Batch sign [swap, unwrap]
 * 7. Broadcast swap, then unwrap
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormattedUtxo {
  txId: string;           // Transaction ID
  outputIndex: number;    // Output index (vout)
  satoshis: number;       // Value in sats
  scriptPk: string;       // Output script hex
  address: string;        // Address this UTXO belongs to
  confirmations?: number; // Optional confirmations
  indexed?: boolean;      // Whether indexed (virtual UTXOs are pre-indexed)
}

export interface ChainedPsbtInput {
  hash: string;           // txid of first PSBT
  index: number;          // output index (usually 0 for frBTC)
  witnessUtxo: {
    script: Buffer;
    value: bigint | number;
  };
  tapInternalKey?: Buffer;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Pre-compute the txid of an unsigned (or signed but not finalized) PSBT.
 *
 * Bitcoin transaction IDs are computed from the serialized transaction
 * (excluding witness data for SegWit). We can compute this before signing
 * because the txid only depends on inputs (txid:vout) and outputs (scripts+values).
 *
 * Reference: oyl-sdk/src/shared/utils.ts:887-894
 */
export function getUnfinalizedPsbtTxId(psbt: bitcoin.Psbt): string {
  const virtualTx = new bitcoin.Transaction();
  virtualTx.version = psbt.version;

  psbt.txInputs.forEach(input => {
    virtualTx.addInput(input.hash, input.index, input.sequence);
  });

  psbt.txOutputs.forEach(output => {
    virtualTx.addOutput(output.script, output.value);
  });

  virtualTx.locktime = psbt.locktime;

  return virtualTx.getId();
}

/**
 * Filter out UTXOs that are being spent by the given PSBT.
 *
 * After building the first PSBT (wrap), we need to know which UTXOs
 * are still available for the second PSBT (swap fee inputs).
 *
 * Reference: oyl-sdk/src/alkanes/alkanes.ts:1280-1309
 */
export function getRemainingUtxosAfterPsbt(
  psbt: bitcoin.Psbt,
  allUtxos: FormattedUtxo[],
): FormattedUtxo[] {
  // Build set of spent outpoints: "txid:vout"
  const spentOutpoints = new Set<string>();
  psbt.txInputs.forEach(input => {
    // input.hash is a Buffer, reversed from txid
    const txid = Buffer.from(input.hash).reverse().toString('hex');
    spentOutpoints.add(`${txid}:${input.index}`);
  });

  // Filter out spent UTXOs
  return allUtxos.filter(utxo => {
    const outpoint = `${utxo.txId}:${utxo.outputIndex}`;
    return !spentOutpoints.has(outpoint);
  });
}

/**
 * Create virtual UTXOs from the change outputs of a PSBT.
 *
 * When the first PSBT has change outputs going back to the user,
 * we can create "virtual" UTXOs that reference these outputs.
 * These virtual UTXOs don't exist on-chain yet, but the second
 * PSBT can spend them since they'll exist once the first PSBT confirms.
 *
 * Reference: oyl-sdk/src/alkanes/alkanes.ts:1280-1309
 */
export function getVirtualChangeUtxos(
  psbt: bitcoin.Psbt,
  userAddresses: Set<string>,
  network: bitcoin.Network,
): FormattedUtxo[] {
  const txid = getUnfinalizedPsbtTxId(psbt);
  const virtualUtxos: FormattedUtxo[] = [];

  psbt.txOutputs.forEach((output, index) => {
    // Skip OP_RETURN outputs
    if (output.script[0] === 0x6a) return;

    try {
      const addr = bitcoin.address.fromOutputScript(output.script, network);

      // Only include outputs going to user addresses (change outputs)
      if (userAddresses.has(addr)) {
        virtualUtxos.push({
          txId: txid,
          outputIndex: index,
          satoshis: Number(output.value),
          scriptPk: Buffer.from(output.script).toString('hex'),
          address: addr,
          confirmations: 0,
          indexed: true, // Virtual UTXOs can be used immediately in chained tx
        });
      }
    } catch {
      // Skip outputs that don't have valid addresses (OP_RETURN, etc.)
    }
  });

  return virtualUtxos;
}

/**
 * Get all available UTXOs for the second transaction in a chained flow.
 *
 * Combines:
 * 1. Remaining UTXOs (not spent by first PSBT)
 * 2. Virtual change UTXOs from first PSBT
 *
 * Reference: oyl-sdk/src/alkanes/alkanes.ts:1353-1359
 */
export function getUtxosForSecondTransaction(
  firstPsbt: bitcoin.Psbt,
  allUtxos: FormattedUtxo[],
  includeFirstPsbtChange: boolean,
  userAddresses: Set<string>,
  network: bitcoin.Network,
): FormattedUtxo[] {
  const remaining = getRemainingUtxosAfterPsbt(firstPsbt, allUtxos);

  if (!includeFirstPsbtChange) {
    return remaining;
  }

  const virtualChange = getVirtualChangeUtxos(firstPsbt, userAddresses, network);

  return [...remaining, ...virtualChange];
}

/**
 * Add the frBTC output from wrap PSBT as an input to the swap PSBT.
 *
 * This creates a "chained" transaction where the swap spends the frBTC
 * that will be created by the wrap transaction.
 *
 * IMPORTANT: For wrap transactions, frBTC goes to output 0 (the user's
 * alkanes address after the signer processes the wrap).
 *
 * Reference: oyl-sdk/src/alkanes/alkanes.ts:63-94
 */
export function addFrBtcWrapOutputToPsbt(params: {
  wrapPsbt: bitcoin.Psbt;
  swapPsbt: bitcoin.Psbt;
  taprootPubkey: string;  // User's taproot pubkey (hex, 33 bytes compressed)
  outputIndex?: number;   // Which output has frBTC (default: 0)
}): void {
  const { wrapPsbt, swapPsbt, taprootPubkey, outputIndex = 0 } = params;

  const wrapTxId = getUnfinalizedPsbtTxId(wrapPsbt);
  const output = wrapPsbt.txOutputs[outputIndex];

  if (!output) {
    throw new Error(`Wrap PSBT has no output at index ${outputIndex}`);
  }

  // Convert to x-only pubkey (32 bytes) for taproot
  const xOnlyPubkey = hexToXOnly(taprootPubkey);

  swapPsbt.addInput({
    hash: wrapTxId,
    index: outputIndex,
    witnessUtxo: {
      script: output.script,
      value: BigInt(output.value),
    },
    tapInternalKey: xOnlyPubkey,
  });
}

/**
 * Add a chained input from a previous PSBT output.
 *
 * Generic version of addFrBtcWrapOutputToPsbt for any output.
 */
export function addChainedInput(params: {
  sourcePsbt: bitcoin.Psbt;
  targetPsbt: bitcoin.Psbt;
  outputIndex: number;
  taprootPubkey?: string;  // Required for taproot outputs
  network: bitcoin.Network;
}): void {
  const { sourcePsbt, targetPsbt, outputIndex, taprootPubkey, network } = params;

  const sourceTxId = getUnfinalizedPsbtTxId(sourcePsbt);
  const output = sourcePsbt.txOutputs[outputIndex];

  if (!output) {
    throw new Error(`Source PSBT has no output at index ${outputIndex}`);
  }

  // Detect output type from script
  const script = output.script;
  const isTaproot = script.length === 34 && script[0] === 0x51 && script[1] === 0x20;

  const inputData: any = {
    hash: sourceTxId,
    index: outputIndex,
    witnessUtxo: {
      script: output.script,
      value: BigInt(output.value),
    },
  };

  if (isTaproot && taprootPubkey) {
    inputData.tapInternalKey = hexToXOnly(taprootPubkey);
  }

  targetPsbt.addInput(inputData);
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Convert a compressed pubkey (33 bytes) or already x-only (32 bytes) to x-only format.
 */
export function hexToXOnly(pubkeyHex: string): Buffer {
  const pubkey = Buffer.from(pubkeyHex, 'hex');
  if (pubkey.length === 33) {
    return pubkey.slice(1); // Remove prefix byte (02 or 03)
  }
  if (pubkey.length === 32) {
    return pubkey; // Already x-only
  }
  throw new Error(`Invalid pubkey length: ${pubkey.length}. Expected 32 or 33 bytes.`);
}

/**
 * Convert x-only pubkey (32 bytes) to a fake compressed format for libraries
 * that require 33-byte pubkeys. Uses 0x02 prefix (assumes even y-coordinate).
 */
export function xOnlyToCompressed(xOnlyHex: string): Buffer {
  const xOnly = Buffer.from(xOnlyHex, 'hex');
  if (xOnly.length !== 32) {
    throw new Error(`Invalid x-only pubkey length: ${xOnly.length}. Expected 32 bytes.`);
  }
  return Buffer.concat([Buffer.from([0x02]), xOnly]);
}

/**
 * Calculate minimum fee for a transaction based on input/output counts.
 *
 * This is a simplified estimate. Real fee calculation should use PSBT analysis.
 */
export function estimateMinimumFee(params: {
  taprootInputCount: number;
  nonTaprootInputCount: number;
  outputCount: number;
  feeRate: number;
}): number {
  const { taprootInputCount, nonTaprootInputCount, outputCount, feeRate } = params;

  // Estimated vbytes per component:
  // - Taproot input: ~57.5 vB (keypath spend)
  // - SegWit input: ~68 vB (P2WPKH)
  // - Output: ~34 vB (P2TR) or ~31 vB (P2WPKH)
  // - Overhead: ~10.5 vB

  const taprootInputVbytes = 57.5;
  const segwitInputVbytes = 68;
  const outputVbytes = 34;
  const overheadVbytes = 10.5;

  const totalVbytes =
    overheadVbytes +
    taprootInputCount * taprootInputVbytes +
    nonTaprootInputCount * segwitInputVbytes +
    outputCount * outputVbytes;

  return Math.ceil(totalVbytes * feeRate);
}

/**
 * Select UTXOs to cover a target amount.
 *
 * Simple greedy selection - takes UTXOs until target is met.
 */
export function selectUtxosForAmount(
  utxos: FormattedUtxo[],
  targetSats: number,
): { selected: FormattedUtxo[]; totalSats: number } {
  const selected: FormattedUtxo[] = [];
  let totalSats = 0;

  // Sort by value descending for efficiency
  const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);

  for (const utxo of sorted) {
    if (totalSats >= targetSats) break;
    selected.push(utxo);
    totalSats += utxo.satoshis;
  }

  return { selected, totalSats };
}
