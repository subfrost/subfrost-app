/**
 * Hook for fetching transaction history using WASM WebProvider
 */

import { useState, useEffect } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export interface TransactionInput {
  txid: string;
  vout: number;
  address?: string;
  amount?: number;
}

export interface TransactionOutput {
  address?: string;
  amount: number;
  scriptPubKey: string;
}

export interface EnrichedTransaction {
  txid: string;
  blockHeight?: number;
  blockTime?: number;
  confirmed: boolean;
  fee?: number;
  weight?: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  hasOpReturn: boolean;
  hasProtostones: boolean;
  isRbf: boolean;
  protostoneTraces?: any[]; // Array of alkanes execution traces
}

export function useTransactionHistory(address?: string) {
  const { provider, isInitialized, network } = useAlkanesSDK();
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !provider || !isInitialized) {
      setTransactions([]);
      return;
    }

    let cancelled = false;

    async function fetchTransactions() {
      if (!address || !provider) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log('[useTransactionHistory] Fetching transactions for:', address);

        // Use WASM provider's esplora method
        const rawTxs = await provider.esploraGetAddressTxs(address);

        if (cancelled) return;

        console.log('[useTransactionHistory] Got', rawTxs?.length || 0, 'transactions');

        // Parse the transactions
        const parsedTxs: EnrichedTransaction[] = [];

        for (const tx of (rawTxs || [])) {
          // Skip malformed transactions
          if (!tx || !tx.txid) continue;

          const vin = tx.vin || [];
          const vout = tx.vout || [];

          const enrichedTx: EnrichedTransaction = {
            txid: tx.txid,
            blockHeight: tx.status?.block_height,
            blockTime: tx.status?.block_time,
            confirmed: tx.status?.confirmed || false,
            fee: tx.fee,
            weight: tx.weight,
            inputs: vin.map((inp: any) => ({
              txid: inp.txid,
              vout: inp.vout,
              address: inp.prevout?.scriptpubkey_address || '',
              amount: inp.prevout?.value || 0,
            })),
            outputs: vout.map((out: any) => ({
              address: out.scriptpubkey_address || '',
              amount: out.value || 0,
              scriptPubKey: out.scriptpubkey || '',
            })),
            hasOpReturn: vout.some((v: any) => v.scriptpubkey_type === 'op_return'),
            hasProtostones: false, // Will be populated by trace calls if needed
            isRbf: vin.some((v: any) => v.sequence < 0xfffffffe),
            protostoneTraces: [],
          };

          parsedTxs.push(enrichedTx);
        }

        if (!cancelled) {
          setTransactions(parsedTxs);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useTransactionHistory] Failed to fetch transaction history:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTransactions();

    return () => {
      cancelled = true;
    };
  }, [address, provider, isInitialized, network]);

  return { transactions, loading, error };
}
