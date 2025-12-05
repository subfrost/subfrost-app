'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Network } from '@/utils/constants';

// Import the WASM WebProvider type
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

interface BitcoinPrice {
  usd: number;
  lastUpdated: number;
}

interface AlkanesSDKContextType {
  provider: WebProvider | null;
  isInitialized: boolean;
  bitcoinPrice: BitcoinPrice | null;
  refreshBitcoinPrice: () => Promise<void>;
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
  oylnet: 'regtest',
  'subfrost-regtest': 'subfrost-regtest',
};

// Custom URL overrides for networks
// Subfrost networks use /v4/subfrost endpoint for both jsonrpc and data_api
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
  const [bitcoinPrice, setBitcoinPrice] = useState<BitcoinPrice | null>(null);

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
  const refreshBitcoinPrice = async () => {
    if (!provider) return;

    try {
      const priceData = await provider.dataApiGetBitcoinPrice();
      console.log('[AlkanesSDK] Bitcoin price data:', priceData);

      if (priceData) {
        // Handle different response formats:
        // - { data: { bitcoin: { usd: number } } } (REST API format)
        // - { bitcoin: { usd: number } } (direct format)
        // - { usd: number } (simple format)
        // - Map objects from serde_wasm_bindgen
        let usdPrice = 0;

        // Convert Map to object if needed
        const data = priceData instanceof Map ? Object.fromEntries(priceData) : priceData;

        if (data?.data?.bitcoin?.usd) {
          usdPrice = data.data.bitcoin.usd;
        } else if (data?.bitcoin?.usd) {
          usdPrice = data.bitcoin.usd;
        } else if (data?.usd) {
          usdPrice = data.usd;
        } else if (data?.price) {
          usdPrice = data.price;
        }

        console.log('[AlkanesSDK] Extracted USD price:', usdPrice);

        if (usdPrice > 0) {
          setBitcoinPrice({
            usd: usdPrice,
            lastUpdated: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch Bitcoin price:', error);
    }
  };

  useEffect(() => {
    if (!isInitialized || !provider) return;

    // Initial fetch
    refreshBitcoinPrice();

    // Poll every 30 seconds
    const interval = setInterval(refreshBitcoinPrice, 30000);

    return () => clearInterval(interval);
  }, [isInitialized, provider]);

  const value: AlkanesSDKContextType = {
    provider,
    isInitialized,
    bitcoinPrice,
    refreshBitcoinPrice,
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
