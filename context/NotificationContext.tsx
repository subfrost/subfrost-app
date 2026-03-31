'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { OperationType } from '@/app/components/SwapSuccessNotification';
import { storePendingTx, clearPendingTx } from '@/hooks/usePendingTransactions';

export interface Notification {
  id: string;
  txId: string;
  operationType: OperationType;
  createdAt: number;
  /** Optional step context for multi-step flows (e.g., "1/2", "2/2") */
  stepContext?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  showNotification: (txId: string, operationType: OperationType, stepContext?: string) => void;
  dismissNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback((txId: string, operationType: OperationType, stepContext?: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    // JOURNAL (2026-03-31): Persist to localStorage so useSyncPendingTransactions
    // can re-surface the toast after navigation or page reload.
    storePendingTx(txId, operationType, stepContext);
    setNotifications((prev) => {
      // Deduplicate: don't re-add if txId already has an active notification
      // (handles the useSyncPendingTransactions re-fire on mount)
      if (prev.some((n) => n.txId === txId)) return prev;
      return [...prev, { id, txId, operationType, createdAt: Date.now(), stepContext }];
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      // Clear from localStorage when the user explicitly dismisses
      if (notif) clearPendingTx(notif.txId);
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, dismissNotification }}>
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
