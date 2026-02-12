'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';
import { useWallet } from '@/context/WalletContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, Activity, Settings, BarChart2, Send, QrCode, Copy, Check, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import AddressAvatar from '@/app/components/AddressAvatar';
import BitcoinBalanceCard from './components/BitcoinBalanceCard';
import AlkanesBalancesCard from './components/AlkanesBalancesCard';
import BalancesPanel from './components/BalancesPanel';
import UTXOManagement from './components/UTXOManagement';
import TransactionHistory, { type TransactionHistoryHandle } from './components/TransactionHistory';
import WalletSettings from './components/WalletSettings';
import RegtestControls from './components/RegtestControls';
import ReceiveModal from './components/ReceiveModal';
import SendModal from './components/SendModal';

type TabView = 'balances' | 'utxos' | 'transactions' | 'settings';

export default function WalletDashboardPage() {
  const { connected, isConnected, isInitializing, address, paymentAddress, network } = useWallet() as any;
  const { t } = useTranslation();
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
  const [sendAlkane, setSendAlkane] = useState<AlkaneAsset | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<'segwit' | 'taproot' | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [txRefreshing, setTxRefreshing] = useState(false);
  const txHistoryRef = useRef<TransactionHistoryHandle>(null);

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

  // Wait for wallet context to finish hydrating before deciding to redirect.
  // On direct page load, isConnected starts false until localStorage/sessionStorage
  // state is restored. Without this guard, the page redirects to "/" immediately.
  if (isInitializing) {
    return null;
  }

  // Redirect if not connected (after hydration is complete)
  if (!walletConnected) {
    router.push('/');
    return null;
  }

  // Settings tab is rendered separately for responsive control
  const tabs = [
    { id: 'balances' as TabView, label: 'Other Balances', shortLabel: 'Other Balances', mobileLabel: 'Others', icon: Wallet, disabled: false },
    { id: 'transactions' as TabView, label: t('walletDash.transactionHistory'), shortLabel: t('walletDash.history'), icon: Activity, disabled: false },
    { id: 'utxos' as TabView, label: t('walletDash.utxos'), shortLabel: t('walletDash.utxos'), mobileLabel: 'UTXOs', icon: BarChart2, disabled: true },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-2 sm:px-4 lg:px-0 text-[color:var(--sf-text)]">
      <div className="flex w-full flex-col gap-6">
        {/* Page Header */}
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center justify-between gap-4">
            <h1 className="text-xl sm:text-3xl font-bold text-[color:var(--sf-text)]">
              {t('walletDash.title')}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <button
                data-testid="header-send-button"
                onClick={() => setShowSendModal(true)}
                className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-primary)] text-white text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
              >
                <Send size={16} />
                {t('walletDash.send')}
              </button>
              <button
                onClick={() => setShowReceiveModal(true)}
                className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
              >
                <QrCode size={16} />
                {t('walletDash.receive')}
              </button>
            </div>
          </div>
          {/* Addresses */}
          <div className="flex flex-col gap-2">
            {paymentAddress && (
              <div className="flex items-center gap-3">
                <AddressAvatar address={paymentAddress} size={24} className="shrink-0" />
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">{t('walletDash.nativeSegwit')}</span>
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
            {address && (
              <div className="flex items-center gap-3">
                <AddressAvatar address={address} size={24} className="shrink-0" />
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">{t('walletDash.taproot')}</span>
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

        {/* Grid: Alkanes Balances (left) | Bitcoin Balance + Tabbed Panel (right) */}
        {/* On mobile (stacked): Bitcoin Balance → Alkanes → Tabbed Panel via order classes */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Bitcoin Balance - right column on lg, first on mobile */}
          <div className="order-1 lg:order-none lg:col-start-2 lg:row-start-1">
            <BitcoinBalanceCard />
          </div>

          {/* Alkanes Balances - left column on lg, second on mobile */}
          <div className="order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2 min-h-0">
            <AlkanesBalancesCard onSendAlkane={(alkane) => { setSendAlkane(alkane); setShowSendModal(true); }} />
          </div>

          {/* Tabbed Panel - right column on lg, third on mobile */}
          <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2 min-h-0">
            <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-3 sm:p-4 lg:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
              {/* Tab Navigation — compact on lg+ since panel is half-width */}
              <div className="border-b border-[color:var(--sf-outline)] mb-4 relative">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <div key={tab.id} className="relative shrink-0">
                        <button
                          onClick={() => tab.disabled ? handleUtxoClick() : setActiveTab(tab.id)}
                          className={`flex items-center gap-1.5 px-2 py-2.5 font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-sm ${
                            tab.disabled
                              ? 'text-[color:var(--sf-text)]/30 cursor-not-allowed'
                              : activeTab === tab.id
                                ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                                : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
                          }`}
                        >
                          <Icon size={14} />
                          {tab.mobileLabel ? (
                            <>
                              <span className="whitespace-nowrap sm:hidden lg:inline">{tab.mobileLabel}</span>
                              <span className="whitespace-nowrap hidden sm:inline lg:hidden">{tab.shortLabel}</span>
                            </>
                          ) : (
                            <span className="whitespace-nowrap">{tab.shortLabel}</span>
                          )}
                        </button>
                        {tab.disabled && showComingSoon && (
                          <div className="absolute left-[calc(50%+28px)] -translate-x-1/2 -top-8 px-3 py-1.5 rounded-lg bg-transparent text-[color:var(--sf-text)]/60 text-xs font-normal whitespace-nowrap z-50 pointer-events-none animate-fade-in-out">
                            {t('walletDash.comingSoon')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex-grow" />
                  {activeTab === 'transactions' && (
                    <button
                      onClick={async () => {
                        setTxRefreshing(true);
                        await txHistoryRef.current?.refresh();
                        setTxRefreshing(false);
                      }}
                      disabled={txRefreshing}
                      className="p-2 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0 text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)] disabled:opacity-50"
                      title={t('txHistory.refresh')}
                    >
                      <RefreshCw size={14} className={txRefreshing ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`p-2 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0 ${
                      activeTab === 'settings'
                        ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                        : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                    }`}
                    title={t('header.settings')}
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="animate-fadeIn">
                {activeTab === 'balances' && <BalancesPanel />}
                {activeTab === 'utxos' && <UTXOManagement />}
                {activeTab === 'transactions' && <TransactionHistory ref={txHistoryRef} />}
                {activeTab === 'settings' && <WalletSettings />}
              </div>

              {/* Regtest Controls */}
              <RegtestControls />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SendModal
        isOpen={showSendModal}
        onClose={() => { setShowSendModal(false); setSendAlkane(null); }}
        initialAlkane={sendAlkane}
      />
      <ReceiveModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
      />
    </div>
  );
}
