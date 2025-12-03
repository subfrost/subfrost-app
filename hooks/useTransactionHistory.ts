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
  const { provider, network } = useAlkanesSDK();
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setTransactions([]);
      return;
    }

    let cancelled = false;

    async function fetchTransactions() {
      if (!address) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Use the API route which uses alkanes-cli
        const response = await fetch('/api/wallet/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            network: network || 'regtest',
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (cancelled) return;

        if (data.error) {
          throw new Error(data.error);
        }

        const rawTxs = data.transactions || [];

        // Parse the transactions from CLI output
        const parsedTxs: EnrichedTransaction[] = [];

        for (const tx of rawTxs) {
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
            hasProtostones: !!tx.alkanes_traces && tx.alkanes_traces.length > 0,
            isRbf: vin.some((v: any) => v.sequence < 0xfffffffe),
            protostoneTraces: tx.alkanes_traces || [],
          };

          parsedTxs.push(enrichedTx);
        }

        if (!cancelled) {
          setTransactions(parsedTxs);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch transaction history:', err);
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
  }, [address, network]);

  return { transactions, loading, error };
}
