/**
 * Hook for fetching transaction history using WASM WebProvider
 * Uses getAddressTxsWithTraces for enriched data including runestone/alkanes traces
 *
 * NOTE: Trace data availability depends on backend support.
 * The trace fields (runestone, runestone_trace, alkanes_traces) will only be
 * populated if the backend supports the --runestone-trace option.
 * On regtest, traces may not be available.
 */

import { useState, useEffect } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export interface TransactionInput {
  txid: string;
  vout: number;
  address?: string;
  amount?: number;
  isCoinbase?: boolean;
}

export interface TransactionOutput {
  address?: string;
  amount: number;
  scriptPubKey: string;
  scriptPubKeyType?: string;
}

export interface AlkanesTrace {
  vout: number;
  outpoint: string;
  protostone_index: number;
  trace: any;
}

export interface RunestoneData {
  edicts?: any[];
  etching?: any;
  mint?: any;
  pointer?: number;
  protostones?: any[];
}

export interface EnrichedTransaction {
  txid: string;
  blockHeight?: number;
  blockTime?: number;
  confirmed: boolean;
  fee?: number;
  weight?: number;
  size?: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  hasOpReturn: boolean;
  hasProtostones: boolean;
  isRbf: boolean;
  isCoinbase: boolean;
  runestone?: RunestoneData;
  alkanesTraces?: AlkanesTrace[];
}

export function useTransactionHistory(address?: string, excludeCoinbase: boolean = true) {
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
        console.log('[useTransactionHistory] Fetching transactions with traces for:', address);

        // Use getAddressTxsWithTraces for enriched data including runestone/alkanes traces
        const rawTxs = await provider.getAddressTxsWithTraces(address, excludeCoinbase);

        if (cancelled) return;

        console.log('[useTransactionHistory] Got', rawTxs?.length || 0, 'transactions');

        // Helper to convert Map objects to plain objects (serde_wasm_bindgen returns Maps)
        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value, key) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        // Convert all transactions from Maps to plain objects
        const txList = (rawTxs || []).map(mapToObject);

        // Parse the transactions
        const parsedTxs: EnrichedTransaction[] = [];

        for (const tx of txList) {
          // Skip malformed transactions
          if (!tx || !tx.txid) {
            console.log('[useTransactionHistory] Skipping tx - no txid:', tx);
            continue;
          }

          const vin = tx.vin || [];
          const vout = tx.vout || [];

          // Check if this is a coinbase transaction
          const isCoinbase = vin.some((v: any) => v.is_coinbase);

          const enrichedTx: EnrichedTransaction = {
            txid: tx.txid,
            blockHeight: tx.status?.block_height,
            blockTime: tx.status?.block_time,
            confirmed: tx.status?.confirmed || false,
            fee: tx.fee,
            weight: tx.weight,
            size: tx.size,
            inputs: vin.map((inp: any) => ({
              txid: inp.txid,
              vout: inp.vout,
              address: inp.prevout?.scriptpubkey_address || '',
              amount: inp.prevout?.value || 0,
              isCoinbase: inp.is_coinbase || false,
            })),
            outputs: vout.map((out: any) => ({
              address: out.scriptpubkey_address || '',
              amount: out.value || 0,
              scriptPubKey: out.scriptpubkey || '',
              scriptPubKeyType: out.scriptpubkey_type || '',
            })),
            hasOpReturn: vout.some((v: any) => v.scriptpubkey_type === 'op_return'),
            hasProtostones: !!(tx.runestone?.protostones?.length > 0),
            isRbf: vin.some((v: any) => v.sequence < 0xfffffffe),
            isCoinbase,
            // Include enriched trace data from getAddressTxsWithTraces
            runestone: tx.runestone,
            alkanesTraces: tx.alkanes_traces || [],
          };

          parsedTxs.push(enrichedTx);
        }

        console.log('[useTransactionHistory] Parsed', parsedTxs.length, 'transactions');

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
  }, [address, provider, isInitialized, network, excludeCoinbase]);

  return { transactions, loading, error };
}
