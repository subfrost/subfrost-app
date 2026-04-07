import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export interface BondInfo {
  bondId: number;
  lpAmount: string;
  fireAmount: string;
  vestStart: number;
  vestEnd: number;
  claimed: string;
}

export function useFireUserBonds(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserBonds', bondingId, account?.taproot?.address, network],
    enabled: enabled && !!bondingId && !!network && isConnected && !!account,
    queryFn: async (): Promise<{ bonds: BondInfo[]; claimableAmount: string }> => {
      // GetBondInfo(20) and GetClaimableAmount(22) require user AlkaneId encoding.
      // TODO: implement per-user bond queries.
      return { bonds: [], claimableAmount: '0' };
    },
    retry: 2,
    staleTime: 15_000,
  });
}
