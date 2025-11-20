import type { ReactNode } from 'react';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import FloatingActions from '@/app/components/FloatingActions';
import ConnectWalletModal from '@/app/components/ConnectWalletModal';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sf-bg min-h-dvh relative flex flex-col">
      <div className="absolute inset-0 sf-watermark" aria-hidden />
      <div className="absolute inset-0 sf-snow" aria-hidden />
      <Header />
      <main className="relative flex-1">
        <div className="container relative mx-auto flex justify-center px-4 pt-8 sm:pt-12 pb-8">
          {children}
        </div>
      </main>
      <Footer />
      <FloatingActions />
      <ConnectWalletModal />
    </div>
  );
}


