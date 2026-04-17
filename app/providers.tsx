'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProgressProvider } from '@bprogress/next/app';

import { GlobalStore } from '@/stores/global';
import { ModalStore } from '@/stores/modals';
import { WalletProvider } from '@/context/WalletContext';
import { AlkanesSDKProvider } from '@/context/AlkanesSDKContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { TransactionConfirmProvider } from '@/context/TransactionConfirmContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { HeightPoller } from '@/queries/height';
import { DevnetProvider } from '@/context/DevnetContext';
import { DevnetBootModal, DevnetErrorModal } from '@/components/DevnetBootModal';
import { DevnetControlPanel, DevnetNetworkBanner } from '@/components/DevnetControlPanel';
import TransactionConfirmModal from '@/app/components/TransactionConfirmModal';
import GlobalNotificationArea from '@/app/components/GlobalNotificationArea';

// Define Network type locally
import type { Network } from '@/utils/constants';

const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

// Detect network from env variable, localStorage, or hostname.
// Priority: NEXT_PUBLIC_NETWORK env var > localStorage > hostname > mainnet default.
// When NEXT_PUBLIC_NETWORK is set (e.g. regtest-local in .env.local), it always wins —
// localStorage cannot override it. This prevents a stale 'devnet' entry in localStorage
// from hijacking the configured network on startup.
function detectNetwork(): Network {
  if (typeof window === 'undefined') return 'mainnet';

  // Env var takes highest priority — set in .env.local for local dev
  if (process.env.NEXT_PUBLIC_NETWORK) {
    return process.env.NEXT_PUBLIC_NETWORK as Network;
  }

  // Then check localStorage for user selection (only when no env override)
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (stored && ['mainnet', 'testnet', 'signet', 'regtest', 'regtest-local', 'subfrost-regtest', 'oylnet', 'devnet'].includes(stored)) {
    return stored as Network;
  }

  // Then check hostname
  const host = window.location.host;
  if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
    return 'signet';
  } else if (host.startsWith('regtest.') || host.startsWith('staging-regtest.')) {
    return 'subfrost-regtest';
  }

  return 'mainnet';
}

export default function Providers({ children }: { children: ReactNode }) {
  // Initialize network synchronously from the env var so we never start with
  // 'mainnet' and immediately re-init the WASM provider on the next tick.
  // When NEXT_PUBLIC_NETWORK is set (e.g. regtest-local in .env.local) this
  // resolves at module parse time — no double-init, no extra splash wait.
  const [network, setNetwork] = useState<Network>(
    (process.env.NEXT_PUBLIC_NETWORK as Network) || 'mainnet'
  );

  // Memoize QueryClient to prevent recreation on re-renders
  // All queries use staleTime: Infinity and never self-refresh.
  // The HeightPoller component is the SINGLE source of invalidation.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            refetchInterval: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            retry: 2,
            gcTime: 5 * 60 * 1000, // 5 minutes cache time
          },
        },
      }),
    []
  );

  // On mount, re-run detectNetwork (which can read localStorage) and update only
  // if the result differs from the synchronous env-var init — avoids a redundant
  // WASM re-init when NEXT_PUBLIC_NETWORK is set and matches.
  useEffect(() => {
    const initialNetwork = detectNetwork();
    setNetwork(prev => prev !== initialNetwork ? initialNetwork : prev);

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

  return (
    <ProgressProvider
      height="1px"
      color="#00E5FF"
      options={{ showSpinner: false }}
      shallowRouting
    >
      <QueryClientProvider client={queryClient}>
        <GlobalStore>
          <ModalStore>
            <ThemeProvider>
              <LanguageProvider>
                <AlkanesSDKProvider network={network}>
                  <DevnetProvider network={network}>
                    <HeightPoller network={network} />
                    <WalletProvider network={network}>
                      <TransactionConfirmProvider>
                        <NotificationProvider>
                          <DevnetNetworkBanner />
                          {children}
                          <DevnetBootModal />
                          <DevnetErrorModal />
                          <DevnetControlPanel />
                          <TransactionConfirmModal />
                          <GlobalNotificationArea />
                        </NotificationProvider>
                      </TransactionConfirmProvider>
                    </WalletProvider>
                  </DevnetProvider>
                </AlkanesSDKProvider>
              </LanguageProvider>
            </ThemeProvider>
          </ModalStore>
        </GlobalStore>
      </QueryClientProvider>
    </ProgressProvider>
  );
}
