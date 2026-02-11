import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { tokenDisplayMapQueryOptions } from '@/queries/market';

// Re-export the type for consumers
export type { TokenDisplay } from '@/queries/market';

export function useTokenDisplayMap(ids: string[] | undefined) {
  const { network } = useWallet();
  const { provider } = useAlkanesSDK();

  return useQuery(tokenDisplayMapQueryOptions(network, ids, provider));
}
