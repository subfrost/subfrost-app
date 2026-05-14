/**
 * pendingTxStorage — pure localStorage helpers for pending tx persistence.
 *
 * JOURNAL (2026-03-31): Extracted from hooks/usePendingTransactions.ts to break
 * a circular import. NotificationContext needs storePendingTx/clearPendingTx,
 * but usePendingTransactions needs useNotification from NotificationContext.
 * Keeping all in one file created:
 *   NotificationContext → usePendingTransactions → NotificationContext (circular)
 *
 * These helpers have zero React imports — safe to import from anywhere.
 */

import type { OperationType } from '@/app/components/SwapSuccessNotification';

export const PENDING_TX_PREFIX = 'sf-pending-tx-';
// Max age: 72 hours. Txs older than this are assumed dropped/replaced.
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface PendingTxRecord {
  txid: string;
  operationType: OperationType;
  stepContext?: string;
  storedAt: number;
}

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
    localStorage.setItem(`${PENDING_TX_PREFIX}${txid}`, JSON.stringify(record));
  } catch {
    // localStorage quota exceeded — non-fatal
  }
}

export function clearPendingTx(txid: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${PENDING_TX_PREFIX}${txid}`);
}

export function loadAllPendingRecords(): PendingTxRecord[] {
  if (typeof window === 'undefined') return [];
  // Snapshot keys first — mutating localStorage while iterating by index
  // shifts subsequent indices and causes entries to be skipped.
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PENDING_TX_PREFIX)) keys.push(key);
  }
  const records: PendingTxRecord[] = [];
  const now = Date.now();
  for (const key of keys) {
    try {
      const record: PendingTxRecord = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!record.txid) { localStorage.removeItem(key); continue; }
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
