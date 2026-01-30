'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { Clock, CheckCircle, Code, RefreshCw, Zap } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function TransactionHistory() {
  const { account } = useWallet() as any;
  const { t } = useTranslation();

  // Get transaction history for both addresses
  const p2wpkhAddress = account?.nativeSegwit?.address;
  const p2trAddress = account?.taproot?.address;

  const { transactions: p2wpkhTxs, loading: p2wpkhLoading, error: p2wpkhError, refresh: refreshP2wpkh } = useTransactionHistory(p2wpkhAddress);
  const { transactions: p2trTxs, loading: p2trLoading, error: p2trError, refresh: refreshP2tr } = useTransactionHistory(p2trAddress);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Merge and dedupe transactions by txid, sort by block time (newest first)
  const transactions = [...p2wpkhTxs, ...p2trTxs]
    .filter((tx, idx, arr) => arr.findIndex(t => t.txid === tx.txid) === idx)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));

  const loading = p2wpkhLoading || p2trLoading;
  const error = p2wpkhError || p2trError;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshP2wpkh(),
        refreshP2tr(),
        new Promise(resolve => setTimeout(resolve, 500)) // minimum 500ms spin
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-[color:var(--sf-text)]/60 mr-2" size={20} />
        <div className="text-[color:var(--sf-text)]/60">{t('txHistory.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-400">{t('txHistory.error')} {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with View Mode Toggle and Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('visual')}
            className={`px-4 md:px-6 py-2 rounded-md text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
              viewMode === 'visual'
                ? 'bg-[color:var(--sf-primary)] text-white hover:shadow-lg'
                : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
            }`}
          >
            {t('txHistory.visual')}
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`px-4 md:px-6 py-2 rounded-md text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
              viewMode === 'raw'
                ? 'bg-[color:var(--sf-primary)] text-white hover:shadow-lg'
                : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
            }`}
          >
            {t('txHistory.rawJson')}
          </button>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50"
          title={t('txHistory.refresh')}
        >
          <RefreshCw size={20} className={loading || isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <a
              key={tx.txid}
              href={`https://espo.sh/tx/${tx.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl bg-[color:var(--sf-surface)]/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-primary)]/10 cursor-pointer"
            >
              {/* Transaction Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {tx.confirmed ? (
                    <CheckCircle size={20} className="text-green-400" />
                  ) : (
                    <Clock size={20} className="text-yellow-400" />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[color:var(--sf-text)]">
                      {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                    </span>
                    {tx.hasProtostones && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        <Zap size={12} />
                        {t('txHistory.alkanes')}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    tx.confirmed
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                  }`}
                >
                  {tx.confirmed ? t('txHistory.confirmed') : t('txHistory.pending')}
                </span>
              </div>
              <div className="text-xs text-[color:var(--sf-text)]/60 mt-2 ml-8">
                {tx.blockTime ? formatDate(tx.blockTime) : t('txHistory.pending')}
                {tx.blockHeight && (
                  <span className="ml-2">• {t('txHistory.block')} {tx.blockHeight}</span>
                )}
                {tx.fee && (
                  <span className="ml-2">• {t('txHistory.fee')} {tx.fee.toLocaleString()} {t('txHistory.sats')}</span>
                )}
              </div>

              {viewMode === 'raw' && (
                /* Raw JSON View */
                <div className="relative mt-4">
                  <div className="absolute top-2 right-2">
                    <Code size={16} className="text-[color:var(--sf-text)]/40" />
                  </div>
                  <div className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] overflow-x-auto text-xs text-[color:var(--sf-text)]/80 whitespace-pre">
                    {JSON.stringify(tx, null, 2)}
                  </div>
                </div>
              )}
            </a>
          ))
        ) : (
          <div className="text-center py-12 text-[color:var(--sf-text)]/60">
            <div className="mb-2">{t('txHistory.noTransactions')}</div>
            <div className="text-sm text-[color:var(--sf-text)]/40">
              {t('txHistory.noActivity')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
