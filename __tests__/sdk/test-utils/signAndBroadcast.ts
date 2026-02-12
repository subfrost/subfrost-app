/**
 * Shared sign-and-broadcast helper for SDK integration tests.
 *
 * Extracts, signs, and broadcasts a PSBT returned by the SDK's
 * alkanesExecuteTyped / alkanesExecuteWithStrings / frbtcWrap etc.
 *
 * Handles:
 *   - Auto-broadcast results (txid already present)
 *   - PSBT byte extraction (Uint8Array or object-keyed)
 *   - Signing via createTestSigner's signAllInputs
 *   - Broadcasting via provider.broadcastTransaction
 *   - Mining confirmation block(s)
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { TestSignerResult } from './createTestSigner';
import { NetworkMap } from './createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export interface SignAndBroadcastOptions {
  /** Number of blocks to mine after broadcast (default: 1) */
  mineBlocks?: number;
  /** Bitcoin network for PSBT deserialization (default: regtest) */
  network?: string;
}

/**
 * Sign and broadcast a PSBT result from SDK execute methods.
 *
 * @param provider  - WASM WebProvider instance
 * @param result    - Raw result from alkanesExecuteTyped / similar
 * @param signer    - TestSignerResult from createTestSigner
 * @param walletAddress - Address to mine confirmation blocks to
 * @param options   - Optional overrides
 * @returns Transaction ID
 */
export async function signAndBroadcast(
  provider: WebProvider,
  result: any,
  signer: TestSignerResult,
  walletAddress: string,
  options: SignAndBroadcastOptions = {},
): Promise<string> {
  const { mineBlocks = 1, network = 'regtest' } = options;
  const btcNetwork = NetworkMap[network] ?? bitcoin.networks.regtest;

  // If the SDK already broadcast (auto-confirm mode), just return the txid
  if (result?.txid || result?.reveal_txid) {
    if (mineBlocks > 0) {
      await provider.bitcoindGenerateToAddress(mineBlocks, walletAddress);
    }
    return result.txid || result.reveal_txid;
  }

  if (!result?.readyToSign) {
    throw new Error('No readyToSign or txid in result');
  }

  const readyToSign = result.readyToSign;

  // Convert PSBT to hex — SDK may return Uint8Array or object-keyed bytes
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
  } else {
    throw new Error('Unexpected PSBT format');
  }

  const rawPsbtHex = Buffer.from(psbtBytes).toString('hex');
  const { signedHexPsbt } = await signer.signer.signAllInputs({ rawPsbtHex });

  // signAllInputs already finalizes — extract and broadcast
  const signedPsbt = bitcoin.Psbt.fromHex(signedHexPsbt, { network: btcNetwork });
  const tx = signedPsbt.extractTransaction();
  const txHex = tx.toHex();
  const txid = tx.getId();

  const broadcastTxid = await provider.broadcastTransaction(txHex);

  // Mine confirmation block(s)
  if (mineBlocks > 0) {
    await provider.bitcoindGenerateToAddress(mineBlocks, walletAddress);
  }

  return broadcastTxid || txid;
}
