'use client';

import { lazy, Suspense, type ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import ThemeToggle from '@/app/components/ThemeToggle';

// Lazy load modal - not needed until user clicks connect
const ConnectWalletModal = lazy(() => import('@/app/components/ConnectWalletModal'));

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <div className="absolute inset-0 sf-snow" aria-hidden />
      <Header />
      <div className="absolute right-6 sm:right-10 top-[66px] z-40">
        <ThemeToggle />
      </div>
      <main className="relative flex-1 flex flex-col min-h-0">
        <div className="container relative mx-auto flex justify-center px-4 pt-8 sm:pt-12 pb-8 flex-1 min-h-0">
          {children}
        </div>
      </main>
      <Footer />
      <FloatingActions />
      <Suspense fallback={null}>
        <ConnectWalletModal />
      </Suspense>
    </div>
  );
}
