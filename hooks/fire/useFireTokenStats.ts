import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_TOKEN_OPCODES } from '@/constants';
import { fireSimulateU128, fireSimulateString } from '@/lib/fire/simulate';

export interface FireTokenStats {
  name: string;
  symbol: string;
  totalSupply: string;
  maxSupply: string;
  emissionPoolRemaining: string;
  circulatingSupply: string;
}

export function useFireTokenStats(enabled: boolean = true) {
  const { network } = useWallet();

  const config = getConfig(network || 'mainnet');
  const fireTokenId = (config as any).FIRE_TOKEN_ID as string | undefined;

  return useQuery({
    queryKey: ['fireTokenStats', fireTokenId, network],
    enabled: enabled && !!fireTokenId && !!network,
    queryFn: async (): Promise<FireTokenStats> => {
      if (!fireTokenId || !network) throw new Error('Config not ready');

      const [name, symbol, totalSupply, maxSupply, emissionPoolRemaining] =
        await Promise.all([
          fireSimulateString(network, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetName)),
          fireSimulateString(network, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetSymbol)),
          fireSimulateU128(network, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetTotalSupply)),
          fireSimulateU128(network, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetMaxSupply)),
          fireSimulateU128(network, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetEmissionPoolRemaining)),
        ]);

      const circulatingSupply = (BigInt(totalSupply) - BigInt(emissionPoolRemaining)).toString();

      return {
        name: name || 'FIRE',
        symbol: symbol || 'FIRE',
        totalSupply,
        maxSupply,
        emissionPoolRemaining,
        circulatingSupply,
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
