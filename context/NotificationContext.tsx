'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { OperationType } from '@/app/components/SwapSuccessNotification';
import { storePendingTx, clearPendingTx } from '@/lib/pendingTxStorage';

export interface Notification {
  id: string;
  txId: string;
  operationType: OperationType;
  createdAt: number;
  /** Optional step context for multi-step flows (e.g., "1/2", "2/2") */
  stepContext?: string;
}

export interface ErrorToast {
  id: string;
  message: string;
  createdAt: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  errorToasts: ErrorToast[];
  showNotification: (txId: string, operationType: OperationType, stepContext?: string) => void;
  showError: (message: string) => void;
  dismissNotification: (id: string) => void;
  dismissError: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const ERROR_TOAST_DURATION = 10_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [errorToasts, setErrorToasts] = useState<ErrorToast[]>([]);

  const showNotification = useCallback((txId: string, operationType: OperationType, stepContext?: string) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    storePendingTx(txId, operationType, stepContext);
    setNotifications((prev) => {
      if (prev.some((n) => n.txId === txId)) return prev;
      return [...prev, { id, txId, operationType, createdAt: Date.now(), stepContext }];
    });
  }, []);

  const showError = useCallback((message: string) => {
    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setErrorToasts((prev) => [...prev, { id, message, createdAt: Date.now() }]);
    setTimeout(() => {
      setErrorToasts((prev) => prev.filter((t) => t.id !== id));
    }, ERROR_TOAST_DURATION);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      if (notif) clearPendingTx(notif.txId);
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrorToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, errorToasts, showNotification, showError, dismissNotification, dismissError }}>
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
