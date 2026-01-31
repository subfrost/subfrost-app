'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { NetworkMap, type Network } from '@/utils/constants';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Import from the unified client module - no direct tiny-secp256k1 imports
import {
  AlkanesWallet,
  AddressType,
  createWallet,
  createWalletFromMnemonic,
  KeystoreManager,
  createKeystore,
  unlockKeystore,
  // Browser wallet imports
  WalletConnector,
  ConnectedWallet,
  BrowserWalletInfo,
  getInstalledWallets,
  isWalletInstalled,
} from '@alkanes/ts-sdk';
import { BROWSER_WALLETS } from '@/constants/wallets';

// Session storage key for mnemonic
const SESSION_MNEMONIC_KEY = 'subfrost_session_mnemonic';

// Wallet type - keystore (mnemonic-based) or browser extension
export type WalletType = 'keystore' | 'browser';

// Re-export browser wallet types for external use
export type { BrowserWalletInfo, ConnectedWallet };

// Map app network names to SDK network names for address generation
// The SDK only recognizes: mainnet, testnet, regtest
function toSdkNetwork(network: Network): 'mainnet' | 'testnet' | 'regtest' {
  switch (network) {
    case 'mainnet':
      return 'mainnet';
    case 'testnet':
    case 'signet':
      return 'testnet';
    case 'regtest':
    case 'regtest-local':
    case 'subfrost-regtest':
    case 'oylnet':
      return 'regtest';
    default:
      return 'mainnet';
  }
}

// Helper to recursively convert Map to plain object (serde_wasm_bindgen returns Maps)
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

// Helper to extract enriched data from WASM provider response
// Handles both Map (from serde_wasm_bindgen) and plain object responses
function extractEnrichedData(rawResult: any): { spendable: any[]; assets: any[]; pending: any[] } | null {
  if (!rawResult) return null;

  let enrichedData: any;
  if (rawResult instanceof Map) {
    const returns = rawResult.get('returns');
    enrichedData = mapToObject(returns);
  } else {
    enrichedData = rawResult?.returns || rawResult;
  }

  if (!enrichedData) return null;

  // Convert any nested Maps in arrays
  const toArray = (val: any): any[] => {
    if (Array.isArray(val)) return val.map(mapToObject);
    if (val && typeof val === 'object' && Object.keys(val).length > 0) {
      return Object.values(val).map(mapToObject);
    }
    return [];
  };

  return {
    spendable: toArray(enrichedData.spendable),
    assets: toArray(enrichedData.assets),
    pending: toArray(enrichedData.pending),
  };
}

type Account = {
  taproot?: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
  nativeSegwit?: { address: string; pubkey: string; hdPath: string };
  spendStrategy: { addressOrder: string[]; utxoSortGreatestToLeast: boolean; changeAddress: string };
  network: any;
};

type FormattedUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: any[];
  runes: any[];
  alkanes: Record<string, { value: string; name: string; symbol: string }>;
  indexed: boolean;
  confirmations: number;
};

// Storage keys
const STORAGE_KEYS = {
  ENCRYPTED_KEYSTORE: 'subfrost_encrypted_keystore',
  WALLET_NETWORK: 'subfrost_wallet_network',
  SESSION_MNEMONIC: 'subfrost_session_mnemonic', // Session-only storage for active wallet
  BROWSER_WALLET_ID: 'subfrost_browser_wallet_id', // Last connected browser wallet ID
  WALLET_TYPE: 'subfrost_wallet_type', // 'keystore' or 'browser'
  BROWSER_WALLET_ADDRESSES: 'subfrost_browser_wallet_addresses', // Cached addresses to avoid re-prompting
} as const;

type WalletContextType = {
  // Connection state
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  isInitializing: boolean;

  // Wallet type
  walletType: WalletType | null;

  // Wallet data
  address: string;
  paymentAddress: string;
  publicKey: string;
  account: Account;
  network: Network;
  wallet: AlkanesWallet | null;

  // Browser wallet data
  browserWallet: ConnectedWallet | null;
  availableBrowserWallets: BrowserWalletInfo[];
  installedBrowserWallets: BrowserWalletInfo[];

  // Keystore Actions
  createWallet: (password: string) => Promise<{ mnemonic: string }>;
  unlockWallet: (password: string) => Promise<void>;
  restoreWallet: (mnemonic: string, password: string) => Promise<void>;
  deleteKeystore: () => void;

  // Browser wallet actions
  detectBrowserWallets: () => Promise<BrowserWalletInfo[]>;
  connectBrowserWallet: (walletId: string) => Promise<void>;

  // Common actions
  disconnect: () => void;
  signPsbt: (psbtBase64: string) => Promise<string>;
  signTaprootPsbt: (psbtBase64: string) => Promise<string>;
  signSegwitPsbt: (psbtBase64: string) => Promise<string>;
  signPsbts: (params: { psbts: string[] }) => Promise<{ signedPsbts: string[] }>;
  signMessage: (message: string) => Promise<string>;

  // UTXO methods
  getUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableTotalBalance: () => Promise<number>;

  // For compatibility with existing code
  hasStoredKeystore: boolean;
};

const WalletContext = createContext<WalletContextType | null>(null);

interface WalletProviderProps {
  children: ReactNode;
  network: Network;
}

