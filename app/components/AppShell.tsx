'use client';

import { lazy, Suspense, type ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import MobileBottomNav from '@/app/components/MobileBottomNav';

// Lazy load modal - not needed until user clicks connect
const ConnectWalletModal = lazy(() => import('@/app/components/ConnectWalletModal'));

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <div className="absolute inset-0 sf-snow" aria-hidden />
      <Header />
      <main className="relative flex-1 flex flex-col min-h-0">
        <div className="container relative mx-auto flex justify-center px-4 py-8 flex-1 min-h-0">
          {children}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
      <FloatingActions />
      <Suspense fallback={null}>
        <ConnectWalletModal />
      </Suspense>
      {/* Spacer for mobile bottom nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
