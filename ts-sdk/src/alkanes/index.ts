/**
 * Alkanes operations module
 * Compatible with @oyl/sdk/lib/alkanes interface
 */

import { AlkanesWallet } from '../wallet';
import { AlkanesProvider } from '../provider';
import { UTXO, TxInput, FormattedUtxo } from '../types';
import * as bitcoin from 'bitcoinjs-lib';

/**
 * Signer interface for transaction signing
 * Compatible with @oyl/sdk signer shim
 */
export interface Signer {
  sign: (psbtBase64: string, finalize?: boolean) => Promise<string>;
  signAllInputs: (params: { rawPsbtHex: string; finalize?: boolean }) => Promise<{ signedPsbt: string; signedHexPsbt: string }>;
  // Optional key pairs for message signing (used by marketplace integrations)
  segwitKeyPair?: { privateKey?: Buffer; publicKey?: Buffer };
  taprootKeyPair?: { privateKey?: Buffer; publicKey?: Buffer };
}

/**
 * Account interface for transaction building
 * Compatible with @oyl/sdk Account type
 */
export interface Account {
  taproot?: {
    address: string;
    pubkey: string;
    pubKeyXOnly: string;
    hdPath: string;
  };
  nativeSegwit?: {
    address: string;
    pubkey: string;
    hdPath: string;
  };
  spendStrategy: {
    addressOrder: string[];
    utxoSortGreatestToLeast: boolean;
    changeAddress: string;
  };
  network: any;
}

/**
 * Execute with BTC wrap/unwrap parameters
 */
export interface ExecuteWithBtcWrapUnwrapParams {
  utxos: FormattedUtxo[];
  alkanesUtxos?: FormattedUtxo[];
  calldata: bigint[];
  feeRate: number;
  account: Account;
  provider: AlkanesProvider;
  signer: Signer;
  frbtcWrapAmount?: number;
  frbtcUnwrapAmount?: number;
  addDieselMint?: boolean;
}

/**
 * Execute result
 */
export interface ExecuteResult {
  txId: string;
  rawTx: string;
  fee: number;
}

/**
 * Execute a transaction with optional BTC wrap/unwrap
 * Compatible with @oyl/sdk executeWithBtcWrapUnwrap
 */
export async function executeWithBtcWrapUnwrap({
  utxos,
  alkanesUtxos,
  calldata,
  feeRate,
  account,
  provider,
  signer,
  frbtcWrapAmount,
  frbtcUnwrapAmount,
  addDieselMint,
}: ExecuteWithBtcWrapUnwrapParams): Promise<{
  executeResult?: ExecuteResult;
  frbtcUnwrapResult?: ExecuteResult;
}> {
  // Get network from provider
  const network = provider.network;

  // Build the alkane execution transaction
  const executeResult = await buildAndBroadcastAlkaneTransaction({
    utxos,
    alkanesUtxos,
    calldata,
    feeRate,
    account,
    provider,
    signer,
    wrapAmount: frbtcWrapAmount,
  });

  // If unwrap is requested, build and broadcast unwrap tx
  let frbtcUnwrapResult: ExecuteResult | undefined;
  if (frbtcUnwrapAmount && frbtcUnwrapAmount > 0) {
    // Unwrap will be handled in a separate transaction
    // This is a placeholder - actual implementation depends on WASM
    frbtcUnwrapResult = undefined;
  }

  return {
    executeResult,
    frbtcUnwrapResult,
  };
}

/**
 * Unwrap BTC (burn frBTC to get native BTC)
 * Compatible with @oyl/sdk unwrapBtc
 */
export async function unwrapBtc({
  alkaneUtxos,
  utxos,
  account,
  provider,
  signer,
  feeRate,
  unwrapAmount,
}: {
  alkaneUtxos: FormattedUtxo[];
  utxos: FormattedUtxo[];
  account: Account;
  provider: AlkanesProvider;
  signer: Signer;
  feeRate: number;
  unwrapAmount: bigint;
}): Promise<ExecuteResult | undefined> {
  // Build unwrap calldata
  // This calls the frBTC contract's unwrap function
  const calldata: bigint[] = [
    2n, // frBTC contract block (mainnet)
    0n, // frBTC contract tx
    2n, // Unwrap opcode
    unwrapAmount,
  ];

  return buildAndBroadcastAlkaneTransaction({
    utxos,
    alkanesUtxos: alkaneUtxos,
    calldata,
    feeRate,
    account,
    provider,
    signer,
  });
}

