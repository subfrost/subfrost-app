import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { FIRE_BONDING_OPCODES } from '@/constants';

export interface BondInfo {
  bondId: number;
  lpAmount: string;
  fireAmount: string;
  vestStart: number;
  vestEnd: number;
  claimed: string;
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

export function useFireUserBonds(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserBonds', bondingId, account?.taproot?.address, network],
    enabled: enabled && !!bondingId && isInitialized && !!provider && isConnected && !!account,
    queryFn: async (): Promise<{ bonds: BondInfo[]; claimableAmount: string }> => {
      if (!provider || !bondingId) throw new Error('Provider or config not ready');

      const [bondsBytes, claimBytes] = await Promise.all([
        simulateOpcode(provider, bondingId, Number(FIRE_BONDING_OPCODES.GetUserBonds)),
        simulateOpcode(provider, bondingId, Number(FIRE_BONDING_OPCODES.GetClaimableAmount)),
      ]);

      // Parse bonds - each bond: lpAmount(16) + fireAmount(16) + vestStart(4) + vestEnd(4) + claimed(16) = 56 bytes
      const bonds: BondInfo[] = [];
      if (bondsBytes && bondsBytes.length >= 56) {
        const bondSize = 56;
        const count = Math.floor(bondsBytes.length / bondSize);
        for (let i = 0; i < count; i++) {
          const offset = i * bondSize;
          bonds.push({
            bondId: i,
            lpAmount: parseU128FromBytes(bondsBytes, offset),
            fireAmount: parseU128FromBytes(bondsBytes, offset + 16),
            vestStart:
              (bondsBytes[offset + 32] || 0) |
              ((bondsBytes[offset + 33] || 0) << 8) |
              ((bondsBytes[offset + 34] || 0) << 16) |
              ((bondsBytes[offset + 35] || 0) << 24),
            vestEnd:
              (bondsBytes[offset + 36] || 0) |
              ((bondsBytes[offset + 37] || 0) << 8) |
              ((bondsBytes[offset + 38] || 0) << 16) |
              ((bondsBytes[offset + 39] || 0) << 24),
            claimed: parseU128FromBytes(bondsBytes, offset + 40),
          });
        }
      }

      const claimableAmount = claimBytes ? parseU128FromBytes(claimBytes) : '0';

      return { bonds, claimableAmount };
    },
    retry: 2,
    staleTime: 15_000,
  });
}
