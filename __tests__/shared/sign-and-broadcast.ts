/**
 * Sign-and-broadcast utility for regtest/devnet integration tests.
 *
 * Extracted from __tests__/sdk/e2e-swap-flow.test.ts.
 * Handles all PSBT format variants and execution states returned by the SDK:
 * - ReadyToSign: single-step tx (no envelope)
 * - ReadyToSignCommit + ReadyToSignReveal: two-step commit/reveal envelope pattern
 * - Complete: already broadcast
 */

import * as bitcoin from 'bitcoinjs-lib';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Extract PSBT bytes from the various formats the SDK may return.
 */
function extractPsbtBytes(psbt: any): Uint8Array {
  if (psbt instanceof Uint8Array) {
    return psbt;
  } else if (typeof psbt === 'object' && psbt !== null) {
    const keys = Object.keys(psbt)
      .map(Number)
      .sort((a: number, b: number) => a - b);
    const bytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      bytes[i] = psbt[keys[i]];
    }
    return bytes;
  } else if (typeof psbt === 'string') {
    const isHex = /^[0-9a-fA-F]+$/.test(psbt);
    return isHex
      ? Buffer.from(psbt, 'hex')
      : Buffer.from(psbt, 'base64');
  }
  throw new Error(`Unexpected PSBT format: ${typeof psbt}`);
}

/**
 * Sign a PSBT, finalize, extract transaction, broadcast, and mine a block.
 * Returns the txid.
 */
async function signBroadcastAndMine(
  provider: WebProvider,
  psbtData: any,
  signerResult: TestSignerResult,
  mineAddress: string
): Promise<string> {
  const psbtBytes = extractPsbtBytes(psbtData);
  const rawPsbtHex = Buffer.from(psbtBytes).toString('hex');
  const { signedHexPsbt } = await signerResult.signer.signAllInputs({
    rawPsbtHex,
  });

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

/**
 * Sign a PSBT returned by alkanesExecuteTyped/alkanesExecuteWithStrings,
 * broadcast it, mine a block, and return the txid.
 *
 * Handles all SDK execution states:
 * - readyToSign: single-step tx
 * - readyToSignCommit: commit/reveal envelope (signs commit, resumes to get reveal, signs reveal)
 * - complete/txid: already broadcast
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

  // Complete state
  if (result?.complete) {
    return result.complete.reveal_txid || result.complete.commit_txid || '';
  }

  // Single-step: ReadyToSign
  if (result?.readyToSign) {
    return signBroadcastAndMine(
      provider,
      result.readyToSign.psbt,
      signerResult,
      mineAddress
    );
  }

  // Two-step commit/reveal: ReadyToSignCommit
  if (result?.readyToSignCommit) {
    console.log('[signAndBroadcast] Commit/reveal flow: signing commit...');

    // Step 1: Sign and broadcast the commit transaction
    const commitTxid = await signBroadcastAndMine(
      provider,
      result.readyToSignCommit.psbt,
      signerResult,
      mineAddress
    );
    console.log('[signAndBroadcast] Commit broadcast:', commitTxid);

    // Step 2: Resume execution to get the reveal transaction
    // The provider needs the commit state to build the reveal
    const commitStateJson = JSON.stringify(result.readyToSignCommit);
    const revealState = await (provider as any).alkanesResumeCommitExecution(commitStateJson);
    console.log('[signAndBroadcast] Resume result keys:', Object.keys(revealState || {}));

    // Step 3: Handle the reveal state
    if (revealState?.readyToSignReveal) {
      console.log('[signAndBroadcast] Signing reveal...');
      const revealTxid = await signBroadcastAndMine(
        provider,
        revealState.readyToSignReveal.psbt,
        signerResult,
        mineAddress
      );
      console.log('[signAndBroadcast] Reveal broadcast:', revealTxid);
      return revealTxid;
    }

    // If resume returned a complete state or txid
    if (revealState?.txid || revealState?.reveal_txid) {
      return revealState.txid || revealState.reveal_txid;
    }
    if (revealState?.complete) {
      return revealState.complete.reveal_txid || revealState.complete.commit_txid || commitTxid;
    }

    // Fallback: return commit txid
    console.warn('[signAndBroadcast] No reveal state returned, returning commit txid');
    return commitTxid;
  }

  // ReadyToSignReveal (mid-flow resume)
  if (result?.readyToSignReveal) {
    return signBroadcastAndMine(
      provider,
      result.readyToSignReveal.psbt,
      signerResult,
      mineAddress
    );
  }

  throw new Error(
    `No readyToSign, readyToSignCommit, or txid in result: ${JSON.stringify(result).slice(0, 200)}`
  );
}
