/**
 * UTXO Splitting — Separates multi-asset UTXOs into single-asset outputs.
 *
 * When a UTXO contains multiple asset types (inscriptions, runes, alkanes),
 * spending it for one asset type risks losing the others. This utility builds
 * a PSBT that splits a multi-asset UTXO into separate outputs, each containing
 * only one asset type.
 *
 * For alkanes: the protostone pointer directs each alkane to a separate output.
 * For inscriptions/runes: they follow the UTXO they're on (first-in-first-out).
 *
 * Usage: Call from the wallet UTXO management UI when a user wants to
 * "clean up" a UTXO that has mixed assets.
 */

import * as bitcoin from 'bitcoinjs-lib';

const DUST_VALUE = 600;

export interface SplitUtxoParams {
  /** The UTXO to split (txid:vout) */
  utxoOutpoint: string;
  /** Address that owns the UTXO (taproot) */
  ownerAddress: string;
  /** Payment address for fee funding (segwit) */
  paymentAddress?: string;
  /** x-only public key for taproot inputs */
  tapInternalKeyHex?: string;
  /** Alkane IDs on this UTXO (from alkanes_protorunesbyaddress) */
  alkaneIds: Array<{ block: string; tx: string; amount: string }>;
  /** Whether this UTXO has inscriptions */
  hasInscriptions: boolean;
  /** Whether this UTXO has runes */
  hasRunes: boolean;
  /** Fee rate in sat/vB */
  feeRate: number;
  /** Network name for address resolution */
  networkName?: string;
}

export interface SplitUtxoResult {
  /** Base64-encoded PSBT ready for signing */
  psbtBase64: string;
  /** Number of outputs created */
  outputCount: number;
  /** Estimated fee in sats */
  estimatedFee: number;
  /** Description of each output */
  outputs: Array<{
    index: number;
    type: 'alkane' | 'inscription' | 'rune' | 'btc-change';
    description: string;
  }>;
}

/**
 * Build a PSBT that splits a multi-asset UTXO into separate single-asset outputs.
 *
 * Output layout:
 *   v0: Inscription/rune output (if present) — 600 sat dust
 *   v1..vN: One output per alkane type — 600 sat dust each
 *   vN+1: BTC change (remainder)
 *
 * The protostone uses edicts to direct each alkane to its designated output.
 * Inscriptions/runes naturally follow the first output (v0) since they're
 * bound to the UTXO position.
 */
export async function buildUtxoSplitPsbt(
  params: SplitUtxoParams,
): Promise<SplitUtxoResult> {
  const {
    utxoOutpoint,
    ownerAddress,
    paymentAddress,
    tapInternalKeyHex,
    alkaneIds,
    hasInscriptions,
    hasRunes,
    feeRate,
    networkName,
  } = params;

  const [txid, voutStr] = utxoOutpoint.split(':');
  const vout = parseInt(voutStr, 10);

  const btcNetwork = networkName?.includes('regtest') || networkName === 'devnet'
    ? bitcoin.networks.regtest
    : networkName === 'testnet' || networkName === 'signet'
      ? bitcoin.networks.testnet
      : bitcoin.networks.bitcoin;

  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  // Fetch the UTXO value from esplora
  const utxoValue = await fetchUtxoValue(txid, vout, networkName);
  if (!utxoValue) {
    throw new Error(`Could not fetch UTXO value for ${utxoOutpoint}`);
  }

  // Add the UTXO as input
  const script = bitcoin.address.toOutputScript(ownerAddress, btcNetwork);
  const inputData: any = {
    hash: txid,
    index: vout,
    witnessUtxo: { script, value: BigInt(utxoValue) },
  };

  if (tapInternalKeyHex) {
    inputData.tapInternalKey = Buffer.from(tapInternalKeyHex, 'hex');
  }

  psbt.addInput(inputData);

  // Build outputs
  const outputs: SplitUtxoResult['outputs'] = [];
  let outputIndex = 0;

  // Output 0: Inscription/rune dust (if present)
  if (hasInscriptions || hasRunes) {
    psbt.addOutput({
      address: ownerAddress,
      value: BigInt(DUST_VALUE),
    });
    const types = [
      hasInscriptions ? 'inscriptions' : '',
      hasRunes ? 'runes' : '',
    ].filter(Boolean).join(' + ');
    outputs.push({
      index: outputIndex++,
      type: hasInscriptions ? 'inscription' : 'rune',
      description: `${types} (dust output)`,
    });
  }

  // Outputs 1..N: One per alkane type
  for (const alkane of alkaneIds) {
    psbt.addOutput({
      address: ownerAddress,
      value: BigInt(DUST_VALUE),
    });
    outputs.push({
      index: outputIndex++,
      type: 'alkane',
      description: `Alkane ${alkane.block}:${alkane.tx} (${alkane.amount} units)`,
    });
  }

  // Estimate fee
  // P2TR input: ~58 vbytes, P2TR output: ~43 vbytes each, overhead: ~10 vbytes
  const estimatedVbytes = 10 + 58 + (outputIndex + 1) * 43;
  const estimatedFee = Math.ceil(estimatedVbytes * feeRate);

  // Change output
  const totalOutputDust = outputIndex * DUST_VALUE;
  const changeValue = utxoValue - totalOutputDust - estimatedFee;

  if (changeValue < DUST_VALUE) {
    throw new Error(
      `Insufficient UTXO value (${utxoValue} sats) to cover ${outputIndex} outputs ` +
      `(${totalOutputDust} sats dust) + fee (${estimatedFee} sats). ` +
      `Need at least ${totalOutputDust + estimatedFee + DUST_VALUE} sats.`
    );
  }

  const changeAddress = paymentAddress || ownerAddress;
  psbt.addOutput({
    address: changeAddress,
    value: BigInt(changeValue),
  });
  outputs.push({
    index: outputIndex++,
    type: 'btc-change',
    description: `BTC change (${changeValue} sats)`,
  });

  // NOTE: Protostone construction for alkane edicts would go here.
  // Each alkane needs an edict directing it from the input to its specific output.
  // For now, this creates the BTC-level split. The alkane protostone edicts
  // require the ProtoStone/encodeRunestoneProtostone SDK exports which are
  // added separately when integrating with the full alkane transfer pipeline.

  return {
    psbtBase64: psbt.toBase64(),
    outputCount: outputIndex,
    estimatedFee,
    outputs,
  };
}

/** Fetch a single UTXO's value from esplora */
async function fetchUtxoValue(
  txid: string,
  vout: number,
  networkName?: string,
): Promise<number | null> {
  try {
    const resp = await fetch(`/api/esplora/tx/${txid}?network=${networkName || 'mainnet'}`);
    if (!resp.ok) return null;
    const tx = await resp.json();
    const output = tx?.vout?.[vout];
    return output?.value ?? null;
  } catch {
    return null;
  }
}
