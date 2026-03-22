import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import BigNumber from 'bignumber.js';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';

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
  const { account, isConnected, network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery({
    queryKey: ['vaultStats', vaultContractId, baseTokenId, account, network],
    enabled: enabled && !!vaultContractId && !!baseTokenId && isInitialized && !!provider,
    queryFn: async (): Promise<VaultStats> => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      try {
        const vaultId = parseAlkaneId(vaultContractId);
        const baseId = parseAlkaneId(baseTokenId);

        // Get user balance if connected (opcode 4: GetVeDieselBalance)
        let userBalance = '0';
        let userBalanceFormatted = '0.00';

        if (isConnected && account) {
          try {
            // Opcode 4 for GetVeDieselBalance
            const contractId = `${vaultId.block}:${vaultId.tx}`;
            
            // Create minimal context for simulate
            // Based on alkanes.proto MessageContextParcel definition
            const context = JSON.stringify({
              alkanes: [],     // Required field: array of AlkaneTransfer (empty for read-only)
              calldata: encodeSimulateCalldata(contractId, [4]),   // Opcode 4 = GetVeDieselBalance
              height: 1000000,
              txindex: 0,
              pointer: 0,
              refund_pointer: 0,
              vout: 0,
              transaction: [], // Empty byte array
              block: [],       // Empty byte array
            });
            
            const userBalanceResult = await provider.alkanesSimulate(contractId, context, 'latest');
            
            if (userBalanceResult && userBalanceResult.execution?.data) {
              userBalance = parseU128FromBytes(userBalanceResult.execution.data);
              userBalanceFormatted = new BigNumber(userBalance).dividedBy(1e8).toFixed(8);
            }
          } catch (error) {
            console.warn('Failed to fetch user vault balance:', error);
          }
        }

        // Fetch total vault balance via opcode 11 (TotalAssets) on dx-btc vault
        let tvl = '0';
        let tvlFormatted = '0.00';
        let totalSupply = '0';
        let vaultBalance = '0';
        let sharePrice = '1';
        let apy = '0.00';

        const contractId = `${vaultId.block}:${vaultId.tx}`;

        // Opcode 11: TotalAssets — returns total base asset held by vault
        try {
          const totalAssetsContext = JSON.stringify({
            alkanes: [],
            calldata: encodeSimulateCalldata(contractId, [11]),
            height: 1000000,
            txindex: 0,
            pointer: 0,
            refund_pointer: 0,
            vout: 0,
            transaction: [],
            block: [],
          });
          const totalAssetsResult = await provider.alkanesSimulate(contractId, totalAssetsContext, 'latest');
          if (totalAssetsResult?.execution?.data && !totalAssetsResult.execution.error) {
            vaultBalance = parseU128FromBytes(totalAssetsResult.execution.data);
            tvl = vaultBalance;
            tvlFormatted = new BigNumber(tvl).dividedBy(1e8).toFixed(8);
          }
        } catch (error) {
          console.warn('[useVaultStats] Failed to fetch TotalAssets (opcode 11):', error);
        }

        // Opcode 101: GetTotalSupply — returns total vault tokens in circulation
        try {
          const totalSupplyContext = JSON.stringify({
            alkanes: [],
            calldata: encodeSimulateCalldata(contractId, [101]),
            height: 1000000,
            txindex: 0,
            pointer: 0,
            refund_pointer: 0,
            vout: 0,
            transaction: [],
            block: [],
          });
          const totalSupplyResult = await provider.alkanesSimulate(contractId, totalSupplyContext, 'latest');
          if (totalSupplyResult?.execution?.data && !totalSupplyResult.execution.error) {
            totalSupply = parseU128FromBytes(totalSupplyResult.execution.data);
          }
        } catch (error) {
          console.warn('[useVaultStats] Failed to fetch GetTotalSupply (opcode 101):', error);
        }

        // Calculate share price = totalAssets / totalSupply
        if (totalSupply !== '0' && tvl !== '0') {
          sharePrice = new BigNumber(tvl).dividedBy(new BigNumber(totalSupply)).toFixed(8);
        }

        // APY calculation would require historical data points (share price over time).
        // For now, if we have a share price > 1, we can estimate based on vault age,
        // but without historical data we leave it at 0.00.
        // TODO: Calculate APY from historical share price data or oracle

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
