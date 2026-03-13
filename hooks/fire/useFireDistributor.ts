import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_DISTRIBUTOR_OPCODES } from '@/constants';

export interface FireDistributor {
  phase: string;
  totalContributed: string;
  totalClaimed: string;
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

export function useFireDistributor(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const distributorId = (config as any).FIRE_DISTRIBUTOR_ID as string | undefined;

  return useQuery({
    queryKey: ['fireDistributor', distributorId, network],
    enabled: enabled && !!distributorId && isInitialized && !!provider,
    queryFn: async (): Promise<FireDistributor> => {
      if (!provider || !distributorId) throw new Error('Provider or config not ready');

      const [phaseBytes, contribBytes, claimedBytes] = await Promise.all([
        simulateOpcode(provider, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetPhase)),
        simulateOpcode(provider, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetTotalContributed)),
        simulateOpcode(provider, distributorId, Number(FIRE_DISTRIBUTOR_OPCODES.GetTotalClaimed)),
      ]);

      return {
        phase: phaseBytes ? parseU128FromBytes(phaseBytes) : '0',
        totalContributed: contribBytes ? parseU128FromBytes(contribBytes) : '0',
        totalClaimed: claimedBytes ? parseU128FromBytes(claimedBytes) : '0',
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
