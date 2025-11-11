import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { createSimulateRequestObject } from '@/lib/oyl/alkanes/transform';
import BigNumber from 'bignumber.js';

export type BoostStats = {
  userVeDiesel: string; // User's veDIESEL holdings
  userStake: string; // User's staked LP amount
  totalVeDiesel: string; // Total veDIESEL in circulation
  totalStake: string; // Total LP staked in gauge
  boostMultiplier: number; // User's actual boost (1.0 to 2.5)
  baseApr: number; // Base APR without boost
  boostedApr: number; // User's boosted APR
};

/**
 * Calculate boost multiplier based on veDIESEL holdings
 * Formula: boost = min(1 + (ve_diesel * total_stake) / (stake * total_ve_diesel), 2.5)
 */
function calculateBoost(
  userVeDiesel: string,
  userStake: string,
  totalVeDiesel: string,
  totalStake: string
): number {
  const vd = new BigNumber(userVeDiesel);
  const us = new BigNumber(userStake);
  const tvd = new BigNumber(totalVeDiesel);
  const ts = new BigNumber(totalStake);

  // Handle edge cases
  if (us.isZero() || tvd.isZero() || ts.isZero()) {
    return 1.0; // No boost
  }

  // boost = 1 + (vd * ts) / (us * tvd)
  const numerator = vd.multipliedBy(ts);
  const denominator = us.multipliedBy(tvd);
  
  if (denominator.isZero()) {
    return 1.0;
  }

  const boostFactor = numerator.dividedBy(denominator);
  const boost = 1 + boostFactor.toNumber();

  // Cap at 2.5x
  return Math.min(boost, 2.5);
}

/**
 * Hook to calculate user's gauge boost based on veDIESEL holdings
 * Queries vault for veDIESEL balance and gauge for staking info
 */
export function useGaugeBoost(
  vaultContractId: string,
  gaugeContractId: string,
  baseApr: number = 12.5,
  enabled: boolean = true
) {
  const { account, isConnected } = useWallet();
  const provider = useSandshrewProvider();

  return useQuery({
    queryKey: ['gaugeBoost', vaultContractId, gaugeContractId, account],
    queryFn: async (): Promise<BoostStats> => {
      try {
        const vaultId = parseAlkaneId(vaultContractId);
        const gaugeId = parseAlkaneId(gaugeContractId);

        // TODO: Query user's veDIESEL balance from vault (opcode 4)
        // For now, use placeholder
        let userVeDiesel = '0';
        
        if (isConnected && account) {
          try {
            const balanceRequest = createSimulateRequestObject({
              target: { block: vaultId.block, tx: vaultId.tx },
              inputs: ['4'], // GetVeDieselBalance
            });
            const balanceResult = await provider.alkanes.simulate(balanceRequest);
            
            if (balanceResult && balanceResult.execution?.data) {
              userVeDiesel = parseU128FromBytes(balanceResult.execution.data);
            }
          } catch (error) {
            console.warn('Failed to fetch veDIESEL balance:', error);
          }
        }

        // TODO: Query gauge contract for:
        // - User's staked amount
        // - Total staked in gauge
        // - Total veDIESEL supply
        // For now, use placeholders
        const userStake = '0'; // Would query from gauge contract
        const totalVeDiesel = '1000000000000000'; // 10M veDIESEL (placeholder)
        const totalStake = '5000000000000000'; // 50M LP staked (placeholder)

        // Calculate boost multiplier
        const boostMultiplier = calculateBoost(
          userVeDiesel,
          userStake,
          totalVeDiesel,
          totalStake
        );

        // Calculate boosted APR
        const boostedApr = baseApr * boostMultiplier;

        return {
          userVeDiesel,
          userStake,
          totalVeDiesel,
          totalStake,
          boostMultiplier,
          baseApr,
          boostedApr,
        };
      } catch (error) {
        console.error('Failed to calculate boost:', error);
        // Return fallback values
        return {
          userVeDiesel: '0',
          userStake: '0',
          totalVeDiesel: '0',
          totalStake: '0',
          boostMultiplier: 1.0,
          baseApr,
          boostedApr: baseApr,
        };
      }
    },
    enabled: enabled && !!vaultContractId && !!gaugeContractId,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,
    retry: 2,
  });
}

/**
 * Parse u128 from little-endian byte array
 */
function parseU128FromBytes(bytes: number[]): string {
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }

  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }

  return value.toString();
}
