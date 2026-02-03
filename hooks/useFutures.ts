/**
 * React hook for futures trading functionality
 * Uses the WASM WebProvider from AlkanesSDKContext for all RPC calls
 *
 * JOURNAL ENTRY (2026-02-02):
 * Converted from useEffect+setInterval to useQuery. Block height and futures data
 * are now managed via TanStack Query and invalidated by HeightPoller.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import {
  getAllFutures,
  type FutureToken,
} from '@/lib/oyl/alkanes/futures';
import { queryKeys } from '@/queries/keys';

export function useFutures() {
  const { provider, isInitialized, network } = useAlkanesSDK();

  // Query for block height
  const { data: currentBlock = 0 } = useQuery({
    queryKey: [...queryKeys.futures.all(network), 'blockHeight'],
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) return 0;
      return await provider.metashrewHeight();
    },
  });

  // Query for futures data (depends on currentBlock)
  const {
    data: futures = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.futures.all(network),
    enabled: isInitialized && !!provider && currentBlock > 0,
    queryFn: async () => {
      if (!provider || currentBlock === 0) return [];
      return await getAllFutures(provider, currentBlock);
    },
  });

  // Generate a new future (regtest only)
  const handleGenerateFuture = useCallback(async () => {
    if (!provider || !isInitialized) {
      throw new Error('Provider not initialized');
    }

    if (network !== 'regtest' && network !== 'subfrost-regtest' && network !== 'oylnet') {
      throw new Error('Generate future is only available on regtest networks');
    }

    const result = await provider.bitcoindGenerateFuture('');
    // Refetch after generation
    await refetch();
    return result;
  }, [provider, isInitialized, network, refetch]);

  return {
    futures,
    currentBlock,
    loading,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : 'Failed to fetch futures'
      : null,
    refetch: () => { refetch(); },
    generateFuture: handleGenerateFuture,
  };
}
