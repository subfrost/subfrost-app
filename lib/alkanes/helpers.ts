/**
 * Shared helper utilities for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 * Previously duplicated across all mutation hooks.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SIGNER_ADDRESSES } from './constants';

/**
 * Convert Uint8Array to base64 string.
 * Works in both browser and Node.js environments.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Get the bitcoinjs-lib network object for a given network string.
 */
export function getBitcoinNetwork(network: string): bitcoin.Network {
  switch (network) {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'testnet':
    case 'signet':
      return bitcoin.networks.testnet;
    case 'regtest':
    case 'regtest-local':
    case 'subfrost-regtest':
    case 'oylnet':
      return bitcoin.networks.regtest;
    default:
      return bitcoin.networks.bitcoin;
  }
}

/**
 * Get the frBTC signer address for a given network.
 * Throws if no signer address is configured.
 */
export function getSignerAddress(network: string): string {
  const signer = SIGNER_ADDRESSES[network];
  if (!signer) {
    throw new Error(`No signer address configured for network: ${network}`);
  }
  return signer;
}

/**
 * Parse protostones string to find the maximum vN output index referenced.
 * Used to auto-generate the correct number of to_addresses.
 */
export function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;
  const voutMatches = protostones.matchAll(/v(\d+)/g);
  for (const match of voutMatches) {
    const idx = parseInt(match[1], 10);
    if (idx > maxVout) maxVout = idx;
  }
  return maxVout;
}

/**
 * Convert display amount to alks (atomic units).
 * Default is 8 decimals for alkane tokens.
 */
export function toAlks(amount: string, decimals: number = 8): string {
  if (!amount) return '0';
  // Simple string-based conversion to avoid BigNumber dependency in shared layer
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac}`;
}

/**
 * Extract a PSBT as base64 from the various formats the WASM SDK can return.
 * Handles: Uint8Array, base64 string, and numeric-key objects.
 */
export function extractPsbtBase64(psbt: unknown): string {
  if (psbt instanceof Uint8Array) {
    return uint8ArrayToBase64(psbt);
  }
  if (typeof psbt === 'string') {
    return psbt;
  }
  if (typeof psbt === 'object' && psbt !== null) {
    const keys = Object.keys(psbt).map(Number).sort((a, b) => a - b);
    const bytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      bytes[i] = (psbt as Record<number, number>)[keys[i]];
    }
    return uint8ArrayToBase64(bytes);
  }
  throw new Error('Unexpected PSBT format: ' + typeof psbt);
}

/**
 * Sign and broadcast a split PSBT that protects inscribed UTXOs.
 *
 * When ordinals_strategy is 'preserve', the WASM returns a split_psbt alongside
 * the main psbt. The split tx separates inscriptions from BTC so the main tx
 * can safely spend the resulting clean UTXOs.
 *
 * Must be called BEFORE signing/broadcasting the main transaction.
 */
export async function signAndBroadcastSplitPsbt(params: {
  splitPsbt: unknown;
  network: bitcoin.Network;
  isBrowserWallet: boolean;
  taprootAddress?: string;
  segwitAddress?: string;
  paymentPubkeyHex?: string;
  signTaprootPsbt: (psbtBase64: string) => Promise<string>;
  signSegwitPsbt: (psbtBase64: string) => Promise<string>;
  broadcastTransaction: (txHex: string) => Promise<string>;
  patchPsbtForBrowserWallet: (params: any) => any;
}): Promise<string> {
  const {
    splitPsbt,
    network,
    isBrowserWallet,
    taprootAddress,
    segwitAddress,
    paymentPubkeyHex,
    signTaprootPsbt,
    signSegwitPsbt,
    broadcastTransaction,
    patchPsbtForBrowserWallet: patchFn,
  } = params;

  let splitBase64 = extractPsbtBase64(splitPsbt);

  if (isBrowserWallet) {
    const patched = patchFn({
      psbtBase64: splitBase64,
      network,
      isBrowserWallet,
      taprootAddress,
      segwitAddress,
      paymentPubkeyHex,
    });
    splitBase64 = patched.psbtBase64;
  }

  let signedBase64: string;
  if (isBrowserWallet) {
    signedBase64 = await signTaprootPsbt(splitBase64);
  } else {
    signedBase64 = await signSegwitPsbt(splitBase64);
    signedBase64 = await signTaprootPsbt(signedBase64);
  }

  const signedPsbt = bitcoin.Psbt.fromBase64(signedBase64, { network });
  signedPsbt.finalizeAllInputs();
  const tx = signedPsbt.extractTransaction();
  const txHex = tx.toHex();
  const txid = tx.getId();

  console.log('[signAndBroadcastSplitPsbt] Broadcasting split tx:', txid);
  await broadcastTransaction(txHex);
  console.log('[signAndBroadcastSplitPsbt] Split tx broadcast — inscriptions protected');
  return txid;
}
