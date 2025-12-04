'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';
import { AlkanesSDKProvider } from '@/context/AlkanesSDKContext';
import { ExchangeProvider } from '@/context/ExchangeContext';
import { ThemeProvider } from '@/context/ThemeContext';

// Define Network type locally
import type { Network } from '@/utils/constants';

const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

// Detect network from localStorage, hostname, or env variable
function detectNetwork(): Network {
  if (typeof window === 'undefined') return 'subfrost-regtest';

  // First check localStorage for user selection
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (stored && ['mainnet', 'testnet', 'signet', 'regtest', 'subfrost-regtest', 'oylnet'].includes(stored)) {
    return stored as Network;
  }

  // Then check hostname
  const host = window.location.host;
  if (!process.env.NEXT_PUBLIC_NETWORK) {
    if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
      return 'signet';
    } else if (host.startsWith('regtest.') || host.startsWith('staging-regtest.')) {
      return 'subfrost-regtest';
    } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
      // Default to subfrost-regtest for local development
      return 'subfrost-regtest';
    }
    return 'mainnet';
  }
  return process.env.NEXT_PUBLIC_NETWORK as Network;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [network, setNetwork] = useState<Network>('subfrost-regtest');

  // Memoize QueryClient to prevent recreation on re-renders
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 30000, // 30 seconds - prevents immediate refetch on navigation
            gcTime: 5 * 60 * 1000, // 5 minutes cache time
          },
        },
      }),
    []
  );

  // Initialize network on mount and listen for storage changes
  useEffect(() => {
    const initialNetwork = detectNetwork();
    setNetwork(initialNetwork);

    // Listen for network changes from other tabs/components
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NETWORK_STORAGE_KEY && e.newValue) {
        setNetwork(e.newValue as Network);
        // Invalidate all queries to refetch with new network
        queryClient.invalidateQueries();
      }
    };

    // Listen for custom events from same tab
    const handleNetworkChange = (e: CustomEvent) => {
      const newNetwork = e.detail as Network;
      setNetwork(newNetwork);
      // Invalidate all queries to refetch with new network
      queryClient.invalidateQueries();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('network-changed' as any, handleNetworkChange as any);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('network-changed' as any, handleNetworkChange as any);
    };
  }, [queryClient]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStore>
        <ModalStore>
          <ThemeProvider>
            <AlkanesSDKProvider network={network}>
              <WalletProvider network={network}>
                <ExchangeProvider>
                  {children}
                </ExchangeProvider>
              </WalletProvider>
            </AlkanesSDKProvider>
          </ThemeProvider>
        </ModalStore>
      </GlobalStore>
    </QueryClientProvider>
  );
}
