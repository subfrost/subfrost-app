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

/** Standard wallet connection/session check timeout (10 seconds) */
const SESSION_TIMEOUT_MS = 10000;

/**
 * Ensure the browser wallet extension has an active session.
 *
 * Auto-reconnect from localStorage restores UI state (addresses, walletType)
 * but doesn't activate the extension session. Without this, signPsbt() fails
 * or shows a connect-only popup without proceeding to sign.
 *
 * Call this at the start of every mutation (swap, wrap, liquidity, etc.)
 * before building the PSBT.
 */
export async function ensureWalletSession(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Check which wallet is actually connected (not just installed)
  const connectedId = localStorage.getItem('subfrost_browser_wallet_id');

  if (connectedId === 'unisat') {
    const unisat = (window as any).unisat;
    if (unisat) {
      let accounts: string[] = [];

      if (typeof unisat.getAccounts === 'function') {
        try {
          accounts = await withTimeout(
            Promise.resolve(unisat.getAccounts()),
            SESSION_TIMEOUT_MS,
            'UniSat',
            'connection check'
          ) || [];
        } catch (error) {
          console.warn('[browserWalletSigning] UniSat getAccounts failed or timed out:', error);
        }
      }

      if (!accounts.length && typeof unisat.requestAccounts === 'function') {
        accounts = await withTimeout(
          Promise.resolve(unisat.requestAccounts()),
          SESSION_TIMEOUT_MS,
          'UniSat',
          'connection request'
        ) || [];
      }

      if (!accounts.length) {
        throw new Error('UniSat is not connected. Unlock UniSat and connect this site before signing.');
      }
    }
  } else if (connectedId === 'okx') {
    const okx = (window as any).okxwallet?.bitcoin;
    if (okx?.connect) {
      try { await okx.connect(); } catch { /* already connected */ }
    }
  } else if (connectedId === 'xverse') {
    const xverse = (window as any).XverseProviders?.BitcoinProvider;
    if (xverse?.request) {
      try {
        // wallet_getAccount is the silent check (no popup if already authorized)
        await xverse.request('wallet_getAccount', null);
      } catch {
        // Not authorized or method not supported — try legacy getAccounts
        try {
          await xverse.request('getAccounts', { purposes: ['ordinals', 'payment'] });
        } catch { /* user denied or extension not ready */ }
      }
    }
  } else if (connectedId === 'oyl') {
    const oyl = (window as any).oyl;
    if (oyl?.getAddresses) {
      try { await oyl.getAddresses(); } catch { /* already connected */ }
    }
  }
}

/** Standard signing timeout (60 seconds) */
const SIGNING_TIMEOUT_MS = 60000;

/**
 * Diagnostic counter for OYL getAddresses() calls
 * Helps identify if React StrictMode or other code is causing duplicate modal triggers
 */
let oylGetAddressesCallCount = 0;
export const getOylCallCount = () => oylGetAddressesCallCount;
export const resetOylCallCount = () => { oylGetAddressesCallCount = 0; };

/**
 * Diagnostic counter for OYL signPsbt() calls
 * If this increments more than once per user action, we have duplicate signing calls
 */
let oylSignPsbtCallCount = 0;
export const getOylSignCount = () => oylSignPsbtCallCount;
export const resetOylSignCount = () => { oylSignPsbtCallCount = 0; };

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

export interface BrowserWalletSessionStatus {
  walletId: string | null;
  isBrowserWallet: boolean;
  isActive: boolean;
  accounts: string[];
  error?: string;
}

type UnisatSigningAddresses = string | {
  taprootAddress?: string;
  paymentAddress?: string;
  fallbackAddress?: string;
  network?: bitcoin.Network;
};

function normalizeUnisatAddresses(
  addresses: UnisatSigningAddresses,
  paymentAddress?: string,
  network?: bitcoin.Network,
) {
  if (typeof addresses === 'string') {
    return {
      taprootAddress: addresses,
      paymentAddress,
      fallbackAddress: addresses,
      network,
    };
  }

  return {
    ...addresses,
    fallbackAddress: addresses.fallbackAddress || addresses.taprootAddress || addresses.paymentAddress,
  };
}

function isPaymentAddress(address: string): boolean {
  const lower = address.toLowerCase();
  return lower.startsWith('bc1q')
    || lower.startsWith('tb1q')
    || lower.startsWith('bcrt1q')
    || address.startsWith('3')
    || address.startsWith('2');
}

