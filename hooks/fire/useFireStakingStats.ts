import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';
import { fireSimulateU128 } from '@/lib/fire/simulate';

export interface FireStakingStats {
  totalStaked: string;
  currentEpoch: string;
  emissionRate: string;
}

export function useFireStakingStats(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireStakingStats', stakingId, network],
    enabled: enabled && !!stakingId && !!network,
    queryFn: async (): Promise<FireStakingStats> => {
      if (!stakingId || !network) throw new Error('Config not ready');

      const [totalStaked, currentEpoch, emissionRate] = await Promise.all([
        fireSimulateU128(network, stakingId, Number(FIRE_STAKING_OPCODES.GetTotalStaked)),
        fireSimulateU128(network, stakingId, Number(FIRE_STAKING_OPCODES.GetCurrentEpoch)),
        fireSimulateU128(network, stakingId, Number(FIRE_STAKING_OPCODES.GetEmissionRate)),
      ]);

      return { totalStaked, currentEpoch, emissionRate };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
