/**
 * Alkanes-RS Wallet Integration
 *
 * Provides encrypted keystore management, PSBT signing, and regtest support
 * using the @alkanes/ts-sdk package.
 */

import * as bitcoin from 'bitcoinjs-lib';

// Import Network type from constants
import type { Network } from '@/utils/constants';

// ✅ REAL ALKANES-RS SDK - Import from @alkanes/ts-sdk package
import {
  KeystoreManager,
  createKeystore,
  unlockKeystore,
  createWallet,
} from '@alkanes/ts-sdk';
import type {
  Keystore as AlkanesKeystore,
  WalletConfig as AlkanesWalletConfig,
} from '@alkanes/ts-sdk';

// Re-export types from SDK (use different names to avoid conflicts)
export type AlkanesWalletKeystore = AlkanesKeystore;
export type AlkanesWalletConfiguration = AlkanesWalletConfig;

// ECC library initialization state
let eccInitialized = false;

async function initEccLib() {
  if (eccInitialized) return;
  
  const ecc = await import('@bitcoinerlab/secp256k1');
  bitcoin.initEccLib(ecc);
  eccInitialized = true;
}

// Type definitions (matching alkanes-rs ts-sdk types)
export type Keystore = {
  mnemonic: string;
  masterFingerprint: string;
  accountXpub: string;
  hdPaths: Record<string, any>;
  network: string;
  createdAt: number;
};

export type EncryptedKeystore = {
  encrypted_mnemonic: string;
  master_fingerprint: string;
  created_at: number;
  version: string;
  pbkdf2_params: {
    salt: string;
    nonce?: string;
    iterations: number;
    algorithm?: string;
  };
  account_xpub: string;
  hd_paths: Record<string, string>;
};

export type AlkanesWalletInstance = {
  getMnemonic(): string;
  getReceivingAddress(index?: number): string;
  getChangeAddress(index?: number): string;
  deriveAddress(type: 'p2wpkh' | 'p2tr', index: number, change: number): { address: string; path: string; publicKey: string };
  signPsbt(psbtBase64: string): string;
  signMessage(message: string, index?: number): string;
  getKeystore(): Keystore;
};

/**
 * WASM module state
 */
let wasmInitialized = false;
let wasmModule: any = null;

/**
 * Initialize WASM module (call once at app startup)
 * Currently disabled to avoid node:crypto issues
 */
export async function initAlkanesWasm() {
  if (wasmInitialized) {
    return wasmModule;
  }

  // Skip WASM initialization for now - using browser-only implementation
  wasmInitialized = true;
  wasmModule = {};
  
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('✅ Alkanes wallet ready (browser-only mode)');
  }
  
  return wasmModule;
}

/**
 * Get network type for alkanes SDK
 */
function getAlkanesNetwork(network: Network): 'mainnet' | 'testnet' | 'regtest' | 'signet' {
  switch (network) {
    case 'mainnet':
      return 'mainnet';
    case 'testnet':
      return 'testnet';
    case 'regtest':
      return 'regtest';
    case 'signet':
      return 'signet';
    default:
      return 'mainnet';
  }
}

/**
 * Get bitcoinjs-lib network
 */
function getBitcoinJsNetwork(network: Network): bitcoin.Network {
  switch (network) {
    case 'mainnet':
      return bitcoin.networks.bitcoin;
    case 'testnet':
      return bitcoin.networks.testnet;
    case 'regtest':
      return bitcoin.networks.regtest;
    default:
      return bitcoin.networks.bitcoin;
  }
}

/**
 * Create a new encrypted keystore using REAL alkanes-rs SDK
 * 
 * @param password - Encryption password (min 8 characters)
 * @param network - Bitcoin network
 * @param wordCount - Mnemonic word count (12, 15, 18, 21, or 24)
 * @returns Encrypted keystore JSON and mnemonic
 */
