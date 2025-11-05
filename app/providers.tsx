'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LaserEyesProvider } from '@omnisat/lasereyes-react';
import type { Network } from '@oyl/sdk';

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
      if (!process.env.NEXT_PUBLIC_NETWORK) {
        if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
          detectedNetwork = 'signet';
        } else if (host.startsWith('oylnet.') || host.startsWith('staging-oylnet.')) {
          detectedNetwork = 'oylnet';
        } else {
          detectedNetwork = 'mainnet';
        }
      } else {
        const envNet = process.env.NEXT_PUBLIC_NETWORK as Network;
        detectedNetwork = (envNet as any) === 'regtest' ? 'mainnet' : envNet;
      }
      setNetwork(detectedNetwork);
    }
  }, []);

  if (!mounted) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalStore>
        <ModalStore>
          {/* @ts-ignore - LaserEyes expects its own network type */}
          <LaserEyesProvider config={{ network }}>
            <WalletProvider>{children}</WalletProvider>
          </LaserEyesProvider>
        </ModalStore>
      </GlobalStore>
    </QueryClientProvider>
  );
}


