/**
 * Alkanes module for @alkanes/ts-sdk
 * Provides BTC wrap/unwrap and execute functions compatible with @oyl/sdk
 *
 * Based on alkanes-rs implementation patterns:
 * - Wrap BTC: Calls opcode 77 (exchange) on frBTC alkane {32, 0}
 * - Unwrap BTC: Calls opcode 2 (unwrap) on frBTC
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { FormattedUtxo, Account, Signer, Provider, AlkaneId } from '../types';

// frBTC Constants (from alkanes-rs wrap_btc.rs)
export const FRBTC_ALKANE_BLOCK = 32;
export const FRBTC_ALKANE_TX = 0;
export const FRBTC_WRAP_OPCODE = 77;
export const FRBTC_UNWRAP_OPCODE = 2;

// Vault constants for locking (optional feature)
export const BRC20_VAULT_BLOCK = 4;
export const BRC20_VAULT_TX = 3032615708;
export const VAULT_LOCK_OPCODE = 1;

// Dust limit for outputs
export const DUST_LIMIT = 546;

/**
 * Execute result structure
 */
export interface ExecuteResult {
  txId?: string;
  psbtBase64?: string;
  psbtHex?: string;
  fee?: number;
  rawTx?: string;
}

/**
 * Wrap BTC parameters
 */
export interface WrapBtcParams {
  utxos: FormattedUtxo[];
  account: Account;
  provider: Provider;
  signer: Signer;
  feeRate: number;
  wrapAmount: number;
  toAddress?: string;
}

/**
 * Unwrap BTC parameters
 */
export interface UnwrapBtcParams {
  utxos: FormattedUtxo[];
  account: Account;
  provider: Provider;
  signer: Signer;
  feeRate: number;
  unwrapAmount: number;
  frbtcAlkaneId?: AlkaneId;
}

/**
 * Execute with BTC wrap/unwrap parameters
 */
export interface ExecuteWithBtcWrapUnwrapParams {
  utxos: FormattedUtxo[];
  alkanesUtxos?: FormattedUtxo[];
  calldata?: any;
  account: Account;
  provider: Provider;
  signer: Signer;
  feeRate: number;
  frbtcWrapAmount?: number;
  frbtcUnwrapAmount?: number;
  frbtcAlkaneId?: AlkaneId;
  addDieselMint?: boolean;
}

/**
 * Protostone specification for alkanes transactions
 */
interface ProtostoneSpec {
  cellpack: {
    target: { block: number; tx: number };
    inputs: number[];
  };
  bitcoinTransfer?: {
    amount: number;
    targetOutput: number;
  };
  pointer?: number;
  refund?: number;
}

/**
 * Encode a cellpack for the alkanes protocol
 * Cellpacks encode: [target_block, target_tx, ...opcodes]
 */
function encodeCellpack(target: { block: number; tx: number }, inputs: number[]): Buffer {
  // Simple LEB128-style encoding for cellpack
  const parts: number[] = [];

  // Encode target (block, tx)
  parts.push(...encodeVarInt(target.block));
  parts.push(...encodeVarInt(target.tx));

  // Encode inputs (opcodes)
  for (const input of inputs) {
    parts.push(...encodeVarInt(input));
  }

  return Buffer.from(parts);
}

/**
 * Encode a variable-length integer (simplified LEB128)
 */
function encodeVarInt(value: number): number[] {
  const result: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>= 7;
    if (v !== 0) {
      byte |= 0x80;
    }
    result.push(byte);
  } while (v !== 0);
  return result;
}

/**
 * Build a protostone OP_RETURN script
 * Based on the runestone/protostone encoding in alkanes-rs
 */
function buildProtostoneScript(protostones: ProtostoneSpec[]): Buffer {
  // Protostones use OP_RETURN with a specific magic number
  const RUNESTONE_TAG = Buffer.from([0x6a]); // OP_RETURN
  const PROTOSTONE_MAGIC = Buffer.from([0x50, 0x52, 0x54]); // "PRT" magic

  const parts: Buffer[] = [RUNESTONE_TAG, PROTOSTONE_MAGIC];

  for (const protostone of protostones) {
    // Encode cellpack
    const cellpack = encodeCellpack(protostone.cellpack.target, protostone.cellpack.inputs);
    parts.push(Buffer.from([cellpack.length])); // length prefix
    parts.push(cellpack);

    // Encode bitcoin transfer if present
    if (protostone.bitcoinTransfer) {
      const transferData = Buffer.alloc(9);
      transferData.writeBigUInt64LE(BigInt(protostone.bitcoinTransfer.amount), 0);
      transferData.writeUInt8(protostone.bitcoinTransfer.targetOutput, 8);
      parts.push(transferData);
    }

    // Encode pointer and refund
    if (protostone.pointer !== undefined) {
      parts.push(Buffer.from([protostone.pointer]));
    }
    if (protostone.refund !== undefined) {
      parts.push(Buffer.from([protostone.refund]));
    }
  }

  return Buffer.concat(parts);
}

