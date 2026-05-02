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
  AlkanesClient,
  KeystoreSigner,
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
// PSBT patching is now handled by ts-sdk wallet adapters (adapter.ts)
// import { patchTapInternalKeys } from '@/lib/psbt-patching';

// Import browser wallet signing utilities with robust reconnection handling
import { signWithOyl, signWithUnisat, signWithXverse, detectWalletId, getOylCallCount, resetOylCallCount, patchTapInternalKeys } from '@/lib/wallet/browserWalletSigning';

// Connection-specific counter for OYL getAddresses() calls during initial connection
// Helps identify if React StrictMode is causing duplicate modal triggers
let oylConnectionCallCount = 0;

// Session storage key for mnemonic
const SESSION_MNEMONIC_KEY = 'subfrost_session_mnemonic';

/**
 * Create a wallet via AlkanesClient.withMnemonic (correct coinType derivation)
 * and wrap it in a legacy-compatible object that supports .deriveAddress/.signPsbt/.signMessage
 * This replaces createWalletFromMnemonic which always uses coinType=0.
 */
function createWalletViaClient(mnemonic: string, sdkNetwork: string) {
  const client = AlkanesClient.withMnemonic(mnemonic, sdkNetwork, { addressType: 'p2tr' });
  const signer = client.signer as any;

  // Build legacy wallet shim that matches what the rest of the app expects
  return {
    // Address derivation — used by addresses memo
    deriveAddress: (type: any, account: number, index: number) => {
      const addrType = typeof type === 'string' ? type : (type === 1 ? 'p2wpkh' : 'p2tr');
      return signer.getAddressInfo?.(addrType, index) || signer.deriveAddress?.(addrType, index) || { address: '', publicKey: '' };
    },
    // Signing
    signPsbt: (psbtBase64: string) => client.signPsbt(psbtBase64).then((r: any) => r.psbtHex || r),
    signMessage: (message: string, index?: number) => client.signMessage(message),
    // Mnemonic access
    exportMnemonic: () => mnemonic,
    // Keep reference to client for SDK operations
    _client: client,
    _signer: signer,
  };
}

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
    case 'qubitcoin-regtest':
    case 'subfrost-regtest':
    case 'oylnet':
    case 'devnet':
      return 'regtest';
    default:
      return 'mainnet';
  }
}

/**
 * Convert a mainnet bech32/bech32m address to regtest format.
 * Browser wallets always provide mainnet addresses (bc1p.../bc1q...).
 * On devnet, the SDK uses regtest params and requires bcrt1 addresses.
 * The witness program (pubkey hash) is identical — only the HRP changes.
 *
 * JOURNAL (2026-03-24): Added to fix "NetworkValidation(NetworkValidationError
 * { required: Regtest })" when using browser wallets on devnet.
 */
