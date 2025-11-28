/**
 * React hook for futures trading functionality
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAllFutures,
  generateFuture,
  getCurrentBlockHeight,
  type FutureToken,
} from '@/lib/oyl/alkanes/futures';

// Create a simple provider for reading public blockchain data (no wallet needed)
async function createReadOnlyProvider() {
  const { AlkanesProvider } = await import('@alkanes/ts-sdk');
  const bitcoin = await import('bitcoinjs-lib');
  
  // Create provider using the AlkanesProvider class
  const provider = new AlkanesProvider({
    url: 'http://localhost:18888', // metashrew RPC
    projectId: 'regtest-local',
    network: bitcoin.networks.regtest,
    networkType: 'regtest',
  });
  
  return provider;
}

export function useFutures() {
  const [provider, setProvider] = useState<any>(null);
  const [futures, setFutures] = useState<FutureToken[]>([]);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize provider on mount (no wallet needed for viewing futures)
  useEffect(() => {
    createReadOnlyProvider()
      .then(p => {
        console.log('[useFutures] Provider initialized:', !!p);
        setProvider(p);
      })
      .catch(err => {
        console.error('[useFutures] Failed to create provider:', err);
        setError('Failed to initialize provider');
      });
  }, []);

  // Fetch current block height
  const fetchBlockHeight = useCallback(async () => {
    if (!provider) {
      console.log('[useFutures] No provider, skipping block height fetch');
      return;
    }

    try {
      const height = await getCurrentBlockHeight(provider);
      console.log('[useFutures] Current block height:', height);
      setCurrentBlock(height);
    } catch (err) {
      console.error('[useFutures] Failed to fetch block height:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch block height');
    }
  }, [provider]);

  // Fetch all futures (public data, no wallet needed)
  const fetchFutures = useCallback(async () => {
    console.log('[useFutures] fetchFutures called', { provider: !!provider, currentBlock });
    
    if (!provider || currentBlock === 0) {
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
  }, [provider, currentBlock]);

  // Generate a new future (regtest only)
  const handleGenerateFuture = useCallback(async (rpcUrl?: string) => {
    setLoading(true);
    setError(null);

    try {
      const blockHash = await generateFuture(rpcUrl);
      console.log('Generated future in block:', blockHash);
      
      // Refresh futures list
      await fetchBlockHeight();
      await fetchFutures();
      
      return blockHash;
    } catch (err) {
      console.error('Failed to generate future:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate future');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchBlockHeight, fetchFutures]);

  // Initial load
  useEffect(() => {
    fetchBlockHeight();
  }, [fetchBlockHeight]);

  useEffect(() => {
    if (currentBlock > 0) {
      fetchFutures();
    }
  }, [currentBlock, fetchFutures]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBlockHeight();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchBlockHeight]);

  return {
    futures,
    currentBlock,
    loading,
    error,
    refetch: fetchFutures,
    generateFuture: handleGenerateFuture,
  };
}
