'use client';

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTransactionHistory, type AlkaneTraceSummary, type EnrichedTransaction } from '@/hooks/useTransactionHistory';
import { usePendingTxs } from '@/hooks/usePendingTxs';
import { RefreshCw, Zap, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useTokenDisplayMap, type TokenDisplay } from '@/hooks/useTokenDisplayMap';

export interface TransactionHistoryHandle {
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

export interface SpeedUpRequest {
  txid: string;
  hex: string;
  fee?: number;
  vsize?: number;
}

const ESPO_ALKANE_ICON_BASE = 'https://cdn.ordiscan.com/alkanes';
const ESPO_ICON_OVERRIDES: Record<string, string> = {
  '2:68479': 'https://cdn.idclub.io/alkanes/2-62083.webp',
  '32:0': 'https://i.ibb.co/CpNspq3D/btc-empty.png',
};
const ESPO_CONTRACT_NAME_OVERRIDES: Record<string, string> = {
  '4:65522': 'Oyl AMM',
};

function espoAlkaneIconUrl(id: string): string {
  const override = ESPO_ICON_OVERRIDES[id];
  if (override) return override;
  return `${ESPO_ALKANE_ICON_BASE}/${id.replace(':', '_')}`;
}

function fallbackLetter(label: string, id: string): string {
  return (label.trim().charAt(0) || id.trim().charAt(0) || '?').toUpperCase();
}

function summaryLabel(id: string, displayMap?: Record<string, TokenDisplay>): string {
  return ESPO_CONTRACT_NAME_OVERRIDES[id] || displayMap?.[id]?.name || displayMap?.[id]?.symbol || id;
}

function EspoAlkaneIcon({ id, label }: { id: string; label: string }) {
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--sf-panel-bg)] text-xs font-semibold uppercase text-[color:var(--sf-text)]">
      <span
        className="absolute inset-0 z-[2] block rounded-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${espoAlkaneIconUrl(id)}")` }}
      />
      <span className="relative z-[1]">{fallbackLetter(label, id)}</span>
    </span>
  );
}

function EspoArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z" />
    </svg>
  );
}

function EspoBendArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M232.49,160.49l-48,48a12,12,0,0,1-17-17L195,164H128A108.12,108.12,0,0,1,20,56a12,12,0,0,1,24,0,84.09,84.09,0,0,0,84,84h67l-27.52-27.51a12,12,0,0,1,17-17l48,48A12,12,0,0,1,232.49,160.49Z" />
    </svg>
  );
}

function AlkaneTraceSummaries({
  summaries,
  displayMap,
}: {
  summaries?: AlkaneTraceSummary[];
  displayMap?: Record<string, TokenDisplay>;
}) {
  const { t } = useTranslation();
  if (!summaries?.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {summaries.map((summary, index) => {
        const label = summaryLabel(summary.contractId, displayMap);
        const createdLabel = summary.createdId ? summaryLabel(summary.createdId, displayMap) : null;
        const statusClass =
          summary.status === 'success'
            ? 'text-green-400'
            : summary.status === 'failure'
              ? 'text-red-400'
              : 'text-[color:var(--sf-text)]/60';

        return (
          <div
            key={`${summary.outpoint || summary.contractId}-${index}`}
            className="grid gap-2 rounded-lg bg-[color:var(--sf-panel-bg)]/75 p-3"
          >
            <span className="text-xs font-semibold tracking-[0.01em] text-[color:var(--sf-text)]/70">
              {t('history.contractCall')}
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <EspoAlkaneIcon id={summary.contractId} label={label} />
              <span className="truncate text-sm font-semibold text-[color:var(--sf-text)]/75">
                {label}
              </span>
              <EspoArrowIcon className="shrink-0 text-[color:var(--sf-text)]/40" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-[color:var(--sf-primary)]/5 px-2 py-1 text-xs font-medium text-[color:var(--sf-text)]">
                <span>{summary.methodName}</span>
                {summary.opcode && (
                  <span className="text-[color:var(--sf-text)]/45">opcode {summary.opcode}</span>
                )}
              </span>
              {summary.createdId && createdLabel && (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[color:var(--sf-text)]/55">
                  <span>{t('history.created')}</span>
                  <EspoAlkaneIcon id={summary.createdId} label={createdLabel} />
                  <span className="truncate">{createdLabel}</span>
                </span>
              )}
            </div>
            <div className={`flex items-center gap-2 text-xs font-semibold ${statusClass}`}>
              <EspoBendArrowIcon className="shrink-0" />
              <span>{summary.statusText}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TransactionHistoryProps {
  onSpeedUpRequest?: (request: SpeedUpRequest) => void;
}

const TransactionHistory = forwardRef<TransactionHistoryHandle, TransactionHistoryProps>(function TransactionHistory({ onSpeedUpRequest }, ref) {
  const { account, network, walletType } = useWallet() as any;
  const { t } = useTranslation();

  const addresses = [
    account?.nativeSegwit?.address,
    account?.taproot?.address,
  ].filter(Boolean) as string[];

  const {
    transactions,
    loading,
    error,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
  } = useTransactionHistory(addresses);

  const summaryAlkaneIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tx of transactions) {
      for (const summary of tx.alkaneSummaries || []) {
        ids.add(summary.contractId);
        if (summary.createdId) ids.add(summary.createdId);
      }
    }
    return Array.from(ids);
  }, [transactions]);
  const { data: summaryDisplayMap } = useTokenDisplayMap(summaryAlkaneIds);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [speedUpLoadingTxid, setSpeedUpLoadingTxid] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Speed-up modal state. We index pending tx hexes by txid so a
  // click on the "Speed Up" button can hand the right hex to the
  // modal without re-querying.
  const { pendingTxs } = usePendingTxs();
  const pendingHexByTxid = new Map(pendingTxs.map((p) => [p.txid, p.hex]));

  // Infinite scroll — load next page when scrolled near bottom
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

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

  const handleSpeedUpClick = async (tx: EnrichedTransaction) => {
    setSpeedUpLoadingTxid(tx.txid);
    try {
      let hex = pendingHexByTxid.get(tx.txid);
      if (!hex) {
        const response = await fetch(
          `/api/esplora/tx/${tx.txid}/hex?network=${encodeURIComponent(network || 'mainnet')}`,
        );
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(body || `Failed to fetch tx hex (${response.status})`);
        }
        hex = (await response.text()).trim();
      }
      if (!hex) throw new Error('No transaction hex returned for speed-up');

      onSpeedUpRequest?.({
        txid: tx.txid,
        hex,
        fee: tx.fee,
        vsize: (tx as { vsize?: number }).vsize,
      });
    } catch (error) {
      console.error('[TransactionHistory] Failed to prepare speed-up tx', error);
      window.alert(error instanceof Error ? error.message : t('speedUp.failed'));
    } finally {
      setSpeedUpLoadingTxid(null);
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
      <div className="space-y-2">
        {transactions.length > 0 ? (
          <>
            {transactions.map((tx) => (
              <a
                key={tx.txid}
                href={`https://espo.sh/tx/${tx.txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer p-3"
              >
                {/* Transaction Header */}
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-sm text-[color:var(--sf-text)]">
                      {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {walletType === 'keystore' && !tx.confirmed && pendingHexByTxid.has(tx.txid) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          // Don't navigate to explorer when bumping.
                          e.preventDefault();
                          e.stopPropagation();
                          void handleSpeedUpClick(tx);
                        }}
                        disabled={speedUpLoadingTxid === tx.txid}
                        className="tx-pending-tone tx-pending-action flex items-center gap-1 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-50"
                        title="Replace this tx with a higher fee (RBF)"
                      >
                        {speedUpLoadingTxid === tx.txid ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Zap size={16} />
                        )}
                        Speed Up
                      </button>
                    )}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        tx.confirmed
                          ? 'bg-[color:var(--sf-info-green-bg)] text-[color:var(--sf-info-green-title)]'
                          : 'tx-pending-tone'
                      }`}
                    >
                      {tx.confirmed ? t('txHistory.confirmed') : t('txHistory.pending')}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-[color:var(--sf-text)]/60 mt-2">
                  {[
                    tx.blockTime ? formatDate(tx.blockTime) : (!tx.confirmed ? t('txHistory.pending') : null),
                    tx.blockHeight ? `${t('txHistory.block')} ${tx.blockHeight}` : null,
                    tx.fee ? `${t('txHistory.fee')} ${tx.fee.toLocaleString()} ${t('txHistory.sats')}` : null,
                  ].filter(Boolean).join(' • ')}
                </div>
                <AlkaneTraceSummaries summaries={tx.alkaneSummaries} displayMap={summaryDisplayMap} />
              </a>
            ))}
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="animate-spin text-[color:var(--sf-text)]/40 mr-2" size={16} />
                <span className="text-xs text-[color:var(--sf-text)]/40">{t('txHistory.loading')}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-[color:var(--sf-text)]/60">
            <div className="mb-2">{t('txHistory.noTransactions')}</div>
            <div className="text-sm text-[color:var(--sf-text)]/40">
              {t('txHistory.noActivity')}
            </div>
          </div>
        )}
        <div ref={loadMoreRef} className="h-px" />
      </div>
    </div>
  );
});

export default TransactionHistory;
