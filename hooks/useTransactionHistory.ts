/**
 * Hook for fetching transaction history using WASM WebProvider
 * Uses getAddressTxsWithTraces for enriched data including runestone/alkanes traces
 *
 * NOTE: Trace data availability depends on backend support.
 * The trace fields (runestone, runestone_trace, alkanes_traces) will only be
 * populated if the backend supports the --runestone-trace option.
 * On regtest, traces may not be available.
 *
 * JOURNAL ENTRY (2026-02-02):
 * Converted from useEffect+useState to useQuery. Data is now invalidated by HeightPoller.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { transactionHistoryQueryOptions } from '@/queries/history';

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

  const { data, isLoading, error, refetch } = useQuery(
    transactionHistoryQueryOptions(network, address, provider, isInitialized, excludeCoinbase),
  );

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    transactions: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch transactions') : null,
    refresh,
  };
}
