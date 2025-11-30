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
  const { provider } = useAlkanesSDK();
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !provider) {
      setTransactions([]);
      return;
    }

    let cancelled = false;

    async function fetchTransactions() {
      if (!provider || !address) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Get network URLs from provider
        const sandshrewUrl = (provider as any).bitcoin?.url || (provider as any).url;
        const esploraUrl = (provider as any).esplora?.baseUrl || null;
        
        if (!sandshrewUrl) {
          throw new Error('Provider URL not configured');
        }
        
        // Dynamic import to avoid WASM loading at SSR time
        const AlkanesWasm = await import('@/ts-sdk/build/wasm/alkanes_web_sys');
        
        // Create WASM WebProvider instance
        const wasmProvider = new AlkanesWasm.WebProvider(sandshrewUrl, esploraUrl);
        
        // Fetch transaction history with runestone traces
        // This uses the complete alkanes-cli implementation: esplora address-txs --runestone-trace
        const enrichedTxs = await wasmProvider.getAddressTxsWithTraces(address, false);
        
        if (cancelled) return;

        // Parse the enriched transactions
        const parsedTxs: EnrichedTransaction[] = [];

        for (const tx of enrichedTxs as any[]) {
          const enrichedTx: EnrichedTransaction = {
            txid: tx.txid,
            blockHeight: tx.status?.block_height,
            blockTime: tx.status?.block_time,
            confirmed: tx.status?.confirmed || false,
            fee: tx.fee,
            weight: tx.weight,
            inputs: tx.vin.map((inp: any) => ({
              txid: inp.txid,
              vout: inp.vout,
              address: inp.prevout?.scriptpubkey_address || '',
              amount: inp.prevout?.value || 0,
            })),
            outputs: tx.vout.map((out: any) => ({
              address: out.scriptpubkey_address || '',
              amount: out.value,
              scriptPubKey: out.scriptpubkey || '',
            })),
            hasOpReturn: tx.vout.some((v: any) => v.scriptpubkey_type === 'op_return'),
            hasProtostones: !!tx.alkanes_traces && tx.alkanes_traces.length > 0,
            isRbf: tx.vin.some((v: any) => v.sequence < 0xfffffffe),
            // Alkanes traces are already included from WASM processing
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
  }, [address, provider]);

  return { transactions, loading, error };
}
