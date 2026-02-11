'use client';

import { type ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import MobileBottomNav from '@/app/components/MobileBottomNav';
import DemoBanner from '@/app/components/DemoBanner';
import SplashScreen from '@/app/components/SplashScreen';
import ConnectWalletModal from '@/app/components/ConnectWalletModal';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <SplashScreen />
      <div className="absolute inset-0 sf-snow" aria-hidden />
      <Header />
      <DemoBanner />
      <main className="relative flex-1 flex flex-col min-h-0">
        <div className="container relative mx-auto flex justify-center px-4 py-8 flex-1 min-h-0">
          {children}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
      <FloatingActions />
      <ConnectWalletModal />
      {/* Spacer for mobile bottom nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
