/**
 * Build an alkane transfer PSBT entirely in JavaScript.
 *
 * Bypasses the WASM SDK's `alkanesExecuteWithStrings` which internally uses
 * metashrew `protorunes_by_address` for UTXO discovery (now defunct).
 *
 * Instead uses:
 *   - SDK WebProvider (`esploraGetAddressUtxo`, `esploraGetTxHex`) for UTXO/tx discovery
 *   - SDK JS exports (`ProtoStone`, `encodeRunestoneProtostone`) for protostone encoding
 *   - bitcoinjs-lib for PSBT construction with real addresses (no dummy wallet)
 */

import * as bitcoin from 'bitcoinjs-lib';
// @ts-expect-error - Types added in PR #246 (kungfuflex/alkanes-rs), pending merge
import { ProtoStone, encodeRunestoneProtostone } from '@alkanes/ts-sdk';
import type * as alkWasm from '@alkanes/ts-sdk/wasm';

type WebProvider = InstanceType<typeof alkWasm.WebProvider>;

const DUST_VALUE = 546;
const PROTOCOL_TAG_ALKANES = 1n;

export interface BuildAlkaneTransferParams {
  provider: WebProvider;         // SDK WASM provider for esplora calls
  alkaneId: string;              // e.g., "2:0"
  amount: bigint;                // base units to transfer
  senderTaprootAddress: string;
  senderPaymentAddress?: string; // segwit address for BTC fee funding (dual-address wallets)
  recipientAddress: string;
  tapInternalKeyHex?: string;    // x-only pubkey for P2TR inputs
  paymentPubkeyHex?: string;     // compressed pubkey for P2SH-P2WPKH
  feeRate: number;               // sat/vB
  network: bitcoin.Network;
}

export interface BuildAlkaneTransferResult {
  psbtBase64: string;
  estimatedFee: number;
}

interface SimpleUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

/**
 * Fetch UTXOs for an address via SDK WebProvider (esplora-backed).
 */
async function fetchUtxos(provider: WebProvider, address: string): Promise<SimpleUtxo[]> {
  const result = await provider.esploraGetAddressUtxo(address);
  if (!result || !Array.isArray(result)) {
    throw new Error('Failed to fetch UTXOs via SDK esplora');
  }
  return result.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    confirmed: u.status?.confirmed ?? false,
  }));
}

/**
 * Fetch raw transaction hex for a txid (needed for witnessUtxo).
 */
async function fetchTxHex(provider: WebProvider, txid: string): Promise<string> {
  const hex = await provider.esploraGetTxHex(txid);
  if (!hex || typeof hex !== 'string') {
    throw new Error(`Failed to fetch tx hex for ${txid}`);
  }
  return hex;
}

/**
 * Estimate virtual size for an alkane transfer transaction.
 *
 * Outputs: v0 (sender change, P2TR), v1 (recipient), v2 (OP_RETURN), v3 (BTC change)
 */
function estimateVsize(
  numTaprootInputs: number,
  numSegwitInputs: number,
  opReturnSize: number,
  recipientOutputSize: number,
  changeOutputSize: number,
): number {
  const TX_OVERHEAD = 10.5; // version + locktime + witness marker
  const TAPROOT_INPUT_VSIZE = 57.5;
  const SEGWIT_INPUT_VSIZE = 68;
  const P2TR_OUTPUT = 43;
  const OP_RETURN_OUTPUT = 8 + 1 + opReturnSize; // value(8) + scriptLen(1) + script

  return Math.ceil(
    TX_OVERHEAD
    + numTaprootInputs * TAPROOT_INPUT_VSIZE
    + numSegwitInputs * SEGWIT_INPUT_VSIZE
    + P2TR_OUTPUT            // v0: sender alkane change (always taproot)
    + recipientOutputSize    // v1: recipient (varies by address type)
    + OP_RETURN_OUTPUT       // v2: protostone
    + changeOutputSize       // v3: BTC change
  );
}

/**
 * Get output vsize for an address type.
 */
function outputVsizeForAddress(address: string): number {
  const lower = address.toLowerCase();
  if (lower.startsWith('bc1p') || lower.startsWith('tb1p') || lower.startsWith('bcrt1p')) return 43; // P2TR
  if (lower.startsWith('bc1q') || lower.startsWith('tb1q') || lower.startsWith('bcrt1q')) return 31; // P2WPKH
  if (lower.startsWith('3') || lower.startsWith('2')) return 32; // P2SH
  return 34; // P2PKH
}

