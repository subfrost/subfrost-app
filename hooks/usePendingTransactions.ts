/**
 * usePendingTransactions — persistent mempool tracking.
 *
 * JOURNAL (2026-03-31): Implements the oyl.io pattern (useSyncAllTransactions)
 * adapted to subfrost's TanStack Query + HeightPoller invalidation architecture.
 *
 * Problem: showNotification() creates an in-memory Notification. Navigating away
 * clears React state — the pending tx toast vanishes and there's no way to know
 * it's still unconfirmed. On page reload, all pending context is lost.
 *
 * Solution:
 * 1. storePendingTx()  — called inside showNotification, persists txid+type to
 *    localStorage under key `sf-pending-tx-<txid>`.
 * 2. clearPendingTx()  — called when a tx confirms, removes the entry.
 * 3. useSyncPendingTransactions() — mounted in AppShell once. On mount it reads
 *    all `sf-pending-tx-*` keys from localStorage, checks each via esplora_tx
 *    RPC, re-fires showNotification for still-pending ones, and silently clears
 *    already-confirmed ones (they don't need a toast).
 *
 * HeightPoller integration: useTxConfirmed (used inside SwapSuccessNotification)
 * already re-checks on every block. storePendingTx / clearPendingTx only need to
 * handle the cross-session persistence gap.
 *
 * Storage format:
 *   key:   "sf-pending-tx-<txid>"
 *   value: JSON { txid, operationType, stepContext?, storedAt }
 */

'use client';

import { useEffect } from 'react';
import { useNotification } from '@/context/NotificationContext';
import type { OperationType } from '@/app/components/SwapSuccessNotification';

const PREFIX = 'sf-pending-tx-';
// Max age: 72 hours. Txs older than this are assumed dropped/replaced.
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface PendingTxRecord {
  txid: string;
  operationType: OperationType;
  stepContext?: string;
  storedAt: number;
}

// ---------------------------------------------------------------------------
// Storage helpers (called outside React — safe to import anywhere)
// ---------------------------------------------------------------------------

export function storePendingTx(
  txid: string,
  operationType: OperationType,
  stepContext?: string,
): void {
  if (typeof window === 'undefined') return;
  const record: PendingTxRecord = {
    txid,
    operationType,
    stepContext,
    storedAt: Date.now(),
  };
  try {
    localStorage.setItem(`${PREFIX}${txid}`, JSON.stringify(record));
  } catch {
    // localStorage quota exceeded — non-fatal
  }
}

export function clearPendingTx(txid: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${PREFIX}${txid}`);
}

export function loadAllPendingRecords(): PendingTxRecord[] {
  if (typeof window === 'undefined') return [];
  const records: PendingTxRecord[] = [];
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const record: PendingTxRecord = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!record.txid) continue;
      // Prune stale records
      if (now - (record.storedAt ?? 0) > MAX_AGE_MS) {
        localStorage.removeItem(key);
        continue;
      }
      records.push(record);
    } catch {
      localStorage.removeItem(key);
    }
  }
  return records;
}

async function isTxConfirmed(txid: string): Promise<boolean> {
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
    return !!json?.result?.status?.confirmed;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sync hook — mount in AppShell once
// ---------------------------------------------------------------------------

/**
 * On mount, reads all persisted pending txids from localStorage.
 * For each:
 *   - Already confirmed → clear from localStorage (no toast needed)
 *   - Still pending     → re-fire showNotification so the toast reappears
 *
 * This hook is a no-op if localStorage is empty (typical case after confirmation).
 */
export function useSyncPendingTransactions(): void {
  const { showNotification } = useNotification();

  useEffect(() => {
    const records = loadAllPendingRecords();
    if (records.length === 0) return;

    // Check each in parallel — don't block render
    records.forEach(async (record) => {
      const confirmed = await isTxConfirmed(record.txid);
      if (confirmed) {
        clearPendingTx(record.txid);
      } else {
        // Re-surface as a notification — SwapSuccessNotification will poll
        // via useTxConfirmed and auto-clear on confirmation
        showNotification(record.txid, record.operationType, record.stepContext);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount
}
