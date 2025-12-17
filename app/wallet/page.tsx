'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useRouter } from 'next/navigation';
import { Wallet, Activity, Settings, BarChart2, Send, QrCode } from 'lucide-react';
import AddressAvatar from '@/app/components/AddressAvatar';
import BalancesPanel from './components/BalancesPanel';
import UTXOManagement from './components/UTXOManagement';
import TransactionHistory from './components/TransactionHistory';
import WalletSettings from './components/WalletSettings';
import RegtestControls from './components/RegtestControls';
import ReceiveModal from './components/ReceiveModal';
import SendModal from './components/SendModal';

type TabView = 'balances' | 'utxos' | 'transactions' | 'settings';

export default function WalletDashboardPage() {
  const { connected, isConnected, address } = useWallet() as any;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabView>('balances');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

  // Redirect if not connected
  if (!walletConnected) {
    router.push('/');
    return null;
  }

  const tabs = [
    { id: 'balances' as TabView, label: 'Balances', icon: Wallet },
    { id: 'utxos' as TabView, label: 'UTXO Management', icon: BarChart2 },
    { id: 'transactions' as TabView, label: 'Transaction History', icon: Activity },
    { id: 'settings' as TabView, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-full max-w-5xl text-[color:var(--sf-text)]">
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4 sm:p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-[color:var(--sf-text)]">Wallet Dashboard</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSendModal(true)}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium flex items-center gap-2 text-sm sm:text-base"
                >
                  <Send size={18} />
                  Send
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="px-3 sm:px-4 py-2 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-primary)]/10 transition-all text-[color:var(--sf-text)] font-medium flex items-center gap-2 text-sm sm:text-base"
                >
                  <QrCode size={18} />
                  Receive
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 overflow-hidden">
              <AddressAvatar address={address} size={32} />
              <span className="text-sm sm:text-lg text-[color:var(--sf-text)]/80 truncate">{address}</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-[color:var(--sf-outline)] mb-6">
            <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 font-medium transition-colors relative text-sm sm:text-base shrink-0 ${
                      activeTab === tab.id
                        ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                        : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
                    }`}
                  >
                    <Icon size={18} className="sm:w-5 sm:h-5" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="animate-fadeIn">
            {activeTab === 'balances' && <BalancesPanel />}
            {activeTab === 'utxos' && <UTXOManagement />}
            {activeTab === 'transactions' && <TransactionHistory />}
            {activeTab === 'settings' && <WalletSettings />}
          </div>

          {/* Regtest Controls - Only show for regtest networks */}
          <RegtestControls />
        </div>

      {/* Modals */}
      <SendModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
      />
      <ReceiveModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
      />
    </div>
  );
}
