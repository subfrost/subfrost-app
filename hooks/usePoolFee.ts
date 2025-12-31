import { useQuery } from '@tanstack/react-query';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };

// WebProvider type for the function signature
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Default fee per 1000 (1% = 10 per 1000)
const DEFAULT_FEE_PER_1000 = 10;

/**
 * Parse u128 from little-endian bytes
 */
function parseU128FromBytes(data: number[] | Uint8Array): bigint {
  if (!data || data.length === 0) {
    throw new Error('No data to parse');
  }

  const bytes = new Uint8Array(data);
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }

  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(bytes[i]) << BigInt(i * 8);
  }

  return result;
}

/**
 * Query pool fee using a WASM provider
 * This function is used by both the hook and standalone callers like useSwapQuotes
 * Uses opcode 20 (GetTotalFee) to query the pool contract
 */
export const queryPoolFeeWithProvider = async (
  provider: WebProvider | null,
  alkaneId?: AlkaneId
): Promise<number> => {
  if (!alkaneId) return TOTAL_PROTOCOL_FEE;
  if (!provider) return TOTAL_PROTOCOL_FEE;

  try {
    const contractId = `${alkaneId.block}:${alkaneId.tx}`;
    console.log('[usePoolFee] Fetching pool fee for:', contractId);

    // Build simulate context with opcode 20 (GetTotalFee)
    const context = JSON.stringify({
      alkanes: [],
      calldata: [20], // Opcode 20 = GetTotalFee, returns u128
      height: 1000000,
      txindex: 0,
      pointer: 0,
      refund_pointer: 0,
      vout: 0,
      transaction: [],
      block: [],
    });

    const result = await provider.alkanesSimulate(contractId, context, 'latest');

    if (!result || !result.execution || !result.execution.data) {
      console.warn('[usePoolFee] No response data, using default fee');
      return TOTAL_PROTOCOL_FEE;
    }

    // Parse u128 fee from execution data
    const feeRaw = parseU128FromBytes(result.execution.data);
    const feePerThousand = Number(feeRaw);

    console.log('[usePoolFee] Pool fee fetched:', { contractId, feePerThousand });

    // Convert to decimal (fee per 1000 -> decimal, e.g., 10 -> 0.01)
    return feePerThousand / 1000;
  } catch (error) {
    console.warn('[usePoolFee] Error fetching pool fee, using default:',
      error instanceof Error ? error.message : String(error));
  }

  return TOTAL_PROTOCOL_FEE;
};

/**
 * Hook to get pool fee for a specific alkane
 */
export const usePoolFee = (alkaneId?: AlkaneId) => {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery({
    queryKey: ['poolFee', network, alkaneId],
    enabled: !!alkaneId && isInitialized && !!provider,
    staleTime: 5 * 60 * 1000, // Pool fees rarely change, cache for 5 minutes
    queryFn: async () => {
      return queryPoolFeeWithProvider(provider, alkaneId);
    },
  });
};
