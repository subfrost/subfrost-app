import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
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
  const provider = useSandshrewProvider();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useQuery({
    queryKey: ['frbtc-premium', network],
    queryFn: async () => {
      try {
        const frbtcId = parseAlkaneId(FRBTC_ALKANE_ID);
        
        // Simulate call to frBTC contract with opcode 104 (get_premium)
        const result = await provider.alkanes.simulate({
          target: frbtcId,
          inputs: [104], // opcode 104 = get_premium
          alkanes: [],
        });

        if (!result || !result.data) {
          throw new Error('No response data from simulate');
        }

        // Parse premium from response data (u128 in le_bytes)
        const premiumBigInt = parseU128FromBytes(result.data);
        
        // Convert to number (premium is in range 0-100,000,000)
        const premium = Number(premiumBigInt);
        
        // Convert to per-1000 format
        // Premium 100,000,000 = 100%, so divide by 100,000 to get per-1000
        // Example: 200,000 = 0.2% = 2 per 1000
        const feePerThousand = premium / 100_000;

        return {
          premium,
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
