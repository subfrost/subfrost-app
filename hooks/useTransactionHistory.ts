import { useState, useEffect, useCallback } from 'react';

export interface TxInput {
  txid?: string;
  vout?: number;
  amount?: number;
  address?: string;
  prevout?: {
    value: number;
    scriptpubkey_address?: string;
  };
}

export interface TxOutput {
  value?: number;
  amount: number;
  address?: string;
  scriptpubkey_address?: string;
  alkanes?: any[];
}

export interface ProtostoneTrace {
  alkaneId: string;
  opcode: string;
  result?: string;
}

export interface Transaction {
  txid: string;
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
  blockHeight?: number;
  blockTime?: number;
  fee?: number;
  size?: number;
  hasProtostones?: boolean;
  protostoneTraces?: ProtostoneTrace[];
  inputs: TxInput[];
  outputs: TxOutput[];
  vin: TxInput[];
  vout: TxOutput[];
}

export function useTransactionHistory(address: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!address) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Try esplora API
      const response = await fetch(`/api/esplora/address/${address}/txs`);

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const txs = await response.json();
      setTransactions(txs || []);
    } catch (err) {
      console.error('Error fetching transaction history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions,
  };
}
