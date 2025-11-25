/**
 * Alkanes module for @alkanes/ts-sdk
 * Provides BTC wrap/unwrap and execute functions compatible with @oyl/sdk
 */

import type { FormattedUtxo, Account, Signer, Provider, AlkaneId } from '../types';

/**
 * Execute result structure
 */
export interface ExecuteResult {
  txId?: string;
  psbtBase64?: string;
  psbtHex?: string;
  fee?: number;
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
 * Wrap BTC to frBTC
 * Placeholder implementation - will call actual alkanes contract
 */
export async function wrapBtc(params: WrapBtcParams): Promise<ExecuteResult> {
  const { utxos, account, provider, signer, feeRate, wrapAmount } = params;

  // This is a placeholder - actual implementation would:
  // 1. Build PSBT with wrap calldata
  // 2. Sign with signer
  // 3. Broadcast via provider

  console.log('wrapBtc called with:', { wrapAmount, feeRate });

  // For now, return empty result - actual implementation needs alkanes WASM
  return {
    txId: undefined,
    psbtBase64: undefined,
    fee: 0,
  };
}

/**
 * Unwrap frBTC to BTC
 * Placeholder implementation - will call actual alkanes contract
 */
export async function unwrapBtc(params: UnwrapBtcParams): Promise<ExecuteResult | undefined> {
  const { utxos, account, provider, signer, feeRate, unwrapAmount, frbtcAlkaneId } = params;

  // This is a placeholder - actual implementation would:
  // 1. Find frBTC UTXOs
  // 2. Build PSBT with unwrap calldata
  // 3. Sign with signer
  // 4. Broadcast via provider

  console.log('unwrapBtc called with:', { unwrapAmount, feeRate, frbtcAlkaneId });

  // For now, return undefined if no unwrap amount
  if (!unwrapAmount || unwrapAmount <= 0) {
    return undefined;
  }

  return {
    txId: undefined,
    psbtBase64: undefined,
    fee: 0,
  };
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

  console.log('executeWithBtcWrapUnwrap called with:', {
    frbtcWrapAmount,
    frbtcUnwrapAmount,
    feeRate,
    addDieselMint,
  });

  // Placeholder implementation
  // Actual implementation would:
  // 1. If wrapAmount > 0, wrap BTC first
  // 2. Execute the main transaction
  // 3. If unwrapAmount > 0, unwrap frBTC

  let executeResult: ExecuteResult | undefined;
  let frbtcUnwrapResult: ExecuteResult | undefined;

  // Execute main transaction (placeholder)
  executeResult = {
    txId: undefined,
    psbtBase64: undefined,
    fee: 0,
  };

  // If unwrap is needed, execute it
  if (frbtcUnwrapAmount && frbtcUnwrapAmount > 0) {
    frbtcUnwrapResult = await unwrapBtc({
      utxos,
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
};
