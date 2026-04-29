/**
 * usePendingTransactions — mempool sync hook.
 *
 * JOURNAL (2026-03-31): Implements the oyl.io pattern (useSyncAllTransactions)
 * adapted to subfrost's TanStack Query + HeightPoller invalidation architecture.
 *
 * Storage helpers live in lib/pendingTxStorage.ts (no React imports) to avoid
 * a circular dependency:
 *   NotificationContext → storePendingTx → usePendingTransactions → useNotification
 *                                              → NotificationContext  ← CIRCULAR
 *
 * useSyncPendingTransactions(): mounted in AppShell once per app load.
 * On mount it reads all sf-pending-tx-* localStorage keys, checks each via
 * esplora_tx RPC, re-fires showNotification for still-pending ones, and
 * silently prunes already-confirmed ones.
 *
 * useExpirePendingActivities(): also mounted in AppShell. Polls every pending
 * activity each block (via HeightPoller invalidation). Removes activities whose
 * tx has confirmed (after a grace period so the indexer can pick it up) or has
 * been dropped from the mempool (deadline cancellation). Pending activity rows
 * persist across toast dismissal — only this cleanup hook removes them.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '@/context/NotificationContext';
import { loadAllPendingRecords, clearPendingTx } from '@/lib/pendingTxStorage';

// Re-export storage helpers so callers only need one import
export { storePendingTx, clearPendingTx, loadAllPendingRecords } from '@/lib/pendingTxStorage';
export type { PendingTxRecord } from '@/lib/pendingTxStorage';

type TxStatus = 'confirmed' | 'pending' | 'dropped';

async function fetchTxStatus(txid: string): Promise<TxStatus | null> {
  try {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'esplora_tx',
        params: [txid],
        id: 1,
      }),
    });
    const json = await res.json();
    if (json?.error) return 'dropped';
    if (!json?.result) return 'dropped';
    if (json.result?.status?.confirmed) return 'confirmed';
    return 'pending';
  } catch {
    return null;
  }
}

async function isTxConfirmed(txid: string): Promise<boolean> {
  return (await fetchTxStatus(txid)) === 'confirmed';
}

/**
 * On mount, reads all persisted pending txids from localStorage.
 * - Already confirmed → prune silently (no toast needed)
 * - Still pending     → re-fire showNotification so the toast reappears
 *
 * No-op if localStorage has no sf-pending-tx-* entries (the common case).
 */
export function useSyncPendingTransactions(): void {
  const { showNotification } = useNotification();

  useEffect(() => {
    const records = loadAllPendingRecords();
    if (records.length === 0) return;

    records.forEach((record) => {
      isTxConfirmed(record.txid).then((confirmed) => {
        if (confirmed) {
          clearPendingTx(record.txid);
        } else {
          // Re-surface — SwapSuccessNotification polls via useTxConfirmed
          // and the row also re-appears in MyWalletSwaps via pendingActivities.
          showNotification(record.txid, record.operationType, record.stepContext, record.tokenInfo);
        }
      }).catch(() => {
        // RPC unavailable — leave the record in localStorage for next mount
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount
}

// Grace period after a tx confirms before we drop the pending activity row.
// Gives the AMM indexer time to ingest it so MyWalletSwaps can render the
// confirmed row without a flicker of "no activity". A tx whose deadline lapsed
// is also "confirmed" on chain (the contract just refunded) — clearing it after
// the grace period is correct: it disappears from My Activity, and the wallet's
// TransactionHistory still shows the underlying bitcoin tx.
const CONFIRM_GRACE_MS = 30_000;

/**
 * Polls every pending activity each block (via HeightPoller invalidation of
 * the per-tx status query). Removes activities whose tx has confirmed (after
 * CONFIRM_GRACE_MS) or has been dropped from the mempool. Mounted once in
 * AppShell. Independent of toast lifecycle — dismissing the green toast does
 * NOT trigger removal here.
 */
export function useExpirePendingActivities(): void {
  const { pendingActivities, clearPendingActivity } = useNotification();
  const queryClient = useQueryClient();

  // useQueries gives us one HeightPoller-invalidated query per pending tx.
  const queries = useQueries({
    queries: pendingActivities.map((p) => ({
      queryKey: ['tx', 'status', p.txId],
      queryFn: () => fetchTxStatus(p.txId),
      enabled: true,
      staleTime: Infinity,
    })),
  });

  const confirmTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    pendingActivities.forEach((activity, idx) => {
      const status = queries[idx]?.data as TxStatus | null | undefined;
      if (!status) return;

      if (status === 'dropped') {
        clearPendingActivity(activity.txId);
        const t = confirmTimers.current.get(activity.txId);
        if (t) {
          clearTimeout(t);
          confirmTimers.current.delete(activity.txId);
        }
        return;
      }

      if (status === 'confirmed' && !confirmTimers.current.has(activity.txId)) {
        const txId = activity.txId;
        const t = setTimeout(() => {
          clearPendingActivity(txId);
          queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
          confirmTimers.current.delete(txId);
        }, CONFIRM_GRACE_MS);
        confirmTimers.current.set(txId, t);
      }
    });

    // Drop any queued timers for activities that are no longer pending.
    const presentIds = new Set(pendingActivities.map((p) => p.txId));
    for (const [txId, timer] of confirmTimers.current.entries()) {
      if (!presentIds.has(txId)) {
        clearTimeout(timer);
        confirmTimers.current.delete(txId);
      }
    }
  }, [pendingActivities, queries, clearPendingActivity, queryClient]);

  useEffect(() => {
    return () => {
      for (const t of confirmTimers.current.values()) clearTimeout(t);
      confirmTimers.current.clear();
    };
  }, []);
}