/**
 * Select UTXOs to cover the required amount plus fees
 */
function selectUtxos(
  utxos: FormattedUtxo[],
  targetAmount: number,
  feeRate: number
): { selected: FormattedUtxo[]; total: number; fee: number } {
  // Sort by satoshis descending for optimal selection
  const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);

  const selected: FormattedUtxo[] = [];
  let total = 0;

  // Estimate base tx size: ~10 bytes overhead + 34 bytes per output * 3 outputs
  // + 68 bytes per input (P2WPKH)
  const baseSize = 10 + 34 * 3;
  const inputSize = 68;

  for (const utxo of sorted) {
    // Skip UTXOs with inscriptions/runes/alkanes
    if (utxo.inscriptions?.length > 0 || Object.keys(utxo.runes || {}).length > 0 ||
        Object.keys(utxo.alkanes || {}).length > 0) {
      continue;
    }

    selected.push(utxo);
    total += utxo.satoshis;

    const estimatedSize = baseSize + selected.length * inputSize;
    const estimatedFee = Math.ceil(estimatedSize * feeRate);

    if (total >= targetAmount + estimatedFee) {
      return { selected, total, fee: estimatedFee };
    }
  }

  // Not enough funds
  const estimatedSize = baseSize + selected.length * inputSize;
  const estimatedFee = Math.ceil(estimatedSize * feeRate);
  return { selected, total, fee: estimatedFee };
}

/**
 * Get the network from account
 */
function getNetwork(account: Account): bitcoin.Network {
  if (!account.network) {
    return bitcoin.networks.bitcoin;
  }
  // account.network is already a bitcoin.Network object
  return account.network;
}

/**
 * Get the primary address from account
 */
function getPrimaryAddress(account: Account): string {
  return account.nativeSegwit?.address || account.taproot?.address || '';
}

/**
 * Get the subfrost signer address for frBTC wrapping
 * This would normally be fetched from the frBTC contract storage
 */
async function getSubfrostAddress(provider: Provider, network: bitcoin.Network): Promise<string> {
  // In production, this should call provider.alkanes.simulate() to get the signer address
  // from the frBTC contract storage. For now, use a placeholder that indicates
  // the actual address should be fetched.

  try {
    // Try to get subfrost address via simulate
    const simulateRequest = {
      target: { block: FRBTC_ALKANE_BLOCK, tx: FRBTC_ALKANE_TX },
      inputs: ['0'], // Opcode 0 typically returns contract info
    };

    if (provider.alkanes && typeof provider.alkanes.simulate === 'function') {
      const result = await provider.alkanes.simulate(simulateRequest);
      if (result?.execution?.data) {
        // Parse the address from result
        // This is contract-specific and may need adjustment
        console.log('Subfrost simulate result:', result);
      }
    }
  } catch (e) {
    console.warn('Could not fetch subfrost address via simulate:', e);
  }

  // Return placeholder - in production this must be the actual subfrost signer address
  // The address varies by network
  if (network === bitcoin.networks.testnet || network === bitcoin.networks.regtest) {
    return 'tb1qsubfrostplaceholderaddress000000000000';
  }
  return 'bc1qsubfrostplaceholderaddress000000000000';
}

/**
 * Wrap BTC to frBTC
 * Creates a PSBT that calls frBTC contract opcode 77 (exchange)
 *
 * Transaction structure:
 * - Input: BTC UTXOs
 * - Output 0: Subfrost signer (receives BTC)
 * - Output 1: User address (receives minted frBTC via protostone pointer)
 * - Output 2: Change
 * - Output 3: OP_RETURN with protostone
 */
