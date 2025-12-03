'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';

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

  // Standard hydration-safe mounting pattern
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStore>
        <ModalStore>
          <WalletProvider>{children}</WalletProvider>
        </ModalStore>
      </GlobalStore>
    </QueryClientProvider>
  );
}
