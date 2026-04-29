'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { OperationType } from '@/app/components/SwapSuccessNotification';
import { storePendingTx, clearPendingTx, type PendingTxTokenInfo } from '@/lib/pendingTxStorage';

export interface Notification {
  id: string;
  txId: string;
  operationType: OperationType;
  createdAt: number;
  /** Optional step context for multi-step flows (e.g., "1/2", "2/2") */
  stepContext?: string;
  /** Display info for activity-feed pending rows */
  tokenInfo?: PendingTxTokenInfo;
}

/**
 * A pending tx row shown in activity tables (MyWalletSwaps, TransactionHistory).
 * Lifecycle is independent of the toast — survives toast dismissal and is only
 * removed by clearPendingActivity (called when the tx confirms/expires).
 */
export interface PendingActivity {
  txId: string;
  operationType: OperationType;
  createdAt: number;
  stepContext?: string;
  tokenInfo?: PendingTxTokenInfo;
}

export interface ErrorToast {
  id: string;
  message: string;
  createdAt: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  pendingActivities: PendingActivity[];
  errorToasts: ErrorToast[];
  showNotification: (txId: string, operationType: OperationType, stepContext?: string, tokenInfo?: PendingTxTokenInfo) => void;
  showError: (message: string) => void;
  dismissNotification: (id: string) => void;
  dismissError: (id: string) => void;
  clearPendingActivity: (txId: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingActivities, setPendingActivities] = useState<PendingActivity[]>([]);
  const [errorToasts, setErrorToasts] = useState<ErrorToast[]>([]);

  const showNotification = useCallback((txId: string, operationType: OperationType, stepContext?: string, tokenInfo?: PendingTxTokenInfo) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = Date.now();
    storePendingTx(txId, operationType, stepContext, tokenInfo);
    setNotifications((prev) => {
      if (prev.some((n) => n.txId === txId)) return prev;
      return [...prev, { id, txId, operationType, createdAt, stepContext, tokenInfo }];
    });
    setPendingActivities((prev) => {
      if (prev.some((p) => p.txId === txId)) return prev;
      return [...prev, { txId, operationType, createdAt, stepContext, tokenInfo }];
    });
  }, []);

  const showError = useCallback((message: string) => {
    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setErrorToasts((prev) => [...prev, { id, message, createdAt: Date.now() }]);
  }, []);

  // Dismiss the green toast only — the pending activity row stays visible until
  // clearPendingActivity is called (when the tx confirms or its deadline lapses).
  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrorToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Remove the pending activity row + localStorage record. Also drops any
  // lingering toast for that txId. Called by usePendingActivityCleanup once
  // the tx confirms or is dropped.
  const clearPendingActivity = useCallback((txId: string) => {
    clearPendingTx(txId);
    setPendingActivities((prev) => prev.filter((p) => p.txId !== txId));
    setNotifications((prev) => prev.filter((n) => n.txId !== txId));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, pendingActivities, errorToasts, showNotification, showError, dismissNotification, dismissError, clearPendingActivity }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