/**
 * Wrap BTC (deposit native BTC to get frBTC)
 */
export async function wrapBtc({
  utxos,
  account,
  provider,
  signer,
  feeRate,
  wrapAmount,
}: {
  utxos: UTXO[] | FormattedUtxo[];
  account: string | Account;
  provider: AlkanesProvider;
  signer: AlkanesWallet | Signer;
  feeRate: number;
  wrapAmount: number;
}): Promise<ExecuteResult | undefined> {
  // Handle both string account and Account object
  const accountObj = typeof account === 'string'
    ? createAccountFromAddress(account, provider.network)
    : account;

  // Convert signer if needed
  const signerObj = 'sign' in signer
    ? signer
    : createSignerFromWallet(signer as AlkanesWallet);

  // Build wrap calldata
  const calldata: bigint[] = [
    2n, // frBTC contract block
    0n, // frBTC contract tx
    1n, // Wrap opcode
    BigInt(wrapAmount),
  ];

  return buildAndBroadcastAlkaneTransaction({
    utxos: utxos as FormattedUtxo[],
    calldata,
    feeRate,
    account: accountObj,
    provider,
    signer: signerObj,
    wrapAmount,
  });
}

/**
 * Build and broadcast an alkane transaction
 */
async function buildAndBroadcastAlkaneTransaction({
  utxos,
  alkanesUtxos,
  calldata,
  feeRate,
  account,
  provider,
  signer,
  wrapAmount,
}: {
  utxos: FormattedUtxo[];
  alkanesUtxos?: FormattedUtxo[];
  calldata: bigint[];
  feeRate: number;
  account: Account;
  provider: AlkanesProvider;
  signer: Signer;
  wrapAmount?: number;
}): Promise<ExecuteResult | undefined> {
  const network = provider.network;

  // Determine the signing address
  const signingAddress = account.taproot?.address ||
                         account.nativeSegwit?.address ||
                         account.spendStrategy.changeAddress;

  if (!signingAddress) {
    throw new Error('No signing address available');
  }

  // Select UTXOs for the transaction
  const allUtxos = [...(alkanesUtxos || []), ...utxos];

  // Calculate required value
  const baseValue = wrapAmount || 546; // Minimum dust amount
  const estimatedFee = feeRate * 250; // Rough estimate for tx size
  const requiredValue = baseValue + estimatedFee;

  // Select UTXOs
  let selectedUtxos: FormattedUtxo[] = [];
  let totalValue = 0;

  // First add alkane UTXOs if any
  if (alkanesUtxos && alkanesUtxos.length > 0) {
    selectedUtxos.push(...alkanesUtxos);
    totalValue += alkanesUtxos.reduce((sum, u) => sum + (u.satoshis ?? u.value ?? 0), 0);
  }

  // Then add regular UTXOs for funding
  for (const utxo of utxos) {
    if (totalValue >= requiredValue) break;

    // Skip UTXOs already in alkanes list
    const utxoTxid = utxo.txid || utxo.txId;
    const utxoVout = utxo.vout ?? utxo.outputIndex;
    const alreadySelected = selectedUtxos.some(
      s => (s.txid || s.txId) === utxoTxid && (s.vout ?? s.outputIndex) === utxoVout
    );
    if (alreadySelected) continue;

    selectedUtxos.push(utxo);
    totalValue += utxo.satoshis ?? utxo.value ?? 0;
  }

  if (totalValue < requiredValue) {
    throw new Error(`Insufficient funds. Required: ${requiredValue}, Available: ${totalValue}`);
  }

  // Build PSBT
  const psbt = new bitcoin.Psbt({ network });

  // Add inputs
  for (const utxo of selectedUtxos) {
    const scriptPk = utxo.scriptPubKey || utxo.scriptPk;
    if (!scriptPk) throw new Error('UTXO missing scriptPubKey');
    const scriptPubKey = Buffer.from(scriptPk, 'hex');
    const txid = utxo.txid || utxo.txId;
    if (!txid) throw new Error('UTXO missing txid');
    const vout = utxo.vout ?? utxo.outputIndex;
    if (vout === undefined) throw new Error('UTXO missing vout');
    const value = utxo.satoshis ?? utxo.value;
    if (value === undefined) throw new Error('UTXO missing value');

    psbt.addInput({
      hash: txid,
      index: vout,
      witnessUtxo: {
        script: scriptPubKey,
        value,
      },
    });
  }

  // Build OP_RETURN with calldata
  const calldataHex = encodeCalldata(calldata);
  const opReturnScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,
    Buffer.from(calldataHex, 'hex'),
  ]);

  // Add OP_RETURN output
  psbt.addOutput({
    script: opReturnScript,
    value: 0,
  });

  // Add main output (alkane execution)
  psbt.addOutput({
    address: signingAddress,
    value: baseValue,
  });

  // Calculate change
  const outputsValue = baseValue;
  const actualFee = feeRate * Math.ceil(psbt.data.globalMap.unsignedTx!.toBuffer().length / 4);
  const change = totalValue - outputsValue - actualFee;

  if (change > 546) {
    psbt.addOutput({
      address: account.spendStrategy.changeAddress || signingAddress,
      value: change,
    });
  }

  // Sign the PSBT
  const psbtBase64 = psbt.toBase64();
  const signedPsbtBase64 = await signer.sign(psbtBase64, true);

  // Extract and broadcast
  const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network });

  try {
    signedPsbt.finalizeAllInputs();
  } catch (e) {
    // Already finalized
  }

  const tx = signedPsbt.extractTransaction();
  const rawTx = tx.toHex();
  const txId = tx.getId();

  // Broadcast
  try {
    await provider.bitcoin.sendRawTransaction(rawTx);
  } catch (error: any) {
    throw new Error(`Broadcast failed: ${error.message}`);
  }

  return {
    txId,
    rawTx,
    fee: actualFee,
  };
}

