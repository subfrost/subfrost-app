'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';

// Define Network type locally
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet';

// Detect network once at module level to avoid re-detection on re-renders
function detectNetwork(): Network {
  if (typeof window === 'undefined') return 'mainnet';

  const host = window.location.host;
  if (!process.env.NEXT_PUBLIC_NETWORK) {
    if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
      return 'signet';
    } else if (host.startsWith('oylnet.') || host.startsWith('staging-oylnet.')) {
      return 'oylnet';
    }
    return 'mainnet';
  }
  const envNet = process.env.NEXT_PUBLIC_NETWORK as Network;
  return (envNet as any) === 'regtest' ? 'mainnet' : envNet;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

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

  // Memoize network detection - only runs once
  const network = useMemo(() => detectNetwork(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStore>
        <ModalStore>
          <WalletProvider network={network}>{children}</WalletProvider>
        </ModalStore>
      </GlobalStore>
    </QueryClientProvider>
  );
}
