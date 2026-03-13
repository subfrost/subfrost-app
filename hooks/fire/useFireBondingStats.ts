import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_BONDING_OPCODES } from '@/constants';

export interface FireBondingStats {
  currentDiscount: string;
  firePrice: string;
  availableFire: string;
}

function parseU128FromBytes(bytes: number[]): string {
  if (!bytes || bytes.length < 16) return '0';
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value.toString();
}

async function simulateOpcode(
  provider: any,
  contractId: string,
  opcode: number,
): Promise<number[] | null> {
  try {
    const context = JSON.stringify({
      alkanes: [],
      calldata: encodeSimulateCalldata(contractId, [opcode]),
      height: 1000000,
      txindex: 0,
      pointer: 0,
      refund_pointer: 0,
      vout: 0,
      transaction: [],
      block: [],
    });
    const result = await provider.alkanesSimulate(contractId, context, 'latest');
    if (result?.execution?.data && !result?.execution?.error) {
      return result.execution.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function useFireBondingStats(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireBondingStats', bondingId, network],
    enabled: enabled && !!bondingId && isInitialized && !!provider,
    queryFn: async (): Promise<FireBondingStats> => {
      if (!provider || !bondingId) throw new Error('Provider or config not ready');

      const [discountBytes, priceBytes, availBytes] = await Promise.all([
        simulateOpcode(provider, bondingId, Number(FIRE_BONDING_OPCODES.GetCurrentDiscount)),
        simulateOpcode(provider, bondingId, Number(FIRE_BONDING_OPCODES.GetFirePrice)),
        simulateOpcode(provider, bondingId, Number(FIRE_BONDING_OPCODES.GetAvailableFire)),
      ]);

      return {
        currentDiscount: discountBytes ? parseU128FromBytes(discountBytes) : '0',
        firePrice: priceBytes ? parseU128FromBytes(priceBytes) : '0',
        availableFire: availBytes ? parseU128FromBytes(availBytes) : '0',
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
