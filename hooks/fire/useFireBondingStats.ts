import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_BONDING_OPCODES } from '@/constants';
import { fireSimulateU128 } from '@/lib/fire/simulate';

export interface FireBondingStats {
  currentDiscount: string;
  firePrice: string;
  availableFire: string;
}

export function useFireBondingStats(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireBondingStats', bondingId, network],
    enabled: enabled && !!bondingId && !!network,
    queryFn: async (): Promise<FireBondingStats> => {
      if (!bondingId || !network) throw new Error('Config not ready');

      const [currentDiscount, firePrice, availableFire] = await Promise.all([
        fireSimulateU128(network, bondingId, Number(FIRE_BONDING_OPCODES.GetCurrentDiscount)),
        fireSimulateU128(network, bondingId, Number(FIRE_BONDING_OPCODES.GetFirePrice)),
        fireSimulateU128(network, bondingId, Number(FIRE_BONDING_OPCODES.GetAvailableFire)),
      ]);

      return { currentDiscount, firePrice, availableFire };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
