'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';


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
  // Wallet adapter for signing
  createWalletAdapter,
  JsWalletAdapter,
} from '@alkanes/ts-sdk';
import { BROWSER_WALLETS, getInstalledWallets, isWalletInstalled } from '@/constants/wallets';
import { patchTapInternalKeys } from '@/lib/psbt-patching';

// Session storage key for mnemonic
const SESSION_MNEMONIC_KEY = 'subfrost_session_mnemonic';

// Network storage key — must match the key in providers.tsx
const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

// Detect network from a Bitcoin address prefix
function detectNetworkFromAddress(address: string): Network | null {
  if (address.startsWith('bc1p') || address.startsWith('bc1q') || address.startsWith('1') || address.startsWith('3')) {
    return 'mainnet';
  }
  if (address.startsWith('tb1p') || address.startsWith('tb1q')) {
    return 'signet';
  }
  if (address.startsWith('bcrt1p') || address.startsWith('bcrt1q')) {
    return 'subfrost-regtest';
  }
  return null;
}

// Switch the app's global network to match a browser wallet's address.
// Updates localStorage and dispatches a CustomEvent that providers.tsx listens for.
function switchNetworkToMatch(detectedNetwork: Network) {
  if (typeof window === 'undefined') return;

  const currentNetwork = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (currentNetwork === detectedNetwork) return;

  console.log(`[WalletContext] Switching app network from "${currentNetwork}" to "${detectedNetwork}" to match browser wallet`);
  localStorage.setItem(NETWORK_STORAGE_KEY, detectedNetwork);
  window.dispatchEvent(new CustomEvent('network-changed', { detail: detectedNetwork }));
}

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

