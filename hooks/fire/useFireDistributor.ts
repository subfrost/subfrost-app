import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_DISTRIBUTOR_OPCODES } from '@/constants';
import { fireSimulateU128 } from '@/lib/fire/simulate';

export interface FireDistributor {
  phase: string;
  totalContributed: string;
  totalClaimed: string;
}

export function useFireDistributor(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const distributorId = (config as any).FIRE_DISTRIBUTOR_ID as string | undefined;

  return useQuery({
    queryKey: ['fireDistributor', distributorId, network],
    enabled: enabled && !!distributorId && !!network,
    queryFn: async (): Promise<FireDistributor> => {
      if (!distributorId || !network) throw new Error('Config not ready');

      const [phase, totalContributed, totalClaimed] = await Promise.all([
        fireSimulateU128(network, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetPhase)),
        fireSimulateU128(network, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetTotalContributed)),
        fireSimulateU128(network, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetTotalClaimed)),
      ]);

      return { phase, totalContributed, totalClaimed };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
