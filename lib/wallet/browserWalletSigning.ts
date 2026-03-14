/**
 * Browser Wallet PSBT Signing Utilities
 *
 * This module provides a unified interface for signing PSBTs across different browser wallets:
 * - Xverse: Uses sats-connect protocol with signInputs mapping
 * - UniSat: Uses signPsbts/signPsbt with toSignInputs array
 * - OYL: Uses SDK adapter with auto-reconnection
 * - OKX: Uses SDK adapter (similar to OYL)
 *
 * JOURNAL (2026-03-03): Unified wallet signing pattern to ensure consistent behavior
 * across all wallet types. Key differences between wallets:
 *
 * | Wallet  | API Format      | Input Mapping         | Auto-Finalize | Returns   |
 * |---------|-----------------|----------------------|---------------|-----------|
 * | Xverse  | signPsbt(base64)| signInputs object    | No (we do it) | Base64    |
 * | UniSat  | signPsbts(hex[])| toSignInputs array   | Yes           | Hex[]     |
 * | OYL     | SDK adapter     | N/A (SDK handles)    | No            | Hex       |
 * | OKX     | SDK adapter     | N/A (SDK handles)    | No            | Hex       |
 */

import * as bitcoin from 'bitcoinjs-lib';

/** Standard signing timeout (60 seconds) */
const SIGNING_TIMEOUT_MS = 60000;

/** Wallet identification */
export type WalletId = 'xverse' | 'unisat' | 'oyl' | 'okx' | 'unknown';

/** Signing result with metadata */
export interface SigningResult {
  /** Signed PSBT in base64 format */
  signedPsbtBase64: string;
  /** Whether the PSBT was auto-finalized by the wallet */
  isFinalized: boolean;
  /** Which wallet signed it */
  walletId: WalletId;
}

/** Browser wallet addresses */
export interface BrowserWalletAddresses {
  taproot?: { address: string; publicKey?: string };
  nativeSegwit?: { address: string; publicKey?: string };
}

/**
 * Helper: Create a promise that times out after specified milliseconds
 */
