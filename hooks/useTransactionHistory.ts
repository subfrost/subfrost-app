/**
 * Hook for fetching paginated transaction history.
 *
 * Uses espoGetAddressTransactions (page + limit) instead of the old
 * getAddressTxsWithTraces which loaded ALL transactions at once.
 *
 * JOURNAL (2026-04-27): Rewrote from two separate useQuery calls (one per
 * address, full history each) to a single useInfiniteQuery that fetches
 * both addresses per page and merges/dedupes them. Initial load: 25 txs
 * instead of hundreds. More pages loaded on scroll.
 */

import { useMemo, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { fetchTxPage, sortByRecency, TX_PAGE_SIZE, type TxPage } from '@/queries/history';

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

/**
 * Paginated transaction history for multiple addresses (merged + deduped).
 * Uses useInfiniteQuery — call `loadMore()` to fetch the next page.
 */
export function useTransactionHistory(addresses: string[]) {
  const { provider, isInitialized, network } = useAlkanesSDK();

  const addressKey = useMemo(
    () => addresses.filter(Boolean).sort().join(','),
    [addresses],
  );

  const query = useInfiniteQuery<TxPage, Error, { pages: TxPage[] }, string[], number>({
    queryKey: ['tx-history', network, addressKey],
    enabled: addressKey.length > 0 && !!provider && isInitialized,
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    queryFn: async ({ pageParam }) => {
      if (!provider) return { transactions: [], hasMore: false };
      return fetchTxPage(
        provider,
        addresses.filter(Boolean),
        pageParam,
        TX_PAGE_SIZE,
      );
    },
  });

  // Flatten all pages into a single deduped, sorted list
  const transactions = useMemo(() => {
    if (!query.data?.pages) return [];
    const seen = new Set<string>();
    const all: EnrichedTransaction[] = [];
    for (const page of query.data.pages) {
      for (const tx of page.transactions) {
        if (!seen.has(tx.txid)) {
          seen.add(tx.txid);
          all.push(tx);
        }
      }
    }
    return all.sort(sortByRecency);
  }, [query.data?.pages]);

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    transactions,
    loading: query.isLoading,
    error: query.error
      ? (query.error instanceof Error ? query.error.message : 'Failed to fetch transactions')
      : null,
    hasMore: query.hasNextPage ?? false,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    refresh,
  };
}
