import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_REDEMPTION_OPCODES } from '@/constants';
import { fireSimulateU128 } from '@/lib/fire/simulate';

export interface FireRedemption {
  rate: string;
  fee: string;
  cooldownRemaining: string;
  totalRedeemed: string;
}

export function useFireRedemption(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const redemptionId = (config as any).FIRE_REDEMPTION_ID as string | undefined;

  return useQuery({
    queryKey: ['fireRedemption', redemptionId, network],
    enabled: enabled && !!redemptionId && !!network,
    queryFn: async (): Promise<FireRedemption> => {
      if (!redemptionId || !network) throw new Error('Config not ready');

      const [rate, fee, totalRedeemed] = await Promise.all([
        fireSimulateU128(network, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetRedemptionRate)),
        fireSimulateU128(network, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetRedemptionFee)),
        fireSimulateU128(network, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetTotalRedeemed)),
      ]);

      // GetUserCooldown(22) requires user AlkaneId — skip for now
      return { rate, fee, cooldownRemaining: '0', totalRedeemed };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
