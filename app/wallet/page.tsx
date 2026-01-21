'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, Activity, Settings, BarChart2, Send, QrCode, Copy, Check } from 'lucide-react';
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
  const { connected, isConnected, address, paymentAddress } = useWallet() as any;
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabView | null;
  const [activeTab, setActiveTab] = useState<TabView>(tabParam && ['balances', 'utxos', 'transactions', 'settings'].includes(tabParam) ? tabParam : 'balances');

  // Update activeTab when URL changes
  useEffect(() => {
    if (tabParam && ['balances', 'utxos', 'transactions', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<'segwit' | 'taproot' | null>(null);

  const copyToClipboard = async (text: string, type: 'segwit' | 'taproot') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(type);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

  // Redirect if not connected
  if (!walletConnected) {
    router.push('/');
    return null;
  }

  // Settings tab is rendered separately for responsive control
  const tabs = [
    { id: 'balances' as TabView, label: 'Balances', icon: Wallet },
    { id: 'utxos' as TabView, label: 'UTXO Management', icon: BarChart2 },
    { id: 'transactions' as TabView, label: 'Transaction History', icon: Activity },
  ];

  return (
    <div className="w-full max-w-5xl text-[color:var(--sf-text)]">
      <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-4 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
          {/* Header */}
          <div className="mb-8">
            {/* Mobile: Title + gear on top, Send/Receive below */}
            <div className="md:hidden">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-[color:var(--sf-text)]">Wallet Dashboard</h1>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`p-2.5 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    activeTab === 'settings'
                      ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                      : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                  }`}
                  title="Settings"
                >
                  <Settings size={18} />
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setShowSendModal(true)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] text-white font-medium flex items-center gap-2 text-sm"
                >
                  <Send size={18} />
                  Send
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="px-3 py-2 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] text-[color:var(--sf-text)] font-medium flex items-center gap-2 text-sm"
                >
                  <QrCode size={18} />
                  Receive
                </button>
              </div>
            </div>
            {/* Desktop: Title + Send/Receive on same row */}
            <div className="hidden md:flex md:items-center md:justify-between mb-4">
              <h1 className="text-3xl font-bold text-[color:var(--sf-text)]">Wallet Dashboard</h1>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setShowSendModal(true)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] text-white font-medium flex items-center gap-2 text-base"
                >
                  <Send size={18} />
                  Send
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="px-4 py-2 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] text-[color:var(--sf-text)] font-medium flex items-center gap-2 text-base"
                >
                  <QrCode size={18} />
                  Receive
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {/* Native Segwit Address */}
              {paymentAddress && (
                <div className="flex items-center gap-3">
                  <AddressAvatar address={paymentAddress} size={24} />
                  <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">Native SegWit:</span>
                  <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/80 truncate">{paymentAddress}</span>
                  <button
                    onClick={() => copyToClipboard(paymentAddress, 'segwit')}
                    className="p-1.5 rounded-md hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0"
                    title="Copy address"
                  >
                    {copiedAddress === 'segwit' ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="text-[color:var(--sf-text)]/60" />
                    )}
                  </button>
                </div>
              )}
              {/* Taproot Address */}
              {address && (
                <div className="flex items-center gap-3">
                  <AddressAvatar address={address} size={24} />
                  <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">Taproot:</span>
                  <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/80 truncate">{address}</span>
                  <button
                    onClick={() => copyToClipboard(address, 'taproot')}
                    className="p-1.5 rounded-md hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0"
                    title="Copy address"
                  >
                    {copiedAddress === 'taproot' ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className="text-[color:var(--sf-text)]/60" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-[color:var(--sf-outline)] mb-6">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none relative text-sm sm:text-base shrink-0 ${
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
              {/* Spacer to push gear to the right - desktop only */}
              <div className="hidden md:block flex-grow" />
              {/* Settings gear button - desktop only (mobile has it in header) */}
              <button
                onClick={() => setActiveTab('settings')}
                className={`hidden md:block p-2.5 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0 ${
                  activeTab === 'settings'
                    ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                    : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                }`}
                title="Settings"
              >
                <Settings size={18} />
              </button>
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
