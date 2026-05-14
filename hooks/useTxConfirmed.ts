'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getEsploraTx } from '@/lib/alkanes/rpc';
import { queryKeys } from '@/queries/keys';

/**
 * Polls for transaction confirmation status via SDK-mediated rpc.ts.
 * Uses staleTime: Infinity so HeightPoller invalidates it each block.
 * Once confirmed, stops refetching (enabled: false).
 */
export function useTxConfirmed(txId: string | undefined): boolean {
  const { network } = useWallet();
  const { data: confirmed = false } = useQuery({
    queryKey: queryKeys.tx.status(txId ?? ''),
    queryFn: async () => {
      if (!txId) return false;
      const tx = await getEsploraTx(network || 'mainnet', txId);
      return !!tx?.status?.confirmed;
    },
    enabled: !!txId,
    staleTime: Infinity,
  });

  return confirmed;
}
