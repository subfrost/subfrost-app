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
 */

'use client';

import { useEffect } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { useWallet } from '@/context/WalletContext';
import { getEsploraTx } from '@/lib/alkanes/rpc';
import { loadAllPendingRecords, clearPendingTx } from '@/lib/pendingTxStorage';

// Re-export storage helpers so callers only need one import
export { storePendingTx, clearPendingTx, loadAllPendingRecords } from '@/lib/pendingTxStorage';
export type { PendingTxRecord } from '@/lib/pendingTxStorage';

async function isTxConfirmed(network: string, txid: string): Promise<boolean> {
  try {
    const tx = await getEsploraTx(network, txid);
    if (tx?.status?.confirmed) return true;
    // On devnet, autoConfirm=true mines txs immediately. Esplora may return
    // null for txs already past the indexed tip — treat as confirmed so the
    // pending notification clears instead of persisting forever.
    if (network === 'devnet' && tx === null) return true;
    return false;
  } catch {
    return false;
  }
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
  const { network } = useWallet();

  useEffect(() => {
    const records = loadAllPendingRecords();
    if (records.length === 0) return;

    records.forEach((record) => {
      isTxConfirmed(network || 'mainnet', record.txid).then((confirmed) => {
        if (confirmed) {
          clearPendingTx(record.txid);
        } else {
          // Re-surface — SwapSuccessNotification polls via useTxConfirmed
          // and auto-clears (via onAutoClose → dismissNotification → clearPendingTx)
          showNotification(record.txid, record.operationType, record.stepContext);
        }
      }).catch(() => {
        // RPC unavailable — leave the record in localStorage for next mount
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount
}
