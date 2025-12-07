/**
 * React hook for futures trading functionality
 * Uses the WASM WebProvider from AlkanesSDKContext for all RPC calls
 */

import { useState, useEffect, useCallback } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import {
  getAllFutures,
  generateFuture,
  getCurrentBlockHeight,
  type FutureToken,
} from '@/lib/oyl/alkanes/futures';

export function useFutures() {
  const { provider, isInitialized, network } = useAlkanesSDK();
  const [futures, setFutures] = useState<FutureToken[]>([]);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current block height using the WASM provider
  const fetchBlockHeight = useCallback(async () => {
    if (!provider || !isInitialized) {
      console.log('[useFutures] Provider not ready, skipping block height fetch');
      return;
    }

    try {
      // Use the WASM provider's metashrew height method
      const height = await provider.metashrewHeight();
      console.log('[useFutures] Current block height:', height);
      setCurrentBlock(height);
    } catch (err) {
      console.error('[useFutures] Failed to fetch block height:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch block height');
    }
  }, [provider, isInitialized]);

  // Fetch all futures (public data, no wallet needed)
  const fetchFutures = useCallback(async () => {
    console.log('[useFutures] fetchFutures called', { provider: !!provider, currentBlock });

    if (!provider || !isInitialized || currentBlock === 0) {
      console.log('[useFutures] Skipping fetch - provider or block not ready');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[useFutures] Calling getAllFutures...');
      const fetchedFutures = await getAllFutures(provider, currentBlock);
      console.log('[useFutures] Got futures:', fetchedFutures.length);
      setFutures(fetchedFutures);
    } catch (err) {
      console.error('[useFutures] Failed to fetch futures:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch futures');
      setFutures([]);
    } finally {
      setLoading(false);
    }
  }, [provider, isInitialized, currentBlock]);

  // Generate a new future (regtest only - uses the provider's bitcoind methods)
  const handleGenerateFuture = useCallback(async () => {
    if (!provider || !isInitialized) {
      throw new Error('Provider not initialized');
    }

    // Only allow on regtest networks
    if (network !== 'regtest' && network !== 'subfrost-regtest' && network !== 'oylnet') {
      throw new Error('Generate future is only available on regtest networks');
    }

    setLoading(true);
    setError(null);

    try {
      // Use the WASM provider's bitcoind generate future method
      const result = await provider.bitcoindGenerateFuture('');
      console.log('[useFutures] Generated future:', result);

      // Refresh futures list
      await fetchBlockHeight();
      await fetchFutures();

      return result;
    } catch (err) {
      console.error('[useFutures] Failed to generate future:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate future');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [provider, isInitialized, network, fetchBlockHeight, fetchFutures]);

  // Initial load when provider is ready
  useEffect(() => {
    if (isInitialized && provider) {
      fetchBlockHeight();
    }
  }, [isInitialized, provider, fetchBlockHeight]);

  useEffect(() => {
    if (currentBlock > 0) {
      fetchFutures();
    }
  }, [currentBlock, fetchFutures]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!isInitialized || !provider) return;

    const interval = setInterval(() => {
      fetchBlockHeight();
    }, 10000);

    return () => clearInterval(interval);
  }, [isInitialized, provider, fetchBlockHeight]);

  return {
    futures,
    currentBlock,
    loading,
    error,
    refetch: fetchFutures,
    generateFuture: handleGenerateFuture,
  };
}
