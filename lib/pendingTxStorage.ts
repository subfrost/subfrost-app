/**
 * pendingTxStorage — pure sessionStorage helpers for pending tx persistence.
 *
 * JOURNAL (2026-03-31): Extracted from hooks/usePendingTransactions.ts to break
 * a circular import. NotificationContext needs storePendingTx/clearPendingTx,
 * but usePendingTransactions needs useNotification from NotificationContext.
 * Keeping all in one file created:
 *   NotificationContext → usePendingTransactions → NotificationContext (circular)
 *
 * These helpers have zero React imports — safe to import from anywhere.
 *
 * JOURNAL (2026-05-01): Switched from localStorage → sessionStorage so the
 * green "submitted" toast persists across in-tab navigations and reloads but
 * is cleared when the browser/tab is closed.
 */

import type { OperationType } from '@/app/components/SwapSuccessNotification';

export const PENDING_TX_PREFIX = 'sf-pending-tx-';
// Max age: 72 hours. Txs older than this are assumed dropped/replaced.
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * Optional token metadata stored alongside a pending tx so the activity feed
 * can render meaningful from/to/amount cells before the indexer catches up.
 * Symbols and amounts are display values (e.g., "frBTC", "0.00500000").
 */
export interface PendingTxTokenInfo {
  fromSymbol?: string;
  toSymbol?: string;
  fromId?: string;
  toId?: string;
  fromAmount?: string;
  toAmount?: string;
}

export interface PendingTxRecord {
  txid: string;
  operationType: OperationType;
  stepContext?: string;
  storedAt: number;
  tokenInfo?: PendingTxTokenInfo;
}

export function storePendingTx(
  txid: string,
  operationType: OperationType,
  stepContext?: string,
  tokenInfo?: PendingTxTokenInfo,
): void {
  if (typeof window === 'undefined') return;
  const record: PendingTxRecord = {
    txid,
    operationType,
    stepContext,
    storedAt: Date.now(),
    tokenInfo,
  };
  try {
    sessionStorage.setItem(`${PENDING_TX_PREFIX}${txid}`, JSON.stringify(record));
  } catch {
    // sessionStorage quota exceeded — non-fatal
  }
}

export function clearPendingTx(txid: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${PENDING_TX_PREFIX}${txid}`);
}

export function loadAllPendingRecords(): PendingTxRecord[] {
  if (typeof window === 'undefined') return [];
  // One-time migration from the previous localStorage-based persistence:
  // drop any leftover sf-pending-tx-* keys so old toasts don't resurface
  // in new sessions.
  try {
    const oldKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PENDING_TX_PREFIX)) oldKeys.push(key);
    }
    for (const key of oldKeys) localStorage.removeItem(key);
  } catch {
    // Storage access can throw in restricted contexts — non-fatal
  }
  // Snapshot keys first — mutating sessionStorage while iterating by index
  // shifts subsequent indices and causes entries to be skipped.
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PENDING_TX_PREFIX)) keys.push(key);
  }
  const records: PendingTxRecord[] = [];
  const now = Date.now();
  for (const key of keys) {
    try {
      const record: PendingTxRecord = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      if (!record.txid) { sessionStorage.removeItem(key); continue; }
      if (now - (record.storedAt ?? 0) > MAX_AGE_MS) {
        sessionStorage.removeItem(key);
        continue;
      }
      records.push(record);
    } catch {
      sessionStorage.removeItem(key);
    }
  }
  return records;
}
