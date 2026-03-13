import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_STAKING_OPCODES } from '@/constants';

export interface FireStakingStats {
  totalStaked: string;
  currentEpoch: string;
  emissionRate: string;
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

export function useFireStakingStats(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireStakingStats', stakingId, network],
    enabled: enabled && !!stakingId && isInitialized && !!provider,
    queryFn: async (): Promise<FireStakingStats> => {
      if (!provider || !stakingId) throw new Error('Provider or config not ready');

      const [totalStakedBytes, epochBytes, rateBytes] = await Promise.all([
        simulateOpcode(provider, stakingId, Number(FIRE_STAKING_OPCODES.GetTotalStaked)),
        simulateOpcode(provider, stakingId, Number(FIRE_STAKING_OPCODES.GetCurrentEpoch)),
        simulateOpcode(provider, stakingId, Number(FIRE_STAKING_OPCODES.GetEmissionRate)),
      ]);

      return {
        totalStaked: totalStakedBytes ? parseU128FromBytes(totalStakedBytes) : '0',
        currentEpoch: epochBytes ? parseU128FromBytes(epochBytes) : '0',
        emissionRate: rateBytes ? parseU128FromBytes(rateBytes) : '0',
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
