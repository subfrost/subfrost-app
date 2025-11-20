/**
 * React hook for futures trading functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { useAlkanesWallet } from './useAlkanesWallet';
import {
  getFutures,
  generateFuture,
  getCurrentBlockHeight,
  type FutureToken,
} from '@/lib/oyl/alkanes/futures';

export function useFutures() {
  const { provider, address } = useAlkanesWallet();
  const [futures, setFutures] = useState<FutureToken[]>([]);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current block height
  const fetchBlockHeight = useCallback(async () => {
    if (!provider) return;

    try {
      const height = await getCurrentBlockHeight(provider);
      setCurrentBlock(height);
    } catch (err) {
      console.error('Failed to fetch block height:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch block height');
    }
  }, [provider]);

  // Fetch all futures for the current address
  const fetchFutures = useCallback(async () => {
    if (!provider || !address || currentBlock === 0) return;

    setLoading(true);
    setError(null);

    try {
      const fetchedFutures = await getFutures(provider, address, currentBlock);
      setFutures(fetchedFutures);
    } catch (err) {
      console.error('Failed to fetch futures:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch futures');
      setFutures([]);
    } finally {
      setLoading(false);
    }
  }, [provider, address, currentBlock]);

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
