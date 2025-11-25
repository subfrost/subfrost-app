/**
 * @alkanes/ts-sdk lite version - no WASM dependencies
 *
 * Use this entry point when you need types and utilities without WASM loading
 */

// Keystore exports (no WASM dependency)
export {
  KeystoreManager,
  DERIVATION_PATHS,
  createKeystore,
  unlockKeystore,
} from './keystore';

// Re-export bip39 functions
import * as bip39 from 'bip39';
export const generateMnemonic = (wordCount: 12 | 15 | 18 | 21 | 24 = 12): string => {
  const strength = wordCount === 12 ? 128 :
                  wordCount === 15 ? 160 :
                  wordCount === 18 ? 192 :
                  wordCount === 21 ? 224 : 256;
  return bip39.generateMnemonic(strength);
};
export const validateMnemonic = (mnemonic: string): boolean => bip39.validateMnemonic(mnemonic);

// Wallet exports (no WASM dependency)
export {
  AlkanesWallet,
  AddressType,
  createWallet,
  createWalletFromMnemonic,
} from './wallet';

// AMM exports (no WASM dependency)
export {
  amm,
  factory,
  splitAlkaneUtxos,
  type AlkaneTokenAllocation,
  type SplitAlkaneUtxosResult,
} from './amm';

// Network exports (no WASM dependency)
export {
  networks,
  mainnet,
  testnet,
  signet,
  oylnet,
  regtest,
  type NetworkConfig,
} from './networks';

// Utility exports (no WASM dependency)
export {
  getNetwork,
  validateAddress,
  satoshisToBTC,
  btcToSatoshis,
  formatAlkaneId,
  parseAlkaneId,
  delay,
  retry,
  calculateFee,
  hexToBytes,
  bytesToHex,
  reverseBytes,
  reversedHex,
  isBrowser,
  isNode,
  safeJsonParse,
  formatTimestamp,
  calculateWeight,
  weightToVsize,
} from './utils';

// Type exports (no WASM dependency)
export type {
  NetworkType,
  HDPath,
  KeystoreParams,
  EncryptedKeystore,
  Keystore,
  WalletConfig,
  AddressInfo,
  TxInput,
  TxOutput,
  PsbtOptions,
  AlkaneId,
  AlkaneBalance,
  AlkaneCallParams,
  ProviderConfig,
  TransactionResult,
  BlockInfo,
  UTXO,
  AddressBalance,
  ExportOptions,
  ImportOptions,
  FormattedUtxo,
  SpendStrategy,
  AccountUtxoPortfolio,
  SwapParams,
  LiquidityParams,
  WrapParams,
  SwapBrcBid,
  SignedBid,
  OkxBid,
  GetOffersParams,
  GetCollectionOffersParams,
} from './types';

// Version
export const VERSION = '0.1.0';

// Additional commonly needed types for api-provider
export enum AddressTypeEnum {
  P2PKH = 'p2pkh',
  P2SH_P2WPKH = 'p2sh-p2wpkh',
  P2WPKH = 'p2wpkh',
  P2TR = 'p2tr',
}

export const UTXO_DUST = 546;

export function assertHex(buffer: Buffer): Buffer {
  // Remove leading 0x02/0x03 prefix for taproot keys
  if (buffer.length === 33 && (buffer[0] === 0x02 || buffer[0] === 0x03)) {
    return buffer.subarray(1);
  }
  return buffer;
}

export function getAddressType(address: string): AddressTypeEnum | null {
  try {
    if (address.startsWith('bc1p') || address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
      return AddressTypeEnum.P2TR;
    }
    if (address.startsWith('bc1q') || address.startsWith('tb1q') || address.startsWith('bcrt1q')) {
      return AddressTypeEnum.P2WPKH;
    }
    if (address.startsWith('3') || address.startsWith('2')) {
      return AddressTypeEnum.P2SH_P2WPKH;
    }
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
      return AddressTypeEnum.P2PKH;
    }
    return null;
  } catch {
    return null;
  }
}

// Asset types enum
export enum AssetType {
  BRC20 = 'brc20',
  RUNES = 'runes',
  COLLECTIBLE = 'collectible',
  ALKANES = 'alkanes',
}

// OylTransactionError class
export class OylTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OylTransactionError';
  }
}

// Timeout utility
export function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

// Provider type (interface-only, no implementation)
export interface Provider {
  esplora: {
    getFeeEstimates: () => Promise<Record<string, number>>;
    getTxInfo: (txId: string) => Promise<any>;
    getAddressUtxos: (address: string) => Promise<any[]>;
    broadcastTransaction: (txHex: string) => Promise<string>;
  };
  api: {
    initSwapBid: (params: any) => Promise<any>;
    initRuneSwapBid: (params: any) => Promise<any>;
    initCollectionSwapBid: (params: any) => Promise<any>;
    confirmSwapBid: (params: any) => Promise<any>;
    confirmRuneSwapBid: (params: any) => Promise<any>;
    confirmCollectionSwapBid: (params: any) => Promise<any>;
  };
}

// Signer type
export interface Signer {
  sign: (psbt: any, finalize?: boolean) => Promise<any>;
  signMessage: (message: string, address: string) => Promise<string>;
}