export async function createAlkanesKeystore(
  password: string,
  network: Network = 'mainnet',
  wordCount: 12 | 15 | 18 | 21 | 24 = 12
): Promise<{ keystore: string; mnemonic: string }> {
  try {
    // ✅ Use REAL alkanes-rs SDK!
    const config: AlkanesWalletConfig = { network, wordCount };
    const result = await createKeystore(password, config);
    
    return {
      keystore: result.keystore,
      mnemonic: result.mnemonic,
    };
  } catch (error) {
    console.error('Error creating keystore:', error);
    throw new Error(`Failed to create keystore: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Unlock an encrypted keystore using REAL alkanes-rs SDK
 * 
 * @param keystoreJson - Encrypted keystore JSON string
 * @param password - Decryption password
 * @returns Decrypted keystore object
 */
export async function unlockAlkanesKeystore(
  keystoreJson: string,
  password: string,
  network: Network = 'mainnet'
): Promise<AlkanesKeystore> {
  try {
    // ✅ Use REAL alkanes-rs SDK!
    const keystore = await unlockKeystore(keystoreJson, password);
    return keystore;
  } catch (error) {
    console.error('Error unlocking keystore:', error);
    throw new Error(`Failed to unlock keystore: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create an Alkanes wallet from keystore using REAL alkanes-rs SDK
 * 
 * @param keystore - Decrypted keystore object
 * @returns Alkanes wallet instance
 */
export async function createAlkanesWallet(
  keystore: Keystore
): Promise<AlkanesWalletInstance> {
  try {
    // ✅ Use REAL alkanes-rs SDK to create wallet!
    const alkanesWallet = await createWallet(keystore);
    
    console.log('Created alkanes wallet:', alkanesWallet);
    console.log('Wallet methods:', Object.keys(alkanesWallet));
    
    // Check if the wallet has the expected methods
    if (!alkanesWallet || typeof alkanesWallet !== 'object') {
      throw new Error('createWallet returned invalid object');
    }
    
    // Wrap alkanes wallet with our interface for compatibility
    return {
      getMnemonic: () => keystore.mnemonic,
      getReceivingAddress: (index = 0) => {
        // AlkanesWallet has deriveAddress(type, index, change)
        const addressInfo = alkanesWallet.deriveAddress('p2wpkh', index, 0);
        return addressInfo.address;
      },
      getChangeAddress: (index = 0) => {
        const addressInfo = alkanesWallet.deriveAddress('p2wpkh', index, 1);
        return addressInfo.address;
      },
      deriveAddress: (type, index, change) => {
        const addressInfo = alkanesWallet.deriveAddress(type as any, index, change);
        return {
          address: addressInfo.address,
          path: addressInfo.path,
          publicKey: addressInfo.publicKey || '',
        };
      },
      signPsbt: (psbtBase64: string): any => {
        if (typeof alkanesWallet.signPsbt === 'function') {
          return alkanesWallet.signPsbt(psbtBase64);
        } else {
          throw new Error('signPsbt method not found on wallet');
        }
      },
      signMessage: (message: string, index = 0): any => {
        if (typeof alkanesWallet.signMessage === 'function') {
          return alkanesWallet.signMessage(message, index);
        } else {
          throw new Error('signMessage method not found on wallet');
        }
      },
      getKeystore: () => keystore,
    };
  } catch (error) {
    console.error('Error creating alkanes wallet:', error);
    throw new Error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create an Alkanes provider using @alkanes/ts-sdk
 *
 * @param network - Bitcoin network
 * @param rpcUrl - Optional Bitcoin Core RPC URL (defaults based on network)
 * @returns Alkanes provider instance
 */
export async function createAlkanesProvider(
  network: Network,
  rpcUrl?: string
) {
  const { AlkanesProvider } = await import('@alkanes/ts-sdk');

  const defaultUrls: Record<Network, string> = {
    mainnet: 'https://mainnet.sandshrew.io/v4/wrlckwrld',
    testnet: 'https://testnet.sandshrew.io/v4/wrlckwrld',
    regtest: 'https://ladder-chain-sieve.sandshrew.io/v4/wrlckwrld',
    signet: 'https://signet.sandshrew.io/v4/wrlckwrld',
    oylnet: 'https://ladder-chain-sieve.sandshrew.io/v4/wrlckwrld',
    'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  };

  const url = rpcUrl || defaultUrls[network] || defaultUrls.mainnet;
  const networkType = getAlkanesNetwork(network);
  const bitcoinNetwork = getBitcoinJsNetwork(network);

  return new AlkanesProvider({
    version: '',
    network: bitcoinNetwork,
    networkType,
    url,
    projectId: '',
  });
}

/**
 * Complete wallet setup flow
 * 
 * Creates a new wallet with encrypted keystore and provider
 * 
 * @param password - Encryption password
 * @param network - Bitcoin network
 * @returns Wallet, keystore JSON, mnemonic, and provider
 */
export async function setupAlkanesWallet(
  password: string,
  network: Network = 'mainnet'
) {
  // Create keystore
  const { keystore: keystoreJson, mnemonic } = await createAlkanesKeystore(
    password,
    network
  );
  
  // Unlock keystore
  const keystore = await unlockAlkanesKeystore(keystoreJson, password);
  
  // Create wallet
  const wallet = await createAlkanesWallet(keystore);
  
  // Create provider
  const provider = await createAlkanesProvider(network);
  
  // Get addresses
  const address = wallet.getReceivingAddress(0);
  const taprootAddress = wallet.deriveAddress('p2tr', 0, 0).address;
  
  return {
    wallet,
    provider,
    keystore: keystoreJson,
    mnemonic,
    address,        // P2WPKH address
    taprootAddress, // P2TR address
  };
}

/**
 * Restore wallet from encrypted keystore
 * 
 * @param keystoreJson - Encrypted keystore JSON
 * @param password - Decryption password
 * @param network - Bitcoin network
 * @returns Wallet and provider
 */
export async function restoreAlkanesWallet(
  keystoreJson: string,
  password: string,
  network: Network = 'mainnet'
) {
  // Unlock keystore
  const keystore = await unlockAlkanesKeystore(keystoreJson, password);
  
  // Create wallet
  const wallet = await createAlkanesWallet(keystore);
  
  // Create provider
  const provider = await createAlkanesProvider(network);
  
  // Get addresses
  const address = wallet.getReceivingAddress(0);
  const taprootAddress = wallet.deriveAddress('p2tr', 0, 0).address;
  
  return {
    wallet,
    provider,
    address,
    taprootAddress,
  };
}

/**
 * Restore wallet from mnemonic phrase using REAL alkanes-rs SDK
 */
export async function restoreFromMnemonic(
  mnemonic: string,
  password: string,
  network: Network = "mainnet"
) {
  // ✅ Validate using REAL alkanes SDK
  const manager = new KeystoreManager();
  if (!manager.validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  // ✅ Create keystore from mnemonic using REAL alkanes SDK
  const config: AlkanesWalletConfig = { network };
  const internalKeystore = manager.createKeystore(mnemonic, config);
  const keystoreJson = await manager.exportKeystore(internalKeystore, password, { pretty: false });
  
  const wallet = await createAlkanesWallet(internalKeystore);
  const provider = await createAlkanesProvider(network);

  const address = wallet.getReceivingAddress(0);
  const taprootAddress = wallet.deriveAddress("p2tr", 0, 0).address;

  return {
    wallet,
    provider,
    keystore: typeof keystoreJson === 'string' ? keystoreJson : JSON.stringify(keystoreJson),
    mnemonic,
    address,
    taprootAddress,
  };
}

/**
 * Sign a PSBT with Alkanes wallet
 * 
 * @param wallet - Alkanes wallet instance
 * @param psbtBase64 - PSBT in base64 format
 * @returns Signed PSBT in base64 format
 */
export function signPsbtWithAlkanes(
  wallet: AlkanesWalletInstance,
  psbtBase64: string
): string {
  return wallet.signPsbt(psbtBase64);
}

/**
 * Get alkane token balance
 * 
 * @param provider - Alkanes provider
 * @param address - Bitcoin address
 * @param alkaneId - Alkane ID (block:tx)
 * @returns Balance information
 */
export async function getAlkaneBalance(
  provider: any,
  address: string,
  alkaneId: { block: number; tx: number }
) {
  return provider.getAlkaneBalance(address, alkaneId);
}

/**
 * Storage keys for keystore
 */
export const STORAGE_KEYS = {
  ENCRYPTED_KEYSTORE: 'alkanes_encrypted_keystore',
  WALLET_NETWORK: 'alkanes_wallet_network',
} as const;

/**
 * Save encrypted keystore to storage
 * 
 * @param keystoreJson - Encrypted keystore JSON
 * @param network - Bitcoin network
 */
export function saveKeystoreToStorage(keystoreJson: string, network: Network) {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, keystoreJson);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);
  } catch (error) {
    console.error('Failed to save keystore to storage:', error);
  }
}

/**
 * Load encrypted keystore from storage
 * 
 * @returns Encrypted keystore JSON and network, or null if not found
 */
export function loadKeystoreFromStorage(): { keystore: string; network: Network } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const keystore = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    const network = localStorage.getItem(STORAGE_KEYS.WALLET_NETWORK) as Network;
    
    if (keystore && network) {
      return { keystore, network };
    }
  } catch (error) {
    console.error('Failed to load keystore from storage:', error);
  }
  
  return null;
}

/**
 * Clear keystore from storage
 */
export function clearKeystoreFromStorage() {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    localStorage.removeItem(STORAGE_KEYS.WALLET_NETWORK);
  } catch (error) {
    console.error('Failed to clear keystore from storage:', error);
  }
}

/**
 * Check if alkanes wallet is available in storage
 */
export function hasStoredKeystore(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
}
