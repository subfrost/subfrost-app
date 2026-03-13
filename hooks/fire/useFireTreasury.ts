import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_TREASURY_OPCODES } from '@/constants';

export interface FireTreasury {
  allocations: string;
  teamVested: string;
  totalBacking: string;
  redemptionRate: string;
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

export function useFireTreasury(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const treasuryId = (config as any).FIRE_TREASURY_ID as string | undefined;

  return useQuery({
    queryKey: ['fireTreasury', treasuryId, network],
    enabled: enabled && !!treasuryId && isInitialized && !!provider,
    queryFn: async (): Promise<FireTreasury> => {
      if (!provider || !treasuryId) throw new Error('Provider or config not ready');

      const [allocBytes, vestedBytes, backingBytes, rateBytes] = await Promise.all([
        simulateOpcode(provider, treasuryId, Number(FIRE_TREASURY_OPCODES.GetAllocations)),
        simulateOpcode(provider, treasuryId, Number(FIRE_TREASURY_OPCODES.GetTeamVested)),
        simulateOpcode(provider, treasuryId, Number(FIRE_TREASURY_OPCODES.GetTotalBackingValue)),
        simulateOpcode(provider, treasuryId, Number(FIRE_TREASURY_OPCODES.GetRedemptionRate)),
      ]);

      return {
        allocations: allocBytes ? parseU128FromBytes(allocBytes) : '0',
        teamVested: vestedBytes ? parseU128FromBytes(vestedBytes) : '0',
        totalBacking: backingBytes ? parseU128FromBytes(backingBytes) : '0',
        redemptionRate: rateBytes ? parseU128FromBytes(rateBytes) : '0',
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
