/**
 * @alkanes/ts-sdk
 * 
 * TypeScript SDK for Alkanes - Bitcoin smart contracts
 * 
 * This SDK provides:
 * - Wallet management with HD derivation (BIP32/44/84/86)
 * - Keystore encryption (ethers.js compatible)
 * - PSBT creation and signing
 * - Provider integration (@oyl/sdk compatible)
 * - Alkanes contract interaction
 * - WASM backend integration (alkanes-web-sys)
 * 
 * @example
 * ```typescript
 * import { createKeystore, unlockKeystore, createWallet, createProvider } from '@alkanes/ts-sdk';
 * 
 * // Create a new wallet
 * const { keystore, mnemonic } = await createKeystore('password123');
 * console.log('Save this mnemonic:', mnemonic);
 * 
 * // Later, unlock the keystore
 * const unlockedKeystore = await unlockKeystore(keystore, 'password123');
 * const wallet = createWallet(unlockedKeystore);
 * 
 * // Get addresses
 * const address = wallet.getReceivingAddress(0);
 * console.log('Address:', address);
 * 
 * // Create provider
 * const provider = createProvider({
 *   url: 'https://api.example.com',
 *   network: bitcoin.networks.bitcoin,
 *   networkType: 'mainnet',
 * });
 * 
 * // Get balance
 * const balance = await provider.getBalance(address);
 * console.log('Balance:', balance);
 * ```
 */

// Keystore exports
export {
  KeystoreManager,
  DERIVATION_PATHS,
  createKeystore,
  unlockKeystore,
} from './keystore';

// Wallet exports
export {
  AlkanesWallet,
  AddressType,
  createWallet,
  createWalletFromMnemonic,
} from './wallet';

// Provider exports
export {
  AlkanesProvider,
  BitcoinRpcClient,
  EsploraClient,
  AlkanesRpcClient,
  createProvider,
} from './provider';
export type {
  SimulateRequest,
  SimulateResponse,
} from './provider';

// AMM exports
export {
  amm,
  factory,
  splitAlkaneUtxos,
} from './amm';
export type {
  AlkaneTokenAllocation,
  SplitAlkaneUtxosResult,
} from './amm';

// Networks exports
export {
  networks,
  mainnet,
  testnet,
  signet,
  regtest,
  oylnet,
} from './networks';
export type { NetworkConfig } from './networks';

// Alkanes operations exports
export {
  wrapBtc,
  unwrapBtc,
  executeWithBtcWrapUnwrap,
} from './alkanes';
export type {
  ExecuteResult,
  WrapBtcParams,
  UnwrapBtcParams,
  ExecuteWithBtcWrapUnwrapParams,
} from './alkanes';

// Type exports
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
  AccountUtxoPortfolio,
  SpendStrategy,
  Account,
  Signer,
  Provider,
  GetOffersParams,
  GetCollectionOffersParams,
  SwapBrcBid,
  SignedBid,
  OkxBid,
  Network,
} from './types';

// Value exports from types (enums, constants, functions, classes)
export {
  AddressType as AddressTypeEnum,
  AssetType,
  UTXO_DUST,
  OylTransactionError,
  getAddressType,
  assertHex,
  timeout,
} from './types';

// Utility exports
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
  estimateTxSize,
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

// Version
export const VERSION = '0.1.0';

/**
 * Initialize the SDK with WASM module
 * 
 * @example
 * ```typescript
 * import init, * as wasm from '@alkanes/ts-sdk/wasm';
 * import { initSDK } from '@alkanes/ts-sdk';
 * 
 * await init();
 * const sdk = initSDK(wasm);
 * ```
 */
export async function initSDK(wasmModule?: any) {
  // Import dynamically to avoid circular dependencies
  const { KeystoreManager, createKeystore, unlockKeystore } = await import('./keystore');
  const { AlkanesWallet, createWallet, createWalletFromMnemonic } = await import('./wallet');
  const { AlkanesProvider, createProvider } = await import('./provider');
  
  return {
    KeystoreManager,
    AlkanesWallet,
    AlkanesProvider,
    createKeystore,
    unlockKeystore,
    createWallet,
    createWalletFromMnemonic,
    createProvider: (config: any) => createProvider(config, wasmModule),
    version: VERSION,
  };
}

// Default export - function that returns SDK object at call time (not module load time)
export default async function getAlkanesSDK() {
  const { KeystoreManager, createKeystore, unlockKeystore } = await import('./keystore');
  const { AlkanesWallet, createWallet, createWalletFromMnemonic } = await import('./wallet');
  const { AlkanesProvider, createProvider } = await import('./provider');
  
  return {
    KeystoreManager,
    AlkanesWallet,
    AlkanesProvider,
    createKeystore,
    unlockKeystore,
    createWallet,
    createWalletFromMnemonic,
    createProvider,
    initSDK,
    VERSION,
  };
}
