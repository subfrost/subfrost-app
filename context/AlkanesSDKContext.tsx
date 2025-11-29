'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AlkanesProvider, createProvider } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';
import { Network, NetworkMap } from '@/utils/constants';

interface BitcoinPrice {
  usd: number;
  lastUpdated: number;
}

interface AlkanesSDKContextType {
  provider: AlkanesProvider | null;
  isInitialized: boolean;
  bitcoinPrice: BitcoinPrice | null;
  refreshBitcoinPrice: () => Promise<void>;
}

const AlkanesSDKContext = createContext<AlkanesSDKContextType | null>(null);

interface AlkanesSDKProviderProps {
  children: ReactNode;
  network: Network;
}

export function AlkanesSDKProvider({ children, network }: AlkanesSDKProviderProps) {
  const [provider, setProvider] = useState<AlkanesProvider | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [bitcoinPrice, setBitcoinPrice] = useState<BitcoinPrice | null>(null);

  // Initialize provider based on network
  useEffect(() => {
    const initProvider = async () => {
      try {
        console.log('[AlkanesSDK] Initializing provider for network:', network);
        
        // Determine URLs based on network
        const baseUrls: Record<Network, string> = {
          mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
          testnet: 'https://testnet.subfrost.io/v4/subfrost',
          signet: 'https://signet.subfrost.io/v4/subfrost',
          regtest: 'http://localhost:18888',
          oylnet: 'https://oylnet.subfrost.io/v4/subfrost',
        };

        const dataApiUrls: Record<Network, string> = {
          mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
          testnet: 'https://testnet.subfrost.io/v4/subfrost',
          signet: 'https://signet.subfrost.io/v4/subfrost',
          regtest: 'http://localhost:3000',
          oylnet: 'https://oylnet.subfrost.io/v4/subfrost',
        };

        const networkConfig = NetworkMap[network];
        
        // Create provider - the SDK handles internal initialization
        const providerInstance = createProvider({
          url: baseUrls[network],
          network: networkConfig,
          networkType: network,
          version: 'v4',
        });

        console.log('[AlkanesSDK] Provider created successfully');
        setProvider(providerInstance);
        setIsInitialized(true);
      } catch (error) {
        console.error('[AlkanesSDK] Failed to initialize provider:', error);
      }
    };

    initProvider();
  }, [network]);

  // Poll Bitcoin price every 30 seconds
  const refreshBitcoinPrice = async () => {
    if (!provider?.dataApiUrl) return;

    try {
      const response = await fetch(`${provider.dataApiUrl}/get-bitcoin-price`);
      if (response.ok) {
        const data = await response.json();
        setBitcoinPrice({
          usd: data.usd || data.price || 0,
          lastUpdated: Date.now(),
        });
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
