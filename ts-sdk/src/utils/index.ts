/**
 * Utility functions for Alkanes SDK
 */

import * as bitcoin from 'bitcoinjs-lib';
import { NetworkType, AlkaneId } from '../types';

// Re-export AddressType enum that mirrors wallet's enum but with uppercase keys for compatibility
export enum AddressTypeEnum {
  P2PKH = 'p2pkh',      // Legacy
  P2SH = 'p2sh',        // Script hash
  P2SH_P2WPKH = 'p2sh-p2wpkh', // Nested SegWit
  P2WPKH = 'p2wpkh',    // Native SegWit
  P2TR = 'p2tr',        // Taproot
}

// Dust threshold for UTXOs
export const UTXO_DUST = 546;

/**
 * Asset type enumeration for swap operations
 */
export enum AssetType {
  BRC20 = 'brc20',
  RUNES = 'runes',
  COLLECTIBLE = 'collectible',
  ALKANE = 'alkane',
}

/**
 * Transaction error class for swap operations
 */
export class OylTransactionError extends Error {
  public code?: string;
  public txId?: string;

  constructor(message: string, code?: string, txId?: string) {
    super(message);
    this.name = 'OylTransactionError';
    this.code = code;
    this.txId = txId;
  }
}

/**
 * Assert and convert a buffer to proper format for PSBT operations
 */
export function assertHex(buffer: Buffer): Buffer {
  if (buffer.length === 33) {
    // Remove prefix byte for x-only pubkey
    return buffer.slice(1, 33);
  }
  return buffer;
}

/**
 * Get address type from a Bitcoin address string
 */
export function getAddressType(address: string): AddressTypeEnum | null {
  try {
    // Check for mainnet taproot (bc1p)
    if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
      return AddressTypeEnum.P2TR;
    }
    // Check for native segwit (bc1q)
    if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
      return AddressTypeEnum.P2WPKH;
    }
    // Check for nested segwit (starts with 3 on mainnet, 2 on testnet)
    if (address.startsWith('3') || address.startsWith('2')) {
      return AddressTypeEnum.P2SH_P2WPKH;
    }
    // Check for legacy (starts with 1 on mainnet, m/n on testnet)
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
      return AddressTypeEnum.P2PKH;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Timeout/sleep utility - returns a promise that resolves after specified ms
 * Used for adding delays between operations
 */
export function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert network type string to bitcoinjs-lib network object
 */
export function getNetwork(networkType: NetworkType): bitcoin.networks.Network {
  switch (networkType) {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'testnet':
      return bitcoin.networks.testnet;
    case 'regtest':
      return bitcoin.networks.regtest;
    case 'signet':
      return bitcoin.networks.testnet; // Signet uses testnet params
    default:
      throw new Error(`Unknown network type: ${networkType}`);
  }
}

/**
 * Validate Bitcoin address for a specific network
 */
export function validateAddress(address: string, network?: bitcoin.networks.Network): boolean {
  try {
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert satoshis to BTC
 */
export function satoshisToBTC(satoshis: number): number {
  return satoshis / 100000000;
}

/**
 * Convert BTC to satoshis
 */
export function btcToSatoshis(btc: number): number {
  return Math.round(btc * 100000000);
}

/**
 * Format AlkaneId as string
 */
export function formatAlkaneId(id: AlkaneId): string {
  return `${id.block}:${id.tx}`;
}

/**
 * Parse AlkaneId from string
 */
export function parseAlkaneId(idString: string): AlkaneId {
  const [block, tx] = idString.split(':').map(Number);
  if (isNaN(block) || isNaN(tx)) {
    throw new Error(`Invalid AlkaneId format: ${idString}`);
  }
  return { block, tx };
}

/**
 * Wait for a specific amount of time
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await delay(delayMs * Math.pow(2, attempt));
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Calculate transaction fee for given size and fee rate
 */
export function calculateFee(vsize: number, feeRate: number): number {
  return Math.ceil(vsize * feeRate);
}

/**
 * Estimate transaction vsize
 */
export function estimateTxSize(inputCount: number, outputCount: number, inputType: 'legacy' | 'segwit' | 'taproot' = 'segwit'): number {
  const baseSize = 10; // Version (4) + locktime (4) + input count (1) + output count (1)
  const outputSize = 34; // Typical output size
  
  let inputSize: number;
  switch (inputType) {
    case 'legacy':
      inputSize = 148;
      break;
    case 'segwit':
      inputSize = 68; // Witness vsize
      break;
    case 'taproot':
      inputSize = 57.5; // Taproot witness vsize
      break;
  }
  
  return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const matches = clean.match(/.{1,2}/g);
  if (!matches) {
    throw new Error('Invalid hex string');
  }
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Reverse byte order (for block hashes, txids, etc.)
 */
export function reverseBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse();
}

/**
 * Convert little-endian hex to big-endian
 */
export function reversedHex(hex: string): string {
  return bytesToHex(reverseBytes(hexToBytes(hex)));
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null;
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(json);
  } catch (error) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return null;
  }
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Calculate transaction weight
 */
export function calculateWeight(baseSize: number, witnessSize: number): number {
  return baseSize * 4 + witnessSize;
}

/**
 * Convert weight to vsize
 */
export function weightToVsize(weight: number): number {
  return Math.ceil(weight / 4);
}
