'use client';

import { useState, useEffect, useRef } from 'react';
import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';
import { useWallet } from '@/context/WalletContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, Copy, Check, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import AddressAvatar from '@/app/components/AddressAvatar';
import AccountSwitcher from '@/app/components/AccountSwitcher';
import PageContent from '@/app/components/PageContent';
import BitcoinBalanceCard from './components/BitcoinBalanceCard';
import AlkanesBalancesCard from './components/AlkanesBalancesCard';
import TransactionHistory, { type TransactionHistoryHandle } from './components/TransactionHistory';
import WalletSettings from './components/WalletSettings';
import RegtestControls from './components/RegtestControls';
import ReceiveModal from './components/ReceiveModal';
import SendModal from './components/SendModal';
import { useNotification } from '@/context/NotificationContext';

type TabView = 'transactions' | 'settings';

export default function WalletDashboardPage() {
  const { connected, isConnected, address, paymentAddress, browserWallet, walletType } = useWallet() as any;
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabView | null;
  const [activeTab, setActiveTab] = useState<TabView>(tabParam && ['transactions', 'settings'].includes(tabParam) ? tabParam : 'transactions');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendAlkane, setSendAlkane] = useState<AlkaneAsset | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<'segwit' | 'taproot' | null>(null);
  const [txRefreshing, setTxRefreshing] = useState(false);
  const { showNotification, notifications } = useNotification();
  const pendingCount = notifications.length;
  const txHistoryRef = useRef<TransactionHistoryHandle>(null);

  useEffect(() => {
    if (tabParam && ['transactions', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const copyToClipboard = async (text: string, type: 'segwit' | 'taproot') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(type);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const { isInitializing } = useWallet() as any;
  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

  useEffect(() => {
    if (!isInitializing && !walletConnected) router.push('/');
  }, [isInitializing, walletConnected, router]);

  if (isInitializing || !walletConnected) return null;

  return (
    <PageContent className="text-[color:var(--sf-text)]">
      <div className="flex w-full flex-col gap-6">
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center justify-between gap-4">
            <h1 className="flex items-center gap-2 text-xl sm:text-3xl font-bold text-[color:var(--sf-text)]">
              {t('walletDash.title')}
              {walletType === 'browser' && browserWallet?.info?.icon && (
                <img src={browserWallet.info.icon} alt="" className="h-[1em] w-[1em] rounded-sm" />
              )}
            </h1>
          </div>

          <div className="flex flex-col gap-2">
            {paymentAddress && (
              <div className="flex items-center gap-3">
                <AddressAvatar address={paymentAddress} size={24} className="shrink-0" />
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">
                  {t('walletDash.nativeSegwit')}
                </span>
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/80 truncate">{paymentAddress}</span>
                <button
                  onClick={() => copyToClipboard(paymentAddress, 'segwit')}
                  className="p-1.5 rounded-md hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0"
                  title="Copy address"
                >
                  {copiedAddress === 'segwit' ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-[color:var(--sf-text)]/60" />
                  )}
                </button>
              </div>
            )}
            {address && (
              <div className="flex items-center gap-3">
                <AccountSwitcher size={24} className="shrink-0" />
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/60 whitespace-nowrap">
                  {t('walletDash.taproot')}
                </span>
                <span className="text-xs sm:text-sm text-[color:var(--sf-text)]/80 truncate">{address}</span>
                <button
                  onClick={() => copyToClipboard(address, 'taproot')}
                  className="p-1.5 rounded-md hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0"
                  title="Copy address"
                >
                  {copiedAddress === 'taproot' ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-[color:var(--sf-text)]/60" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="min-h-0 h-full">
              <AlkanesBalancesCard onSendAlkane={(alkane) => { setSendAlkane(alkane); setShowSendModal(true); }} />
            </div>
            <div className="min-h-0 h-full">
              <BitcoinBalanceCard
                onSend={() => setShowSendModal(true)}
                onReceive={() => setShowReceiveModal(true)}
              />
            </div>
          </div>

          <div className="min-h-0 w-full">
            <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-3 sm:p-4 lg:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
              <div className="border-b border-[color:var(--sf-outline)] mb-4 relative">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className={`flex items-center gap-1.5 px-2 py-2.5 font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-sm ${
                      activeTab === 'transactions'
                        ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                        : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80'
                    }`}
                  >
                    <span className="whitespace-nowrap">{t('walletDash.history')}</span>
                    {pendingCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]">
                        {pendingCount}
                      </span>
                    )}
                  </button>
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
                      <RefreshCw size={16} className={txRefreshing ? 'animate-spin' : ''} />
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
                    <Settings size={16} />
                  </button>
                </div>
              </div>

              <div className="animate-fadeIn">
                {activeTab === 'transactions' && <TransactionHistory ref={txHistoryRef} />}
                {activeTab === 'settings' && (
                  <>
                    <WalletSettings />
                    <RegtestControls />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SendModal
        isOpen={showSendModal}
        onClose={() => { setShowSendModal(false); setSendAlkane(null); }}
        initialAlkane={sendAlkane}
        onSuccess={(txid) => showNotification(txid, 'send')}
      />
      <ReceiveModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
      />
    </PageContent>
  );
}
