/**
 * WalletContext - Unified wallet management for keystore and browser wallets
 *
 * ============================================================================
 * ⚠️⚠️⚠️ CRITICAL: BROWSER WALLET ADDRESS HANDLING (2026-03-01) ⚠️⚠️⚠️
 * ============================================================================
 *
 * This context exposes `walletType` which can be 'browser' or 'keystore'.
 *
 * **ALL mutation hooks MUST check walletType and use ACTUAL addresses for
 * browser wallets.** Browser wallets do NOT load a mnemonic into the SDK,
 * so symbolic addresses (`p2tr:0`, `p2wpkh:0`) resolve to the SDK's DUMMY
 * wallet instead of the user's wallet.
 *
 * Example of CORRECT usage in mutation hooks:
 * ```typescript
 * const { walletType, account } = useWallet();
 * const isBrowserWallet = walletType === 'browser';
 *
 * const toAddresses = isBrowserWallet
 *   ? [account?.taproot?.address]     // ✅ Actual address
 *   : ['p2tr:0'];                      // OK for keystore
 *
 * const changeAddr = isBrowserWallet
 *   ? account?.nativeSegwit?.address
 *   : 'p2wpkh:0';
 * ```
 *
 * This is NOT optional. Using symbolic addresses for browser wallets causes
 * tokens to be sent to the SDK's dummy wallet addresses. See useSwapMutation.ts
 * header comment for full documentation of this bug and the tokens lost to it.
 *
 * See also: CLAUDE.md "2026-03-01: Browser Wallet Output Address Bug"
 * ============================================================================
 */
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
        try {
          const walletInfo = BROWSER_WALLETS.find(w => w.id === storedBrowserWalletId);
          if (walletInfo && isWalletInstalled(walletInfo)) {
            // Reconstruct ConnectedWallet from cached addresses WITHOUT prompting the
            // extension. connector.connect() would show a popup (e.g., Xverse getAddresses)
            // which blocks initialization and can leave the extension in a conflicting
            // state if the user dismisses it or it times out.
            const cachedAddrs = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
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

              // Only set state if we successfully created the connected wallet
              setBrowserWallet(connected);
              setBrowserWalletAddresses(cachedParsed);
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
          } else {
            // Wallet not installed anymore, clear stored state
            console.log('[WalletContext] Stored browser wallet not installed, clearing');
            localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
            localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
            localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
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
          // Log addresses being used for balance queries
          console.log('[WalletContext] Using browser wallet addresses for balance queries:');
          console.log('  Taproot:', taprootAddr?.address || '(none)');
          console.log('  NativeSegwit:', segwitAddr?.address || '(none)');
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

    console.log('[WalletContext] connectBrowserWallet called with walletId:', walletId);

    const walletInfo = BROWSER_WALLETS.find(w => w.id === walletId);
    if (!walletInfo) {
      throw new Error(`Unknown wallet: ${walletId}`);
    }

    console.log('[WalletContext] Found wallet info:', walletInfo.name, 'injectionKey:', walletInfo.injectionKey);

    if (!isWalletInstalled(walletInfo)) {
      throw new Error(`${walletInfo.name} is not installed`);
    }

    console.log('[WalletContext] Wallet is installed, starting connection...');

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
        console.log('[WalletContext][OYL-CONNECT] ===== OYL CONNECTION FLOW START =====');
        const oylProvider = (window as any).oyl;
        if (!oylProvider) throw new Error('OYL wallet not available');

        // Log all available methods on window.oyl
        console.log('[WalletContext][OYL-CONNECT] window.oyl available methods:', Object.keys(oylProvider).join(', '));
        console.log('[WalletContext][OYL-CONNECT] window.oyl prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(oylProvider) || {}).join(', '));

        // Check if already connected - if not, getAddresses() will trigger connection prompt
        let isConnectedResult: any = 'N/A';
        if (typeof oylProvider.isConnected === 'function') {
          try {
            isConnectedResult = await oylProvider.isConnected();
          } catch (e: any) {
            isConnectedResult = `ERROR: ${e?.message || e}`;
          }
        }
        console.log('[WalletContext][OYL-CONNECT] isConnected() result:', isConnectedResult);

        // getAddresses returns all address types in one call
        // On first call when not connected, this triggers the connection approval popup
        const rawAddresses = await oylProvider.getAddresses();
        console.log('[WalletContext] OYL getAddresses RAW response:', rawAddresses);
        console.log('[WalletContext] OYL getAddresses RAW JSON:', JSON.stringify(rawAddresses, null, 2));
        console.log('[WalletContext] OYL response type:', typeof rawAddresses);
        if (rawAddresses) {
          console.log('[WalletContext] OYL response keys:', Object.keys(rawAddresses));
          console.log('[WalletContext] OYL nativeSegwit type:', typeof rawAddresses.nativeSegwit);
          console.log('[WalletContext] OYL taproot type:', typeof rawAddresses.taproot);
        }

        // Handle different possible response formats from OYL
        // Format 1: { nativeSegwit: { address, publicKey }, taproot: { address, publicKey } }
        // Format 2: { nativeSegwit: "address", taproot: "address" }
        // Format 3: Array format
        let addresses: {
          nativeSegwit?: { address: string; publicKey?: string };
          taproot?: { address: string; publicKey?: string };
        } = {};

        if (Array.isArray(rawAddresses)) {
          // Handle array format - find by address type
          console.log('[WalletContext] OYL returned array format');
          for (const addr of rawAddresses) {
            if (addr.type === 'p2wpkh' || addr.addressType === 'p2wpkh' || addr.purpose === 'payment') {
              addresses.nativeSegwit = { address: addr.address, publicKey: addr.publicKey };
            } else if (addr.type === 'p2tr' || addr.addressType === 'p2tr' || addr.purpose === 'ordinals') {
              addresses.taproot = { address: addr.address, publicKey: addr.publicKey };
            }
          }
        } else if (rawAddresses && typeof rawAddresses === 'object') {
          // Handle object format
          if (typeof rawAddresses.nativeSegwit === 'string') {
            // Format: { nativeSegwit: "address", taproot: "address" }
            console.log('[WalletContext] OYL returned string addresses');
            addresses.nativeSegwit = { address: rawAddresses.nativeSegwit };
            addresses.taproot = { address: rawAddresses.taproot };
          } else {
            // Format: { nativeSegwit: { address, publicKey }, taproot: { address, publicKey } }
            console.log('[WalletContext] OYL returned object addresses');
            addresses = rawAddresses;
          }
        }

        if (!addresses?.nativeSegwit?.address && !addresses?.taproot?.address) {
          console.error('[WalletContext] OYL missing addresses after parsing:', { nativeSegwit: addresses?.nativeSegwit, taproot: addresses?.taproot });
          throw new Error('No addresses returned from OYL');
        }

        console.log('[WalletContext] OYL addresses (parsed):');
        console.log('  Taproot:', addresses.taproot?.address || '(none)');
        console.log('  NativeSegwit:', addresses.nativeSegwit?.address || '(none)');

        // DEBUGGING: Log address comparison for derivation path analysis
        // Different wallets may derive different addresses from the same seed
        // due to different BIP derivation paths (BIP44/84/86)
        console.log('[WalletContext] OYL address comparison - check if these match your Xverse addresses:');
        console.log('  If addresses differ, your funds are on Xverse addresses, not OYL addresses.');
        console.log('  This is normal - different wallets use different derivation paths.');

        // Store both address types
        if (addresses.taproot?.address) {
          additionalAddresses.taproot = {
            address: addresses.taproot.address,
            publicKey: addresses.taproot.publicKey,
          };
        }
        if (addresses.nativeSegwit?.address) {
          additionalAddresses.nativeSegwit = {
            address: addresses.nativeSegwit.address,
            publicKey: addresses.nativeSegwit.publicKey,
          };
        }

        // Use taproot as primary address (fall back to segwit if no taproot)
        const primaryAddress = addresses.taproot?.address || addresses.nativeSegwit?.address;
        const primaryPubKey = addresses.taproot?.publicKey || addresses.nativeSegwit?.publicKey;
        const primaryType = addresses.taproot?.address ? 'p2tr' : 'p2wpkh';

        if (!primaryAddress) {
          throw new Error('No valid address found from OYL wallet');
        }

        // Log final connection state
        console.log('[WalletContext][OYL-CONNECT] Creating ConnectedWallet with:');
        console.log('[WalletContext][OYL-CONNECT]   address:', primaryAddress);
        console.log('[WalletContext][OYL-CONNECT]   publicKey:', primaryPubKey);
        console.log('[WalletContext][OYL-CONNECT]   addressType:', primaryType);

        // Check isConnected again after getAddresses
        if (typeof oylProvider.isConnected === 'function') {
          try {
            const postConnectStatus = await oylProvider.isConnected();
            console.log('[WalletContext][OYL-CONNECT] isConnected() AFTER getAddresses:', postConnectStatus);
          } catch (e: any) {
            console.log('[WalletContext][OYL-CONNECT] isConnected() threw after getAddresses:', e?.message || e);
          }
        }

        console.log('[WalletContext][OYL-CONNECT] ===== OYL CONNECTION FLOW END =====');

        connected = new (ConnectedWallet as any)(walletInfo, oylProvider, {
          address: primaryAddress,
          publicKey: primaryPubKey,
          addressType: primaryType,
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
        // JOURNAL ENTRY (2026-03-02): Added 10s timeout - should respond quickly.
        const okxProvider = (window as any).okxwallet?.bitcoin;
        if (!okxProvider) throw new Error('OKX wallet not available');

        console.log('[WalletContext] OKX: calling connect...');

        const result = await Promise.race([
          okxProvider.connect(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              'OKX wallet connection timed out after 10s. ' +
              'Please check your OKX extension popup and approve the connection.'
            )), 10000)
          ),
        ]);
        console.log('[WalletContext] OKX: connect returned:', result);
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
        // JOURNAL ENTRY (2026-03-02): Added 10s timeout - Unisat should respond quickly.
        // If it doesn't, the extension is likely in a bad state and needs refresh.
        const unisatProvider = (window as any).unisat;
        if (!unisatProvider) throw new Error('Unisat wallet not available. Please install the Unisat extension.');

        console.log('[WalletContext] Unisat: provider found, available methods:', Object.keys(unisatProvider));
        console.log('[WalletContext] Unisat: calling requestAccounts...');

        let accounts: string[];
        try {
          // Check if already connected first - getAccounts() returns existing accounts without prompting
          const existingAccounts = await unisatProvider.getAccounts();
          console.log('[WalletContext] Unisat: getAccounts() returned:', existingAccounts);

          if (existingAccounts?.length > 0) {
            accounts = existingAccounts;
            console.log('[WalletContext] Unisat: using existing connection');
          } else {
            // Not connected - trigger requestAccounts() but don't wait for it directly
            // because Unisat's requestAccounts() often hangs even after user approval.
            // Instead, we poll getAccounts() to detect when connection is established.
            console.log('[WalletContext] Unisat: triggering requestAccounts (this shows the popup)...');

            // Fire and forget - this triggers the popup
            const requestPromise = unisatProvider.requestAccounts().catch((e: any) => {
              console.log('[WalletContext] Unisat: requestAccounts rejected:', e);
              return null;
            });

            // Poll getAccounts() to detect when user approves
            const pollForConnection = async (): Promise<string[]> => {
              const maxAttempts = 60; // 30 seconds total (500ms * 60)
              for (let i = 0; i < maxAttempts; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));
                try {
                  const accts = await unisatProvider.getAccounts();
                  if (accts?.length > 0) {
                    console.log('[WalletContext] Unisat: poll detected connection after', (i + 1) * 0.5, 'seconds');
                    return accts;
                  }
                } catch (e) {
                  // Ignore polling errors
                }
              }
              throw new Error('Unisat connection timed out. Please approve the connection in your Unisat wallet.');
            };

            // Race between requestAccounts resolving and our polling
            accounts = await Promise.race([
              requestPromise.then((result: string[] | null) => {
                if (result && result.length > 0) {
                  console.log('[WalletContext] Unisat: requestAccounts resolved:', result);
                  return result;
                }
                // If requestAccounts returned empty, keep waiting for poll
                return new Promise<string[]>(() => {}); // Never resolves
              }),
              pollForConnection(),
            ]);
          }
          console.log('[WalletContext] Unisat: final accounts:', accounts);
        } catch (e: any) {
          console.error('[WalletContext] Unisat: connection error:', e);
          const msg = typeof e === 'string' ? e : e?.message || JSON.stringify(e);
          throw new Error(`Unisat connection failed: ${msg}`);
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
      console.log('[WalletContext] browserWalletAddresses state will be:', additionalAddresses);
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

      // ============================================================================
      // Xverse Signing (2026-03-01)
      // ============================================================================
      // Xverse uses the sats-connect protocol and requires a signInputs mapping
      // that tells the wallet which address should sign which inputs.
      //
      // CRITICAL: The PSBT must have CORRECT addresses in input witnessUtxo scripts.
      // If patchPsbtForBrowserWallet() was applied to a PSBT that already had correct
      // addresses from the SDK, it will CORRUPT the scripts and break signInputs mapping.
      //
      // When working correctly:
      // - Input 0 (segwit UTXO): decoded address matches paymentAddr → payIdx
      // - Input 1 (taproot token UTXO): decoded address matches ordinalsAddr → ordIdx
      // - signInputs = { "bc1q...": [0], "bc1p...": [1] }
      //
      // When corrupted (PSBT patching bug):
      // - Both inputs decode to same address type
      // - signInputs only has one entry → Xverse hangs waiting for missing signatures
      //
      // Verified working TX: 985436b5c5c850bd121cd4862f32413f467145b121d34c006417724d71588db9
      // ============================================================================
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
          console.log(`[WalletContext] Input ${i}: witnessUtxo exists:`, !!input.witnessUtxo);
          if (!input.witnessUtxo) {
            // No witnessUtxo — assume payment input
            console.log(`[WalletContext] Input ${i}: No witnessUtxo, assigning to payment`);
            if (paymentAddr) payIdx.push(i);
            else ordIdx.push(i);
            continue;
          }
          try {
            const scriptHex = Buffer.from(input.witnessUtxo.script).toString('hex');
            console.log(`[WalletContext] Input ${i}: script hex:`, scriptHex);
            const addr = bitcoin.address.fromOutputScript(
              Buffer.from(input.witnessUtxo.script), btcNetwork
            );
            console.log(`[WalletContext] Input ${i}: Decoded address:`, addr);
            console.log(`[WalletContext] Input ${i}: Comparing to ordinalsAddr:`, ordinalsAddr, '| match:', addr === ordinalsAddr);
            console.log(`[WalletContext] Input ${i}: Comparing to paymentAddr:`, paymentAddr, '| match:', addr === paymentAddr);
            if (paymentAddr && addr === paymentAddr) {
              console.log(`[WalletContext] Input ${i}: → Assigning to PAYMENT`);
              payIdx.push(i);
            } else if (addr === ordinalsAddr) {
              console.log(`[WalletContext] Input ${i}: → Assigning to ORDINALS`);
              ordIdx.push(i);
            } else {
              // Heuristic: P2SH (3...) or P2WPKH (bc1q...) → payment; else → ordinals
              const isSegwit = addr.startsWith('3') || addr.toLowerCase().startsWith('bc1q');
              console.log(`[WalletContext] Input ${i}: Using heuristic, isSegwit:`, isSegwit);
              if (isSegwit && paymentAddr) {
                console.log(`[WalletContext] Input ${i}: → Assigning to PAYMENT (heuristic)`);
                payIdx.push(i);
              } else {
                console.log(`[WalletContext] Input ${i}: → Assigning to ORDINALS (heuristic)`);
                ordIdx.push(i);
              }
            }
          } catch (e) {
            console.error(`[WalletContext] Input ${i}: Failed to decode address:`, e);
            ordIdx.push(i);
          }
        }

        if (ordIdx.length > 0) signInputs[ordinalsAddr] = ordIdx;
        if (paymentAddr && payIdx.length > 0) signInputs[paymentAddr] = payIdx;

        console.log('[WalletContext] Xverse signInputs:', JSON.stringify(signInputs));

        // Debug: Log PSBT details before signing
        console.log('[WalletContext] PSBT to sign (base64 length):', psbt.toBase64().length);
        console.log('[WalletContext] PSBT input count:', psbt.data.inputs.length);
        console.log('[WalletContext] Calling xverse.request("signPsbt")...');

        let response;
        try {
          response = await xverse.request('signPsbt', {
            psbt: psbt.toBase64(),
            signInputs,
            broadcast: false,
          });
          console.log('[WalletContext] Xverse response:', JSON.stringify(response));
        } catch (xverseError: any) {
          console.error('[WalletContext] Xverse signPsbt threw error:', xverseError);
          console.error('[WalletContext] Error message:', xverseError?.message);
          console.error('[WalletContext] Error name:', xverseError?.name);
          console.error('[WalletContext] Full error:', JSON.stringify(xverseError, Object.getOwnPropertyNames(xverseError)));
          throw xverseError;
        }

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

      // ============================================================================
      // UNISAT WALLET DIRECT SIGNING (2026-03-03)
      // ============================================================================
      // VERIFIED WORKING: Transaction 81b3d4d2c04e163c0ba791963b7569eaa2196814b4d3a5afa8d62719d0a3df69
      //
      // PITFALLS ENCOUNTERED (in order of discovery):
      //
      // 1. SDK ADAPTER NULL ERROR
      //    - Error: "Cannot read properties of null (reading '0')"
      //    - Cause: SDK's walletAdapter.signPsbt() returns null in some cases
      //    - Fix: Direct window.unisat bypass (similar to Xverse pattern)
      //
      // 2. MISSING ADDRESS IN toSignInputs
      //    - Error: "no address or public key in toSignInput"
      //    - Cause: Each toSignInputs entry MUST have `address` or `publicKey`
      //    - Fix: Always include `address: unisatAddress` in each entry
      //
      // 3. NO POPUP APPEARING
      //    - Symptom: signPsbt called but no wallet popup
      //    - Cause: UniSat has BOTH signPsbt AND signPsbts methods
      //    - Fix: Check which method exists, prefer signPsbts (SDK pattern)
      //
      // 4. TAPROOT FINALIZATION FAILURE
      //    - Error: "No tapleaf script signature provided"
      //    - Cause: autoFinalized: false returns unfinalized taproot inputs
      //    - Fix: Use autoFinalized: true for UniSat (it handles taproot internally)
      //
      // 5. DOUBLE FINALIZATION ERROR
      //    - Error: "Input has already been finalized"
      //    - Cause: autoFinalized: true returns already-finalized PSBT
      //    - Fix: Try extractTransaction() first, fallback to finalizeAllInputs()
      //
      // UniSat API Reference:
      // - signPsbt(psbtHex, options): Signs single PSBT, returns hex
      // - signPsbts(psbtHexArray, options): Signs multiple PSBTs, returns hex[]
      // - Options: { autoFinalized: boolean, toSignInputs: [{index, address}] }
      //
      // CRITICAL: UniSat is SINGLE-ADDRESS — all inputs use the same address
      // ============================================================================
      const unisat = (window as any).unisat;
      if (unisat && browserWallet?.info?.id === 'unisat') {
        console.log('[WalletContext] UniSat: signing PSBT directly (bypassing SDK adapter)');

        const patchedPsbtHex = psbt.toHex();
        console.log('[WalletContext] UniSat: PSBT hex length:', patchedPsbtHex.length);
        console.log('[WalletContext] UniSat: Input count:', psbt.data.inputs.length);

        // Get the connected UniSat address - required for toSignInputs
        // UniSat is a single-address wallet, so all inputs that can be signed use this address
        const unisatAddress = browserWallet.address;
        console.log('[WalletContext] UniSat: connected address:', unisatAddress);

        // Build toSignInputs - tell UniSat which inputs to sign
        // Each entry must have index + address (or publicKey)
        // UniSat will only sign inputs matching its connected address
        const toSignInputs = psbt.data.inputs.map((_, index) => ({
          index,
          address: unisatAddress,
        }));

        console.log('[WalletContext] UniSat: toSignInputs:', JSON.stringify(toSignInputs));

        // JOURNAL (2026-03-03): UniSat has both signPsbt (singular) and signPsbts (plural).
        // The SDK uses signPsbts which takes an array and returns an array.
        // Try signPsbts first (SDK method), fall back to signPsbt if unavailable.
        let signedHex: string | null = null;
        try {
          // Check which method UniSat exposes
          const hasSignPsbts = typeof unisat.signPsbts === 'function';
          const hasSignPsbt = typeof unisat.signPsbt === 'function';
          console.log('[WalletContext] UniSat: hasSignPsbts:', hasSignPsbts, 'hasSignPsbt:', hasSignPsbt);

          // JOURNAL (2026-03-03): Added 60-second timeout to detect hanging wallet prompts.
          // If UniSat doesn't respond (popup blocked, extension crashed, etc.), we timeout
          // rather than hanging indefinitely.
          const signWithTimeout = async (signFn: () => Promise<any>, method: string): Promise<any> => {
            return Promise.race([
              signFn(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(
                  `UniSat ${method} timed out after 60s. ` +
                  'Check if: (1) popup blocker is active, (2) UniSat extension icon has pending request, ' +
                  '(3) wallet is locked, (4) popup opened behind browser window.'
                )), 60000)
              ),
            ]);
          };

          if (hasSignPsbts) {
            // Use SDK-style signPsbts (array format)
            // toSignInputs is a flat array (same for all PSBTs in the batch)
            // JOURNAL (2026-03-03): Use autoFinalized: true for UniSat - it handles taproot
            // finalization internally. With autoFinalized: false, we get "No tapleaf script
            // signature provided" error during our manual finalizeAllInputs() call.
            console.log('[WalletContext] UniSat: calling signPsbts (array format, autoFinalized: true)...');
            console.log('[WalletContext] UniSat: Please check for popup or extension icon notification');
            const signedHexArray = await signWithTimeout(
              () => unisat.signPsbts([patchedPsbtHex], {
                autoFinalized: true,  // Let UniSat finalize taproot inputs
                toSignInputs,  // Flat array, applies to all PSBTs
              }),
              'signPsbts'
            );
            console.log('[WalletContext] UniSat: signPsbts returned:', signedHexArray?.length, 'results');
            signedHex = signedHexArray?.[0] || null;
          } else if (hasSignPsbt) {
            // Fall back to singular signPsbt
            console.log('[WalletContext] UniSat: calling signPsbt (single format, autoFinalized: true)...');
            console.log('[WalletContext] UniSat: Please check for popup or extension icon notification');
            signedHex = await signWithTimeout(
              () => unisat.signPsbt(patchedPsbtHex, {
                autoFinalized: true,  // Let UniSat finalize taproot inputs
                toSignInputs,
              }),
              'signPsbt'
            );
          } else {
            throw new Error('UniSat wallet does not expose signPsbt or signPsbts');
          }
          console.log('[WalletContext] UniSat: sign result type:', typeof signedHex);
          console.log('[WalletContext] UniSat: sign result length:', signedHex?.length || 'null');
        } catch (unisatError: any) {
          console.error('[WalletContext] UniSat sign threw error:', unisatError);
          console.error('[WalletContext] Error message:', unisatError?.message);
          console.error('[WalletContext] Error code:', unisatError?.code);
          throw new Error(`UniSat signing failed: ${unisatError?.message || unisatError}`);
        }

        // UniSat can return null if user cancels or something fails internally
        if (!signedHex) {
          throw new Error('UniSat signing was cancelled or returned empty result');
        }

        // Convert hex to base64 for return
        const signedBuffer = Buffer.from(signedHex, 'hex');
        return signedBuffer.toString('base64');
      }

      // For all other browser wallets (OYL, OKX, etc.): use SDK adapter
      // JOURNAL ENTRY (2026-02-20): Direct window.oyl.signPsbt() calls fail with validation errors.
      // The SDK adapter (walletAdapter.signPsbt) works correctly for all wallets including OYL.
      // Successful DIESEL minting proved the SDK adapter path works.
      // Pass the patched PSBT (with corrected tapInternalKey) as HEX
      // JOURNAL ENTRY (2026-02-20): The SDK's walletAdapter.signPsbt() expects HEX format,
      // not base64. It validates the input is valid hex before calling the wallet extension.
      // JOURNAL ENTRY (2026-02-28): OYL wallet requires explicit connection check before signing.
      // If "Site origin must be connected first" error occurs, the wallet needs to be reconnected.
      // JOURNAL ENTRY (2026-03-01): REMOVED pre-emptive isConnected() check.
      // OYL's isConnected() returns false even after successful getAddresses() - it tracks
      // a different concept (persistent site approval) vs. session availability. The SDK's
      // OylAdapter doesn't use isConnected() at all - it just calls signPsbt() directly.
      // Let the SDK try to sign and handle errors gracefully instead of blocking users.
      const patchedPsbtHex = psbt.toHex();
      const walletId = browserWallet?.info?.id || 'unknown';

      // ============================================================================
      // OYL WALLET BEHAVIOR DOCUMENTATION (2026-03-01)
      // ============================================================================
      //
      // VERIFIED WORKING: OYL wallet swaps work correctly as of 2026-03-01.
      // Confirmed via txid: 0b2455ceef9c0f1fb8c09d37b08f667a656cac5e09e4d0cf01ddccc7b59aef43
      //
      // KEY INSIGHTS ABOUT OYL WALLET:
      //
      // 1. isConnected() RETURNS FALSE EVEN WHEN WORKING
      //    OYL's isConnected() tracks persistent site approval, NOT session readiness.
      //    Signing works even when isConnected() returns false.
      //    DO NOT gate signing on isConnected() - it will block valid users.
      //
      // 2. OYL HAS NO connect() METHOD
      //    Unlike other wallets, OYL doesn't expose a connect() method.
      //    Connection is established implicitly via getAddresses().
      //    Available methods: disconnect, isConnected, getNetwork, switchNetwork,
      //    getAddresses, getBalance, signMessage, signPsbt, signPsbts, pushPsbt
      //
      // 3. MULTIPLE SIGNATURE POPUPS ARE EXPECTED
      //    OYL shows one popup PER INPUT being signed in the transaction.
      //    If a swap has 3 UTXOs (e.g., 1 segwit for fees + 2 taproot for tokens),
      //    the user will see 3 separate signature popups. This is OYL's UX design,
      //    NOT a bug in our code. Other wallets like Xverse batch all signatures
      //    into a single popup.
      //
      // 4. AUTO-RECONNECTION ON "connected first" ERROR
      //    If signing fails with "Site origin must be connected first", we
      //    automatically call getAddresses() to re-establish connection, then retry.
      //    This handles the case where OYL's session expired between operations.
      //
      // 5. SDK ADAPTER PATH IS CORRECT
      //    We use walletAdapter.signPsbt() (from SDK), NOT direct window.oyl calls.
      //    The SDK adapter handles format conversion and validation correctly.
      //    Direct window.oyl.signPsbt() calls were tried and failed with validation errors.
      //
      // This logging section helps trace signing flow for debugging future issues.
      // ============================================================================

      // Log 1: Entry point - what wallet and what PSBT
      console.log(`[WalletContext][OYL-DEBUG] ===== SIGNING ATTEMPT START =====`);
      console.log(`[WalletContext][OYL-DEBUG] walletId: "${walletId}"`);
      console.log(`[WalletContext][OYL-DEBUG] PSBT hex length: ${patchedPsbtHex.length}`);
      console.log(`[WalletContext][OYL-DEBUG] PSBT hex (first 100 chars): ${patchedPsbtHex.substring(0, 100)}...`);

      // Log 2: Check OYL provider state BEFORE signing
      if (walletId === 'oyl') {
        const oylProvider = (window as any).oyl;
        console.log(`[WalletContext][OYL-DEBUG] window.oyl exists: ${!!oylProvider}`);
        if (oylProvider) {
          console.log(`[WalletContext][OYL-DEBUG] window.oyl methods: ${Object.keys(oylProvider).join(', ')}`);
          console.log(`[WalletContext][OYL-DEBUG] window.oyl.isConnected exists: ${typeof oylProvider.isConnected}`);
          console.log(`[WalletContext][OYL-DEBUG] window.oyl.signPsbt exists: ${typeof oylProvider.signPsbt}`);
          console.log(`[WalletContext][OYL-DEBUG] window.oyl.getAddresses exists: ${typeof oylProvider.getAddresses}`);
          console.log(`[WalletContext][OYL-DEBUG] window.oyl.connect exists: ${typeof oylProvider.connect}`);

          // Check isConnected if available
          if (typeof oylProvider.isConnected === 'function') {
            try {
              const connected = await oylProvider.isConnected();
              console.log(`[WalletContext][OYL-DEBUG] isConnected() returned: ${connected}`);
            } catch (connCheckErr: any) {
              console.log(`[WalletContext][OYL-DEBUG] isConnected() threw: ${connCheckErr?.message || connCheckErr}`);
            }
          }
        }
      }

      // Log 3: What adapter is being used
      console.log(`[WalletContext][OYL-DEBUG] walletAdapter type: ${walletAdapter?.constructor?.name || typeof walletAdapter}`);
      console.log(`[WalletContext][OYL-DEBUG] Calling walletAdapter.signPsbt() with auto_finalized: false`);

      // JOURNAL (2026-03-03): Added 60-second timeout for OYL/OKX signing to match UniSat.
      // Without timeout, a stuck popup or crashed extension causes indefinite hang.
      const SIGNING_TIMEOUT_MS = 60000;
      const signWithTimeout = async (signFn: () => Promise<string>): Promise<string> => {
        return Promise.race([
          signFn(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error(
              `${walletId} signing timed out after 60s. ` +
              'Check if: (1) popup blocker is active, (2) wallet extension icon has pending request, ' +
              '(3) wallet is locked, (4) popup opened behind browser window.'
            )), SIGNING_TIMEOUT_MS)
          ),
        ]);
      };

      let signedHex: string;
      try {
        const signStartTime = Date.now();
        signedHex = await signWithTimeout(() => walletAdapter.signPsbt(patchedPsbtHex, { auto_finalized: false }));
        const signDuration = Date.now() - signStartTime;
        console.log(`[WalletContext][OYL-DEBUG] signPsbt SUCCESS in ${signDuration}ms`);
        console.log(`[WalletContext][OYL-DEBUG] signedHex length: ${signedHex?.length || 'undefined'}`);
      } catch (e: any) {
        // Log 4: Detailed error information
        console.error(`[WalletContext][OYL-DEBUG] ===== signPsbt FAILED =====`);
        console.error(`[WalletContext][OYL-DEBUG] Error type: ${e?.constructor?.name || typeof e}`);
        console.error(`[WalletContext][OYL-DEBUG] Error message: "${e?.message}"`);
        console.error(`[WalletContext][OYL-DEBUG] Error code: ${e?.code}`);
        console.error(`[WalletContext][OYL-DEBUG] Full error object:`, e);
        console.error(`[WalletContext][OYL-DEBUG] Error stack:`, e?.stack);

        // JOURNAL ENTRY (2026-03-01): OYL wallet auto-reconnection
        // OYL requires persistent site connection. If signing fails with "connected first",
        // try to re-establish connection by calling getAddresses() and retry signing.
        const errorMsg = e?.message || String(e);
        const isConnectionError = errorMsg.includes('connected first') ||
                                   errorMsg.includes('not connected') ||
                                   errorMsg.includes('connection');

        console.log(`[WalletContext][OYL-DEBUG] isConnectionError check: "${errorMsg}" includes 'connected first': ${errorMsg.includes('connected first')}`);
        console.log(`[WalletContext][OYL-DEBUG] walletId === 'oyl': ${walletId === 'oyl'}`);

        if (walletId === 'oyl' && isConnectionError) {
          console.log('[WalletContext][OYL-DEBUG] Detected OYL connection error, attempting reconnection...');
          const oylProvider = (window as any).oyl;

          console.log(`[WalletContext][OYL-DEBUG] oylProvider exists for reconnect: ${!!oylProvider}`);
          console.log(`[WalletContext][OYL-DEBUG] oylProvider.getAddresses exists: ${typeof oylProvider?.getAddresses}`);
          console.log(`[WalletContext][OYL-DEBUG] oylProvider.connect exists: ${typeof oylProvider?.connect}`);

          if (oylProvider?.getAddresses) {
            try {
              // Try calling connect() first if available (more explicit)
              if (typeof oylProvider.connect === 'function') {
                console.log('[WalletContext][OYL-DEBUG] Calling oylProvider.connect()...');
                try {
                  const connectResult = await oylProvider.connect();
                  console.log('[WalletContext][OYL-DEBUG] connect() result:', connectResult);
                } catch (connectErr: any) {
                  console.log('[WalletContext][OYL-DEBUG] connect() error:', connectErr?.message || connectErr);
                }
              }

              // Then call getAddresses() to ensure we're connected
              console.log('[WalletContext][OYL-DEBUG] Calling oylProvider.getAddresses()...');
              const addresses = await oylProvider.getAddresses();
              console.log('[WalletContext][OYL-DEBUG] getAddresses() returned:', addresses);

              // Check isConnected again after reconnection
              if (typeof oylProvider.isConnected === 'function') {
                const connectedAfter = await oylProvider.isConnected();
                console.log(`[WalletContext][OYL-DEBUG] isConnected() AFTER reconnect: ${connectedAfter}`);
              }

              // Retry signing after reconnection (with timeout)
              console.log('[WalletContext][OYL-DEBUG] Retrying walletAdapter.signPsbt() after reconnection...');
              const retryStartTime = Date.now();
              signedHex = await signWithTimeout(() => walletAdapter.signPsbt(patchedPsbtHex, { auto_finalized: false }));
              const retryDuration = Date.now() - retryStartTime;
              console.log(`[WalletContext][OYL-DEBUG] RETRY signPsbt SUCCESS in ${retryDuration}ms`);
              console.log(`[WalletContext][OYL-DEBUG] signedHex length: ${signedHex?.length || 'undefined'}`);
            } catch (reconnectError: any) {
              console.error('[WalletContext][OYL-DEBUG] ===== RECONNECTION FAILED =====');
              console.error('[WalletContext][OYL-DEBUG] reconnectError type:', reconnectError?.constructor?.name);
              console.error('[WalletContext][OYL-DEBUG] reconnectError message:', reconnectError?.message);
              console.error('[WalletContext][OYL-DEBUG] reconnectError full:', reconnectError);
              throw new Error('OYL wallet connection required. Please disconnect and reconnect your wallet, then try again.');
            }
          } else {
            console.error('[WalletContext][OYL-DEBUG] No getAddresses method available for reconnection');
            throw new Error('OYL wallet connection required. Please disconnect and reconnect your wallet, then try again.');
          }
        } else {
          console.log(`[WalletContext][OYL-DEBUG] Not an OYL connection error, throwing original error`);
          throw new Error(`${walletId} signing failed: ${e?.message || e}`);
        }
      }

      console.log(`[WalletContext][OYL-DEBUG] ===== SIGNING ATTEMPT END (success) =====`);

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
