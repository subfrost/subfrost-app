'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Network } from '@/utils/constants';

// Import the WASM WebProvider type
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

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

// Custom URL overrides for networks
// Subfrost networks use /v4/subfrost endpoint for both jsonrpc and data_api
// regtest-local uses local Docker environment (localhost:18888 for jsonrpc, localhost:4000 for data_api)
const NETWORK_CONFIG: Record<Network, Record<string, string> | undefined> = {
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
        const providerName = NETWORK_TO_PROVIDER[network] || 'mainnet';
        const configOverrides = NETWORK_CONFIG[network];

        // Create the WASM WebProvider
        const providerInstance = new wasm.WebProvider(providerName, configOverrides);

        console.log('[AlkanesSDK] WASM WebProvider created successfully');
        console.log('[AlkanesSDK] RPC URL:', providerInstance.sandshrew_rpc_url());

        setProvider(providerInstance);
        setIsInitialized(true);
      } catch (error) {
        console.error('[AlkanesSDK] Failed to initialize WASM provider:', error);
      }
    };

    initProvider();
  }, [network]);

  // Poll Bitcoin price every 30 seconds
  // Uses API route to avoid CORS issues with direct WASM calls
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

  // Poll fee estimates every 30 seconds
  // Uses API route to avoid CORS issues with direct WASM calls
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
      // Set fallback values if fetch fails
      if (!feeEstimates) {
        setFeeEstimates({
          fast: 25,
          medium: 10,
          slow: 2,
          lastUpdated: Date.now(),
        });
      }
    }
  };

  useEffect(() => {
    if (!isInitialized || !provider) return;

    // Initial fetch
    refreshBitcoinPrice();
    refreshFeeEstimates();

    // Poll every 30 seconds
    const priceInterval = setInterval(refreshBitcoinPrice, 30000);
    const feeInterval = setInterval(refreshFeeEstimates, 30000);

    return () => {
      clearInterval(priceInterval);
      clearInterval(feeInterval);
    };
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
