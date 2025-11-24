'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NetworkType as Network } from '@alkanes/ts-sdk/types'; // Corrected import for Network

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 2 },
  },
});

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [network, setNetwork] = useState<Network>('mainnet');

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const host = window.location.host;
      let detectedNetwork: Network;
      const envNetwork = process.env.NEXT_PUBLIC_NETWORK as Network;

      if (envNetwork) {
        detectedNetwork = envNetwork === 'regtest' ? 'mainnet' : envNetwork;
      } else if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
        detectedNetwork = 'signet';
      } else if (host.startsWith('oylnet.') || host.startsWith('staging-oylnet.')) {
        detectedNetwork = 'oylnet';
      } else {
        detectedNetwork = 'mainnet';
      }
      setNetwork(detectedNetwork);
    }
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
