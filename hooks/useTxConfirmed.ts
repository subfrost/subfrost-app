'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/keys';

/**
 * Polls for transaction confirmation status via esplora_tx RPC.
 * Uses staleTime: Infinity so HeightPoller invalidates it each block.
 * Once confirmed, stops refetching (enabled: false).
 */
export function useTxConfirmed(txId: string | undefined): boolean {
  const { data: confirmed = false } = useQuery({
    queryKey: queryKeys.tx.status(txId ?? ''),
    queryFn: async () => {
      if (!txId) return false;
      const res = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'esplora_tx',
          params: [txId],
          id: 1,
        }),
      });
      const json = await res.json();
      return !!json?.result?.status?.confirmed;
    },
    enabled: !!txId,
    staleTime: Infinity,
  });

  return confirmed;
}