function convertToRegtest(address: string): string {
  if (!address.startsWith('bc1')) return address; // already regtest/testnet or unknown

  // Bech32 character set for decoding
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const charMap: Record<string, number> = {};
  for (let i = 0; i < CHARSET.length; i++) charMap[CHARSET[i]] = i;

  // Decode: split at last '1', convert data chars to 5-bit values
  const lastOne = address.lastIndexOf('1');
  const data = address.slice(lastOne + 1);
  const values: number[] = [];
  for (const c of data) {
    const v = charMap[c.toLowerCase()];
    if (v === undefined) return address; // invalid char, return as-is
    values.push(v);
  }

  // values[0] = witness version, values[1..len-6] = witness program, values[len-6..] = checksum
  const witnessVersion = values[0];
  const programValues = values.slice(1, values.length - 6);

  // Determine encoding: witness v0 uses bech32, v1+ uses bech32m
  const BECH32_CONST = 1;
  const BECH32M_CONST = 0x2bc830a3;
  const encodingConst = witnessVersion === 0 ? BECH32_CONST : BECH32M_CONST;

  // Compute new checksum for "bcrt" HRP
  const hrp = 'bcrt';
  const hrpExpand = [...hrp].map(c => c.charCodeAt(0) >> 5)
    .concat([0])
    .concat([...hrp].map(c => c.charCodeAt(0) & 31));

  const polymod = (values: number[]): number => {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((top >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  };

  const dataNoChecksum = [witnessVersion, ...programValues];
  const polyValues = [...hrpExpand, ...dataNoChecksum, 0, 0, 0, 0, 0, 0];
  const mod = polymod(polyValues) ^ encodingConst;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);

  // Encode result
  const result = hrp + '1' + [...dataNoChecksum, ...checksum].map(v => CHARSET[v]).join('');
  return result;
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
    case 'devnet':
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
// ⚠️ CRITICAL (2026-03-26): The SDK's getEnrichedBalances returns nested Maps
// (from serde_wasm_bindgen), NOT plain objects. JSON.stringify(Map) produces "{}",
// making it look like balances are empty. mapToObject MUST be applied to the
// ENTIRE result tree including array items. Without this, BTC balance shows 0
// on devnet even though the underlying lua_evalsaved RPC returns valid UTXOs.
// Proven via faucet-balance.test.ts: spendable[0] is a Map with .get("value").
function extractEnrichedData(rawResult: any): { spendable: any[]; assets: any[]; pending: any[] } | null {
  if (!rawResult) return null;
  let enrichedData: any;
  if (rawResult instanceof Map) {
    const returns = rawResult.get('returns');
    enrichedData = returns instanceof Map ? mapToObject(returns) : mapToObject(returns || rawResult);
  } else {
    enrichedData = rawResult?.returns || rawResult?.result?.returns || rawResult;
    // The enrichedData itself or its children may still be Maps
    enrichedData = mapToObject(enrichedData);
  }

  if (!enrichedData) return null;

  const toArray = (val: any): any[] => {
    if (val instanceof Map) return [...val.values()].map(mapToObject);
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
  /** Zcash transparent address — derived from same mnemonic via BIP44 m/44'/133'/0'/0/0 */
  zcash?: { address: string; pubkey: string; hdPath: string };
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
  TAPROOT_ADDRESS_INDEX: 'subfrost_taproot_address_index', // BIP86 address index (last segment) for keystore
} as const;

/**
 * TxContext — single source of truth for address-fallback chains used when
 * building alkanes / Bitcoin transactions.
 *
 * Every mutation hook used to recompute `fromAddresses`, `changeAddress`,
 * `alkanesChangeAddress` and `protectTaproot` from a wallet-type-specific
 * fallback chain (`paymentAddress || taprootAddress`, `[segwit, taproot]
 * .filter(Boolean)`, `isBrowserWallet || network === 'devnet' || …`). Those
 * accidentally produced the right keystore behaviour because keystore wallets
 * are taproot-only (`account.nativeSegwit === undefined`), but a future
 * contributor adding a new mutation could easily forget a fallback and break
 * keystore. `txContext` collapses all of that into one computed object.
 *
 * Wallet-type semantics:
 *   - **keystore** — taproot-only by design. All four fields point at the
 *     single taproot address; `shouldProtectTaproot=false` because there is
 *     no second address to spend BTC fees from.
 *   - **browser dual-address** (Xverse / Leather / OYL) — fee inputs come
 *     from `[segwit, taproot]`, BTC change goes to segwit, alkane change to
 *     taproot, `shouldProtectTaproot=true` reserves taproot UTXOs for alkanes.
 *   - **browser single-address** (UniSat / OKX) — only one address; we use
 *     it for everything and disable protect_taproot.
 *
 * `null` when the wallet isn't connected — consumers must guard via
 * `isConnected` (or the `if (!txContext)` shortcut).
 */
export type TxContext = {
  /** Addresses to source UTXOs from. Browser-dual: [segwit, taproot]. Single-address: [primary]. Keystore: [taproot]. */
  feeSourceAddresses: string[];
  /** Where BTC change goes. Segwit when available, otherwise the primary single address. Keystore: taproot. */
  btcChangeAddress: string;
  /** Where unwanted alkane change goes. Always the taproot address (alkanes are P2TR). */
  alkanesChangeAddress: string;
  /** Whether SDK should reserve taproot UTXOs for alkanes only and source BTC fees from segwit. True only for browser-dual wallets. */
  shouldProtectTaproot: boolean;
  /**
   * SDK ordinals_strategy default for this wallet. Controls whether
   * `alkanesExecuteTyped` runs the inscription/rune lookup pass.
   *
   * - `'burn'` for keystore: keystore is BIP86 taproot-only and wallet-internal,
   *   never receives inscriptions. Skipping the ord check is purely a perf win
   *   (one fewer RPC per UTXO + no split-tx codepath ever entered).
   * - `'exclude'` for browser wallets: matches the SDK's own default, but stated
   *   explicitly so future SDK changes can't silently shift behaviour.
   *
   * Per-operation overrides (e.g. SendModal's `'preserve'` for users who
   * opted into split-tx inscription protection) take precedence at the call
   * site — pass `ordinalsStrategy` explicitly to override.
   */
  defaultOrdinalsStrategy: 'burn' | 'exclude' | 'preserve';
};

type WalletContextType = {
  // Connection state
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  isInitializing: boolean;

  // Wallet type
  walletType: WalletType | null;
  /** Human-readable name of the connected wallet (e.g. "UniSat", "Oyl Wallet", "Keystore") */
  connectedWalletName: string | null;

  // Wallet data
  address: string;
  paymentAddress: string;
  publicKey: string;
  addresses: WalletAddresses;
  account: Account;
  network: Network;
  wallet: AlkanesWallet | null;
  /**
   * Computed transaction-context addresses. `null` when the wallet isn't
   * connected. See `TxContext` jsdoc for semantics.
   */
  txContext: TxContext | null;

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
  // Taproot address index (last segment of m/86'/coinType'/0'/0/N).
  // SDK only exposes this segment — account/change are fixed at 0.
  const [taprootAddressIndex, setTaprootAddressIndex] = useState(() =>
    typeof localStorage !== 'undefined'
      ? parseInt(localStorage.getItem(STORAGE_KEYS.TAPROOT_ADDRESS_INDEX) || '0', 10) || 0
      : 0
  );

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

  // Track whether the user explicitly disconnected on the current network.
  // Without this, the devnet auto-connect effect below immediately re-creates
  // the boot wallet the moment `wallet` goes null, making disconnect a no-op.
  // Reset on network change so switching back to devnet still auto-connects.
  const userDisconnectedRef = useRef(false);

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
          const restoredWallet = createWalletViaClient(sessionMnemonic, toSdkNetwork(network));
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

  // Listen for address index changes from WalletSettings
  useEffect(() => {
    const handler = () => {
      const idx = parseInt(localStorage.getItem(STORAGE_KEYS.TAPROOT_ADDRESS_INDEX) || '0', 10) || 0;
      setTaprootAddressIndex(idx);
    };
    window.addEventListener('derivation-changed', handler);
    return () => window.removeEventListener('derivation-changed', handler);
  }, []);

  // Load keystore wallet into SDK provider when sdkInitialized becomes true
  // (separate from main init so it doesn't re-trigger browser wallet reconnect)
  useEffect(() => {
    if (!sdkInitialized || !loadWallet) return;

    // On devnet, auto-connect the boot wallet so faucets, swaps, and balance
    // queries all use the same address set. Without this, the user must manually
    // import the boot mnemonic — and if they don't, faucet-minted tokens land at
    // addresses the SDK can't spend from.
    //
    // ⚠️ CRITICAL: Two different coinType derivation systems coexist:
    //   - createWalletFromMnemonic (this call) → coinType=0 → UI addresses
    //   - walletLoadMnemonic (WASM provider in boot.ts) → coinType=1 → on-chain txs
    // These produce DIFFERENT addresses from the same mnemonic.
    // Boot-seeded state (tokens, orders, LP) lives at coinType=1 addresses.
    // The connected wallet displays coinType=0 addresses.
    // Global Trades + Orderbook show boot data (no address filter).
    // Positions + My Activity only show user-initiated actions.
    // DO NOT change boot.ts to coinType=0 — breaks WASM keystore.
    // See CLAUDE.md "Address Derivation — Two CoinType Systems" for full history.
    if (network === 'devnet' && !wallet && !userDisconnectedRef.current) {
      const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      try {
        const bootWallet = createWalletViaClient(BOOT_MNEMONIC, toSdkNetwork(network));
        setWallet(bootWallet);
        setWalletType('keystore');
        loadWallet(BOOT_MNEMONIC);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, BOOT_MNEMONIC);
        console.log('[WalletContext] Devnet: auto-connected boot wallet');
      } catch (e) {
        console.warn('[WalletContext] Devnet auto-connect failed:', e);
      }
      return;
    }

    const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    const storedWalletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);
    if (sessionMnemonic && storedWalletType === 'keystore') {
      loadWallet(sessionMnemonic);
    }
  }, [sdkInitialized, loadWallet, network, wallet]);

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

    // Network change is a fresh context — clear the explicit-disconnect flag so
    // the devnet auto-connect can fire again when the user switches back.
    userDisconnectedRef.current = false;

    const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
    const storedWalletType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);

    if (sessionMnemonic && storedWalletType === 'keystore' && wallet) {
      console.log('[WalletContext] Network changed to', network, '- recreating wallet with new network');
      try {
        const newWallet = createWalletViaClient(sessionMnemonic, toSdkNetwork(network));
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
          // On devnet, convert mainnet addresses (bc1p/bc1q) to regtest (bcrt1p/bcrt1q)
          const devnetConvert = network === 'devnet' ? convertToRegtest : (a: string) => a;

          const taprootAddress = hasExplicitTaproot ? devnetConvert(taprootAddr!.address) : '';
          const segwitAddress = hasExplicitSegwit ? devnetConvert(segwitAddr!.address) : '';

          // Log addresses being used for balance queries
          console.log('[WalletContext] Using browser wallet addresses for balance queries:');
          console.log('  Taproot:', taprootAddress || '(none)');
          console.log('  NativeSegwit:', segwitAddress || '(none)');
          if (network === 'devnet') {
            console.log('  (converted from mainnet to regtest format for devnet)');
          }
          return {
            nativeSegwit: hasExplicitSegwit ? {
              address: segwitAddress,
              pubkey: segwitAddr!.publicKey || '',
              hdPath: ''
            } : { address: '', pubkey: '', hdPath: '' },
            taproot: hasExplicitTaproot ? {
              address: taprootAddress,
              pubkey: taprootAddr!.publicKey || '',
              pubKeyXOnly: taprootAddr!.publicKey ? taprootAddr!.publicKey.slice(2) : '',
              hdPath: ''
            } : { address: '', pubkey: '', pubKeyXOnly: '', hdPath: '' },
          };
        }
      }

      // Fall back to detecting address type from address format
      // On devnet, convert mainnet addresses to regtest before detection
      const resolvedAddress = network === 'devnet' ? convertToRegtest(primaryAddress) : primaryAddress;

      // bc1q... = native segwit (P2WPKH)
      // bc1p... = taproot (P2TR)
      // tb1q.../tb1p... = testnet equivalents
      // bcrt1q.../bcrt1p... = regtest equivalents
      const isTaproot = resolvedAddress.startsWith('bc1p') || resolvedAddress.startsWith('tb1p') || resolvedAddress.startsWith('bcrt1p');
      const isNativeSegwit = resolvedAddress.startsWith('bc1q') || resolvedAddress.startsWith('tb1q') || resolvedAddress.startsWith('bcrt1q');

      if (network === 'devnet' && resolvedAddress !== primaryAddress) {
        console.log(`[WalletContext] Devnet: converted ${primaryAddress.slice(0, 12)}... → ${resolvedAddress.slice(0, 14)}...`);
      }

      // Only assign the address to the correct type based on address format
      // This prevents the bug where a taproot address was being used for both
      return {
        nativeSegwit: isNativeSegwit ? {
          address: resolvedAddress,
          pubkey: primaryPublicKey,
          hdPath: ''
        } : { address: '', pubkey: '', hdPath: '' },
        taproot: isTaproot ? {
          address: resolvedAddress,
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

    let segwitInfo = { address: '', publicKey: '' };
    // NOTE: createWalletViaClient shim signature is (type, account, index) but
    // only the third arg reaches the SDK signer. Pass our address index as the
    // third arg or it's silently ignored.
    let taprootInfo = wallet.deriveAddress(AddressType.P2TR, 0, taprootAddressIndex);

    // No coinType override needed — createWalletViaClient uses AlkanesClient.withMnemonic
    // which correctly derives coinType=1 for regtest/devnet, coinType=0 for mainnet.

    // Derive Zcash address from the same mnemonic (BIP44 m/44'/133'/0'/0/0)
    // On mainnet, show the real ZEC address alongside BTC addresses
    let zcashInfo: { address: string; pubkey: string; hdPath: string } | null = null;
    try {
      const sessionMnemonic = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_MNEMONIC_KEY)
        : null;
      if (sessionMnemonic) {
        const { deriveZcashAddress, toZcashNetwork } = require('@/lib/zcash/address');
        const zcashNet = toZcashNetwork(network);
        zcashInfo = deriveZcashAddress(sessionMnemonic, zcashNet);
      }
    } catch (e) {
      // ZEC derivation is optional — don't break the wallet if it fails
      console.debug('[WalletContext] ZEC address derivation skipped:', (e as Error).message);
    }

    return {
      nativeSegwit: {
        address: segwitInfo.address || '',
        pubkey: segwitInfo.publicKey || '',
        hdPath: (segwitInfo as any).path || '',
      },
      taproot: {
        address: taprootInfo.address,
        pubkey: taprootInfo.publicKey,
        pubKeyXOnly: taprootInfo.publicKey.slice(2), // Remove prefix for x-only
        hdPath: taprootInfo.path,
      },
      zcash: zcashInfo || undefined,
    };
  }, [wallet, browserWallet, walletType, browserWalletAddresses, network, taprootAddressIndex]);

  // Build account structure
  const account: Account = useMemo(() => {
    return {
      nativeSegwit: addresses.nativeSegwit.address ? addresses.nativeSegwit : undefined,
      taproot: addresses.taproot.address ? addresses.taproot : undefined,
      zcash: addresses.zcash?.address ? addresses.zcash : undefined,
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[network],
    };
  }, [addresses, network]);

  // Compute transaction-context addresses. See `TxContext` jsdoc for the
  // wallet-type semantics this codifies. `null` when neither address is
  // available (wallet not connected); consumers should guard via the
  // `isConnected` flag they already check.
  const txContext: TxContext | null = useMemo(() => {
    const segwit = account.nativeSegwit?.address;
    const taproot = account.taproot?.address;

    if (walletType === 'keystore') {
      // Keystore is BIP86 taproot-only by design — no segwit derivation.
      // All addresses funnel to the single taproot, and protect_taproot is
      // moot because there's no second address to source BTC fees from.
      if (!taproot) return null;
      return {
        feeSourceAddresses: [taproot],
        btcChangeAddress: taproot,
        alkanesChangeAddress: taproot,
        shouldProtectTaproot: false,
        // Keystore never holds inscriptions — skip the ord lookup entirely.
        // 'burn' makes `check_utxos_for_inscriptions_with_provider` return
        // early before any per-UTXO ord_outputs RPC call.
        defaultOrdinalsStrategy: 'burn',
      };
    }

    // Browser wallet (or unconnected — both addresses absent → null below).
    if (!segwit && !taproot) return null;

    // Dual-address wallets (Xverse, Leather, OYL) expose distinct segwit +
    // taproot addresses. Single-address wallets (UniSat, OKX) expose only
    // one — `isDualAddress` is false and we collapse the BTC + alkane
    // change destinations to that single address.
    const isDualAddress = !!segwit && !!taproot && segwit !== taproot;
    const primary = (taproot || segwit)!;

    return {
      // Browser-dual: source from both. Single-address: just the one.
      // `Set` dedupes when the wallet returns the same address for both
      // purposes (some configurations of UniSat).
      feeSourceAddresses: Array.from(new Set([segwit, taproot].filter(Boolean) as string[])),
      // BTC change goes to segwit when available — taproot UTXOs are reserved
      // for alkanes on dual-address wallets. Falls back to whatever single
      // address exists.
      btcChangeAddress: segwit || primary,
      // Alkane change always goes to taproot (alkanes are P2TR). Single-
      // address segwit-only wallets fall back to that address — there's
      // nowhere else to send it.
      alkanesChangeAddress: taproot || primary,
      // Only meaningful when there's a separate segwit address to source
      // BTC fees from. Single-address wallets must spend taproot UTXOs for
      // both alkanes and fees, so reserving them would block fee selection.
      shouldProtectTaproot: isDualAddress,
      // Browser wallets may hold inscriptions/runes — keep the SDK's default
      // exclude behaviour, but state it explicitly so a future SDK upgrade
      // can't silently change it. Per-operation overrides (e.g. SendModal's
      // 'preserve' when user has the WalletSettings "Protect ordinals" toggle
      // on) take precedence at the call site.
      defaultOrdinalsStrategy: 'exclude',
    };
  }, [account, walletType]);

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
    const newWallet = createWalletViaClient(mnemonic, sdkNetwork);

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
    const unlockedWallet = createWalletViaClient(keystore.mnemonic, toSdkNetwork(network));

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
    const restoredWallet = createWalletViaClient(trimmedMnemonic, sdkNetwork);

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
    // Mark explicit disconnect so the devnet auto-connect effect doesn't
    // immediately re-create the boot wallet. Cleared on network change.
    userDisconnectedRef.current = true;

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
        // Xverse connection using direct request('getAccounts') - no connect() fallback
        // 2026-03-17: Removed connect() attempt - it doesn't trigger popups properly.
        // Direct request() is the working pattern (same as OYL's getAddresses()).
        const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;

        console.log('[WalletContext] Xverse: ===== CONNECTION START =====');
        if (!xverseProvider) {
          throw new Error('Xverse wallet not detected. Please install the Xverse extension.');
        }

        console.log('[WalletContext] Xverse: calling request("getAccounts") directly...');

        // DIRECT CALL - no intermediate connect() method. This triggers the popup.
        const response: any = await Promise.race([
          xverseProvider.request('getAccounts', {
            purposes: ['ordinals', 'payment'],
            message: 'Connect to Subfrost',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              'Xverse connection timed out after 30s. ' +
              'Try: (1) open/unlock your Xverse extension popup, ' +
              '(2) check chrome://extensions for Xverse errors, ' +
              '(3) try refreshing the page.'
            )), 30000)
          ),
        ]);

        console.log('[WalletContext] Xverse getAccounts response:', response);
        const accounts = response?.result || [];

        if (accounts.length === 0) {
          throw new Error(
            'Xverse connection failed — no accounts returned. ' +
            'Try refreshing the page or reconnecting your wallet.'
          );
        }

        console.log('[WalletContext] Xverse: got', accounts.length, 'accounts:', accounts);

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
        // Add 30s timeout to prevent infinite hang if user dismisses popup or extension is unresponsive
        oylConnectionCallCount++;
        console.log(`[WalletContext][OYL-CONNECT] Calling getAddresses() with 30s timeout (connection call #${oylConnectionCallCount}, signing calls: ${getOylCallCount()})...`);
        const rawAddresses = await Promise.race([
          oylProvider.getAddresses(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('OYL connection timed out after 30s. Please try again and approve the connection prompt.')),
              30000
            )
          ),
        ]);
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
    // For browser wallets — ts-sdk adapter handles tapInternalKey patching, input scripts,
    // redeemScripts, wallet-specific protocols, timeouts, and reconnection internally
    if (walletAdapter && walletType === 'browser') {
      const psbtHex = Buffer.from(psbtBase64, 'base64').toString('hex');
      console.log('[WalletContext] Signing PSBT with SDK adapter');
      const signedHex = await walletAdapter.signPsbt(psbtHex, { auto_finalized: false });
      return Buffer.from(signedHex, 'hex').toString('base64');
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
  // ARCHITECTURE NOTE (2026-03-09): All wallet-specific signing logic (Xverse signInputs
  // mapping, UniSat autoFinalized:true, OYL reconnection, PSBT patching pipeline) is now
  // handled by the ts-sdk wallet adapters in @alkanes/ts-sdk/browser-wallets/adapter.ts.
  // This function delegates to walletAdapter.signPsbt() for all browser wallets.
  // See adapter.ts: XverseAdapter, UnisatAdapter, OylAdapter, OkxAdapter, etc.
  const signTaprootPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    // For browser wallets — delegate to ts-sdk adapter which handles:
    // 1. tapInternalKey patching (dummy → user key)
    // 2. Input witnessUtxo script patching (dummy → user scripts)
    // 3. P2SH redeemScript injection (Xverse)
    // 4. Wallet-specific signing protocols (Xverse signInputs, UniSat autoFinalized, etc.)
    // 5. OYL auto-reconnection on session expiry
    // 6. 60-second timeout for all wallets
    if (walletAdapter && walletType === 'browser') {
      const walletId = browserWallet?.info?.id || 'unknown';
      console.log(`[WalletContext] Signing taproot PSBT (wallet: ${walletId})`);

      // Import bitcoinjs-lib dynamically to parse PSBT
      const bitcoin = await import('bitcoinjs-lib');
      const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin
        : network === 'signet' || network === 'testnet' ? bitcoin.networks.testnet
        : bitcoin.networks.regtest;

      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
      const detectedWallet = detectWalletId(browserWallet);

      // CRITICAL: Patch tapInternalKey on ALL taproot inputs BEFORE any wallet-specific signing.
      // The SDK builds PSBTs with a dummy wallet's tapInternalKey (from AlkanesSDKContext's walletCreate()).
      // Wallets validate tapInternalKey matches their own key before signing:
      // - Xverse: "No taproot scripts signed" error / "User rejected request to sign a psbt"
      // - UniSat: silently skips unmatched inputs → infinite loading spinner
      // Without this, taproot inputs cannot be signed by ANY browser wallet.
      const taprootPubKey = browserWalletAddresses?.taproot?.publicKey || browserWallet?.publicKey;
      if (taprootPubKey) {
        const xOnlyHex = taprootPubKey.length === 66 ? taprootPubKey.slice(2) : taprootPubKey;
        const patchedCount = patchTapInternalKeys(psbt, xOnlyHex);
        if (patchedCount > 0) {
          console.log(`[WalletContext] Patched tapInternalKey on ${patchedCount} input(s) to user x-only: ${xOnlyHex}`);
        }
      } else {
        console.warn('[WalletContext] No taproot public key available for tapInternalKey patching');
      }

      // For OYL wallet, use the robust signWithOyl from browserWalletSigning.ts
      // which has 60s timeout, expanded error detection, and auto-reconnection
      if (detectedWallet === 'oyl') {
        try {
          console.log(`[WalletContext] OYL: Using signWithOyl (${psbt.inputCount} inputs)`);

          const result = await signWithOyl(psbt, walletAdapter);
          console.log(`[WalletContext] OYL: signing succeeded (finalized: ${result.isFinalized})`);
          return result.signedPsbtBase64;
        } catch (e: any) {
          console.error(`[WalletContext] OYL signing failed:`, e?.message || e);
          throw new Error(`OYL signing failed: ${e?.message || e}`);
        }
      }

      // For Xverse wallet, use signWithXverse which uses the proper signInputs mapping
      // required by Xverse's signPsbt API
      if (detectedWallet === 'xverse') {
        try {
          const ordinalsAddress = browserWalletAddresses?.taproot?.address;
          const paymentAddress = browserWalletAddresses?.nativeSegwit?.address;

          if (!ordinalsAddress) {
            throw new Error('Xverse ordinals address not found');
          }

          console.log(`[WalletContext] Xverse: Using signWithXverse (${psbt.inputCount} inputs)`);
          console.log(`[WalletContext] Xverse: ordinalsAddr: ${ordinalsAddress}, paymentAddr: ${paymentAddress}`);

          const result = await signWithXverse(psbt, ordinalsAddress, paymentAddress, btcNetwork);
          console.log(`[WalletContext] Xverse: signing succeeded (finalized: ${result.isFinalized})`);
          return result.signedPsbtBase64;
        } catch (e: any) {
          console.error(`[WalletContext] Xverse signing failed:`, e?.message || e);
          throw new Error(`Xverse signing failed: ${e?.message || e}`);
        }
      }

      // For UniSat wallet, use signWithUnisat which calls signPsbts with
      // `autoFinalized: true`. UniSat's `autoFinalized: false` mode is buggy for
      // taproot inputs — it returns partial-sig fields that bitcoinjs-lib's
      // `finalizeAllInputs()` can't reconcile, throwing "Cannot finalize taproot
      // input #N. No tapleaf script signature provided." (bitcoinjs falls
      // through to script-path finalization because key-path metadata is
      // incomplete from UniSat's side).
      //
      // The previous fallback at the bottom of this function called the SDK
      // adapter with `auto_finalized: false`, which forwarded that flag to
      // UniSat → triggered the bug. Routing UniSat through `signWithUnisat`
      // (which passes `autoFinalized: true`) makes UniSat return a fully
      // finalized PSBT (with `finalScriptWitness` set on each input) that
      // every mutation hook can use directly.
      //
      // Source: 2026-04-28 unwrap regression with UniSat. Trace showed
      // "[WalletContext] unisat signing succeeded (988 hex chars)" hitting
      // the generic adapter path on line ~1860 instead of the UniSat-specific
      // helper. Adding this branch routes UniSat through the right helper.
      if (detectedWallet === 'unisat') {
        try {
          const unisatAddress = browserWalletAddresses?.taproot?.address || browserWallet?.address;
          if (!unisatAddress) {
            throw new Error('UniSat address not found');
          }
          console.log(`[WalletContext] UniSat: Using signWithUnisat (${psbt.inputCount} inputs, address=${unisatAddress})`);
          const result = await signWithUnisat(psbt, unisatAddress);
          console.log(`[WalletContext] UniSat: signing succeeded (finalized: ${result.isFinalized})`);
          return result.signedPsbtBase64;
        } catch (e: any) {
          console.error(`[WalletContext] UniSat signing failed:`, e?.message || e);
          throw new Error(`UniSat signing failed: ${e?.message || e}`);
        }
      }

      // For other browser wallets (OKX, Leather, Phantom, etc.), use the SDK
      // adapter directly. UniSat is handled above and avoids this path because
      // `auto_finalized: false` is broken for UniSat taproot inputs (see comment
      // on the UniSat branch).
      // IMPORTANT: Use the PATCHED psbt (with corrected tapInternalKey), not the original psbtBase64
      const patchedPsbtHex = psbt.toHex();

      try {
        const signedHex = await walletAdapter.signPsbt(patchedPsbtHex, { auto_finalized: false });
        if (!signedHex) {
          throw new Error(`${walletId} signing returned empty result`);
        }
        console.log(`[WalletContext] ${walletId} signing succeeded (${signedHex.length} hex chars)`);
        return Buffer.from(signedHex, 'hex').toString('base64');
      } catch (e: any) {
        console.error(`[WalletContext] ${walletId} signing failed:`, e?.message || e);
        throw new Error(`${walletId} signing failed: ${e?.message || e}`);
      }
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
        case 'devnet':
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

    // BIP86 path: m/86'/coinType/0'/0/N
    // coinType: 0 for mainnet, 1 for testnet/regtest
    // N: user-configurable address index (default 0). MUST match the path used
    // in `addresses` useMemo to derive the displayed taproot address — otherwise
    // the signing key won't match `tapInternalKey` in the PSBT and finalize
    // fails with "No tapleaf script signature provided".
    const coinType = network === 'mainnet' ? 0 : 1;
    const taprootPath = `m/86'/${coinType}'/0'/0/${taprootAddressIndex}`;
    const taprootChild = root.derivePath(taprootPath);

    if (!taprootChild.privateKey) {
      throw new Error('Failed to derive taproot private key');
    }

    // X-only pubkey for taproot (remove first byte which is the prefix)
    const xOnlyPubkey = taprootChild.publicKey.slice(1, 33);

    // BIP-341 key-path tweak — must be applied to the privKey directly, NOT
    // via bip32.tweak(). bip32's tweak does not negate the privKey when the
    // internal pubkey has odd y-parity, which BIP-341 requires. Without that
    // negation the resulting tweaked pubkey doesn't match the on-chain output
    // key for ~50% of all keys (Y-coordinate ambiguity), so bitcoinjs's
    // _signTaprootInput silently fails to write tapKeySig and
    // finalizeAllInputs() throws "Can not finalize taproot input #N. No
    // tapleaf script signature provided."
    //
    // If the compressed pubkey starts with 0x03 (odd y), negate the privKey
    // before applying the TapTweak. Then sign with an ECPair built from the
    // tweaked privKey so bitcoinjs gets the right pubkey for its
    // toXOnly(tweakedPubkey) === witnessUtxo.script[2..34] comparison.
    const ecc = await import('@bitcoinerlab/secp256k1');
    const ecpairModule = await import('ecpair');
    const ECPair = ecpairModule.ECPairFactory(ecc as any);

    let privKeyForTweak = taprootChild.privateKey;
    if (taprootChild.publicKey[0] === 0x03) {
      privKeyForTweak = ecc.privateNegate(privKeyForTweak);
    }
    const tapTweak = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey);
    const tweakedPriv = ecc.privateAdd(privKeyForTweak, tapTweak);
    if (!tweakedPriv) {
      throw new Error('TapTweak produced an invalid private key (overflow)');
    }
    const tweakedKeyPair = ECPair.fromPrivateKey(Buffer.from(tweakedPriv), { network: btcNetwork });

    // Parse and sign the PSBT
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

    console.log('[signTaprootPsbt] Signing', psbt.inputCount, 'inputs with taproot key');
    console.log('[signTaprootPsbt] Taproot path:', taprootPath);
    console.log('[signTaprootPsbt] X-only pubkey:', Buffer.from(xOnlyPubkey).toString('hex'));
    console.log('[signTaprootPsbt] Internal y-parity:', taprootChild.publicKey[0] === 0x03 ? 'odd (negated)' : 'even');

    // Sign each input with the tweaked taproot key
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, tweakedKeyPair);
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
      const walletId = browserWallet?.info?.id || 'unknown';
      console.log(`[WalletContext] Signing segwit PSBT (wallet: ${walletId})`);

      // For OYL wallet, use the robust signWithOyl from browserWalletSigning.ts
      // which has 60s timeout, expanded error detection, and auto-reconnection
      if (detectWalletId(browserWallet) === 'oyl') {
        try {
          // Import bitcoinjs-lib dynamically to parse PSBT
          const bitcoin = await import('bitcoinjs-lib');
          const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin
            : network === 'signet' || network === 'testnet' ? bitcoin.networks.testnet
            : bitcoin.networks.regtest;

          const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          console.log(`[WalletContext] OYL (segwit): Using signWithOyl (${psbt.inputCount} inputs)`);

          const result = await signWithOyl(psbt, walletAdapter);
          console.log(`[WalletContext] OYL (segwit): signing succeeded (finalized: ${result.isFinalized})`);
          return result.signedPsbtBase64;
        } catch (e: any) {
          console.error(`[WalletContext] OYL (segwit) signing failed:`, e?.message || e);
          throw new Error(`OYL signing failed: ${e?.message || e}`);
        }
      }

      // For UniSat, route through signWithUnisat for the same reason as the
      // taproot path: the SDK adapter's `auto_finalized: false` mode produces
      // PSBTs that bitcoinjs-lib's finalizer can't reconcile. signWithUnisat
      // uses `autoFinalized: true` and returns finalized PSBTs.
      if (detectWalletId(browserWallet) === 'unisat') {
        try {
          const bitcoin = await import('bitcoinjs-lib');
          const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin
            : network === 'signet' || network === 'testnet' ? bitcoin.networks.testnet
            : bitcoin.networks.regtest;
          const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          const unisatAddress = browserWalletAddresses?.nativeSegwit?.address
            || browserWalletAddresses?.taproot?.address
            || browserWallet?.address;
          if (!unisatAddress) {
            throw new Error('UniSat address not found');
          }
          console.log(`[WalletContext] UniSat (segwit): Using signWithUnisat (${psbt.inputCount} inputs, address=${unisatAddress})`);
          const result = await signWithUnisat(psbt, unisatAddress);
          console.log(`[WalletContext] UniSat (segwit): signing succeeded (finalized: ${result.isFinalized})`);
          return result.signedPsbtBase64;
        } catch (e: any) {
          console.error(`[WalletContext] UniSat (segwit) signing failed:`, e?.message || e);
          throw new Error(`UniSat signing failed: ${e?.message || e}`);
        }
      }

      // For other browser wallets, use the SDK adapter directly
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');

      try {
        const signedHex = await walletAdapter.signPsbt(psbtHex, { auto_finalized: false });
        if (!signedHex) {
          throw new Error(`${walletId} signing returned empty result`);
        }
        console.log(`[WalletContext] ${walletId} (segwit) signing succeeded (${signedHex.length} hex chars)`);
        return Buffer.from(signedHex, 'hex').toString('base64');
      } catch (e: any) {
        console.error(`[WalletContext] ${walletId} (segwit) signing failed:`, e?.message || e);
        throw new Error(`${walletId} signing failed: ${e?.message || e}`);
      }
    }

    // Keystore is taproot-only by policy. Native segwit derivation is intentionally
    // disabled to ensure all keystore funds live at a single (taproot) address.
    // Callers should never reach this branch — if they do, that means a code path
    // is still treating keystore as dual-address. Surface the bug rather than
    // silently producing a half-signed PSBT.
    if (walletType === 'keystore') {
      throw new Error('signSegwitPsbt called for keystore wallet — keystore is taproot-only. Use signTaprootPsbt instead.');
    }

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
        case 'devnet':
          return bitcoin.networks.regtest;
        default:
          return bitcoin.networks.bitcoin;
      }
    };

    const btcNetwork = getBitcoinNetwork();

    // Derive segwit key using BIP84 path (browser wallets that need it use SDK adapter above)
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
  }, [wallet, browserWallet, walletType, account, sdkProvider, sdkInitialized, network]);

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
      connectedWalletName: walletType === 'browser'
        ? (browserWallet?.info?.name || BROWSER_WALLETS.find(w => w.id === localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ID))?.name || 'Browser Wallet')
        : walletType === 'keystore' ? 'Keystore' : null,

      address: addresses.taproot.address || addresses.nativeSegwit.address,
      paymentAddress: addresses.nativeSegwit.address,
      publicKey: addresses.nativeSegwit.pubkey,
      addresses,
      account,
      network,
      wallet,
      txContext,

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
      txContext,
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
