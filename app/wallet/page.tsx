'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleUtxoClick = useCallback(() => {
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 1500);
  }, []);

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
    { id: 'balances' as TabView, label: 'Balances', shortLabel: 'Balances', icon: Wallet, disabled: false },
    { id: 'transactions' as TabView, label: 'Transaction History', shortLabel: 'History', icon: Activity, disabled: false },
    { id: 'utxos' as TabView, label: 'UTXO Management', shortLabel: 'UTXOs', icon: BarChart2, disabled: true },
  ];

  return (
    <div className="w-full max-w-5xl text-[color:var(--sf-text)]">
      <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-4 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <h1 className="text-2xl md:text-3xl font-bold text-[color:var(--sf-text)] mb-4 md:mb-0">Wallet Dashboard</h1>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setShowSendModal(true)}
                  className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-primary)] text-white text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
                >
                  <Send size={16} />
                  Send
                </button>
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
                >
                  <QrCode size={16} />
                  Receive
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {/* Native Segwit Address */}
              {paymentAddress && (
                <div className="flex items-center gap-3">
                  <AddressAvatar address={paymentAddress} size={24} className="shrink-0" />
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
                  <AddressAvatar address={address} size={24} className="shrink-0" />
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
          <div className="border-b border-[color:var(--sf-outline)] mb-6 relative">
            <div className="flex items-center gap-1 md:gap-2 overflow-x-auto scrollbar-hide pt-10">
              {tabs.map((tab, index) => {
                const Icon = tab.icon;
                return (
                  <div key={tab.id} className="relative shrink-0">
                    <button
                      onClick={() => tab.disabled ? handleUtxoClick() : setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 md:gap-2 px-2 md:px-4 py-3 font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-xs md:text-base ${
                        tab.disabled
                          ? 'text-[color:var(--sf-text)]/30 cursor-not-allowed'
                          : activeTab === tab.id
                            ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                            : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
                      }`}
                    >
                      <Icon size={16} className="md:w-5 md:h-5" />
                      <span className="whitespace-nowrap md:hidden">{tab.shortLabel}</span>
                      <span className="whitespace-nowrap hidden md:inline">{tab.label}</span>
                    </button>
                    {/* Coming Soon tooltip - appears directly above UTXO tab */}
                    {tab.disabled && showComingSoon && (
                      <div className="absolute left-[calc(50%+28px)] -translate-x-1/2 -top-8 px-3 py-1.5 rounded-lg bg-transparent text-[color:var(--sf-text)]/60 text-sm font-bold whitespace-nowrap z-50 pointer-events-none animate-fade-in-out">
                        Coming Soon!
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Spacer to push gear to the right */}
              <div className="flex-grow" />
              {/* Settings gear button */}
              <button
                onClick={() => setActiveTab('settings')}
                className={`p-2 md:p-2.5 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0 ${
                  activeTab === 'settings'
                    ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                    : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                }`}
                title="Settings"
              >
                <Settings size={16} className="md:w-[18px] md:h-[18px]" />
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
