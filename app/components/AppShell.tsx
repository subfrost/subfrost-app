'use client';

import { type ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import MobileBottomNav from '@/app/components/MobileBottomNav';
import DemoBanner from '@/app/components/DemoBanner';
import SplashScreen from '@/app/components/SplashScreen';
import ConnectWalletModal from '@/app/components/ConnectWalletModal';

// Keep the wallet modal mounted so SfPopup can play its close animation before
// the wallet context flips the open state off.
function ConnectWalletModalMount() {
  return <ConnectWalletModal />;
}

// JOURNAL (2026-03-31): On mount, reads all `sf-pending-tx-*` localStorage keys
// and re-fires showNotification for any txids that are still unconfirmed.
// Confirmed ones are silently pruned. This closes the navigation/reload gap
// where the pending toast would disappear but the tx was still in the mempool.
function PendingTxSync() {
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <SplashScreen />
      <Header />
      <DemoBanner />
      <main className="relative flex-1 flex flex-col min-h-0">
        <div className="relative w-full flex justify-center px-2 sm:px-4 py-3 sm:py-8 flex-1 min-h-0">
          {children}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
      <FloatingActions />
      <ConnectWalletModalMount />
      <PendingTxSync />
      {/* Spacer for mobile bottom nav (nav height + bottom gap) */}
      <div className="h-20 md:hidden" />
    </div>
  );
}
