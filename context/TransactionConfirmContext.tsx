'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * One alkane balance entry on a tx input or output.
 */
export interface PlanAlkaneEntry {
  /** Alkane id "block:tx" string (e.g. "2:0" for DIESEL). */
  alkaneId: string;
  symbol?: string;
  /** Sub-units (raw bigint, no decimals applied). */
  amount: bigint;
  /** True when the value is contract-derived and may differ on confirmation
   *  (e.g. swap output amount that depends on pool reserves at submit time).
   *  UI surfaces these with an "≈" prefix and a slippage disclaimer. */
  uncertain?: boolean;
}

/**
 * One UTXO being spent.
 */
export interface PlanInput {
  txid: string;
  vout: number;
  /** sat value of this prevout. */
  valueSats: number;
  /** Address of the prevout. Undefined for foreign inputs we couldn't resolve. */
  address?: string;
  /** True when this address belongs to the connected wallet. */
  isOurs?: boolean;
  /** Alkanes carried by this prevout (will be consumed). */
  alkanes?: PlanAlkaneEntry[];
}

/**
 * One output being created. OP_RETURN outputs have address=null.
 */
export interface PlanOutput {
  /** Bech32/base58 address, or null for OP_RETURN (carrying protostones). */
  address: string | null;
  valueSats: number;
  isOpReturn?: boolean;
  isOurs?: boolean;
  /** Alkanes that will land on this output (post-protostone routing).
   *  For edict-driven txs these are exact. For cellpack-bearing txs
   *  they are best-effort estimates from the swap quote / simulator
   *  with `uncertain: true` set per entry. */
  alkanes?: PlanAlkaneEntry[];
}

/**
 * A single transaction in a (potentially multi-tx) confirmation flow.
 * Atomic flows like split-tx routing or BTC→Token wrap+swap stack two
 * plans; the modal renders them as separate cards.
 */
export interface TxPlan {
  /** Optional label — "Split (alkane sweep)", "Main (swap)", etc. */
  label?: string;
  /** Optional short summary line shown above the input/output table. */
  summary?: string;
  inputs: PlanInput[];
  outputs: PlanOutput[];
  /** Computed fee = sum(inputs) - sum(outputs). */
  feeSats: number;
  /** sat-rate, used for display only. */
  feeRateSatVb?: number;
}

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
  /**
   * Rich plan describing exactly what will happen on-chain. When supplied
   * the modal renders an input/output breakdown with per-output alkane
   * routing, per-input alkane consumption, and a multi-card view for
   * atomic flows that broadcast more than one tx.
   *
   * `plan` is additive — the modal still uses the type-specific summary
   * (`fromAmount` / `toAmount` etc.) for the headline. The plan adds the
   * "what UTXOs am I spending and what comes out" detail beneath it.
   */
  plan?: TxPlan[];
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
