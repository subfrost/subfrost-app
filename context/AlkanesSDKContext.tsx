'use client';

/**
 * AlkanesSDKContext - Provides WASM WebProvider for blockchain operations
 *
 * JOURNAL ENTRY (2026-01-28):
 * Added browser-aware URL configuration to bypass CORS issues. When running in browser
 * context on localhost (development), the SDK is configured to use `/api/rpc` proxy
 * instead of direct calls to regtest.subfrost.io. This is necessary because:
 *
 * 1. The WASM SDK makes direct fetch calls internally for RPC operations
 * 2. regtest.subfrost.io does not return proper CORS headers for localhost origins
 * 3. Browser fetch calls get blocked with 403 Forbidden
 *
 * The proxy route (app/api/rpc/route.ts) forwards requests server-side, bypassing CORS.
 *
 * TODO: Fix CORS headers on regtest.subfrost.io nginx/ingress config to allow
 * localhost origins, so the WASM SDK can make direct calls without proxy. Once fixed,
 * this browser detection logic can be simplified or removed.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Network } from '@/utils/constants';

// Import the WASM WebProvider type
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Check if we're running in a browser context.
 * Used to determine whether to route SDK calls through our /api/rpc proxy to
 * avoid CORS issues. The proxy is a same-origin Next.js API route, so it works
 * from any deployed origin (localhost, staging, production) without CORS.
 *
 * JOURNAL ENTRY (2026-02-06):
 * Previously only checked for localhost. Staging (staging-app.subfrost.io) hit
 * CORS errors because mainnet.subfrost.io doesn't return proper headers for
 * non-localhost origins. Extended to all browser contexts since the proxy is
 * always available at the same origin and the latency overhead is negligible.
 */
const isBrowserContext = (): boolean => {
  return typeof window !== 'undefined';
};

/**
 * Get the proxy URL for SDK calls when in browser localhost context
 * Returns the full origin + /api/rpc path
 */
const getProxyUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/rpc`;
};

interface BitcoinPrice {
  usd: number;
  lastUpdated: number;
}

interface FeeEstimates {
  slow: number;
  medium: number;
  fast: number;
  lastUpdated: number;
}

interface AlkanesSDKContextType {
  provider: WebProvider | null;
  isInitialized: boolean;
  isWalletLoaded: boolean;
  loadWallet: (mnemonic: string, passphrase?: string) => void;
  bitcoinPrice: BitcoinPrice | null;
  refreshBitcoinPrice: () => Promise<void>;
  feeEstimates: FeeEstimates | null;
  refreshFeeEstimates: () => Promise<void>;
  network: Network;
}

const AlkanesSDKContext = createContext<AlkanesSDKContextType | null>(null);

interface AlkanesSDKProviderProps {
  children: ReactNode;
  network: Network;
}

// Map network names to WebProvider preset names
const NETWORK_TO_PROVIDER: Record<Network, string> = {
  mainnet: 'mainnet',
  testnet: 'testnet',
  signet: 'signet',
  regtest: 'regtest',
  'regtest-local': 'regtest',
  oylnet: 'regtest',
  'subfrost-regtest': 'subfrost-regtest',
};

// Direct URL configurations for each network (used in production or server-side)
const DIRECT_NETWORK_CONFIG: Record<Network, Record<string, string> | undefined> = {
  mainnet: {
    jsonrpc_url: 'https://mainnet.subfrost.io/v4/subfrost',
    data_api_url: 'https://mainnet.subfrost.io/v4/subfrost',
  },
  testnet: {
    jsonrpc_url: 'https://testnet.subfrost.io/v4/subfrost',
    data_api_url: 'https://testnet.subfrost.io/v4/subfrost',
  },
  signet: {
    jsonrpc_url: 'https://signet.subfrost.io/v4/subfrost',
    data_api_url: 'https://signet.subfrost.io/v4/subfrost',
  },
  regtest: {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
  'regtest-local': {
    jsonrpc_url: 'http://localhost:18888',
    data_api_url: 'http://localhost:4000',
  },
  oylnet: {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
  'subfrost-regtest': {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
};

/**
 * Networks that should use proxy when in browser context.
 * These are remote networks whose endpoints may not return proper CORS headers.
 * regtest-local uses local Docker (localhost) which doesn't need a proxy.
 */
const NETWORKS_NEEDING_PROXY: Network[] = ['regtest', 'oylnet', 'subfrost-regtest', 'mainnet', 'testnet', 'signet'];

/**
 * Get network configuration, using proxy URL when in browser localhost context
 * for networks that have CORS issues
 */
const getNetworkConfig = (network: Network): Record<string, string> | undefined => {
  const directConfig = DIRECT_NETWORK_CONFIG[network];

  // If we're in browser and this network needs proxy, use proxy URL.
  // Network is encoded in the path (not query param) so the SDK can
  // safely append REST sub-paths like /get-alkanes-by-address without
  // breaking the URL structure.
  if (isBrowserContext() && NETWORKS_NEEDING_PROXY.includes(network)) {
    const proxyUrl = `${getProxyUrl()}/${encodeURIComponent(network)}`;
    console.log(`[AlkanesSDK] Using proxy URL for ${network}:`, proxyUrl);
    return {
      jsonrpc_url: proxyUrl,
      data_api_url: proxyUrl,
    };
  }

  return directConfig;
};

export function AlkanesSDKProvider({ children, network }: AlkanesSDKProviderProps) {
  const [provider, setProvider] = useState<WebProvider | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isWalletLoaded, setIsWalletLoaded] = useState(false);
  const [bitcoinPrice, setBitcoinPrice] = useState<BitcoinPrice | null>(null);
  const [feeEstimates, setFeeEstimates] = useState<FeeEstimates | null>(null);

  // Load wallet into provider from mnemonic
  const loadWallet = (mnemonic: string, passphrase?: string) => {
    if (!provider) {
      console.error('[AlkanesSDK] Cannot load wallet - provider not initialized');
      return;
    }

    try {
      provider.walletLoadMnemonic(mnemonic, passphrase || null);
      setIsWalletLoaded(true);
      console.log('[AlkanesSDK] Wallet loaded into provider');
    } catch (error) {
      console.error('[AlkanesSDK] Failed to load wallet:', error);
    }
  };

  // Initialize provider based on network
  useEffect(() => {
    const initProvider = async () => {
      try {
        console.log('[AlkanesSDK] Initializing WASM WebProvider for network:', network);

        // Dynamically import the WASM module
        const wasm = await import('@alkanes/ts-sdk/wasm');

        // Get provider preset name and config overrides
        // Uses proxy URL for networks with CORS issues when in browser localhost context
        const providerName = NETWORK_TO_PROVIDER[network] || 'mainnet';
        const configOverrides = getNetworkConfig(network);

        // Create the WASM WebProvider
        const providerInstance = new wasm.WebProvider(providerName, configOverrides);

        console.log('[AlkanesSDK] WASM WebProvider created successfully');
        console.log('[AlkanesSDK] RPC URL:', providerInstance.sandshrew_rpc_url());

        // Pre-load a dummy wallet so walletIsLoaded() returns true.
        // Extension wallets (Xverse, Oyl) never share their mnemonic, so
        // walletLoadMnemonic is never called for them. Without this, the SDK's
        // alkanesExecuteWithStrings rejects with "Wallet not loaded" before it
        // even attempts UTXO discovery. The dummy wallet satisfies the check;
        // real addresses are passed via fromAddresses/toAddresses options, and
        // autoConfirm:false prevents internal signing.
        // For keystore wallets, loadWallet(mnemonic) overwrites this immediately.
        try {
          providerInstance.walletCreate();
          console.log('[AlkanesSDK] Dummy wallet loaded (for extension wallet compatibility)');
        } catch (e) {
          console.warn('[AlkanesSDK] walletCreate failed (non-fatal):', e);
        }

        setProvider(providerInstance);
        setIsInitialized(true);
      } catch (error) {
        console.error('[AlkanesSDK] Failed to initialize WASM provider:', error);
      }
    };

    initProvider();
  }, [network]);

  // BTC price and fee estimates are now managed by TanStack Query (queries/market.ts)
  // and invalidated by the central HeightPoller. These context methods are kept for
  // backward compatibility but simply fetch once on init.
  const refreshBitcoinPrice = async () => {
    try {
      const response = await fetch('/api/btc-price');
      const data = await response.json();
      if (data?.usd && data.usd > 0) {
        setBitcoinPrice({
          usd: data.usd,
          lastUpdated: data.timestamp || Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch Bitcoin price:', error);
    }
  };

  const refreshFeeEstimates = async () => {
    try {
      const response = await fetch('/api/fees');
      const data = await response.json();
      if (data) {
        setFeeEstimates({
          fast: Math.max(1, data.fast || 25),
          medium: Math.max(1, data.medium || 10),
          slow: Math.max(1, data.slow || 2),
          lastUpdated: Date.now(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch fee estimates:', error);
      if (!feeEstimates) {
        setFeeEstimates({ fast: 25, medium: 10, slow: 2, lastUpdated: Date.now() });
      }
    }
  };

  // Fetch once on init — ongoing refresh is handled by HeightPoller + TanStack Query
  useEffect(() => {
    if (!isInitialized || !provider) return;
    refreshBitcoinPrice();
    refreshFeeEstimates();
  }, [isInitialized, provider]);

  const value: AlkanesSDKContextType = {
    provider,
    isInitialized,
    isWalletLoaded,
    loadWallet,
    bitcoinPrice,
    refreshBitcoinPrice,
    feeEstimates,
    refreshFeeEstimates,
    network,
  };

  return (
    <AlkanesSDKContext.Provider value={value}>
      {children}
    </AlkanesSDKContext.Provider>
  );
}

export function useAlkanesSDK() {
  const context = useContext(AlkanesSDKContext);
  if (!context) {
    throw new Error('useAlkanesSDK must be used within AlkanesSDKProvider');
  }
  return context;
}
