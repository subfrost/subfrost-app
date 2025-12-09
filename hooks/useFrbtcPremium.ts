import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { FRBTC_WRAP_FEE_PER_1000, FRBTC_UNWRAP_FEE_PER_1000 } from '@/constants/alkanes';

/**
 * Parse u128 from little-endian bytes
 */
function parseU128FromBytes(data: number[] | Uint8Array): bigint {
  if (!data || data.length === 0) {
    throw new Error('No data to parse');
  }
  
  // Ensure we have at least 16 bytes for u128
  const bytes = new Uint8Array(data);
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }
  
  // Parse as little-endian u128
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(bytes[i]) << BigInt(i * 8);
  }
  
  return result;
}

/**
 * Fetches current wrap/unwrap premium from frBTC contract
 * Uses opcode 104 (get_premium) via alkanes.simulate
 * 
 * Premium range: 0 to 100,000,000 (representing 0% to 100%)
 * Returns per-1000 format for compatibility with existing code
 */
export function useFrbtcPremium() {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useQuery({
    queryKey: ['frbtc-premium', network, FRBTC_ALKANE_ID],
    // Only enable if we have a valid frBTC alkane ID configured
    enabled: isInitialized && !!provider && !!FRBTC_ALKANE_ID && FRBTC_ALKANE_ID !== '',
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      // Return fallback if no frBTC contract configured for this network
      if (!FRBTC_ALKANE_ID || FRBTC_ALKANE_ID === '') {
        return {
          premium: 100_000,
          wrapFeePerThousand: FRBTC_WRAP_FEE_PER_1000,
          unwrapFeePerThousand: FRBTC_UNWRAP_FEE_PER_1000,
          isLive: false,
          error: 'frBTC not configured for this network',
        };
      }

      try {
        const frbtcId = parseAlkaneId(FRBTC_ALKANE_ID);
        
        // Simulate call to frBTC contract with opcode 104 (get_premium)
        // The calldata should be a byte array [104] not hex string
        const contractId = `${frbtcId.block}:${frbtcId.tx}`;
        
        // Create minimal context for simulate
        // Based on alkanes.proto MessageContextParcel definition:
        // - alkanes: repeated AlkaneTransfer (required, empty for read-only calls)
        // - transaction: bytes
        // - block: bytes
        // - height: uint64
        // - txindex: uint32
        // - calldata: bytes
        // - vout: uint32
        // - pointer: uint32
        // - refund_pointer: uint32
        const context = JSON.stringify({
          alkanes: [],     // Required field: array of AlkaneTransfer (empty for read-only)
          calldata: [104], // Opcode 104 as byte array
          height: 1000000,
          txindex: 0,
          pointer: 0,
          refund_pointer: 0,
          vout: 0,
          transaction: [], // Empty byte array
          block: [],       // Empty byte array
        });
        
        const result = await provider.alkanesSimulate(contractId, context, 'latest');

        console.log('frBTC premium result:', result);

        if (!result || !result.execution || !result.execution.data) {
          throw new Error('No response data from simulate');
        }

        // Parse u128 from execution data
        const premium = parseU128FromBytes(result.execution.data);
        
        // Convert to per-1000 format
        // Premium 100,000,000 = 100%, so divide by 100,000 to get per-1000
        // Example: 200,000 = 0.2% = 2 per 1000
        const feePerThousand = Number(premium) / 100_000;

        return {
          premium: Number(premium),
          wrapFeePerThousand: feePerThousand,
          unwrapFeePerThousand: feePerThousand,
          isLive: true,
        };
      } catch (error) {
        // Only log as warning since this is expected on regtest/testnet without deployed contracts
        console.warn('[useFrbtcPremium] Using fallback premium values:',
          error instanceof Error ? error.message : 'Unknown error');

        // Return fallback values
        return {
          premium: 100_000, // 0.1% = 1 per 1000
          wrapFeePerThousand: FRBTC_WRAP_FEE_PER_1000,
          unwrapFeePerThousand: FRBTC_UNWRAP_FEE_PER_1000,
          isLive: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    staleTime: 60_000, // Cache for 1 minute (premium can change)
    retry: 3,
    retryDelay: 1000,
  });
}

export type FrbtcPremiumData = {
  premium: number;
  wrapFeePerThousand: number;
  unwrapFeePerThousand: number;
  isLive: boolean;
  error?: string;
};
