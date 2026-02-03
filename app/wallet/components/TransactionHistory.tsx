'use client';

import { useState, useImperativeHandle, forwardRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { RefreshCw, Zap } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export interface TransactionHistoryHandle {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const TransactionHistory = forwardRef<TransactionHistoryHandle>(function TransactionHistory(_props, ref) {
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

  useImperativeHandle(ref, () => ({
    refresh: handleRefresh,
    isRefreshing,
  }));

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
    <div>
      {/* Transactions List */}
      <div className="space-y-2 max-h-[232px] overflow-y-auto pr-1">
        {transactions.length > 0 ? (
          transactions.map((tx) => (
            <a
              key={tx.txid}
              href={`https://espo.sh/tx/${tx.txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer p-3"
            >
              {/* Transaction Header */}
              <div className="flex items-center justify-between">
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
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    tx.confirmed
                      ? 'bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] text-[color:var(--sf-info-green-title)]'
                      : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                  }`}
                >
                  {tx.confirmed ? t('txHistory.confirmed') : t('txHistory.pending')}
                </span>
              </div>
              <div className="text-xs text-[color:var(--sf-text)]/60 mt-2">
                {tx.blockTime ? formatDate(tx.blockTime) : t('txHistory.pending')}
                {tx.blockHeight && (
                  <span className="ml-2">• {t('txHistory.block')} {tx.blockHeight}</span>
                )}
                {tx.fee && (
                  <span className="ml-2">• {t('txHistory.fee')} {tx.fee.toLocaleString()} {t('txHistory.sats')}</span>
                )}
              </div>
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
});

export default TransactionHistory;
