'use client';

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useNotification } from '@/context/NotificationContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { RefreshCw, Zap, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export interface TransactionHistoryHandle {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const TransactionHistory = forwardRef<TransactionHistoryHandle>(function TransactionHistory(_props, ref) {
  const { account } = useWallet() as any;
  const { pendingActivities } = useNotification();
  const { network } = useAlkanesSDK();
  const { t } = useTranslation();

  const segwitAddr: string | undefined = account?.nativeSegwit?.address;
  const taprootAddr: string | undefined = account?.taproot?.address;
  const addresses = [segwitAddr, taprootAddr].filter(Boolean) as string[];

  const {
    transactions,
    loading,
    error,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
  } = useTransactionHistory(addresses);

  // Split fetched txs into confirmed vs unconfirmed (mempool).
  const { confirmedTxs, mempoolTxsById } = useMemo(() => {
    const confirmed: typeof transactions = [];
    const mempool: Record<string, typeof transactions[0]> = {};
    for (const tx of transactions) {
      if (tx.confirmed) confirmed.push(tx);
      else mempool[tx.txid] = tx;
    }
    return { confirmedTxs: confirmed, mempoolTxsById: mempool };
  }, [transactions]);

  // All unconfirmed txids (from pending activities + espo mempool), deduped, newest first.
  // Pending activities persist independently of toast dismissal — see
  // NotificationContext.pendingActivities. Filter against confirmedTxs so a
  // pending row disappears as soon as its confirmed counterpart appears below.
  const confirmedTxidSet = useMemo(() => {
    const s = new Set<string>();
    for (const tx of confirmedTxs) s.add(tx.txid);
    return s;
  }, [confirmedTxs]);

  const pendingTxIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: { txId: string; sortKey: number }[] = [];
    for (const p of pendingActivities) {
      if (seen.has(p.txId) || confirmedTxidSet.has(p.txId)) continue;
      seen.add(p.txId);
      ordered.push({ txId: p.txId, sortKey: p.createdAt });
    }
    for (const tx of Object.values(mempoolTxsById)) {
      if (seen.has(tx.txid) || confirmedTxidSet.has(tx.txid)) continue;
      seen.add(tx.txid);
      ordered.push({ txId: tx.txid, sortKey: 0 });
    }
    return ordered.sort((a, b) => b.sortKey - a.sortKey).map((o) => o.txId);
  }, [pendingActivities, mempoolTxsById, confirmedTxidSet]);

  const [pendingFees, setPendingFees] = useState<Record<string, number>>({});
  const fetchedFeeTxIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    pendingTxIds.forEach((txId) => {
      if (mempoolTxsById[txId]?.fee != null) return;
      if (fetchedFeeTxIds.current.has(txId)) return;
      fetchedFeeTxIds.current.add(txId);
      fetch(`/api/rpc/${network}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'esplora_tx',
          params: [txId],
          id: 1,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          const fee = json?.result?.fee;
          if (typeof fee !== 'number') return;
          setPendingFees((prev) => ({ ...prev, [txId]: fee }));
        })
        .catch(() => { fetchedFeeTxIds.current.delete(txId); });
    });
  }, [pendingTxIds, mempoolTxsById, network]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll — load next page when scrolled near bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || isLoadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      loadMore();
    }
  }, [hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        new Promise(resolve => setTimeout(resolve, 500))
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

  return (
    <div>
      <div ref={scrollRef} className="space-y-2 max-h-[308px] lg:max-h-[752px] overflow-y-auto pr-1">
        {pendingTxIds.map((txId) => {
          const mempoolTx = mempoolTxsById[txId];
          const fee = mempoolTx?.fee ?? pendingFees[txId];
          const hasProtostones = mempoolTx?.hasProtostones;
          return (
            <a
              key={`pending-${txId}`}
              href={`https://espo.sh/tx/${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[color:var(--sf-text)]">
                    {txId.slice(0, 8)}...{txId.slice(-8)}
                  </span>
                  {hasProtostones && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      <Zap size={12} />
                      {t('txHistory.alkanes')}
                    </span>
                  )}
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400">
                  {t('txHistory.unconfirmed')}
                </span>
              </div>
              <div className="text-xs text-[color:var(--sf-text)]/60 mt-2">
                {[
                  `${t('txHistory.block')} ${t('txHistory.tbd')}`,
                  fee != null
                    ? `${t('txHistory.fee')} ${fee.toLocaleString()} ${t('txHistory.sats')}`
                    : null,
                ].filter(Boolean).join(' • ')}
              </div>
            </a>
          );
        })}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="animate-spin text-[color:var(--sf-text)]/60 mr-2" size={20} />
            <div className="text-[color:var(--sf-text)]/60">{t('txHistory.loading')}</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-red-400">{t('txHistory.error')} {error}</div>
          </div>
        ) : confirmedTxs.length > 0 ? (
          <>
            {confirmedTxs.map((tx) => {
              return (
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
                  {[
                    tx.blockTime ? formatDate(tx.blockTime) : (!tx.confirmed ? t('txHistory.pending') : null),
                    tx.blockHeight ? `${t('txHistory.block')} ${tx.blockHeight}` : null,
                    tx.fee ? `${t('txHistory.fee')} ${tx.fee.toLocaleString()} ${t('txHistory.sats')}` : null,
                  ].filter(Boolean).join(' • ')}
                </div>
              </a>
              );
            })}
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="animate-spin text-[color:var(--sf-text)]/40 mr-2" size={16} />
                <span className="text-xs text-[color:var(--sf-text)]/40">{t('txHistory.loading')}</span>
              </div>
            )}
          </>
        ) : pendingTxIds.length === 0 ? (
          <div className="text-center py-12 text-[color:var(--sf-text)]/60">
            <div className="mb-2">{t('txHistory.noTransactions')}</div>
            <div className="text-sm text-[color:var(--sf-text)]/40">
              {t('txHistory.noActivity')}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default TransactionHistory;
