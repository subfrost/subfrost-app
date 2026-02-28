/**
 * Build an alkane transfer PSBT entirely in JavaScript.
 *
 * Bypasses the WASM SDK's `alkanesExecuteWithStrings` which internally uses
 * metashrew `protorunes_by_address` for UTXO discovery (now defunct).
 *
 * Instead uses:
 *   - esplora (`esplora_address::utxo`) for UTXO discovery
 *   - SDK JS exports (`ProtoStone`, `encodeRunestoneProtostone`) for protostone encoding
 *   - bitcoinjs-lib for PSBT construction with real addresses (no dummy wallet)
 */

import * as bitcoin from 'bitcoinjs-lib';
// @ts-expect-error - ProtoStone and encodeRunestoneProtostone are in dist/index.js but not in index.d.ts
import { ProtoStone, encodeRunestoneProtostone } from '@alkanes/ts-sdk';

const DUST_VALUE = 546;
const PROTOCOL_TAG_ALKANES = 1n;

export interface BuildAlkaneTransferParams {
  alkaneId: string;           // e.g., "2:0"
  amount: bigint;             // base units to transfer
  senderTaprootAddress: string;
  senderPaymentAddress?: string; // segwit address for BTC fee funding (dual-address wallets)
  recipientAddress: string;
  tapInternalKeyHex?: string;    // x-only pubkey for P2TR inputs
  paymentPubkeyHex?: string;     // compressed pubkey for P2SH-P2WPKH
  feeRate: number;               // sat/vB
  network: bitcoin.Network;
  networkName: string;           // for RPC proxy routing
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
 * Fetch UTXOs for an address via esplora (espo-backed, not metashrew).
 */
async function fetchUtxos(address: string): Promise<SimpleUtxo[]> {
  const resp = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'esplora_address::utxo',
      params: [address],
      id: 1,
    }),
  });
  const json = await resp.json();
  if (!json.result || !Array.isArray(json.result)) {
    throw new Error('Failed to fetch UTXOs via esplora');
  }
  return json.result.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    confirmed: u.status?.confirmed ?? false,
  }));
}

/**
 * Derive the output script for an address.
 * For segwit/taproot addresses this is cheaper and more reliable than
 * fetching the full raw transaction hex from esplora (which can 404 on
 * regtest when the esplora instance is out of sync with the RPC backend).
 */
function addressToScript(address: string, network: bitcoin.Network): Buffer {
  return Buffer.from(bitcoin.address.toOutputScript(address, network));
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
    alkaneId, amount, senderTaprootAddress, senderPaymentAddress,
    recipientAddress, tapInternalKeyHex, feeRate, network,
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
  const taprootUtxos = await fetchUtxos(senderTaprootAddress);

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
    btcUtxos = await fetchUtxos(senderPaymentAddress);
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
  // 4. Build PSBT
  // -----------------------------------------------------------------------
  const psbt = new bitcoin.Psbt({ network });

  // Parse tapInternalKey for P2TR inputs (BIP-174 standard field).
  // Wallets use this to identify which inputs belong to the connected account.
  const tapInternalKey = tapInternalKeyHex
    ? Buffer.from(tapInternalKeyHex.length === 66 ? tapInternalKeyHex.slice(2) : tapInternalKeyHex, 'hex')
    : undefined;

  // Derive output scripts from known sender addresses instead of fetching
  // raw tx hex from esplora. This avoids 404 errors on regtest where the
  // esplora instance (espo.subfrost.io) may be out of sync with the RPC
  // backend that provided the UTXOs.
  const taprootScript = addressToScript(senderTaprootAddress, network);
  const btcFeeAddress = hasSeparatePayment ? senderPaymentAddress : senderTaprootAddress;
  const btcFeeScript = addressToScript(btcFeeAddress, network);
  const btcFeeIsP2TR = btcFeeScript.length === 34 && btcFeeScript[0] === 0x51 && btcFeeScript[1] === 0x20;

  // Add alkane inputs (taproot, from sender)
  for (const utxo of alkaneUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: taprootScript,
        value: BigInt(utxo.value),
      },
      ...(tapInternalKey ? { tapInternalKey } : {}),
    });
  }

  // Add BTC fee inputs
  for (const utxo of selectedBtcUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: btcFeeScript,
        value: BigInt(utxo.value),
      },
      ...(btcFeeIsP2TR && tapInternalKey ? { tapInternalKey } : {}),
    });
  }

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