export async function buildAlkaneTransferPsbt(
  params: BuildAlkaneTransferParams,
): Promise<BuildAlkaneTransferResult> {
  const {
    provider, alkaneId, amount, senderTaprootAddress, senderPaymentAddress,
    recipientAddress, feeRate, network,
  } = params;

  const [block, tx] = alkaneId.split(':').map(Number);

  // -----------------------------------------------------------------------
  // 1. Build protostone OP_RETURN
  // -----------------------------------------------------------------------
  const protostone = ProtoStone.edicts({
    protocolTag: PROTOCOL_TAG_ALKANES,
    edicts: [{
      id: { block: BigInt(block), tx: BigInt(tx) },
      amount: BigInt(amount),
      output: 1, // v1 = recipient
    }],
  });

  const { encodedRunestone } = encodeRunestoneProtostone({
    protostones: [protostone],
    pointer: 0, // unedicted remainder → v0 (sender change)
  });

  const opReturnScript = Buffer.from(encodedRunestone);

  // -----------------------------------------------------------------------
  // 2. Discover UTXOs
  // -----------------------------------------------------------------------
  const taprootUtxos = await fetchUtxos(provider, senderTaprootAddress);

  // Alkane UTXOs are dust-value outputs on the taproot address.
  // Include ALL dust UTXOs as inputs — the edict handles distribution.
  const alkaneUtxos = taprootUtxos
    .filter(u => u.value <= 1000 && u.confirmed)
    .sort((a, b) => b.value - a.value);

  if (alkaneUtxos.length === 0) {
    throw new Error('No alkane UTXOs found at sender address');
  }

  // BTC UTXOs for fee funding
  const hasSeparatePayment = senderPaymentAddress && senderPaymentAddress !== senderTaprootAddress;
  let btcUtxos: SimpleUtxo[];
  if (hasSeparatePayment) {
    btcUtxos = await fetchUtxos(provider, senderPaymentAddress);
  } else {
    // Single-address: use non-dust UTXOs from the taproot address
    btcUtxos = taprootUtxos.filter(u => u.value > 1000);
  }
  btcUtxos = btcUtxos
    .filter(u => u.confirmed)
    .sort((a, b) => b.value - a.value); // largest first

  // -----------------------------------------------------------------------
  // 3. Calculate fee and select BTC UTXOs
  // -----------------------------------------------------------------------
  const alkaneInputTotal = alkaneUtxos.reduce((s, u) => s + u.value, 0);
  const outputCost = DUST_VALUE * 2; // v0 (sender change) + v1 (recipient)
  const recipientOutputVsize = outputVsizeForAddress(recipientAddress);
  const btcChangeAddress = hasSeparatePayment ? senderPaymentAddress : senderTaprootAddress;
  const changeOutputVsize = outputVsizeForAddress(btcChangeAddress);

  // Select BTC UTXOs until we cover fee + dust outputs
  const selectedBtcUtxos: SimpleUtxo[] = [];
  let btcInputTotal = 0;
  let estimatedFee = 0;

  // First estimate with zero BTC inputs to get baseline
  for (const utxo of btcUtxos) {
    selectedBtcUtxos.push(utxo);
    btcInputTotal += utxo.value;

    const numTaprootInputs = alkaneUtxos.length + (hasSeparatePayment ? 0 : selectedBtcUtxos.length);
    const numSegwitInputs = hasSeparatePayment ? selectedBtcUtxos.length : 0;

    const vsize = estimateVsize(
      numTaprootInputs,
      numSegwitInputs,
      opReturnScript.length,
      recipientOutputVsize,
      changeOutputVsize,
    );
    estimatedFee = Math.ceil(vsize * feeRate);

    const totalIn = alkaneInputTotal + btcInputTotal;
    const totalOut = outputCost + estimatedFee;

    if (totalIn >= totalOut) break;
  }

  const totalIn = alkaneInputTotal + btcInputTotal;
  const totalOut = outputCost + estimatedFee;

  if (totalIn < totalOut) {
    throw new Error(`Insufficient BTC for fee. Need ${totalOut} sats, have ${totalIn} sats.`);
  }

  const btcChange = totalIn - outputCost - estimatedFee;

  // -----------------------------------------------------------------------
  // 4. Fetch raw transactions for witnessUtxo
  // -----------------------------------------------------------------------
  const allInputUtxos = [...alkaneUtxos, ...selectedBtcUtxos];
  const uniqueTxids = [...new Set(allInputUtxos.map(u => u.txid))];
  const txHexMap = new Map<string, string>();
  await Promise.all(uniqueTxids.map(async (txid) => {
    const hex = await fetchTxHex(provider, txid);
    txHexMap.set(txid, hex);
  }));

  // -----------------------------------------------------------------------
  // 5. Build PSBT
  // -----------------------------------------------------------------------
  const psbt = new bitcoin.Psbt({ network });

  // Add alkane inputs (taproot, from sender)
  for (const utxo of alkaneUtxos) {
    const txHex = txHexMap.get(utxo.txid)!;
    const prevTx = bitcoin.Transaction.fromHex(txHex);
    const prevOut = prevTx.outs[utxo.vout];

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(prevOut.script),
        value: BigInt(utxo.value),
      },
    });
  }

  // Add BTC fee inputs
  for (const utxo of selectedBtcUtxos) {
    const txHex = txHexMap.get(utxo.txid)!;
    const prevTx = bitcoin.Transaction.fromHex(txHex);
    const prevOut = prevTx.outs[utxo.vout];

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(prevOut.script),
        value: BigInt(utxo.value),
      },
    });
  }

  // NOTE: tapInternalKey is intentionally omitted from the PSBT.
  // For P2TR key-path spends, the wallet determines signing from the
  // witnessUtxo script (OP_1 <32-byte push> = P2TR). Browser Buffer
  // polyfills corrupt the binary serialization, so we let the wallet
  // handle tapInternalKey internally during signing.

  // v0: Sender alkane change (dust — receives unedicted alkane remainder)
  psbt.addOutput({
    address: senderTaprootAddress,
    value: BigInt(DUST_VALUE),
  });

  // v1: Recipient (dust — receives alkane via edict)
  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(DUST_VALUE),
  });

  // v2: OP_RETURN (protostone)
  psbt.addOutput({
    script: opReturnScript,
    value: BigInt(0),
  });

  // v3: BTC change (fee remainder)
  if (btcChange >= DUST_VALUE) {
    psbt.addOutput({
      address: btcChangeAddress,
      value: BigInt(btcChange),
    });
  }

  return {
    psbtBase64: psbt.toBase64(),
    estimatedFee,
  };
}