/**
 * Helper: Create a promise that times out after specified milliseconds
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  walletId: string,
  action = 'signing'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${walletId} ${action} timed out after ${ms / 1000}s. ` +
                'Check if: (1) popup blocker is active, (2) wallet extension icon has pending request, ' +
                '(3) wallet is locked, (4) popup opened behind browser window.'
            )
          ),
        ms
      )
    ),
  ]);
}

async function getUnisatAccounts(action = 'connection check'): Promise<string[]> {
  const unisat = (window as any).unisat;
  if (!unisat || typeof unisat.getAccounts !== 'function') return [];
  const accounts = await withTimeout(
    Promise.resolve(unisat.getAccounts()),
    SESSION_TIMEOUT_MS,
    'UniSat',
    action
  );
  return Array.isArray(accounts) ? accounts : [];
}

export async function getBrowserWalletSessionStatus(): Promise<BrowserWalletSessionStatus> {
  if (typeof window === 'undefined') {
    return { walletId: null, isBrowserWallet: false, isActive: true, accounts: [] };
  }

  const walletId = localStorage.getItem('subfrost_browser_wallet_id');
  if (!walletId) {
    return { walletId: null, isBrowserWallet: false, isActive: true, accounts: [] };
  }

  if (walletId === 'unisat') {
    try {
      const accounts = await getUnisatAccounts();
      return {
        walletId,
        isBrowserWallet: true,
        isActive: accounts.length > 0,
        accounts,
        error: accounts.length > 0 ? undefined : 'UniSat is locked or not connected.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { walletId, isBrowserWallet: true, isActive: false, accounts: [], error: message };
    }
  }

  return { walletId, isBrowserWallet: true, isActive: true, accounts: [] };
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
  addresses: UnisatSigningAddresses,
  paymentAddressArg?: string,
  networkArg?: bitcoin.Network,
): Promise<SigningResult> {
  const unisat = (window as any).unisat;
  if (!unisat) {
    throw new Error('UniSat wallet not available');
  }

  await ensureWalletSession();

  const {
    taprootAddress,
    paymentAddress,
    fallbackAddress,
    network,
  } = normalizeUnisatAddresses(addresses, paymentAddressArg, networkArg);

  if (!fallbackAddress) {
    throw new Error('UniSat address not found');
  }

  const psbtHex = psbt.toHex();
  console.log('[browserWalletSigning] UniSat: PSBT hex length:', psbtHex.length);
  console.log('[browserWalletSigning] UniSat: taproot address:', taprootAddress || '(none)');
  console.log('[browserWalletSigning] UniSat: payment address:', paymentAddress || '(none)');
  console.log('[browserWalletSigning] UniSat: fallback address:', fallbackAddress);

  // Build toSignInputs with the address that matches each input script. Mixed
  // split PSBTs can contain both taproot alkane inputs and native segwit BTC
  // inputs; assigning every input to taproot can make UniSat never open.
  const toSignInputs = psbt.data.inputs.map((input, index) => {
    let address = fallbackAddress;

    if (network && input.witnessUtxo) {
      try {
        const inputAddress = bitcoin.address.fromOutputScript(
          Buffer.from(input.witnessUtxo.script),
          network,
        );

        if (inputAddress === taprootAddress || inputAddress === paymentAddress) {
          address = inputAddress;
        } else if (paymentAddress && isPaymentAddress(inputAddress)) {
          address = paymentAddress;
        } else if (taprootAddress) {
          address = taprootAddress;
        }
      } catch (error) {
        console.warn(`[browserWalletSigning] UniSat: could not resolve input ${index} address:`, error);
      }
    }

    return { index, address };
  });

  console.log('[browserWalletSigning] UniSat: toSignInputs:', JSON.stringify(toSignInputs));

  const hasSignPsbts = typeof unisat.signPsbts === 'function';
  const hasSignPsbt = typeof unisat.signPsbt === 'function';
  console.log('[browserWalletSigning] UniSat: hasSignPsbts:', hasSignPsbts, 'hasSignPsbt:', hasSignPsbt);

  let signedHex: string | null = null;

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/user rejected/i.test(message)) {
      throw new Error('UniSat rejected the signing request. If no popup appeared, unlock UniSat and try again.');
    }
    throw error;
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
  oylSignPsbtCallCount++;
  const callId = oylSignPsbtCallCount;

  const psbtHex = psbt.toHex();
  const startTime = Date.now();
  console.log(`[browserWalletSigning] OYL: ===== SIGN START (call #${callId}) =====`);
  console.log(`[browserWalletSigning] OYL: PSBT hex length:`, psbtHex.length);
  console.log(`[browserWalletSigning] OYL: inputs:`, psbt.inputCount);
  console.log(`[browserWalletSigning] OYL: Total signWithOyl calls this session: ${callId}`);

  const oylProvider = (window as any).oyl;

  const signWithRetry = async (): Promise<string> => {
    try {
      console.log('[browserWalletSigning] OYL: calling walletAdapter.signPsbt()...');
      const signedHex: string = await withTimeout(
        walletAdapter.signPsbt(psbtHex, { auto_finalized: false }),
        SIGNING_TIMEOUT_MS,
        'OYL'
      );
      console.log('[browserWalletSigning] OYL: signPsbt SUCCESS, got', signedHex?.length, 'hex chars');
      return signedHex;
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      // CONSERVATIVE error detection - only reconnect on SPECIFIC connection errors
      // Avoid false positives that would trigger unnecessary modals
      const isConnectionError =
        errorMsg.includes('Site origin must be connected first') ||
        errorMsg.includes('not connected') ||
        errorMsg.includes('disconnected');

      console.log('[browserWalletSigning] OYL signPsbt error:', errorMsg);
      console.log('[browserWalletSigning] OYL isConnectionError:', isConnectionError);

      if (isConnectionError && oylProvider?.getAddresses) {
        oylGetAddressesCallCount++;
        console.log(`[browserWalletSigning] OYL: connection error, attempting reconnection (call #${oylGetAddressesCallCount})...`);

        // Try to reconnect
        if (typeof oylProvider.connect === 'function') {
          try {
            await oylProvider.connect();
          } catch {
            // Ignore connect errors
          }
        }

        await oylProvider.getAddresses();
        console.log(`[browserWalletSigning] OYL: reconnection successful (call #${oylGetAddressesCallCount}), retrying sign...`);

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
  const elapsed = Date.now() - startTime;
  console.log(`[browserWalletSigning] OYL: ===== SIGN COMPLETE (call #${callId}) =====`);
  console.log(`[browserWalletSigning] OYL: signed hex length:`, signedHex?.length);
  console.log(`[browserWalletSigning] OYL: elapsed time:`, elapsed, 'ms');

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
    if (input.tapLeafScript?.length) {
      continue;
    }
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
