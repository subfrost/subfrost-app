'use client';

import { useState, useEffect, useRef } from 'react';
import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';
import { useWallet } from '@/context/WalletContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import PageContent from '@/app/components/PageContent';
import BitcoinBalanceCard from './components/BitcoinBalanceCard';
import AlkanesBalancesCard, { type AlkaneBalanceFilter } from './components/AlkanesBalancesCard';
import TransactionHistory, { type TransactionHistoryHandle } from './components/TransactionHistory';
import WalletSettings from './components/WalletSettings';
import RegtestControls from './components/RegtestControls';
import ReceiveModal from './components/ReceiveModal';
import SendModal from './components/SendModal';
import { useNotification } from '@/context/NotificationContext';
import { useFuelAllocation } from '@/hooks/useFuelAllocation';

type WalletSection = AlkaneBalanceFilter | 'history';

export default function WalletDashboardPage() {
  const { connected, isConnected } = useWallet() as any;
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeSection, setActiveSection] = useState<WalletSection>(
    tabParam === 'transactions' ? 'history' : 'tokens',
  );
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(tabParam === 'settings');
  const [sendAlkane, setSendAlkane] = useState<AlkaneAsset | null>(null);
  const [txRefreshing, setTxRefreshing] = useState(false);
  const { showNotification, notifications } = useNotification();
  const fuelAllocation = useFuelAllocation();
  const pendingCount = notifications.length;
  const txHistoryRef = useRef<TransactionHistoryHandle>(null);

  useEffect(() => {
    if (tabParam === 'transactions') {
      setActiveSection('history');
    } else if (tabParam === 'settings') {
      setShowSettingsModal(true);
    }
  }, [tabParam]);

  const { isInitializing } = useWallet() as any;
  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

  useEffect(() => {
    if (!isInitializing && !walletConnected) router.push('/');
  }, [isInitializing, walletConnected, router]);

  if (isInitializing || !walletConnected) return null;

  const walletSections: WalletSection[] = [
    'tokens',
    'positions',
    'nfts',
    ...(fuelAllocation.isEligible ? (['fuel'] as const) : []),
    'history',
  ];
  const isAlkaneSection = ['tokens', 'positions', 'nfts', 'fuel'].includes(activeSection);

  return (
    <PageContent className="text-[color:var(--sf-text)]">
      <div className="mx-auto flex w-full max-w-[1204px] flex-col gap-6">
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full items-center justify-between gap-4">
            <h1 className="flex items-center gap-2 text-xl sm:text-3xl font-bold text-[color:var(--sf-text)]">
              {t('walletDash.title')}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <BitcoinBalanceCard
            onSend={() => setShowSendModal(true)}
            onReceive={() => setShowReceiveModal(true)}
            onSettings={() => setShowSettingsModal(true)}
            settingsActive={showSettingsModal}
          />

          <div className="h-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] flex flex-col">
            <div className="mb-4 flex items-center gap-3">
              <div className="sf-tab-group">
                {walletSections.map((section) => (
                  <button
                    key={section}
                    onClick={() => setActiveSection(section)}
                    className={`sf-tab-btn ${activeSection === section ? 'sf-tab-btn--active' : ''}`}
                  >
                    {section === 'tokens' ? t('balances.tabTokens')
                      : section === 'positions' ? t('balances.tabPositions')
                      : section === 'nfts' ? t('balances.tabNfts')
                      : section === 'fuel' ? t('balances.tabFuel')
                      : t('walletDash.history')}
                    {section === 'history' && pendingCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {activeSection === 'history' && (
                <div className="ml-auto">
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
                </div>
              )}
            </div>

            {isAlkaneSection && (
              <AlkanesBalancesCard
                embedded
                hideHeader
                hideTabs
                filter={activeSection as AlkaneBalanceFilter}
                onSendBitcoin={() => { setSendAlkane(null); setShowSendModal(true); }}
                onSendAlkane={(alkane) => { setSendAlkane(alkane); setShowSendModal(true); }}
              />
            )}

            {activeSection === 'history' && (
              <TransactionHistory ref={txHistoryRef} />
            )}
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
      {showSettingsModal && (
        <div className="sf-popup-overlay p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="sf-popup w-full max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
                  {t('header.settings')}
                </h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <WalletSettings />
              <RegtestControls />
            </div>
          </div>
        </div>
      )}
    </PageContent>
  );
}