function withTimeout<T>(promise: Promise<T>, ms: number, walletId: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${walletId} signing timed out after ${ms / 1000}s. ` +
                'Check if: (1) popup blocker is active, (2) wallet extension icon has pending request, ' +
                '(3) wallet is locked, (4) popup opened behind browser window.'
            )
          ),
        ms
      )
    ),
  ]);
}

/**
 * Sign PSBT with Xverse wallet
 *
 * Xverse uses the sats-connect protocol and requires a signInputs mapping
 * that maps addresses to input indices.
 */
export async function signWithXverse(
  psbt: bitcoin.Psbt,
  ordinalsAddress: string,
  paymentAddress: string | undefined,
  network: bitcoin.Network
): Promise<SigningResult> {
  const xverse = (window as any).XverseProviders?.BitcoinProvider;
  if (!xverse) {
    throw new Error('Xverse wallet not available');
  }

  console.log('[browserWalletSigning] Xverse: building signInputs mapping...');
  console.log('[browserWalletSigning] Xverse: ordinalsAddr:', ordinalsAddress, '| paymentAddr:', paymentAddress);

  // Build signInputs: map each input to the correct signing address
  const signInputs: Record<string, number[]> = {};
  const ordIdx: number[] = [];
  const payIdx: number[] = [];

  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (!input.witnessUtxo) {
      // No witnessUtxo — default to payment if available, else ordinals
      if (paymentAddress) payIdx.push(i);
      else ordIdx.push(i);
      continue;
    }

    try {
      const addr = bitcoin.address.fromOutputScript(
        Buffer.from(input.witnessUtxo.script),
        network
      );

      if (paymentAddress && addr === paymentAddress) {
        payIdx.push(i);
      } else if (addr === ordinalsAddress) {
        ordIdx.push(i);
      } else {
        // Heuristic: P2SH/P2WPKH → payment; else → ordinals
        const isSegwit = addr.startsWith('3') || addr.toLowerCase().startsWith('bc1q');
        if (isSegwit && paymentAddress) {
          payIdx.push(i);
        } else {
          ordIdx.push(i);
        }
      }
    } catch {
      ordIdx.push(i);
    }
  }

  if (ordIdx.length > 0) signInputs[ordinalsAddress] = ordIdx;
  if (paymentAddress && payIdx.length > 0) signInputs[paymentAddress] = payIdx;

  console.log('[browserWalletSigning] Xverse: signInputs:', JSON.stringify(signInputs));

  const response: any = await withTimeout(
    xverse.request('signPsbt', {
      psbt: psbt.toBase64(),
      signInputs,
      broadcast: false,
    }),
    SIGNING_TIMEOUT_MS,
    'Xverse'
  );

  console.log('[browserWalletSigning] Xverse: response received');

  const signedPsbtBase64 = response.result?.psbt;
  if (!signedPsbtBase64) {
    const errDetail = response.error ? JSON.stringify(response.error) : JSON.stringify(response);
    throw new Error(`Xverse signing failed: ${errDetail}`);
  }

  return {
    signedPsbtBase64,
    isFinalized: false, // Xverse does NOT auto-finalize
    walletId: 'xverse',
  };
}

/**
 * Sign PSBT with UniSat wallet
 *
 * UniSat has both signPsbt (singular) and signPsbts (plural).
 * We prefer signPsbts for consistency with the SDK.
 * UniSat with autoFinalized: true returns already-finalized PSBTs.
 */
export async function signWithUnisat(
  psbt: bitcoin.Psbt,
  unisatAddress: string
): Promise<SigningResult> {
  const unisat = (window as any).unisat;
  if (!unisat) {
    throw new Error('UniSat wallet not available');
  }

  const psbtHex = psbt.toHex();
  console.log('[browserWalletSigning] UniSat: PSBT hex length:', psbtHex.length);
  console.log('[browserWalletSigning] UniSat: connected address:', unisatAddress);

  // Build toSignInputs - tell UniSat which inputs to sign
  const toSignInputs = psbt.data.inputs.map((_, index) => ({
    index,
    address: unisatAddress,
  }));

  console.log('[browserWalletSigning] UniSat: toSignInputs:', JSON.stringify(toSignInputs));

  const hasSignPsbts = typeof unisat.signPsbts === 'function';
  const hasSignPsbt = typeof unisat.signPsbt === 'function';
  console.log('[browserWalletSigning] UniSat: hasSignPsbts:', hasSignPsbts, 'hasSignPsbt:', hasSignPsbt);

  let signedHex: string | null = null;

  if (hasSignPsbts) {
    console.log('[browserWalletSigning] UniSat: calling signPsbts (autoFinalized: true)...');
    const signedHexArray: string[] = await withTimeout(
      unisat.signPsbts([psbtHex], {
        autoFinalized: true, // Let UniSat finalize taproot inputs
        toSignInputs,
      }),
      SIGNING_TIMEOUT_MS,
      'UniSat'
    );
    console.log('[browserWalletSigning] UniSat: signPsbts returned:', signedHexArray?.length, 'results');
    signedHex = signedHexArray?.[0] || null;
  } else if (hasSignPsbt) {
    console.log('[browserWalletSigning] UniSat: calling signPsbt (autoFinalized: true)...');
    signedHex = await withTimeout(
      unisat.signPsbt(psbtHex, {
        autoFinalized: true,
        toSignInputs,
      }),
      SIGNING_TIMEOUT_MS,
      'UniSat'
    );
  } else {
    throw new Error('UniSat wallet does not expose signPsbt or signPsbts');
  }

  if (!signedHex) {
    throw new Error('UniSat signing was cancelled or returned empty result');
  }

  console.log('[browserWalletSigning] UniSat: signed hex length:', signedHex.length);

  // Convert hex to base64
  const signedBuffer = Buffer.from(signedHex, 'hex');
  return {
    signedPsbtBase64: signedBuffer.toString('base64'),
    isFinalized: true, // UniSat with autoFinalized: true returns finalized PSBTs
    walletId: 'unisat',
  };
}

/**
 * Sign PSBT with OYL wallet via SDK adapter
 *
 * OYL works best through the SDK adapter path. Direct window.oyl calls
 * failed with validation errors in testing.
 */
export async function signWithOyl(
  psbt: bitcoin.Psbt,
  walletAdapter: any
): Promise<SigningResult> {
  const psbtHex = psbt.toHex();
  console.log('[browserWalletSigning] OYL: PSBT hex length:', psbtHex.length);

  const oylProvider = (window as any).oyl;

  const signWithRetry = async (): Promise<string> => {
    try {
      const signedHex: string = await withTimeout(
        walletAdapter.signPsbt(psbtHex, { auto_finalized: false }),
        SIGNING_TIMEOUT_MS,
        'OYL'
      );
      return signedHex;
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      const isConnectionError =
        errorMsg.includes('connected first') ||
        errorMsg.includes('not connected') ||
        errorMsg.includes('connection');

      if (isConnectionError && oylProvider?.getAddresses) {
        console.log('[browserWalletSigning] OYL: connection error, attempting reconnection...');

        // Try to reconnect
        if (typeof oylProvider.connect === 'function') {
          try {
            await oylProvider.connect();
          } catch {
            // Ignore connect errors
          }
        }

        await oylProvider.getAddresses();
        console.log('[browserWalletSigning] OYL: reconnection successful, retrying sign...');

        // Retry signing
        return await withTimeout(
          walletAdapter.signPsbt(psbtHex, { auto_finalized: false }),
          SIGNING_TIMEOUT_MS,
          'OYL'
        );
      }

      throw e;
    }
  };

  const signedHex = await signWithRetry();
  console.log('[browserWalletSigning] OYL: signed hex length:', signedHex?.length);

  const signedBuffer = Buffer.from(signedHex, 'hex');
  return {
    signedPsbtBase64: signedBuffer.toString('base64'),
    isFinalized: false, // OYL does NOT auto-finalize
    walletId: 'oyl',
  };
}

/**
 * Sign PSBT with OKX wallet via SDK adapter
 *
 * OKX is similar to OYL - uses the SDK adapter path.
 */
export async function signWithOkx(
  psbt: bitcoin.Psbt,
  walletAdapter: any
): Promise<SigningResult> {
  const psbtHex = psbt.toHex();
  console.log('[browserWalletSigning] OKX: PSBT hex length:', psbtHex.length);

  const signedHex: string = await withTimeout(
    walletAdapter.signPsbt(psbtHex, { auto_finalized: false }),
    SIGNING_TIMEOUT_MS,
    'OKX'
  );

  console.log('[browserWalletSigning] OKX: signed hex length:', signedHex?.length);

  const signedBuffer = Buffer.from(signedHex, 'hex');
  return {
    signedPsbtBase64: signedBuffer.toString('base64'),
    isFinalized: false, // OKX does NOT auto-finalize
    walletId: 'okx',
  };
}

/**
 * Finalize a signed PSBT and extract the transaction
 *
 * Handles both pre-finalized PSBTs (from UniSat) and non-finalized PSBTs
 * (from Xverse, OYL, OKX).
 */
export function finalizeAndExtractTx(
  signedPsbtBase64: string,
  isAlreadyFinalized: boolean,
  network: bitcoin.Network
): { tx: bitcoin.Transaction; txHex: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network });

  let tx: bitcoin.Transaction;

  if (isAlreadyFinalized) {
    // Try to extract directly
    try {
      tx = psbt.extractTransaction();
      console.log('[browserWalletSigning] PSBT was already finalized');
    } catch (extractError: any) {
      // If extraction fails, the wallet lied about finalization - try to finalize
      console.log('[browserWalletSigning] PSBT claimed finalized but extraction failed, trying to finalize...');
      psbt.finalizeAllInputs();
      tx = psbt.extractTransaction();
    }
  } else {
    // Need to finalize first
    try {
      psbt.finalizeAllInputs();
      tx = psbt.extractTransaction();
      console.log('[browserWalletSigning] PSBT finalized successfully');
    } catch (finalizeError: any) {
      // Maybe it was actually finalized despite the flag
      try {
        tx = psbt.extractTransaction();
        console.log('[browserWalletSigning] PSBT was actually already finalized');
      } catch {
        throw new Error(`Failed to finalize transaction: ${finalizeError.message}`);
      }
    }
  }

  return {
    tx,
    txHex: tx.toHex(),
    txid: tx.getId(),
  };
}

/**
 * Detect wallet ID from browser wallet info
 */
export function detectWalletId(browserWallet: any): WalletId {
  const id = browserWallet?.info?.id?.toLowerCase();
  if (id === 'xverse') return 'xverse';
  if (id === 'unisat') return 'unisat';
  if (id === 'oyl') return 'oyl';
  if (id === 'okx') return 'okx';
  return 'unknown';
}

/**
 * Patch tapInternalKey on all taproot inputs to match the user's public key
 *
 * The SDK builds PSBTs with a dummy wallet's tapInternalKey. Wallets validate
 * tapInternalKey matches their own key before signing.
 */
export function patchTapInternalKeys(psbt: bitcoin.Psbt, xOnlyPubKeyHex: string): number {
  // Use pure Uint8Array — wallets reject Buffer with "Expected Uint8Array" error
  const xOnlyBuffer = new Uint8Array(Buffer.from(xOnlyPubKeyHex, 'hex'));
  let patchedCount = 0;

  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    // Only patch taproot inputs (those that have or should have tapInternalKey)
    if (input.witnessUtxo) {
      const script = input.witnessUtxo.script;
      // Check if it's a P2TR output (version 1 witness program)
      if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
        input.tapInternalKey = xOnlyBuffer;
        patchedCount++;
      }
    }
  }

  return patchedCount;
}
