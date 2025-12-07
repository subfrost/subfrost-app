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
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      try {
        const frbtcId = parseAlkaneId(FRBTC_ALKANE_ID);
        
        // Simulate call to frBTC contract with opcode 104 (get_premium)
        // The calldata should be a byte array [104] not hex string
        const contractId = `${frbtcId.block}:${frbtcId.tx}`;
        
        // Create minimal context for simulate
        // calldata must be an array of bytes, not a hex string
        const context = JSON.stringify({
          calldata: [104], // Opcode 104 as byte array
          height: 1000000,
          txindex: 0,
          pointer: 0,
          refund_pointer: 0,
          vout: 0,
          transaction: '0x',
          block: '0x',
          atomic: null,
          runes: [],
          sheets: {},
          runtime_balances: {},
          trace: null
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
        console.error('Failed to fetch frBTC premium:', error);
        
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