/**
 * Encode calldata to hex string
 */
function encodeCalldata(calldata: bigint[]): string {
  // Encode calldata as protobuf-style varint encoding
  const buffers: Buffer[] = [];

  for (const value of calldata) {
    buffers.push(encodeVarint(value));
  }

  return Buffer.concat(buffers).toString('hex');
}

/**
 * Encode a value as a varint
 */
function encodeVarint(value: bigint): Buffer {
  const bytes: number[] = [];
  let v = value;

  while (v >= 0x80n) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));

  return Buffer.from(bytes);
}

/**
 * Create an Account object from an address
 */
function createAccountFromAddress(
  address: string,
  network: bitcoin.networks.Network
): Account {
  // Detect address type
  const isTaproot = address.startsWith('bc1p') || address.startsWith('tb1p');
  const isNativeSegwit = address.startsWith('bc1q') || address.startsWith('tb1q');

  return {
    taproot: isTaproot ? {
      address,
      pubkey: '',
      pubKeyXOnly: '',
      hdPath: "m/86'/0'/0'/0/0",
    } : undefined,
    nativeSegwit: isNativeSegwit ? {
      address,
      pubkey: '',
      hdPath: "m/84'/0'/0'/0/0",
    } : undefined,
    spendStrategy: {
      addressOrder: [isTaproot ? 'taproot' : 'nativeSegwit'],
      utxoSortGreatestToLeast: true,
      changeAddress: address,
    },
    network,
  };
}

/**
 * Create a Signer from an AlkanesWallet
 */
function createSignerFromWallet(wallet: AlkanesWallet): Signer {
  return {
    sign: async (psbtBase64: string, finalize?: boolean) => {
      const signed = wallet.signPsbt(psbtBase64);
      return signed;
    },
    signAllInputs: async ({ rawPsbtHex, finalize }: { rawPsbtHex: string; finalize?: boolean }) => {
      // Convert hex to base64 for signing
      const psbtBase64 = Buffer.from(rawPsbtHex, 'hex').toString('base64');
      const signedPsbtBase64 = wallet.signPsbt(psbtBase64);
      // Convert back to hex
      const signedHexPsbt = Buffer.from(signedPsbtBase64, 'base64').toString('hex');
      return { signedPsbt: signedPsbtBase64, signedHexPsbt };
    },
  };
}

/**
 * Estimate transaction size in virtual bytes
 */
export function estimateTxSize(numInputs: number, numOutputs: number): number {
  // P2WPKH input size approx 68 vbytes
  // P2WPKH output size approx 31 vbytes
  // Base transaction size approx 10 vbytes
  return (numInputs * 68) + (numOutputs * 31) + 10;
}
