import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_REDEMPTION_OPCODES } from '@/constants';

export interface FireRedemption {
  rate: string;
  fee: string;
  cooldownRemaining: string;
  totalRedeemed: string;
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

export function useFireRedemption(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const redemptionId = (config as any).FIRE_REDEMPTION_ID as string | undefined;

  return useQuery({
    queryKey: ['fireRedemption', redemptionId, network],
    enabled: enabled && !!redemptionId && isInitialized && !!provider,
    queryFn: async (): Promise<FireRedemption> => {
      if (!provider || !redemptionId) throw new Error('Provider or config not ready');

      const [rateBytes, feeBytes, cooldownBytes, redeemedBytes] = await Promise.all([
        simulateOpcode(provider, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetRedemptionRate)),
        simulateOpcode(provider, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetRedemptionFee)),
        simulateOpcode(provider, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetCooldownRemaining)),
        simulateOpcode(provider, redemptionId, Number(FIRE_REDEMPTION_OPCODES.GetTotalRedeemed)),
      ]);

      return {
        rate: rateBytes ? parseU128FromBytes(rateBytes) : '0',
        fee: feeBytes ? parseU128FromBytes(feeBytes) : '0',
        cooldownRemaining: cooldownBytes ? parseU128FromBytes(cooldownBytes) : '0',
        totalRedeemed: redeemedBytes ? parseU128FromBytes(redeemedBytes) : '0',
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