export function WalletProvider({ children, network }: WalletProviderProps) {
  const { provider: sdkProvider, isInitialized: sdkInitialized, loadWallet } = useAlkanesSDK();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [wallet, setWallet] = useState<AlkanesWallet | null>(null);
  const [hasStoredKeystore, setHasStoredKeystore] = useState(false);

  // Browser wallet state
  const [browserWallet, setBrowserWallet] = useState<ConnectedWallet | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [installedBrowserWallets, setInstalledBrowserWallets] = useState<BrowserWalletInfo[]>([]);
  // Store both addresses from browser wallets that support multiple address types
  const [browserWalletAddresses, setBrowserWalletAddresses] = useState<{
    nativeSegwit?: { address: string; publicKey?: string };
    taproot?: { address: string; publicKey?: string };
  } | null>(null);

  // WalletConnector instance (lazy initialized)
  const walletConnectorRef = useRef<WalletConnector | null>(null);
  const getWalletConnector = useCallback(() => {
    if (!walletConnectorRef.current) {
      walletConnectorRef.current = new WalletConnector();
    }
    return walletConnectorRef.current;
  }, []);

  // Track whether wallet initialization has already run to prevent re-triggering
  // on dependency changes (e.g., sdkInitialized going from false→true)
  const hasInitializedRef = useRef(false);

  // Check for stored keystore and restore session on mount
  // Only runs once per mount — uses hasInitializedRef to prevent re-triggering
  // when sdkInitialized/loadWallet change after the initial run.
  useEffect(() => {
    if (hasInitializedRef.current) return;

    const initializeWallet = async () => {
      if (typeof window === 'undefined') return;
      hasInitializedRef.current = true;

      const stored = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
      setHasStoredKeystore(!!stored);

      // Detect installed browser wallets
      try {
        // Give wallets time to inject (some wallets inject asynchronously)
        await new Promise(resolve => setTimeout(resolve, 100));
        const installed = getInstalledWallets();
        setInstalledBrowserWallets(installed);
      } catch (error) {
        console.warn('[WalletContext] Failed to detect browser wallets:', error);
      }

      // Check for previously stored wallet type
      const storedWalletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE) as WalletType | null;

      // Check for active keystore session (survives page navigation but not tab close)
      const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
      if (sessionMnemonic && stored && storedWalletType === 'keystore') {
        try {
          // Restore wallet from session mnemonic
          const restoredWallet = createWalletFromMnemonic(sessionMnemonic, toSdkNetwork(network));
          setWallet(restoredWallet);
          setWalletType('keystore');

          // Also load the wallet into the SDK provider for signing
          if (sdkInitialized && loadWallet) {
            loadWallet(sessionMnemonic);
          }
        } catch (error) {
          // Session invalid, clear it
          sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
          localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
        }
      }

      // Check for browser wallet auto-reconnect
      const storedBrowserWalletId = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ID);
      if (storedBrowserWalletId && storedWalletType === 'browser') {
        // Restore cached addresses from localStorage to avoid re-prompting
        try {
          const cachedAddrs = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
          if (cachedAddrs) {
            setBrowserWalletAddresses(JSON.parse(cachedAddrs));
          }
        } catch {
          // ignore parse errors
        }

        try {
          const connector = getWalletConnector();
          const walletInfo = BROWSER_WALLETS.find(w => w.id === storedBrowserWalletId);
          if (walletInfo && isWalletInstalled(walletInfo)) {
            // Attempt to reconnect to the browser wallet
            const connected = await connector.connect(walletInfo);
            setBrowserWallet(connected);
            setWalletType('browser');
            console.log('[WalletContext] Reconnected to browser wallet:', walletInfo.name);

            // Use cached addresses from localStorage instead of re-prompting
            // The addresses were cached during the initial connectBrowserWallet call
          }
        } catch (error) {
          // Auto-reconnect failed, clear stored ID
          console.warn('[WalletContext] Failed to auto-reconnect browser wallet:', error);
          localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
          localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
          localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
        }
      }

      setIsInitializing(false);
    };

    initializeWallet();
  }, [network, sdkInitialized, loadWallet, getWalletConnector]);

  // Load keystore wallet into SDK provider when sdkInitialized becomes true
  // (separate from main init so it doesn't re-trigger browser wallet reconnect)
  useEffect(() => {
    if (!sdkInitialized || !loadWallet) return;
    const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    const storedWalletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);
    if (sessionMnemonic && storedWalletType === 'keystore') {
      loadWallet(sessionMnemonic);
    }
  }, [sdkInitialized, loadWallet]);

  // Derive addresses from wallet (keystore or browser wallet)
  const addresses = useMemo(() => {
    // For browser wallets, use the connected wallet's address(es)
    if (browserWallet && walletType === 'browser') {
      const primaryAddress = browserWallet.address;
      const primaryPublicKey = browserWallet.publicKey || '';

      // Check if we have explicit addresses from wallets that support multiple address types
      if (browserWalletAddresses) {
        const { nativeSegwit: segwitAddr, taproot: taprootAddr } = browserWalletAddresses;

        // Use explicit addresses if available, otherwise fall back to detecting from primary
        const hasExplicitSegwit = segwitAddr?.address;
        const hasExplicitTaproot = taprootAddr?.address;

        // If wallet provided explicit addresses, use them
        if (hasExplicitSegwit || hasExplicitTaproot) {
          return {
            nativeSegwit: hasExplicitSegwit ? {
              address: segwitAddr!.address,
              pubkey: segwitAddr!.publicKey || '',
              hdPath: ''
            } : { address: '', pubkey: '', hdPath: '' },
            taproot: hasExplicitTaproot ? {
              address: taprootAddr!.address,
              pubkey: taprootAddr!.publicKey || '',
              pubKeyXOnly: taprootAddr!.publicKey ? taprootAddr!.publicKey.slice(2) : '',
              hdPath: ''
            } : { address: '', pubkey: '', pubKeyXOnly: '', hdPath: '' },
          };
        }
      }

      // Fall back to detecting address type from address format
      // bc1q... = native segwit (P2WPKH)
      // bc1p... = taproot (P2TR)
      // tb1q.../tb1p... = testnet equivalents
      // bcrt1q.../bcrt1p... = regtest equivalents
      const isTaproot = primaryAddress.startsWith('bc1p') || primaryAddress.startsWith('tb1p') || primaryAddress.startsWith('bcrt1p');
      const isNativeSegwit = primaryAddress.startsWith('bc1q') || primaryAddress.startsWith('tb1q') || primaryAddress.startsWith('bcrt1q');

      // Only assign the address to the correct type based on address format
      // This prevents the bug where a taproot address was being used for both
      return {
        nativeSegwit: isNativeSegwit ? {
          address: primaryAddress,
          pubkey: primaryPublicKey,
          hdPath: ''
        } : { address: '', pubkey: '', hdPath: '' },
        taproot: isTaproot ? {
          address: primaryAddress,
          pubkey: primaryPublicKey,
          pubKeyXOnly: primaryPublicKey ? primaryPublicKey.slice(2) : '',
          hdPath: ''
        } : { address: '', pubkey: '', pubKeyXOnly: '', hdPath: '' },
      };
    }

    // For keystore wallets
    if (!wallet) {
      return {
        nativeSegwit: { address: '', pubkey: '', hdPath: '' },
        taproot: { address: '', pubkey: '', pubKeyXOnly: '', hdPath: '' },
      };
    }

    const segwitInfo = wallet.deriveAddress(AddressType.P2WPKH, 0, 0);
    const taprootInfo = wallet.deriveAddress(AddressType.P2TR, 0, 0);

    return {
      nativeSegwit: {
        address: segwitInfo.address,
        pubkey: segwitInfo.publicKey,
        hdPath: segwitInfo.path,
      },
      taproot: {
        address: taprootInfo.address,
        pubkey: taprootInfo.publicKey,
        pubKeyXOnly: taprootInfo.publicKey.slice(2), // Remove prefix for x-only
        hdPath: taprootInfo.path,
      },
    };
  }, [wallet, browserWallet, walletType, browserWalletAddresses]);

  // Build account structure
  const account: Account = useMemo(() => {
    return {
      nativeSegwit: addresses.nativeSegwit.address ? addresses.nativeSegwit : undefined,
      taproot: addresses.taproot.address ? addresses.taproot : undefined,
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[network],
    };
  }, [addresses, network]);

  // Create new wallet
  const createNewWallet = useCallback(async (password: string): Promise<{ mnemonic: string }> => {
    // Debug: check Web Crypto API availability before keystore creation
    console.log('[Wallet] isSecureContext:', typeof window !== 'undefined' && window.isSecureContext);
    console.log('[Wallet] window.crypto exists:', typeof window !== 'undefined' && !!window.crypto);
    console.log('[Wallet] window.crypto.subtle exists:', typeof window !== 'undefined' && !!window.crypto?.subtle);
    console.log('[Wallet] Current origin:', typeof window !== 'undefined' && window.location.origin);

    // createKeystore generates mnemonic and returns both encrypted keystore and mnemonic
    const sdkNetwork = toSdkNetwork(network);
    const { keystore: encrypted, mnemonic } = await createKeystore(password, { network: sdkNetwork });

    // Create wallet from mnemonic
    const newWallet = createWalletFromMnemonic(mnemonic, sdkNetwork);

    // Store encrypted keystore
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encrypted);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    // Clear any browser wallet connection
    setBrowserWallet(null);
    setBrowserWalletAddresses(null);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);

    setWallet(newWallet);
    setWalletType('keystore');
    setHasStoredKeystore(true);

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(mnemonic);
    }

    return { mnemonic };
  }, [network, loadWallet]);

  // Unlock existing wallet
  const unlockWallet = useCallback(async (password: string): Promise<void> => {
    const encrypted = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    if (!encrypted) {
      throw new Error('No wallet found. Please create or restore a wallet first.');
    }

    const keystore = await unlockKeystore(encrypted, password);
    const unlockedWallet = createWalletFromMnemonic(keystore.mnemonic, toSdkNetwork(network));

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, keystore.mnemonic);
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');

    // Clear any browser wallet connection
    setBrowserWallet(null);
    setBrowserWalletAddresses(null);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);

    setWallet(unlockedWallet);
    setWalletType('keystore');

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(keystore.mnemonic);
    }
  }, [network, loadWallet]);

  // Restore wallet from mnemonic
  const restoreWallet = useCallback(async (mnemonic: string, password: string): Promise<void> => {
    // Create keystore manager and use its validateMnemonic method
    const manager = new KeystoreManager();

    const trimmedMnemonic = mnemonic.trim();

    // Validate mnemonic
    if (!manager.validateMnemonic(trimmedMnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Create wallet
    const sdkNetwork = toSdkNetwork(network);
    const restoredWallet = createWalletFromMnemonic(trimmedMnemonic, sdkNetwork);

    // Create keystore and encrypt
    const keystore = manager.createKeystore(trimmedMnemonic, { network: sdkNetwork });
    const encrypted = await manager.exportKeystore(keystore, password, { pretty: true });
    const encryptedStr = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted, null, 2);

    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encryptedStr);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, trimmedMnemonic);

    // Clear any browser wallet connection
    setBrowserWallet(null);
    setBrowserWalletAddresses(null);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);

    setWallet(restoredWallet);
    setWalletType('keystore');
    setHasStoredKeystore(true);

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(trimmedMnemonic);
    }
  }, [network, loadWallet]);

  // Delete stored keystore permanently
  const deleteKeystore = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Clear all keystore-related storage
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    localStorage.removeItem(STORAGE_KEYS.WALLET_NETWORK);
    localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);

    // Also clear old alkanes keys for backwards compatibility
    localStorage.removeItem('alkanes_encrypted_keystore');
    localStorage.removeItem('alkanes_wallet_network');

    // Reset wallet state
    setWallet(null);
    setBrowserWallet(null);
    setBrowserWalletAddresses(null);
    setWalletType(null);
    setHasStoredKeystore(false);
  }, []);

  // Disconnect (lock) wallet - works for both keystore and browser wallets
  const disconnect = useCallback(async () => {
    // Clear keystore session
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
    setWallet(null);

    // Clear browser wallet connection
    if (browserWallet) {
      try {
        await browserWallet.disconnect();
      } catch (error) {
        console.warn('[WalletContext] Failed to disconnect browser wallet:', error);
      }
    }
    setBrowserWallet(null);
    setBrowserWalletAddresses(null);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);

    // Disconnect the WalletConnector
    const connector = getWalletConnector();
    try {
      await connector.disconnect();
    } catch (error) {
      // Ignore disconnect errors
    }

    setWalletType(null);
    setIsConnectModalOpen(false);
  }, [browserWallet, getWalletConnector]);

  // Detect installed browser wallets
  const detectBrowserWallets = useCallback(async (): Promise<BrowserWalletInfo[]> => {
    if (typeof window === 'undefined') return [];

    try {
      // Give wallets time to inject
      await new Promise(resolve => setTimeout(resolve, 100));
      const installed = getInstalledWallets();
      setInstalledBrowserWallets(installed);
      return installed;
    } catch (error) {
      console.error('[WalletContext] Failed to detect browser wallets:', error);
      return [];
    }
  }, []);

  // Helper function to query browser wallet for both address types
  const fetchBrowserWalletAddresses = useCallback(async (walletId: string): Promise<{
    nativeSegwit?: { address: string; publicKey?: string };
    taproot?: { address: string; publicKey?: string };
  }> => {
    const result: {
      nativeSegwit?: { address: string; publicKey?: string };
      taproot?: { address: string; publicKey?: string };
    } = {};

    try {
      switch (walletId) {
        case 'xverse': {
          // Xverse supports both ordinals (taproot) and payment (native segwit) addresses
          const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;
          if (xverseProvider) {
            const response = await xverseProvider.request('getAccounts', {
              purposes: ['ordinals', 'payment'],
            });
            if (response?.result) {
              for (const account of response.result) {
                if (account.purpose === 'ordinals' || account.addressType === 'p2tr') {
                  result.taproot = { address: account.address, publicKey: account.publicKey };
                } else if (account.purpose === 'payment' || account.addressType === 'p2wpkh') {
                  result.nativeSegwit = { address: account.address, publicKey: account.publicKey };
                }
              }
            }
          }
          break;
        }
        case 'leather': {
          // Leather provides multiple addresses
          const leatherProvider = (window as any).LeatherProvider;
          if (leatherProvider) {
            const response = await leatherProvider.request('getAddresses');
            if (response?.result?.addresses) {
              for (const addr of response.result.addresses) {
                if (addr.symbol === 'BTC') {
                  if (addr.type === 'p2tr') {
                    result.taproot = { address: addr.address, publicKey: addr.publicKey };
                  } else if (addr.type === 'p2wpkh') {
                    result.nativeSegwit = { address: addr.address, publicKey: addr.publicKey };
                  }
                }
              }
            }
          }
          break;
        }
        case 'unisat':
        case 'okx':
        case 'wizz':
        case 'magic-eden':
        case 'phantom':
        default:
          // These wallets typically only expose one address
          // We'll detect the type from the address format in the addresses useMemo
          break;
      }
    } catch (error) {
      console.warn('[WalletContext] Failed to fetch additional addresses:', error);
    }

    return result;
  }, []);

  // Connect to a browser wallet by ID
  const connectBrowserWallet = useCallback(async (walletId: string): Promise<void> => {
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }

    const walletInfo = BROWSER_WALLETS.find(w => w.id === walletId);
    if (!walletInfo) {
      throw new Error(`Unknown wallet: ${walletId}`);
    }

    if (!isWalletInstalled(walletInfo)) {
      throw new Error(`${walletInfo.name} is not installed`);
    }

    try {
      let connected: ConnectedWallet;
      const additionalAddresses: {
        nativeSegwit?: { address: string; publicKey?: string };
        taproot?: { address: string; publicKey?: string };
      } = {};

      // For wallets that support multiple address types, call their native API
      // directly to get ALL addresses in a single user prompt, then construct
      // a ConnectedWallet manually. This avoids a second prompt from
      // fetchBrowserWalletAddresses calling getAccounts again.
      if (walletId === 'xverse') {
        const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;
        if (!xverseProvider) throw new Error('Xverse provider not available');

        // Single prompt: get all accounts (ordinals + payment)
        const response = await xverseProvider.request('getAccounts', {
          purposes: ['ordinals', 'payment'],
        });
        if (!response?.result?.length) throw new Error('No accounts returned from Xverse');

        // Extract all addresses from the single response
        let primaryAccount = response.result[0];
        for (const account of response.result) {
          if (account.purpose === 'ordinals' || account.addressType === 'p2tr') {
            additionalAddresses.taproot = { address: account.address, publicKey: account.publicKey };
          } else if (account.purpose === 'payment' || account.addressType === 'p2wpkh') {
            additionalAddresses.nativeSegwit = { address: account.address, publicKey: account.publicKey };
          }
        }

        // Construct ConnectedWallet using the SDK class (same constructor the SDK uses internally)
        // The constructor takes (info, provider, account) but the .d.ts doesn't expose it
        const provider = (window as any)[walletInfo.injectionKey];
        connected = new (ConnectedWallet as any)(walletInfo, provider, {
          address: primaryAccount.address,
          publicKey: primaryAccount.publicKey,
          addressType: primaryAccount.addressType,
        });
      } else if (walletId === 'leather') {
        const leatherProvider = (window as any).LeatherProvider;
        if (!leatherProvider) throw new Error('Leather provider not available');

        // Single prompt: get all addresses
        const response = await leatherProvider.request('getAddresses');
        if (!response?.result?.addresses?.length) throw new Error('No addresses returned from Leather');

        let primaryAccount: any = null;
        for (const addr of response.result.addresses) {
          if (addr.symbol === 'BTC') {
            if (addr.type === 'p2tr') {
              additionalAddresses.taproot = { address: addr.address, publicKey: addr.publicKey };
              if (!primaryAccount) primaryAccount = addr;
            } else if (addr.type === 'p2wpkh') {
              additionalAddresses.nativeSegwit = { address: addr.address, publicKey: addr.publicKey };
              if (!primaryAccount) primaryAccount = addr;
            }
          }
        }
        if (!primaryAccount) throw new Error('No BTC addresses returned from Leather');

        const provider = (window as any)[walletInfo.injectionKey];
        connected = new (ConnectedWallet as any)(walletInfo, provider, {
          address: primaryAccount.address,
          publicKey: primaryAccount.publicKey,
          addressType: primaryAccount.type,
        });
      } else if (walletId === 'phantom') {
        // Phantom is a multi-chain wallet. window.phantom is the top-level object;
        // the Bitcoin provider lives at window.phantom.bitcoin and follows the
        // standard Bitcoin wallet API (requestAccounts, signPsbt, etc.).
        const phantomBtcProvider = (window as any).phantom?.bitcoin;
        if (!phantomBtcProvider) throw new Error('Phantom Bitcoin provider not available');

        const accounts = await phantomBtcProvider.requestAccounts();
        if (!accounts?.length) throw new Error('No accounts returned from Phantom');

        // Phantom returns account objects with address and publicKey
        const primaryAccount = accounts[0];
        const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
        const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;

        const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
        if (isTaproot) {
          additionalAddresses.taproot = { address: addr, publicKey: pubKey };
        } else {
          additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };
        }

        connected = new (ConnectedWallet as any)(walletInfo, phantomBtcProvider, {
          address: addr,
          publicKey: pubKey,
          addressType: isTaproot ? 'p2tr' : 'p2wpkh',
        });
      } else if (walletId === 'keplr') {
        // Keplr exposes Bitcoin via window.keplr.bitcoin (or window.bitcoin_keplr)
        // using the standard Bitcoin wallet API (requestAccounts, signPsbt, etc.),
        // NOT the Cosmos-style enable(chainId) + getKey(chainId) API.
        const keplrBtcProvider = (window as any).keplr?.bitcoin || (window as any).bitcoin_keplr;
        if (!keplrBtcProvider) throw new Error('Keplr Bitcoin provider not available');

        // Connect and get accounts using the standard Bitcoin wallet API
        let accounts: string[];
        if (typeof keplrBtcProvider.requestAccounts === 'function') {
          accounts = await keplrBtcProvider.requestAccounts();
        } else if (typeof keplrBtcProvider.connectWallet === 'function') {
          const result = await keplrBtcProvider.connectWallet();
          accounts = Array.isArray(result) ? result : [result?.address || result];
        } else {
          throw new Error('Keplr Bitcoin provider does not support connection');
        }

        if (!accounts?.length) throw new Error('No accounts returned from Keplr');
        const addr = typeof accounts[0] === 'string' ? accounts[0] : (accounts[0] as any).address;

        // Get public key if available
        let pubKeyHex: string | undefined;
        try {
          if (typeof keplrBtcProvider.getPublicKey === 'function') {
            pubKeyHex = await keplrBtcProvider.getPublicKey();
          }
        } catch {
          // Public key not available
        }

        // Detect address type from format
        const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
        if (isTaproot) {
          additionalAddresses.taproot = { address: addr, publicKey: pubKeyHex };
        } else {
          additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKeyHex };
        }

        // Pass the Bitcoin sub-provider (not window.keplr) so ConnectedWallet
        // delegates signPsbt/signMessage to the correct object
        connected = new (ConnectedWallet as any)(walletInfo, keplrBtcProvider, {
          address: addr,
          publicKey: pubKeyHex,
          addressType: isTaproot ? 'p2tr' : 'p2wpkh',
        });
      } else {
        // For other wallets (Unisat, OKX, Phantom, etc.), use the standard connector
        const connector = getWalletConnector();
        connected = await connector.connect(walletInfo);
      }

      // Clear any keystore session
      sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
      setWallet(null);

      // Store browser wallet info
      localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ID, walletId);
      localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'browser');

      setBrowserWallet(connected);
      setBrowserWalletAddresses(additionalAddresses);
      setWalletType('browser');
      setIsConnectModalOpen(false);

      // Cache additional addresses so auto-reconnect doesn't need to re-prompt
      if (additionalAddresses.nativeSegwit || additionalAddresses.taproot) {
        localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES, JSON.stringify(additionalAddresses));
      }

      console.log('[WalletContext] Connected to browser wallet:', walletInfo.name);
      console.log('[WalletContext] Primary address:', connected.address);
      console.log('[WalletContext] Additional addresses:', additionalAddresses);
    } catch (error) {
      console.error('[WalletContext] Failed to connect browser wallet:', error);
      throw error;
    }
  }, [getWalletConnector]);

  // Sign PSBT - supports both keystore and browser wallets
  const signPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets
    if (browserWallet && walletType === 'browser') {
      // Browser wallets typically expect hex, convert base64 to hex
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');
      const signedHex = await browserWallet.signPsbt(psbtHex);
      // Convert signed hex back to base64
      const signedBuffer = Buffer.from(signedHex, 'hex');
      return signedBuffer.toString('base64');
    }

    // For keystore wallets
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signPsbt(psbtBase64);
  }, [wallet, browserWallet, walletType]);

  // Sign PSBT with taproot inputs (BIP86 derivation)
  // Uses dynamic import to avoid SSR issues with crypto libraries
  const signTaprootPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets, they handle taproot signing internally
    if (browserWallet && walletType === 'browser') {
      // Browser wallets typically expect hex, convert base64 to hex
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');
      const signedHex = await browserWallet.signPsbt(psbtHex);
      // Convert signed hex back to base64
      const signedBuffer = Buffer.from(signedHex, 'hex');
      return signedBuffer.toString('base64');
    }

    // For keystore wallets, use BIP86 derivation
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get mnemonic from session storage
    const mnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    if (!mnemonic) {
      throw new Error('Wallet session expired. Please unlock wallet again.');
    }

    // Dynamic imports to avoid SSR issues
    const [bitcoin, tinysecp, BIP32Factory, bip39] = await Promise.all([
      import('bitcoinjs-lib'),
      import('tiny-secp256k1'),
      import('bip32').then(m => m.default),
      import('bip39'),
    ]);

    // Initialize ECC library
    bitcoin.initEccLib(tinysecp);

    // Determine bitcoin network
    const getBitcoinNetwork = () => {
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
    };

    const btcNetwork = getBitcoinNetwork();

    // Derive taproot key using BIP86 path
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const bip32 = BIP32Factory(tinysecp);
    const root = bip32.fromSeed(seed, btcNetwork);

    // BIP86 path: m/86'/coinType/0'/0/0
    // coinType: 0 for mainnet, 1 for testnet/regtest
    const coinType = network === 'mainnet' ? 0 : 1;
    const taprootPath = `m/86'/${coinType}'/0'/0/0`;
    const taprootChild = root.derivePath(taprootPath);

    if (!taprootChild.privateKey) {
      throw new Error('Failed to derive taproot private key');
    }

    // X-only pubkey for taproot (remove first byte which is the prefix)
    const xOnlyPubkey = taprootChild.publicKey.slice(1, 33);

    // Tweak the key for taproot key-path spend
    const tweakedChild = taprootChild.tweak(
      bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
    );

    // Parse and sign the PSBT
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

    console.log('[signTaprootPsbt] Signing', psbt.inputCount, 'inputs with taproot key');
    console.log('[signTaprootPsbt] Taproot path:', taprootPath);
    console.log('[signTaprootPsbt] X-only pubkey:', Buffer.from(xOnlyPubkey).toString('hex'));

    // Sign each input with the tweaked taproot key
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, tweakedChild);
        console.log(`[signTaprootPsbt] Signed input ${i}`);
      } catch (error) {
        console.warn(`[signTaprootPsbt] Could not sign input ${i}:`, error);
      }
    }

    return psbt.toBase64();
  }, [wallet, network, browserWallet, walletType]);

  // Sign PSBT with segwit inputs (BIP84 derivation)
  // Uses dynamic import to avoid SSR issues with crypto libraries
  const signSegwitPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets, they handle segwit signing internally
    if (browserWallet && walletType === 'browser') {
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');
      const signedHex = await browserWallet.signPsbt(psbtHex);
      const signedBuffer = Buffer.from(signedHex, 'hex');
      return signedBuffer.toString('base64');
    }

    // For keystore wallets, use BIP84 derivation
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get mnemonic from session storage
    const mnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    if (!mnemonic) {
      throw new Error('Wallet session expired. Please unlock wallet again.');
    }

    // Dynamic imports to avoid SSR issues
    const [bitcoin, tinysecp, BIP32Factory, bip39] = await Promise.all([
      import('bitcoinjs-lib'),
      import('tiny-secp256k1'),
      import('bip32').then(m => m.default),
      import('bip39'),
    ]);

    // Initialize ECC library
    bitcoin.initEccLib(tinysecp);

    // Determine bitcoin network
    const getBitcoinNetwork = () => {
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
    };

    const btcNetwork = getBitcoinNetwork();

    // Derive segwit key using BIP84 path
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const bip32 = BIP32Factory(tinysecp);
    const root = bip32.fromSeed(seed, btcNetwork);

    // BIP84 path: m/84'/coinType/0'/0/0
    // coinType: 0 for mainnet, 1 for testnet/regtest
    const coinType = network === 'mainnet' ? 0 : 1;
    const segwitPath = `m/84'/${coinType}'/0'/0/0`;
    const segwitChild = root.derivePath(segwitPath);

    if (!segwitChild.privateKey) {
      throw new Error('Failed to derive segwit private key');
    }

    // Parse and sign the PSBT
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

    console.log('[signSegwitPsbt] Signing', psbt.inputCount, 'inputs with segwit key');
    console.log('[signSegwitPsbt] Segwit path:', segwitPath);
    console.log('[signSegwitPsbt] Pubkey:', Buffer.from(segwitChild.publicKey).toString('hex'));

    // Sign each input with the segwit key
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, segwitChild);
        console.log(`[signSegwitPsbt] Signed input ${i}`);
      } catch (error) {
        console.warn(`[signSegwitPsbt] Could not sign input ${i}:`, error);
      }
    }

    return psbt.toBase64();
  }, [wallet, network, browserWallet, walletType]);

  // Sign multiple PSBTs - supports both keystore and browser wallets
  const signPsbts = useCallback(async (params: { psbts: string[] }): Promise<{ signedPsbts: string[] }> => {
    // For browser wallets
    if (browserWallet && walletType === 'browser') {
      const signedPsbts = await Promise.all(
        params.psbts.map(async (psbtBase64) => {
          const psbtBuffer = Buffer.from(psbtBase64, 'base64');
          const psbtHex = psbtBuffer.toString('hex');
          const signedHex = await browserWallet.signPsbt(psbtHex);
          const signedBuffer = Buffer.from(signedHex, 'hex');
          return signedBuffer.toString('base64');
        })
      );
      return { signedPsbts };
    }

    // For keystore wallets
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    const signedPsbts = await Promise.all(params.psbts.map(psbt => wallet.signPsbt(psbt)));
    return { signedPsbts };
  }, [wallet, browserWallet, walletType]);

  // Sign message - supports both keystore and browser wallets
  const signMessage = useCallback(async (message: string): Promise<string> => {
    // For browser wallets
    if (browserWallet && walletType === 'browser') {
      return browserWallet.signMessage(message);
    }

    // For keystore wallets
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signMessage(message, 0);
  }, [wallet, browserWallet, walletType]);

  // Get UTXOs using WASM provider
  const getUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    // Check for either keystore wallet or browser wallet
    const isConnected = wallet || (browserWallet && walletType === 'browser');
    if (!isConnected || !account.nativeSegwit?.address || !sdkProvider || !sdkInitialized) {
      return [];
    }

    try {
      const utxos: FormattedUtxo[] = [];

      // Fetch UTXOs for native segwit address
      if (account.nativeSegwit?.address) {
        const rawResult = await sdkProvider.getEnrichedBalances(account.nativeSegwit.address, '1');
        const enriched = extractEnrichedData(rawResult);
        if (enriched) {
          // Combine all UTXO categories
          const allUtxos = [
            ...enriched.spendable,
            ...enriched.assets,
            ...enriched.pending,
          ];
          for (const utxo of allUtxos) {
            // balances.lua returns outpoint as "txid:vout" format
            const [txid, voutStr] = (utxo.outpoint || ':').split(':');
            const vout = parseInt(voutStr || '0', 10);
            utxos.push({
              txId: txid || '',
              outputIndex: vout,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: account.nativeSegwit.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.height ? 1 : 0,
            });
          }
        }
      }

      // Fetch UTXOs for taproot address
      if (account.taproot?.address) {
        const rawResult = await sdkProvider.getEnrichedBalances(account.taproot.address, '1');
        const enriched = extractEnrichedData(rawResult);
        if (enriched) {
          const allUtxos = [
            ...enriched.spendable,
            ...enriched.assets,
            ...enriched.pending,
          ];
          for (const utxo of allUtxos) {
            // balances.lua returns outpoint as "txid:vout" format
            const [txid, voutStr] = (utxo.outpoint || ':').split(':');
            const vout = parseInt(voutStr || '0', 10);
            utxos.push({
              txId: txid || '',
              outputIndex: vout,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: account.taproot.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.height ? 1 : 0,
            });
          }
        }
      }

      return utxos;
    } catch (error) {
      console.error('[WalletContext] Error fetching UTXOs:', error);
      return [];
    }
  }, [wallet, browserWallet, walletType, account, sdkProvider, sdkInitialized]);

  // Get spendable UTXOs using WASM provider
  const getSpendableUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    // Check for either keystore wallet or browser wallet
    const isConnected = wallet || (browserWallet && walletType === 'browser');
    if (!isConnected || !account.nativeSegwit?.address || !sdkProvider || !sdkInitialized) {
      return [];
    }

    try {
      const rawResult = await sdkProvider.getEnrichedBalances(account.nativeSegwit.address, '1');
      const enriched = extractEnrichedData(rawResult);

      if (!enriched || enriched.spendable.length === 0) {
        return [];
      }

      const spendableUtxos: FormattedUtxo[] = enriched.spendable.map((utxo: any) => {
        // balances.lua returns outpoint as "txid:vout" format
        const [txid, voutStr] = (utxo.outpoint || ':').split(':');
        const vout = parseInt(voutStr || '0', 10);
        return {
          txId: txid || '',
          outputIndex: vout,
          satoshis: utxo.value || 0,
          scriptPk: utxo.scriptpubkey || '',
          address: account.nativeSegwit!.address,
          inscriptions: [],
          runes: [],
          alkanes: {},
          indexed: true,
          confirmations: utxo.height ? 1 : 0,
        };
      });

      spendableUtxos.sort((a, b) =>
        account.spendStrategy.utxoSortGreatestToLeast
          ? b.satoshis - a.satoshis
          : a.satoshis - b.satoshis
      );

      return spendableUtxos;
    } catch (error) {
      console.error('[WalletContext] Error fetching spendable UTXOs:', error);
      return [];
    }
  }, [wallet, browserWallet, walletType, account, sdkProvider, sdkInitialized]);

  // Get spendable balance using WASM provider
  const getSpendableTotalBalance = useCallback(async (): Promise<number> => {
    // Check for either keystore wallet or browser wallet
    const isConnected = wallet || (browserWallet && walletType === 'browser');

    console.log('[WalletContext] getSpendableTotalBalance called', {
      hasWallet: !!wallet,
      hasBrowserWallet: !!browserWallet,
      walletType,
      hasSdkProvider: !!sdkProvider,
      sdkInitialized,
      nativeSegwit: account.nativeSegwit?.address,
      taproot: account.taproot?.address,
    });

    if (!isConnected || !sdkProvider || !sdkInitialized) {
      console.log('[WalletContext] Returning 0 - missing dependencies');
      return 0;
    }

    try {
      let totalBalance = 0;

      // Query both native segwit and taproot addresses
      const addresses: string[] = [];
      if (account.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
      if (account.taproot?.address) addresses.push(account.taproot.address);

      console.log('[WalletContext] Querying addresses:', addresses);

      if (addresses.length === 0) return 0;

      // Fetch balances for all addresses in parallel
      const results = await Promise.all(
        addresses.map(async (address) => {
          try {
            console.log('[WalletContext] Fetching enriched balances for:', address);
            const rawResult = await sdkProvider.getEnrichedBalances(address, '1');
            console.log('[WalletContext] Raw result for', address, ':', rawResult);
            const extracted = extractEnrichedData(rawResult);
            console.log('[WalletContext] Extracted data for', address, ':', extracted);
            return extracted;
          } catch (err) {
            console.error('[WalletContext] Error fetching for', address, ':', err);
            return null;
          }
        })
      );

      // Sum up spendable balances from all addresses
      for (const enriched of results) {
        if (enriched && enriched.spendable.length > 0) {
          const addressBalance = enriched.spendable.reduce((sum: number, utxo: any) => {
            return sum + (utxo.value || 0);
          }, 0);
          console.log('[WalletContext] Address balance:', addressBalance);
          totalBalance += addressBalance;
        }
      }

      console.log('[WalletContext] Total balance:', totalBalance);
      return totalBalance;
    } catch (error) {
      console.error('[WalletContext] Error fetching balance:', error);
      return 0;
    }
  }, [wallet, browserWallet, walletType, account, sdkProvider, sdkInitialized]);

  const onConnectModalOpenChange = useCallback((isOpen: boolean) => {
    setIsConnectModalOpen(isOpen);
  }, []);

  // Build context value
  const contextValue = useMemo<WalletContextType>(
    () => ({
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected: !!wallet || !!browserWallet,
      isInitializing,

      // Wallet type
      walletType,

      address: addresses.taproot.address || addresses.nativeSegwit.address,
      paymentAddress: addresses.nativeSegwit.address,
      publicKey: addresses.nativeSegwit.pubkey,
      account,
      network,
      wallet,

      // Browser wallet data
      browserWallet,
      availableBrowserWallets: BROWSER_WALLETS,
      installedBrowserWallets,

      // Keystore actions
      createWallet: createNewWallet,
      unlockWallet,
      restoreWallet,
      deleteKeystore,

      // Browser wallet actions
      detectBrowserWallets,
      connectBrowserWallet,

      // Common actions
      disconnect,
      signPsbt,
      signTaprootPsbt,
      signSegwitPsbt,
      signPsbts,
      signMessage,

      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,

      hasStoredKeystore,
    }),
    [
      isConnectModalOpen,
      onConnectModalOpenChange,
      wallet,
      browserWallet,
      walletType,
      isInitializing,
      addresses,
      account,
      network,
      installedBrowserWallets,
      createNewWallet,
      unlockWallet,
      restoreWallet,
      deleteKeystore,
      detectBrowserWallets,
      connectBrowserWallet,
      disconnect,
      signPsbt,
      signTaprootPsbt,
      signSegwitPsbt,
      signPsbts,
      signMessage,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      hasStoredKeystore,
    ]
  );

  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 size={32} color="#449CFF" className="animate-spin" />
      </div>
    );
  }

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
