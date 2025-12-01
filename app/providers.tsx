'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';
import { AlkanesSDKProvider } from '@/context/AlkanesSDKContext';
import { ExchangeProvider } from '@/context/ExchangeContext';

// Define Network type locally
type Network = 'mainnet' | 'testnet' | 'signet' | 'regtest';

const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

// Get initial network (can be called during SSR with fallback)
function getInitialNetwork(): Network {
  // Check env var first (works on SSR)
  if (process.env.NEXT_PUBLIC_NETWORK) {
    return process.env.NEXT_PUBLIC_NETWORK as Network;
  }
  return 'mainnet';
}

// Detect network from localStorage, hostname, or env variable (client only)
function detectNetworkClient(): Network {
  if (typeof window === 'undefined') return getInitialNetwork();

  // First check localStorage for user selection
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (stored && ['mainnet', 'testnet', 'signet', 'regtest'].includes(stored)) {
    return stored as Network;
  }

  // Then check hostname
  const host = window.location.host;
  if (!process.env.NEXT_PUBLIC_NETWORK) {
    if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
      return 'signet';
    } else if (host.startsWith('regtest.') || host.startsWith('staging-regtest.')) {
      return 'regtest';
    }
    return 'mainnet';
  }
  return process.env.NEXT_PUBLIC_NETWORK as Network;
}

export default function Providers({ children }: { children: ReactNode }) {
  // Use ref to track if we've initialized to avoid re-running detection
  const initialized = useRef(false);
  const [network, setNetwork] = useState<Network>(getInitialNetwork);

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
    // Only run network detection once on client
    if (!initialized.current) {
      initialized.current = true;
      const clientNetwork = detectNetworkClient();
      if (clientNetwork !== network) {
        setNetwork(clientNetwork);
      }
    }

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
  }, [queryClient, network]);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStore>
        <ModalStore>
          <AlkanesSDKProvider network={network}>
            <WalletProvider network={network}>
              <ExchangeProvider>
                {children}
              </ExchangeProvider>
            </WalletProvider>
          </AlkanesSDKProvider>
        </ModalStore>
      </GlobalStore>
    </QueryClientProvider>
  );
}
