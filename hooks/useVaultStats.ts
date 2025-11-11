import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { createSimulateRequestObject } from '@/lib/oyl/alkanes/transform';
import BigNumber from 'bignumber.js';

interface VaultStats {
  tvl: string; // Total Value Locked in base units
  tvlFormatted: string; // Formatted with decimals
  apy: string; // Annual Percentage Yield
  userBalance: string; // User's vault token balance
  userBalanceFormatted: string; // Formatted with decimals
  sharePrice: string; // Price of one vault share in base asset
  totalSupply: string; // Total vault tokens in circulation
  vaultBalance: string; // Total base asset in vault
}

/**
 * Hook to fetch vault statistics including TVL, APY, user balance
 * Uses alkanes.simulate to query vault contract state
 */
export function useVaultStats(vaultContractId: string, baseTokenId: string, enabled: boolean = true) {
  const { account, isConnected } = useWallet();
  const provider = useSandshrewProvider();

  return useQuery({
    queryKey: ['vaultStats', vaultContractId, baseTokenId, account],
    queryFn: async (): Promise<VaultStats> => {
      try {
        const vaultId = parseAlkaneId(vaultContractId);
        const baseId = parseAlkaneId(baseTokenId);

        // Get user balance if connected (opcode 4: GetVeDieselBalance)
        let userBalance = '0';
        let userBalanceFormatted = '0.00';
        
        if (isConnected && account) {
          try {
            const userBalanceRequest = createSimulateRequestObject({
              target: { block: vaultId.block, tx: vaultId.tx },
              inputs: ['4'], // GetVeDieselBalance opcode
            });
            const userBalanceResult = await provider.alkanes.simulate(userBalanceRequest);
            
            if (userBalanceResult && userBalanceResult.execution?.data) {
              userBalance = parseU128FromBytes(userBalanceResult.execution.data);
              userBalanceFormatted = new BigNumber(userBalance).dividedBy(1e8).toFixed(8);
            }
          } catch (error) {
            console.warn('Failed to fetch user vault balance:', error);
          }
        }

        // TODO: Fetch TVL and total supply from vault contract
        // For now, use placeholder values
        // Real implementation would query the vault's internal storage
        const tvl = '0';
        const tvlFormatted = '0.00';
        const totalSupply = '0';
        const vaultBalance = '0';
        const sharePrice = '1';

        // TODO: Calculate APY from historical data or oracle
        // For now, return a placeholder
        const apy = '0.00';

        return {
          tvl,
          tvlFormatted,
          apy,
          userBalance,
          userBalanceFormatted,
          sharePrice,
          totalSupply,
          vaultBalance,
        };
      } catch (error) {
        console.error('Failed to fetch vault stats:', error);
        // Return fallback values
        return {
          tvl: '0',
          tvlFormatted: '0.00',
          apy: '0.00',
          userBalance: '0',
          userBalanceFormatted: '0.00',
          sharePrice: '1',
          totalSupply: '0',
          vaultBalance: '0',
        };
      }
    },
    enabled: enabled && !!vaultContractId && !!baseTokenId,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Data is fresh for 15 seconds
    retry: 2,
  });
}

/**
 * Parse u128 from little-endian byte array
 * Same logic as useFrbtcPremium
 */
function parseU128FromBytes(bytes: number[]): string {
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }

  // Read 16 bytes as little-endian u128
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }

  return value.toString();
}
