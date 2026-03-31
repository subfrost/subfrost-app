'use client';

import { type ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import MobileBottomNav from '@/app/components/MobileBottomNav';
import DemoBanner from '@/app/components/DemoBanner';
import SplashScreen from '@/app/components/SplashScreen';
import ConnectWalletModal from '@/app/components/ConnectWalletModal';
import { useWallet } from '@/context/WalletContext';
import { useSyncPendingTransactions } from '@/hooks/usePendingTransactions';

// JOURNAL (2026-03-31): Guard ConnectWalletModal mount at the AppShell level.
// Previously the modal used `if (!isConnectModalOpen) return null` internally.
// In React 18 Strict Mode (reactStrictMode: true in next.config.mjs), components
// mount → unmount → remount during development. When the close handler called
// onConnectModalOpenChange(false) + resetForm() synchronously, React attempted
// to removeChild a node that Strict Mode had already unmounted in the first
// pass, producing:
//   "Failed to execute 'removeChild' on 'Node': The node to be removed is
//    not a child of this node."
// Fix: gate the mount here so the component is never in a partial-unmount state.
// The modal only enters the React tree when open, and exits cleanly when closed.
function ConnectWalletModalGate() {
  const { isConnectModalOpen } = useWallet();
  if (!isConnectModalOpen) return null;
  return <ConnectWalletModal />;
}

// JOURNAL (2026-03-31): On mount, reads all `sf-pending-tx-*` localStorage keys
// and re-fires showNotification for any txids that are still unconfirmed.
// Confirmed ones are silently pruned. This closes the navigation/reload gap
// where the pending toast would disappear but the tx was still in the mempool.
function PendingTxSync() {
  useSyncPendingTransactions();
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <SplashScreen />
      <div className="absolute inset-0 sf-snow" aria-hidden />
      <Header />
      <DemoBanner />
      <main className="relative flex-1 flex flex-col min-h-0">
        <div className="relative w-full flex justify-center px-4 py-8 flex-1 min-h-0">
          {children}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
      <FloatingActions />
      <ConnectWalletModalGate />
      <PendingTxSync />
      {/* Spacer for mobile bottom nav (nav height + bottom gap + breathing room) */}
      <div className="h-24 md:hidden" />
    </div>
  );
}