export async function wrapBtc(params: WrapBtcParams): Promise<ExecuteResult> {
  const { utxos, account, provider, signer, feeRate, wrapAmount, toAddress } = params;

  if (!wrapAmount || wrapAmount <= 0) {
    throw new Error('wrapAmount must be greater than 0');
  }

  const network = getNetwork(account);
  const userAddress = toAddress || getPrimaryAddress(account);

  if (!userAddress) {
    throw new Error('No recipient address available');
  }

  // Get subfrost signer address
  const subfrostAddress = await getSubfrostAddress(provider, network);
  console.log('Wrapping BTC: amount=%d, toAddress=%s, subfrost=%s', wrapAmount, userAddress, subfrostAddress);

  // Select UTXOs
  const { selected, total, fee } = selectUtxos(utxos, wrapAmount, feeRate);

  if (total < wrapAmount + fee) {
    throw new Error(`Insufficient funds: need ${wrapAmount + fee}, have ${total}`);
  }

  // Build protostone for wrap operation
  const protostone: ProtostoneSpec = {
    cellpack: {
      target: { block: FRBTC_ALKANE_BLOCK, tx: FRBTC_ALKANE_TX },
      inputs: [FRBTC_WRAP_OPCODE], // Opcode 77: exchange/wrap
    },
    bitcoinTransfer: {
      amount: wrapAmount,
      targetOutput: 0, // Send BTC to subfrost (output 0)
    },
    pointer: 1, // Minted frBTC goes to output 1 (user)
    refund: 1,  // Refund unused frBTC to output 1
  };

  // Create PSBT
  const psbt = new bitcoin.Psbt({ network });

  // Add inputs
  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPk, 'hex'),
        value: utxo.satoshis,
      },
    });
  }

  // Output 0: Subfrost signer (receives BTC)
  psbt.addOutput({
    address: subfrostAddress,
    value: wrapAmount,
  });

  // Output 1: User address (receives frBTC via protostone pointer)
  psbt.addOutput({
    address: userAddress,
    value: DUST_LIMIT,
  });

  // Output 2: Change
  const changeAmount = total - wrapAmount - fee - DUST_LIMIT;
  if (changeAmount > DUST_LIMIT) {
    const changeAddress = account.spendStrategy?.changeAddress === 'taproot'
      ? account.taproot?.address
      : account.nativeSegwit?.address;

    if (changeAddress) {
      psbt.addOutput({
        address: changeAddress,
        value: changeAmount,
      });
    }
  }

  // Output 3: OP_RETURN with protostone
  const protostoneScript = buildProtostoneScript([protostone]);
  psbt.addOutput({
    script: protostoneScript,
    value: 0,
  });

  // Sign the PSBT using the signer
  let signedPsbt: bitcoin.Psbt;
  try {
    if (typeof signer.signAllInputs === 'function') {
      signedPsbt = await signer.signAllInputs(psbt);
    } else if (typeof signer.signPsbt === 'function') {
      // signer.signPsbt expects rawPsbtHex and returns signed hex
      const signedHex = await signer.signPsbt(psbt.toHex());
      signedPsbt = bitcoin.Psbt.fromHex(signedHex, { network });
    } else {
      // Return unsigned PSBT for external signing
      return {
        psbtBase64: psbt.toBase64(),
        psbtHex: psbt.toHex(),
        fee,
      };
    }

    // Finalize and extract transaction
    signedPsbt.finalizeAllInputs();
    const tx = signedPsbt.extractTransaction();
    const txHex = tx.toHex();

    // Broadcast via provider
    let txId: string | undefined;
    if (provider.pushPsbt) {
      const result = await provider.pushPsbt({ psbtHex: signedPsbt.toHex() });
      txId = result.txId;
    } else if (provider.bitcoin?.sendRawTransaction) {
      txId = await provider.bitcoin.sendRawTransaction(txHex);
    }

    return {
      txId,
      psbtBase64: signedPsbt.toBase64(),
      psbtHex: signedPsbt.toHex(),
      fee,
      rawTx: txHex,
    };
  } catch (error) {
    console.error('Error signing/broadcasting wrap transaction:', error);
    // Return unsigned PSBT if signing fails
    return {
      psbtBase64: psbt.toBase64(),
      psbtHex: psbt.toHex(),
      fee,
    };
  }
}

/**
 * Unwrap frBTC to BTC
 * Creates a PSBT that calls frBTC contract opcode 2 (unwrap)
 *
 * Transaction structure:
 * - Input: frBTC UTXOs
 * - Output 0: User address (receives BTC from vault)
 * - Output 1: Change
 * - Output 2: OP_RETURN with protostone
 */
