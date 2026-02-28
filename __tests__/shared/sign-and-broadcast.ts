/**
 * Sign-and-broadcast utility for regtest integration tests.
 *
 * Extracted from __tests__/sdk/e2e-swap-flow.test.ts.
 * Handles PSBT format variants returned by the WASM SDK.
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Sign a PSBT returned by alkanesExecuteTyped, broadcast it, mine a block,
 * and return the txid.
 *
 * Handles three PSBT formats the SDK may return:
 * - Uint8Array
 * - Object with numeric keys (JSON-serialized Uint8Array)
 * - Already-broadcast result with txid
 */
export async function signAndBroadcast(
  provider: WebProvider,
  result: any,
  signerResult: TestSignerResult,
  mineAddress: string
): Promise<string> {
  // If the SDK already broadcast (auto-confirm mode), just return the txid
  if (result?.txid || result?.reveal_txid) {
    return result.txid || result.reveal_txid;
  }

  if (!result?.readyToSign) {
    throw new Error(
      `No readyToSign or txid in result: ${JSON.stringify(result).slice(0, 200)}`
    );
  }

  const readyToSign = result.readyToSign;

  // Convert PSBT to hex for signAllInputs
  let psbtBytes: Uint8Array;
  if (readyToSign.psbt instanceof Uint8Array) {
    psbtBytes = readyToSign.psbt;
  } else if (typeof readyToSign.psbt === 'object') {
    const keys = Object.keys(readyToSign.psbt)
      .map(Number)
      .sort((a: number, b: number) => a - b);
    psbtBytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      psbtBytes[i] = readyToSign.psbt[keys[i]];
    }
  } else if (typeof readyToSign.psbt === 'string') {
    // base64 or hex string
    const isHex = /^[0-9a-fA-F]+$/.test(readyToSign.psbt);
    psbtBytes = isHex
      ? Buffer.from(readyToSign.psbt, 'hex')
      : Buffer.from(readyToSign.psbt, 'base64');
  } else {
    throw new Error(`Unexpected PSBT format: ${typeof readyToSign.psbt}`);
  }

  const rawPsbtHex = Buffer.from(psbtBytes).toString('hex');
  const { signedHexPsbt } = await signerResult.signer.signAllInputs({
    rawPsbtHex,
  });

  // signAllInputs already finalizes — extract and broadcast
  const signedPsbt = bitcoin.Psbt.fromHex(signedHexPsbt, {
    network: bitcoin.networks.regtest,
  });
  const tx = signedPsbt.extractTransaction();
  const txHex = tx.toHex();
  const txid = tx.getId();

  const broadcastTxid = await provider.broadcastTransaction(txHex);

  // Mine a block to confirm
  await provider.bitcoindGenerateToAddress(1, mineAddress);

  return broadcastTxid || txid;
}
