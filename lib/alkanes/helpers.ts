/**
 * Shared helper utilities for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 * Previously duplicated across all mutation hooks.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { SIGNER_ADDRESSES } from './constants';

/**
 * Static signer address lookup — kept for tests only.
 * Production code uses getSignerAddressDynamic() which applies BIP341 tweak.
 * @deprecated Use getSignerAddressDynamic instead
 */
export function getSignerAddress(network: string): string {
  const signer = SIGNER_ADDRESSES[network];
  if (!signer) {
    throw new Error(`No signer address configured for network: ${network}`);
  }
  return signer;
}

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
    case 'devnet':
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

/**
 * Dynamically query the frBTC signer address from the contract via opcode 103.
 * On devnet the signer key changes each boot, so the hardcoded address is stale.
 * Mainnet uses the static address to avoid an alkanes_simulate call during
 * ESPO-backed swap/wrap flows; non-mainnet keeps the dynamic lookup because
 * local/regtest signer keys can change between deployments.
 */
export async function getSignerAddressDynamic(network: string): Promise<string> {
  if (network === 'mainnet') {
    return getSignerAddress(network);
  }

  try {
    const { getRpcUrl } = await import('@/utils/getConfig');
    const rpcUrl = getRpcUrl(network);
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target: { block: '32', tx: '0' },
          inputs: ['103'],
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '999',
          txindex: 0,
          vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    const hex = data?.result?.execution?.data?.replace('0x', '') || '';
    if (hex.length === 64) {
      const bitcoin = await import('bitcoinjs-lib');
      const ecc = await import('@bitcoinerlab/secp256k1');
      bitcoin.initEccLib(ecc);
      const xOnly = Buffer.from(hex, 'hex');
      const btcNetwork = network.includes('regtest') || network === 'devnet'
        ? bitcoin.networks.regtest
        : network === 'testnet' || network === 'signet'
          ? bitcoin.networks.testnet
          : bitcoin.networks.bitcoin;
      const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: btcNetwork });
      if (payment.address) return payment.address;
    }
  } catch (e: any) {
    throw new Error(`Failed to query frBTC signer address: ${e?.message}`);
  }
  throw new Error('Failed to derive frBTC signer address from opcode 103');
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
 *
 * 2026-05-04: Bug — sub-1 amounts (e.g. "0.1") produced "010000000" because
 * the old `^0+(\d)` regex required a digit AFTER leading zeros, leaving the
 * bare `'0'` from `whole` untouched. The post-012ccfca SDK rejects leading
 * zeros in cellpack ints and surfaces it as "Invalid edict format" (its
 * cellpack-number parser falls back to the edict parser on parse failure).
 */
export function toAlks(amount: string, decimals: number = 8): string {
  if (!amount) return '0';
  // Simple string-based conversion to avoid BigNumber dependency in shared layer.
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  // Strip leading zeros from the combined integer; the empty-string case
  // (input was "0" or "0.0") falls back to "0".
  const combined = `${whole}${frac}`.replace(/^0+/, '');
  return combined || '0';
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