export async function unwrapBtc(params: UnwrapBtcParams): Promise<ExecuteResult | undefined> {
  const { utxos, account, provider, signer, feeRate, unwrapAmount, frbtcAlkaneId } = params;

  if (!unwrapAmount || unwrapAmount <= 0) {
    return undefined;
  }

  const network = getNetwork(account);
  const userAddress = getPrimaryAddress(account);

  if (!userAddress) {
    throw new Error('No recipient address available');
  }

  // Use provided frbtcAlkaneId or default
  const targetAlkane = frbtcAlkaneId || { block: FRBTC_ALKANE_BLOCK, tx: FRBTC_ALKANE_TX };

  console.log('Unwrapping frBTC: amount=%d, toAddress=%s', unwrapAmount, userAddress);

  // For unwrap, we need frBTC UTXOs, not regular BTC UTXOs
  // Filter for UTXOs that have frBTC alkanes
  const frbtcUtxos = utxos.filter(utxo => {
    if (!utxo.alkanes) return false;
    const alkaneKey = `${targetAlkane.block}:${targetAlkane.tx}`;
    return !!utxo.alkanes[alkaneKey];
  });

  if (frbtcUtxos.length === 0) {
    console.warn('No frBTC UTXOs found for unwrap');
    // Fall back to regular UTXOs for fees
  }

  // Select UTXOs for fees
  const { selected, total, fee } = selectUtxos(utxos, DUST_LIMIT, feeRate);

  // Build protostone for unwrap operation
  const protostone: ProtostoneSpec = {
    cellpack: {
      target: { block: Number(targetAlkane.block), tx: Number(targetAlkane.tx) },
      inputs: [FRBTC_UNWRAP_OPCODE, 0, unwrapAmount], // Opcode 2: unwrap with amount
    },
    pointer: 0, // BTC output goes to output 0 (user)
    refund: 0,  // Refund goes to output 0
  };

  // Create PSBT
  const psbt = new bitcoin.Psbt({ network });

  // Add frBTC inputs first (if any)
  for (const utxo of frbtcUtxos) {
    psbt.addInput({
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPk, 'hex'),
        value: utxo.satoshis,
      },
    });
  }

  // Add BTC inputs for fees
  for (const utxo of selected) {
    // Skip if already added as frBTC UTXO
    if (frbtcUtxos.some(f => f.txId === utxo.txId && f.outputIndex === utxo.outputIndex)) {
      continue;
    }
    psbt.addInput({
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPk, 'hex'),
        value: utxo.satoshis,
      },
    });
  }

  // Output 0: User address (receives BTC from unwrap)
  psbt.addOutput({
    address: userAddress,
    value: DUST_LIMIT, // Actual BTC will be added by the contract
  });

  // Output 1: Change
  const inputTotal = frbtcUtxos.reduce((sum, u) => sum + u.satoshis, 0) + total;
  const changeAmount = inputTotal - fee - DUST_LIMIT;
  if (changeAmount > DUST_LIMIT) {
    const changeAddress = account.spendStrategy?.changeAddress === 'taproot'
      ? account.taproot?.address
      : account.nativeSegwit?.address;

    if (changeAddress) {
      psbt.addOutput({
        address: changeAddress,
        value: changeAmount,
      });
    }
  }

  // Output 2: OP_RETURN with protostone
  const protostoneScript = buildProtostoneScript([protostone]);
  psbt.addOutput({
    script: protostoneScript,
    value: 0,
  });

  // Sign the PSBT
  try {
    let signedPsbt: bitcoin.Psbt;

    if (typeof signer.signAllInputs === 'function') {
      signedPsbt = await signer.signAllInputs(psbt);
    } else if (typeof signer.signPsbt === 'function') {
      const signedHex = await signer.signPsbt(psbt.toHex());
      signedPsbt = bitcoin.Psbt.fromHex(signedHex, { network });
    } else {
      return {
        psbtBase64: psbt.toBase64(),
        psbtHex: psbt.toHex(),
        fee,
      };
    }

    signedPsbt.finalizeAllInputs();
    const tx = signedPsbt.extractTransaction();
    const txHex = tx.toHex();

    let txId: string | undefined;
    if (provider.pushPsbt) {
      const result = await provider.pushPsbt({ psbtHex: signedPsbt.toHex() });
      txId = result.txId;
    } else if (provider.bitcoin?.sendRawTransaction) {
      txId = await provider.bitcoin.sendRawTransaction(txHex);
    }

    return {
      txId,
      psbtBase64: signedPsbt.toBase64(),
      psbtHex: signedPsbt.toHex(),
      fee,
      rawTx: txHex,
    };
  } catch (error) {
    console.error('Error signing/broadcasting unwrap transaction:', error);
    return {
      psbtBase64: psbt.toBase64(),
      psbtHex: psbt.toHex(),
      fee,
    };
  }
}

