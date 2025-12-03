'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';
import { AlkanesSDKProvider } from '@/context/AlkanesSDKContext';
import type { Network } from '@/utils/constants';

// Detect network from environment
function detectNetwork(): Network {
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK as Network | undefined;
  if (envNetwork && ['mainnet', 'testnet', 'signet', 'oylnet', 'regtest'].includes(envNetwork)) {
    return envNetwork;
  }
  // Check if running locally (regtest)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'regtest';
    }
  }
  return 'mainnet';
}

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const network = useMemo(() => detectNetwork(), []);

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

  // Standard hydration-safe mounting pattern
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AlkanesSDKProvider network={network}>
        <GlobalStore>
          <ModalStore>
            <WalletProvider>{children}</WalletProvider>
          </ModalStore>
        </GlobalStore>
      </AlkanesSDKProvider>
    </QueryClientProvider>
  );
}
