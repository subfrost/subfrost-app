import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_TREASURY_OPCODES } from '@/constants';
import { fireSimulateU128 } from '@/lib/fire/simulate';

export interface FireTreasury {
  allocations: string;
  teamVested: string;
  totalBacking: string;
  redemptionRate: string;
}

export function useFireTreasury(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const treasuryId = (config as any).FIRE_TREASURY_ID as string | undefined;

  return useQuery({
    queryKey: ['fireTreasury', treasuryId, network],
    enabled: enabled && !!treasuryId && !!network,
    queryFn: async (): Promise<FireTreasury> => {
      if (!treasuryId || !network) throw new Error('Config not ready');

      const [allocations, teamVested, totalBacking, redemptionRate] = await Promise.all([
        fireSimulateU128(network, treasuryId, Number(FIRE_TREASURY_OPCODES.GetAllocations)),
        fireSimulateU128(network, treasuryId, Number(FIRE_TREASURY_OPCODES.GetTeamVested)),
        fireSimulateU128(network, treasuryId, Number(FIRE_TREASURY_OPCODES.GetTotalBackingValue)),
        fireSimulateU128(network, treasuryId, Number(FIRE_TREASURY_OPCODES.GetRedemptionRate)),
      ]);

      return { allocations, teamVested, totalBacking, redemptionRate };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
