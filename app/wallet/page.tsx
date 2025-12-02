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
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-white">Wallet Dashboard</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSendModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-white font-medium flex items-center gap-2"
              >
                <Send size={18} />
                Send
              </button>
              <button
                onClick={() => setShowReceiveModal(true)}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors text-white font-medium flex items-center gap-2"
              >
                <QrCode size={18} />
                Receive
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AddressAvatar address={address} size={32} />
            <span className="text-lg text-white/80">{address}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-white/10 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-white/60 hover:text-white/80'
                  }`}
                >
                  <Icon size={20} />
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