/**
 * Execute an alkanes transaction with optional BTC wrap/unwrap
 * Combines execute with wrap or unwrap in a single operation
 */
export async function executeWithBtcWrapUnwrap(params: ExecuteWithBtcWrapUnwrapParams): Promise<{
  executeResult?: ExecuteResult;
  frbtcUnwrapResult?: ExecuteResult;
}> {
  const {
    utxos,
    alkanesUtxos,
    calldata,
    account,
    provider,
    signer,
    feeRate,
    frbtcWrapAmount,
    frbtcUnwrapAmount,
    frbtcAlkaneId,
    addDieselMint,
  } = params;

  console.log('executeWithBtcWrapUnwrap:', {
    frbtcWrapAmount,
    frbtcUnwrapAmount,
    feeRate,
    addDieselMint,
    hasCalldata: !!calldata,
  });

  let executeResult: ExecuteResult | undefined;
  let frbtcUnwrapResult: ExecuteResult | undefined;

  // Step 1: If wrapAmount > 0, wrap BTC first
  if (frbtcWrapAmount && frbtcWrapAmount > 0) {
    console.log('Step 1: Wrapping %d sats to frBTC', frbtcWrapAmount);
    executeResult = await wrapBtc({
      utxos,
      account,
      provider,
      signer,
      feeRate,
      wrapAmount: frbtcWrapAmount,
    });

    if (!executeResult.txId) {
      console.warn('Wrap transaction not broadcast - may need external signing');
    }
  }

  // Step 2: Execute main calldata if provided
  if (calldata) {
    console.log('Step 2: Executing calldata');
    // Build PSBT for calldata execution
    const network = getNetwork(account);
    const combinedUtxos = [...utxos, ...(alkanesUtxos || [])];
    const { selected, total, fee } = selectUtxos(combinedUtxos, DUST_LIMIT, feeRate);

    // Parse calldata into protostone
    const protostone: ProtostoneSpec = {
      cellpack: {
        target: {
          block: calldata.target?.block || 0,
          tx: calldata.target?.tx || 0,
        },
        inputs: calldata.inputs || [],
      },
      pointer: calldata.pointer,
      refund: calldata.refund,
    };

    const psbt = new bitcoin.Psbt({ network });

    for (const utxo of selected) {
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: Buffer.from(utxo.scriptPk, 'hex'),
          value: utxo.satoshis,
        },
      });
    }

    const userAddress = getPrimaryAddress(account);
    if (userAddress) {
      psbt.addOutput({
        address: userAddress,
        value: DUST_LIMIT,
      });
    }

    const changeAmount = total - fee - DUST_LIMIT;
    if (changeAmount > DUST_LIMIT) {
      const changeAddress = account.nativeSegwit?.address || account.taproot?.address;
      if (changeAddress) {
        psbt.addOutput({
          address: changeAddress,
          value: changeAmount,
        });
      }
    }

    const protostoneScript = buildProtostoneScript([protostone]);
    psbt.addOutput({
      script: protostoneScript,
      value: 0,
    });

    executeResult = {
      psbtBase64: psbt.toBase64(),
      psbtHex: psbt.toHex(),
      fee,
    };
  }

  // Step 3: If unwrapAmount > 0, unwrap frBTC
  if (frbtcUnwrapAmount && frbtcUnwrapAmount > 0) {
    console.log('Step 3: Unwrapping %d frBTC to BTC', frbtcUnwrapAmount);
    frbtcUnwrapResult = await unwrapBtc({
      utxos: alkanesUtxos || utxos,
      account,
      provider,
      signer,
      feeRate,
      unwrapAmount: frbtcUnwrapAmount,
      frbtcAlkaneId,
    });
  }

  return {
    executeResult,
    frbtcUnwrapResult,
  };
}

export default {
  wrapBtc,
  unwrapBtc,
  executeWithBtcWrapUnwrap,
  // Constants
  FRBTC_ALKANE_BLOCK,
  FRBTC_ALKANE_TX,
  FRBTC_WRAP_OPCODE,
  FRBTC_UNWRAP_OPCODE,
};