// Helper to create SATS Connect unsecured JWT token
// Used by Xverse, Magic Eden, and Orange wallets which follow the SATS Connect protocol
function createSatsConnectToken(payload: any): string {
  const header = { typ: 'JWT', alg: 'none' };
  const encodeBase64 = (obj: any) => {
    const json = JSON.stringify(obj);
    // Use btoa for browser, handling unicode
    const base64 = btoa(unescape(encodeURIComponent(json)));
    // Convert to URL-safe base64
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encodeBase64(header)}.${encodeBase64(payload)}.`;
}

// Convert app network to SATS Connect network type
function toSatsConnectNetwork(network: Network): string {
  switch (network) {
    case 'mainnet':
      return 'Mainnet';
    case 'testnet':
      return 'Testnet';
    case 'signet':
      return 'Signet';
    case 'regtest':
    case 'regtest-local':
    case 'subfrost-regtest':
    case 'oylnet':
      return 'Regtest';
    default:
      return 'Mainnet';
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

type WalletAddresses = {
  nativeSegwit: { address: string; pubkey: string; hdPath: string };
  taproot: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
};

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
  addresses: WalletAddresses;
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
  // SDK wallet adapter for signing - handles all wallet-specific logic
  const [walletAdapter, setWalletAdapter] = useState<JsWalletAdapter | null>(null);

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
        // Restore cached addresses from localStorage
        let cachedAddrs: string | null = null;
        try {
          cachedAddrs = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
          if (cachedAddrs) {
            setBrowserWalletAddresses(JSON.parse(cachedAddrs));
          }
        } catch {
          // ignore parse errors
        }

        try {
          const walletInfo = BROWSER_WALLETS.find(w => w.id === storedBrowserWalletId);
          if (walletInfo && isWalletInstalled(walletInfo)) {
            // Reconstruct ConnectedWallet from cached addresses WITHOUT prompting the
            // extension. connector.connect() would show a popup (e.g., Xverse getAddresses)
            // which blocks initialization and can leave the extension in a conflicting
            // state if the user dismisses it or it times out.
            let cachedParsed: any = null;
            try { cachedParsed = cachedAddrs ? JSON.parse(cachedAddrs) : null; } catch {}

            const primaryAddr = cachedParsed?.taproot?.address
              || cachedParsed?.nativeSegwit?.address;

            if (primaryAddr) {
              const primaryPubKey = cachedParsed?.taproot?.publicKey
                || cachedParsed?.nativeSegwit?.publicKey;
              const isTaproot = primaryAddr.startsWith('bc1p') || primaryAddr.startsWith('tb1p') || primaryAddr.startsWith('bcrt1p');

              const providerObj = (window as any)[walletInfo.injectionKey];
              const connected = new (ConnectedWallet as any)(walletInfo, providerObj, {
                address: primaryAddr,
                publicKey: primaryPubKey,
                addressType: isTaproot ? 'p2tr' : 'p2wpkh',
              });

              setBrowserWallet(connected);
              setWalletType('browser');
              const adapter = createWalletAdapter(connected);
              setWalletAdapter(adapter);
              console.log('[WalletContext] Restored browser wallet from cache:', walletInfo.name);

              // Auto-detect network from cached address
              const detectedNetwork = detectNetworkFromAddress(primaryAddr);
              if (detectedNetwork) {
                switchNetworkToMatch(detectedNetwork);
              }
            } else {
              // No cached addresses — don't call connector.connect() on page load.
              // It sends a request to the extension that may never resolve (e.g.,
              // Xverse getAccounts opens a popup). If the popup is dismissed or
              // the request times out, the extension can be left in a conflicting
              // state that blocks subsequent manual connection attempts.
              // Instead, just clear the stored wallet and let the user reconnect.
              console.log('[WalletContext] No cached addresses for auto-reconnect, clearing stored wallet');
              localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
              localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
              localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
            }
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

  // Track previous network to detect changes
  const prevNetworkRef = useRef<string | null>(null);

  // Recreate keystore wallet when network changes (without page refresh)
  useEffect(() => {
    // Skip on initial mount
    if (prevNetworkRef.current === null) {
      prevNetworkRef.current = network;
      return;
    }

    // Only handle network changes for keystore wallets
    if (prevNetworkRef.current === network) return;
    prevNetworkRef.current = network;

    const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    const storedWalletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);

    if (sessionMnemonic && storedWalletType === 'keystore' && wallet) {
      console.log('[WalletContext] Network changed to', network, '- recreating wallet with new network');
      try {
        const newWallet = createWalletFromMnemonic(sessionMnemonic, toSdkNetwork(network));
        setWallet(newWallet);

        // Also reload into SDK provider
        if (sdkInitialized && loadWallet) {
          loadWallet(sessionMnemonic);
        }
      } catch (error) {
        console.error('[WalletContext] Failed to recreate wallet for new network:', error);
      }
    }
  }, [network, sdkInitialized, loadWallet, wallet]);

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
    setWalletAdapter(null); // Clear SDK wallet adapter
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
    setWalletAdapter(null); // Clear SDK wallet adapter
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
    setWalletAdapter(null); // Clear SDK wallet adapter
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
    setWalletAdapter(null); // Clear SDK wallet adapter
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
          // Use getAccounts on the direct BitcoinProvider (same as SDK WalletConnector)
          const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;
          if (xverseProvider) {
            const response = await xverseProvider.request('getAccounts', {
              purposes: ['ordinals', 'payment'],
            });
            const addrs = response?.result || [];
            for (const account of addrs) {
              if (account.purpose === 'ordinals' || account.addressType === 'p2tr') {
                result.taproot = { address: account.address, publicKey: account.publicKey };
              } else if (account.purpose === 'payment' || account.addressType === 'p2wpkh') {
                result.nativeSegwit = { address: account.address, publicKey: account.publicKey };
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
      // fetchBrowserWalletAddresses calling getAddresses again.
      // NOTE: The modal stays open during connection so errors are visible.
      // The modal component handles its own UI state (loading/connecting overlay).

      if (walletId === 'xverse') {
        // Xverse connection using direct BitcoinProvider.request('getAccounts')
        // — no sats-connect dependency needed. Same API used for signing.
        const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;
        if (!xverseProvider) throw new Error('Xverse wallet not detected. Please install the Xverse extension.');

        console.log('[WalletContext] Xverse: calling getAccounts via direct provider...');

        const response: any = await Promise.race([
          xverseProvider.request('getAccounts', {
            purposes: ['ordinals', 'payment'],
            message: 'Connect to Subfrost',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              'Xverse connection timed out after 60s. ' +
              'Try: (1) open/unlock your Xverse extension popup first, ' +
              '(2) check chrome://extensions for errors in Xverse service worker, ' +
              '(3) try connecting on another site to verify extension works.'
            )), 60000)
          ),
        ]);

        console.log('[WalletContext] Xverse getAccounts response:', response);
        const accounts = response?.result || [];
        if (accounts.length === 0) {
          throw new Error(
            'Xverse connection failed — no accounts returned. ' +
            'Try: (1) refresh this page, (2) open/unlock your Xverse extension, ' +
            '(3) check that this site is not blocked in Xverse settings.'
          );
        }

        const ordinalsAccount = accounts.find((a: any) =>
          a.purpose === 'ordinals' || a.addressType === 'p2tr'
        ) || accounts[0];
        const paymentAccount = accounts.find((a: any) =>
          a.purpose === 'payment' || a.addressType === 'p2wpkh' || a.addressType === 'p2sh'
        );

        if (ordinalsAccount) {
          additionalAddresses.taproot = {
            address: ordinalsAccount.address,
            publicKey: ordinalsAccount.publicKey,
          };
        }
        if (paymentAccount) {
          additionalAddresses.nativeSegwit = {
            address: paymentAccount.address,
            publicKey: paymentAccount.publicKey,
          };
        }

        const primaryAddr = ordinalsAccount?.address || paymentAccount?.address;
        if (!primaryAddr) throw new Error('No address found in Xverse accounts');

        const primaryIsTaproot = primaryAddr.startsWith('bc1p') || primaryAddr.startsWith('tb1p') || primaryAddr.startsWith('bcrt1p');
        connected = new (ConnectedWallet as any)(walletInfo, xverseProvider, {
          address: primaryAddr,
          publicKey: ordinalsAccount?.publicKey || paymentAccount?.publicKey,
          addressType: primaryIsTaproot ? 'p2tr' : 'p2wpkh',
          paymentAddress: paymentAccount?.address,
          paymentPublicKey: paymentAccount?.publicKey,
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
      } else if (walletId === 'oyl') {
        // OYL wallet exposes window.oyl with getAddresses(), signPsbt(), signMessage()
        const oylProvider = (window as any).oyl;
        if (!oylProvider) throw new Error('OYL wallet not available');

        // Check if already connected - if not, getAddresses() will trigger connection prompt
        const isConnected = oylProvider.isConnected ? await oylProvider.isConnected() : false;
        console.log('[WalletContext] OYL wallet connected status:', isConnected);

        // getAddresses returns all address types in one call
        // On first call when not connected, this triggers the connection approval popup
        const addresses = await oylProvider.getAddresses();
        if (!addresses?.nativeSegwit || !addresses?.taproot) {
          throw new Error('No addresses returned from OYL');
        }

        // Store both address types
        additionalAddresses.taproot = {
          address: addresses.taproot.address,
          publicKey: addresses.taproot.publicKey,
        };
        additionalAddresses.nativeSegwit = {
          address: addresses.nativeSegwit.address,
          publicKey: addresses.nativeSegwit.publicKey,
        };

        // Use taproot as primary address
        connected = new (ConnectedWallet as any)(walletInfo, oylProvider, {
          address: addresses.taproot.address,
          publicKey: addresses.taproot.publicKey,
          addressType: 'p2tr',
        });
      } else if (walletId === 'tokeo') {
        // Tokeo exposes window.tokeo.bitcoin with requestAccounts(), getAccounts(), signPsbt()
        const tokeoProvider = (window as any).tokeo?.bitcoin;
        if (!tokeoProvider) throw new Error('Tokeo wallet not available');

        // Request connection
        await tokeoProvider.requestAccounts();

        // Get accounts - returns { accounts: [{ address, publicKey, type }] }
        const result = await tokeoProvider.getAccounts();
        if (!result?.accounts?.length) {
          throw new Error('No accounts returned from Tokeo');
        }

        // Find taproot (p2tr) and native segwit (p2wpkh) accounts
        const taprootAccount = result.accounts.find((a: any) => a.type === 'p2tr');
        const segwitAccount = result.accounts.find((a: any) => a.type === 'p2wpkh');

        if (!taprootAccount) {
          throw new Error('No taproot address found in Tokeo');
        }

        // Store both address types
        additionalAddresses.taproot = {
          address: taprootAccount.address,
          publicKey: taprootAccount.publicKey,
        };
        if (segwitAccount) {
          additionalAddresses.nativeSegwit = {
            address: segwitAccount.address,
            publicKey: segwitAccount.publicKey,
          };
        }

        // Use taproot as primary address
        connected = new (ConnectedWallet as any)(walletInfo, tokeoProvider, {
          address: taprootAccount.address,
          publicKey: taprootAccount.publicKey,
          addressType: 'p2tr',
        });
      } else if (walletId === 'orange') {
        // Orange wallet uses window.OrangeBitcoinProvider or window.OrangeWalletProviders.OrangeBitcoinProvider
        // It follows the SATS Connect protocol which requires a JWT token
        const win = window as any;
        const orangeProvider = win.OrangeBitcoinProvider ||
          win.OrangecryptoProviders?.BitcoinProvider ||
          win.OrangeWalletProviders?.OrangeBitcoinProvider;
        if (!orangeProvider) throw new Error('Orange wallet not available');

        // Create SATS Connect JWT token for the connect request
        const satsConnectPayload = {
          purposes: ['ordinals', 'payment'],
          message: 'Connect to Subfrost',
          network: { type: toSatsConnectNetwork(network) },
        };
        const token = createSatsConnectToken(satsConnectPayload);

        // Orange uses connect(token) which returns a response with addresses
        const response = await orangeProvider.connect(token);
        const addresses = response?.addresses || [];

        if (!addresses.length) {
          throw new Error('No addresses returned from Orange wallet');
        }

        // Find ordinals (taproot) and payment (segwit) addresses
        const ordinalsAddr = addresses.find((a: any) =>
          a.purpose === 'ordinals' || a.addressType === 'p2tr' ||
          a.address?.startsWith('bc1p') || a.address?.startsWith('tb1p')
        );
        const paymentAddr = addresses.find((a: any) =>
          a.purpose === 'payment' || a.addressType === 'p2wpkh' ||
          a.address?.startsWith('bc1q') || a.address?.startsWith('tb1q')
        );

        const primaryAccount = ordinalsAddr || addresses[0];
        const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
        const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;

        if (ordinalsAddr) {
          additionalAddresses.taproot = {
            address: typeof ordinalsAddr === 'string' ? ordinalsAddr : ordinalsAddr.address,
            publicKey: typeof ordinalsAddr === 'string' ? undefined : ordinalsAddr.publicKey,
          };
        }
        if (paymentAddr) {
          additionalAddresses.nativeSegwit = {
            address: typeof paymentAddr === 'string' ? paymentAddr : paymentAddr.address,
            publicKey: typeof paymentAddr === 'string' ? undefined : paymentAddr.publicKey,
          };
        }

        connected = new (ConnectedWallet as any)(walletInfo, orangeProvider, {
          address: addr,
          publicKey: pubKey,
          addressType: addr?.startsWith('bc1p') || addr?.startsWith('tb1p') ? 'p2tr' : 'p2wpkh',
        });
      } else if (walletId === 'magic-eden') {
        // Magic Eden uses window.magicEden.bitcoin and follows SATS Connect protocol
        const magicEdenProvider = (window as any).magicEden?.bitcoin;
        if (!magicEdenProvider) throw new Error('Magic Eden wallet not available');

        // Create SATS Connect JWT token for the connect request
        const satsConnectPayload = {
          purposes: ['ordinals', 'payment'],
          message: 'Connect to Subfrost',
          network: { type: toSatsConnectNetwork(network) },
        };
        const token = createSatsConnectToken(satsConnectPayload);

        // Magic Eden uses connect(token) which returns a response with addresses
        const response = await magicEdenProvider.connect(token);
        const addresses = response?.addresses || [];

        if (!addresses.length) {
          throw new Error('No addresses returned from Magic Eden wallet');
        }

        // Find ordinals (taproot) and payment (segwit) addresses
        const ordinalsAddr = addresses.find((a: any) =>
          a.purpose === 'ordinals' || a.addressType === 'p2tr' ||
          a.address?.startsWith('bc1p') || a.address?.startsWith('tb1p')
        );
        const paymentAddr = addresses.find((a: any) =>
          a.purpose === 'payment' || a.addressType === 'p2wpkh' ||
          a.address?.startsWith('bc1q') || a.address?.startsWith('tb1q')
        );

        const primaryAccount = ordinalsAddr || addresses[0];
        const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
        const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;

        if (ordinalsAddr) {
          additionalAddresses.taproot = {
            address: typeof ordinalsAddr === 'string' ? ordinalsAddr : ordinalsAddr.address,
            publicKey: typeof ordinalsAddr === 'string' ? undefined : ordinalsAddr.publicKey,
          };
        }
        if (paymentAddr) {
          additionalAddresses.nativeSegwit = {
            address: typeof paymentAddr === 'string' ? paymentAddr : paymentAddr.address,
            publicKey: typeof paymentAddr === 'string' ? undefined : paymentAddr.publicKey,
          };
        }

        connected = new (ConnectedWallet as any)(walletInfo, magicEdenProvider, {
          address: addr,
          publicKey: pubKey,
          addressType: addr?.startsWith('bc1p') || addr?.startsWith('tb1p') ? 'p2tr' : 'p2wpkh',
        });
      } else if (walletId === 'okx') {
        // OKX wallet exposes window.okxwallet.bitcoin with connect(), signPsbt()
        const okxProvider = (window as any).okxwallet?.bitcoin;
        if (!okxProvider) throw new Error('OKX wallet not available');

        const result = await okxProvider.connect();
        const addr = result?.address;
        const pubKey = result?.publicKey;
        if (!addr) throw new Error('No address returned from OKX');

        const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
        if (isTaproot) {
          additionalAddresses.taproot = { address: addr, publicKey: pubKey };
        } else {
          additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };
        }

        connected = new (ConnectedWallet as any)(walletInfo, okxProvider, {
          address: addr,
          publicKey: pubKey,
          addressType: isTaproot ? 'p2tr' : 'p2wpkh',
        });
      } else if (walletId === 'unisat') {
        // Unisat exposes window.unisat with requestAccounts(), getPublicKey(), signPsbt()
        // Only provides one address type at a time (user-configurable in wallet settings)
        const unisatProvider = (window as any).unisat;
        if (!unisatProvider) throw new Error('Unisat wallet not available. Please install the Unisat extension.');

        let accounts: string[];
        try {
          accounts = await unisatProvider.requestAccounts();
        } catch (e: any) {
          // Unisat may throw a non-Error (string or object) on rejection
          const msg = typeof e === 'string' ? e : e?.message || JSON.stringify(e);
          throw new Error(`Unisat requestAccounts failed: ${msg}`);
        }
        if (!accounts?.length) throw new Error('No accounts returned from Unisat');
        const addr = accounts[0];

        let pubKey: string | undefined;
        try { pubKey = await unisatProvider.getPublicKey(); } catch {}

        const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
        if (isTaproot) {
          additionalAddresses.taproot = { address: addr, publicKey: pubKey };
        } else {
          additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };
        }

        connected = new (ConnectedWallet as any)(walletInfo, unisatProvider, {
          address: addr,
          publicKey: pubKey,
          addressType: isTaproot ? 'p2tr' : 'p2wpkh',
        });
      } else {
        // For other wallets, use the standard connector
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

      // Create SDK wallet adapter for signing - handles all wallet-specific logic
      const adapter = createWalletAdapter(connected);
      setWalletAdapter(adapter);

      // Cache additional addresses so auto-reconnect doesn't need to re-prompt
      if (additionalAddresses.nativeSegwit || additionalAddresses.taproot) {
        localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES, JSON.stringify(additionalAddresses));
      }

      console.log('[WalletContext] Connected to browser wallet:', walletInfo.name);
      console.log('[WalletContext] Primary address:', connected.address);
      console.log('[WalletContext] Additional addresses:', additionalAddresses);
      console.log('[WalletContext] Created wallet adapter:', adapter.getInfo().name);

      // Auto-detect network from the wallet's addresses and switch if needed
      const addrToCheck = additionalAddresses.taproot?.address
        || additionalAddresses.nativeSegwit?.address
        || connected.address;
      if (addrToCheck) {
        const detectedNetwork = detectNetworkFromAddress(addrToCheck);
        if (detectedNetwork) {
          switchNetworkToMatch(detectedNetwork);
        }
      }
    } catch (error) {
      console.error('[WalletContext] Failed to connect browser wallet:', error);
      throw error;
    }
  }, [getWalletConnector]);

  // Sign PSBT - supports both keystore and browser wallets
  // Uses SDK wallet adapters for all browser wallet signing
  const signPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets - use the SDK adapter which handles all wallet-specific logic
    if (walletAdapter && walletType === 'browser') {
      // Patch tapInternalKey on P2TR inputs before signing (same fix as signTaprootPsbt).
      // Without this, UniSat/other wallets can't match inputs to their connected account.
      const bitcoin = await import('bitcoinjs-lib');
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64);
      const taprootPubKey = browserWalletAddresses?.taproot?.publicKey || browserWallet?.publicKey;
      if (taprootPubKey) {
        const xOnlyHex = taprootPubKey.length === 66 ? taprootPubKey.slice(2) : taprootPubKey;
        patchTapInternalKeys(psbt, xOnlyHex);
      }
      const psbtHex = psbt.toHex();

      console.log('[WalletContext] Signing PSBT with SDK adapter');
      const signedHex = await walletAdapter.signPsbt(psbtHex, { auto_finalized: false });

      // Convert signed hex back to base64
      const signedBuffer = Buffer.from(signedHex, 'hex');
      return signedBuffer.toString('base64');
    }

    // For keystore wallets
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signPsbt(psbtBase64);
  }, [wallet, walletAdapter, walletType, browserWalletAddresses, browserWallet]);

  // Sign PSBT with taproot inputs (BIP86 derivation)
  // Uses SDK wallet adapters for browser wallets, BIP86 derivation for keystore
  //
  // JOURNAL (2026-02-06): For Xverse wallets, we bypass the SDK adapter and call
  // the Xverse Bitcoin Provider directly. The SDK's XverseAdapter.signPsbt swallows
  // detailed error info from Xverse, making P2SH-P2WPKH signing failures opaque.
  // Direct calls give us full response logging and avoid adapter quirks.
  //
  // JOURNAL (2026-02-09): Xverse signing requires two PSBT input fixes for browser wallets:
  // 1. tapInternalKey: SDK builds PSBTs with dummy wallet's key (from walletCreate()).
  //    Xverse validates tapInternalKey matches its own key → "No taproot scripts signed".
  //    Fix: patch input.tapInternalKey to user's actual x-only pubkey before signing.
  // 2. P2SH-P2WPKH witnessUtxo + redeemScript: centralized in lib/psbt-patching.ts.
  //    The SDK's dummy wallet hashes differ from the user's → pattern-based matching.
  //    All output + input patching now goes through patchPsbtForBrowserWallet() in the
  //    calling code (SendModal, mutation hooks), not here.
  // Key gotchas:
  // - psbt.updateInput() throws "Can not add duplicate data" — use direct assignment
  // - bitcoinjs-lib may return Uint8Array not Buffer — wrap in Buffer.from() for .equals()
  // - Do NOT add bip32Derivation/tapBip32Derivation — signInputs mapping is sufficient
  //
  // JOURNAL (2026-02-09): paymentAddress resolution for signInputs mapping:
  // (browserWallet as any).paymentAddress returns undefined for Xverse — the runtime
  // getter doesn't exist on the ConnectedWallet object. Without a valid paymentAddr,
  // all inputs map to the ordinals (taproot) address, causing Xverse to sign P2SH inputs
  // with the wrong key. Fix: fall back to browserWalletAddresses.nativeSegwit.address,
  // which is populated from the wallet connect response and reliably has the payment addr.
  // Proven on mainnet: tx f9e7eaf2c548647f99f5a1b72ef37fed5771191b9f30adab2c4f9f09957d454c
  // JOURNAL (2026-02-11): tapInternalKey patching moved BEFORE the Xverse/other-wallet split.
  // The SDK's WASM (execute.rs:1764) sets tap_internal_key from the dummy wallet's key pair
  // (AlkanesSDKContext's walletCreate()). ALL browser wallets need the user's actual x-only
  // public key here — UniSat auto-detects signable inputs by deriving a P2TR address from
  // tapInternalKey, and if it doesn't match the connected account, all inputs are silently
  // skipped → infinite loading spinner in the UniSat popup. Same issue affected Xverse
  // ("No taproot scripts signed"). Now fixed for all browser wallets uniformly.
  const signTaprootPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets - handle signing based on wallet type
    if (walletAdapter && walletType === 'browser') {
      const bitcoin = await import('bitcoinjs-lib');
      const btcNetwork = (() => {
        switch (network) {
          case 'mainnet': return bitcoin.networks.bitcoin;
          case 'testnet': case 'signet': return bitcoin.networks.testnet;
          default: return bitcoin.networks.regtest;
        }
      })();

      // Parse the PSBT so we can patch tapInternalKey for all browser wallets
      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

      // Patch tapInternalKey on taproot inputs to the user's actual x-only public key.
      // The SDK builds PSBTs with a dummy wallet's tapInternalKey (from AlkanesSDKContext's
      // walletCreate()). Wallets validate tapInternalKey matches their own key before signing:
      // - Xverse: "No taproot scripts signed" error
      // - UniSat: silently skips unmatched inputs → infinite loading spinner
      const taprootPubKey = browserWalletAddresses?.taproot?.publicKey || browserWallet?.publicKey;
      if (taprootPubKey) {
        const xOnlyHex = taprootPubKey.length === 66 ? taprootPubKey.slice(2) : taprootPubKey;
        const patchedCount = patchTapInternalKeys(psbt, xOnlyHex);
        if (patchedCount > 0) {
          console.log(`[WalletContext] Patched tapInternalKey on ${patchedCount} input(s) to user x-only: ${xOnlyHex}`);
        }
      }

      // For Xverse: call the Xverse Bitcoin Provider directly
      const xverse = (window as any).XverseProviders?.BitcoinProvider;
      if (xverse && browserWallet?.info?.id === 'xverse') {
        console.log('[WalletContext] Xverse: signing PSBT directly (bypassing SDK adapter)');

        // Build signInputs: map each input to the correct signing address
        const ordinalsAddr = browserWallet.address;
        // paymentAddress runtime getter on ConnectedWallet returns undefined for some
        // wallet types. Fall back to browserWalletAddresses which is populated from
        // the wallet connect response (getAddress / sats-connect).
        const paymentAddr: string | undefined =
          (browserWallet as any).paymentAddress ||
          browserWalletAddresses?.nativeSegwit?.address;
        console.log('[WalletContext] Ordinals:', ordinalsAddr, '| Payment:', paymentAddr);

        const signInputs: Record<string, number[]> = {};
        const ordIdx: number[] = [];
        const payIdx: number[] = [];

        for (let i = 0; i < psbt.data.inputs.length; i++) {
          const input = psbt.data.inputs[i];
          if (!input.witnessUtxo) {
            // No witnessUtxo — assume payment input
            if (paymentAddr) payIdx.push(i);
            else ordIdx.push(i);
            continue;
          }
          try {
            const addr = bitcoin.address.fromOutputScript(
              Buffer.from(input.witnessUtxo.script), btcNetwork
            );
            if (paymentAddr && addr === paymentAddr) {
              payIdx.push(i);
            } else if (addr === ordinalsAddr) {
              ordIdx.push(i);
            } else {
              // Heuristic: P2SH (3...) or P2WPKH (bc1q...) → payment; else → ordinals
              const isSegwit = addr.startsWith('3') || addr.toLowerCase().startsWith('bc1q');
              if (isSegwit && paymentAddr) payIdx.push(i);
              else ordIdx.push(i);
            }
          } catch {
            ordIdx.push(i);
          }
        }

        if (ordIdx.length > 0) signInputs[ordinalsAddr] = ordIdx;
        if (paymentAddr && payIdx.length > 0) signInputs[paymentAddr] = payIdx;

        console.log('[WalletContext] Xverse signInputs:', JSON.stringify(signInputs));

        const response = await xverse.request('signPsbt', {
          psbt: psbt.toBase64(),
          signInputs,
          broadcast: false,
        });

        console.log('[WalletContext] Xverse response:', JSON.stringify(response));

        // Xverse returns either:
        //   - SIP format: { status: "success", result: { psbt: "..." } }
        //   - JSON-RPC format: { jsonrpc: "2.0", result: { psbt: "..." } }
        // Handle both response formats.
        const signedPsbtBase64 = response.result?.psbt;
        if (signedPsbtBase64) {
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64);
          return signedPsbt.toBase64();
        }

        // No signed PSBT in response — surface the full error
        const errDetail = response.error
          ? JSON.stringify(response.error)
          : JSON.stringify(response);
        throw new Error(`Xverse signing failed: ${errDetail}`);
      }

      // For all browser wallets (OYL, OKX, Unisat, etc.): use SDK adapter
      // JOURNAL ENTRY (2026-02-20): Direct window.oyl.signPsbt() calls fail with validation errors.
      // The SDK adapter (walletAdapter.signPsbt) works correctly for all wallets including OYL.
      // Successful DIESEL minting proved the SDK adapter path works.
      // Pass the patched PSBT (with corrected tapInternalKey) as HEX
      // JOURNAL ENTRY (2026-02-20): The SDK's walletAdapter.signPsbt() expects HEX format,
      // not base64. It validates the input is valid hex before calling the wallet extension.
      // JOURNAL ENTRY (2026-02-28): OYL wallet requires explicit connection check before signing.
      // If "Site origin must be connected first" error occurs, the wallet needs to be reconnected.
      const patchedPsbtHex = psbt.toHex();
      const walletId = browserWallet?.info?.id || 'unknown';

      // For OYL wallet: check connection status before signing
      if (walletId === 'oyl') {
        const oylProvider = (window as any).oyl;
        if (oylProvider && oylProvider.isConnected) {
          const isConnected = await oylProvider.isConnected();
          if (!isConnected) {
            console.warn('[WalletContext] OYL wallet connection lost');
            // OYL requires manual reconnection - cannot auto-reconnect programmatically
            throw new Error(
              'OYL wallet connection expired. Please:\n' +
              '1. Click "Disconnect Wallet" in the top right\n' +
              '2. Click "Connect Wallet" and choose OYL again\n' +
              '3. Retry your transaction'
            );
          }
        }
      }

      console.log(`[WalletContext] Signing PSBT with SDK adapter (${walletId})`);
      let signedHex: string;
      try {
        signedHex = await walletAdapter.signPsbt(patchedPsbtHex, { auto_finalized: false });
      } catch (e: any) {
        console.error(`[WalletContext] ${walletId} adapter signPsbt error:`, e?.message || e);

        // Provide more helpful error for OYL connection issues
        if (walletId === 'oyl' && e?.message?.includes('connected first')) {
          throw new Error('OYL wallet connection required. Please disconnect and reconnect your wallet, then try again.');
        }

        throw new Error(`${walletId} signing failed: ${e?.message || e}`);
      }

      // Wallet adapter returns hex, convert to base64 for return
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
  }, [wallet, network, walletAdapter, walletType, browserWallet, browserWalletAddresses]);

  // Sign PSBT with segwit inputs (BIP84 derivation)
  // Uses SDK wallet adapters for browser wallets, BIP84 derivation for keystore
  const signSegwitPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets - use the SDK adapter which handles all wallet-specific logic
    if (walletAdapter && walletType === 'browser') {
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');

      console.log('[WalletContext] Signing segwit PSBT with SDK adapter');
      const signedHex = await walletAdapter.signPsbt(psbtHex, { auto_finalized: false });

      // Convert signed hex back to base64
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
  }, [wallet, network, walletAdapter, walletType]);

  // Sign multiple PSBTs - supports both keystore and browser wallets
  // Uses SDK wallet adapters for all browser wallet signing
  const signPsbts = useCallback(async (params: { psbts: string[] }): Promise<{ signedPsbts: string[] }> => {
    // For browser wallets - use the SDK adapter which handles all wallet-specific logic
    if (walletAdapter && walletType === 'browser') {
      console.log('[WalletContext] Signing multiple PSBTs with SDK adapter');
      const signedPsbts = await Promise.all(
        params.psbts.map(async (psbtBase64) => {
          const psbtBuffer = Buffer.from(psbtBase64, 'base64');
          const psbtHex = psbtBuffer.toString('hex');
          const signedHex = await walletAdapter.signPsbt(psbtHex, { auto_finalized: false });
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
  }, [wallet, walletAdapter, walletType]);

  // Sign message - supports both keystore and browser wallets
  const signMessage = useCallback(async (message: string): Promise<string> => {
    // For browser wallets
    if (browserWallet && walletType === 'browser') {
      // OYL signMessage is now handled natively by the SDK's ConnectedWallet.signMessage()
      const connectedWalletId = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ID);

      // Tokeo: signMessage(message, protocol?) => signature
      if (connectedWalletId === 'tokeo') {
        const tokeoProvider = (window as any).tokeo?.bitcoin;
        if (!tokeoProvider) throw new Error('Tokeo wallet not available');
        return await tokeoProvider.signMessage(message);
      }

      // Orange wallet: signMessage({ address, message }) => { signature }
      if (connectedWalletId === 'orange') {
        const win = window as any;
        const orangeProvider = win.OrangeBitcoinProvider ||
          win.OrangecryptoProviders?.BitcoinProvider ||
          win.OrangeWalletProviders?.OrangeBitcoinProvider;
        if (!orangeProvider) throw new Error('Orange wallet not available');

        if (typeof orangeProvider.signMessage === 'function') {
          const result = await orangeProvider.signMessage({
            address: browserWallet.address,
            message,
          });
          return result?.signature || result;
        }
        throw new Error('Orange wallet signMessage not supported');
      }

      // Magic Eden: signMessage(message, address?) => signature
      if (connectedWalletId === 'magic-eden') {
        const magicEdenProvider = (window as any).magicEden?.bitcoin;
        if (!magicEdenProvider) throw new Error('Magic Eden wallet not available');
        return await magicEdenProvider.signMessage(message, browserWallet.address);
      }

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
      addresses,
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
