import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_STAKING_OPCODES } from '@/constants';

export interface StakingPosition {
  positionId: number;
  amount: string;
  weightedAmount: string;
  lockTier: number;
  lockMultiplier: number;
  unlockBlock: number;
  pendingRewards: string;
}

function parseU128FromBytes(bytes: number[], offset: number = 0): string {
  if (!bytes || bytes.length < offset + 16) return '0';
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
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

/**
 * Parse staking positions from contract response.
 * Expected format: repeated chunks of [amount(16), weightedAmount(16), lockTier(1), unlockBlock(4), pendingRewards(16)]
 */
function parsePositions(bytes: number[]): StakingPosition[] {
  const POSITION_SIZE = 53; // 16 + 16 + 1 + 4 + 16
  const positions: StakingPosition[] = [];

  if (!bytes || bytes.length < POSITION_SIZE) return positions;

  const posCount = Math.floor(bytes.length / POSITION_SIZE);
  for (let i = 0; i < posCount; i++) {
    const offset = i * POSITION_SIZE;
    const amount = parseU128FromBytes(bytes, offset);
    const weightedAmount = parseU128FromBytes(bytes, offset + 16);
    const lockTier = bytes[offset + 32] || 0;
    const unlockBlock =
      (bytes[offset + 33] || 0) |
      ((bytes[offset + 34] || 0) << 8) |
      ((bytes[offset + 35] || 0) << 16) |
      ((bytes[offset + 36] || 0) << 24);
    const pendingRewards = parseU128FromBytes(bytes, offset + 37);

    const multipliers = [1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

    positions.push({
      positionId: i,
      amount,
      weightedAmount,
      lockTier,
      lockMultiplier: multipliers[lockTier] || 1.0,
      unlockBlock,
      pendingRewards,
    });
  }

  return positions;
}

export function useFireUserPositions(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserPositions', stakingId, account?.taproot?.address, network],
    enabled: enabled && !!stakingId && isInitialized && !!provider && isConnected && !!account,
    queryFn: async (): Promise<{ positions: StakingPosition[]; pendingRewards: string }> => {
      if (!provider || !stakingId) throw new Error('Provider or config not ready');

      const [positionsBytes, rewardsBytes] = await Promise.all([
        simulateOpcode(provider, stakingId, Number(FIRE_STAKING_OPCODES.GetUserPositions)),
        simulateOpcode(provider, stakingId, Number(FIRE_STAKING_OPCODES.GetUserPendingRewards)),
      ]);

      const positions = positionsBytes ? parsePositions(positionsBytes) : [];
      const pendingRewards = rewardsBytes ? parseU128FromBytes(rewardsBytes) : '0';

      return { positions, pendingRewards };
    },
    retry: 2,
    staleTime: 15_000,
  });
}
