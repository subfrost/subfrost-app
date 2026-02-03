'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface TransactionDetails {
  type: 'swap' | 'wrap' | 'unwrap' | 'addLiquidity' | 'removeLiquidity' | 'send';
  title: string;
  description?: string;
  fromAmount?: string;
  fromSymbol?: string;
  fromId?: string; // Alkane ID (e.g., "32:0" for frBTC)
  toAmount?: string;
  toSymbol?: string;
  toId?: string; // Alkane ID
  feeRate?: number;
  estimatedFee?: string;
  // For liquidity operations
  token0Amount?: string;
  token0Symbol?: string;
  token0Id?: string;
  token1Amount?: string;
  token1Symbol?: string;
  token1Id?: string;
  lpAmount?: string;
  poolName?: string;
  // For send
  recipient?: string;
  // Raw PSBT for display (hex or base64)
  psbtPreview?: string;
}

interface PendingTransaction {
  id: string;
  details: TransactionDetails;
  resolve: (approved: boolean) => void;
}

interface TransactionConfirmContextValue {
  pendingTransaction: PendingTransaction | null;
  requestConfirmation: (details: TransactionDetails) => Promise<boolean>;
  approve: () => void;
  reject: () => void;
}

const TransactionConfirmContext = createContext<TransactionConfirmContextValue | null>(null);

export function TransactionConfirmProvider({ children }: { children: ReactNode }) {
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction | null>(null);

  const requestConfirmation = useCallback((details: TransactionDetails): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setPendingTransaction({
        id,
        details,
        resolve,
      });
    });
  }, []);

  const approve = useCallback(() => {
    if (pendingTransaction) {
      pendingTransaction.resolve(true);
      setPendingTransaction(null);
    }
  }, [pendingTransaction]);

  const reject = useCallback(() => {
    if (pendingTransaction) {
      pendingTransaction.resolve(false);
      setPendingTransaction(null);
    }
  }, [pendingTransaction]);

  return (
    <TransactionConfirmContext.Provider
      value={{
        pendingTransaction,
        requestConfirmation,
        approve,
        reject,
      }}
    >
      {children}
    </TransactionConfirmContext.Provider>
  );
}

export function useTransactionConfirm() {
  const context = useContext(TransactionConfirmContext);
  if (!context) {
    throw new Error('useTransactionConfirm must be used within TransactionConfirmProvider');
  }
  return context;
}
