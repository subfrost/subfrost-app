import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { tokenDisplayMapQueryOptions } from '@/queries/market';

// Re-export the type for consumers
export type { TokenDisplay } from '@/queries/market';

export function useTokenDisplayMap(ids: string[] | undefined) {
  const { network } = useWallet();

  return useQuery(tokenDisplayMapQueryOptions(network, ids));
}
