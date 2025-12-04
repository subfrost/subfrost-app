import { useQuery } from '@tanstack/react-query';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };

// WebProvider type for the function signature
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Query pool fee using a WASM provider
 * This function is used by both the hook and standalone callers like useSwapQuotes
 */
export const queryPoolFeeWithProvider = async (
  provider: WebProvider | null,
  alkaneId?: AlkaneId
): Promise<number> => {
  if (!alkaneId) return TOTAL_PROTOCOL_FEE;
  if (!provider) return TOTAL_PROTOCOL_FEE;

  try {
    console.log('[usePoolFee] Fetching pool fee for:', { alkaneId });

    // Use alkanes RPC method to get storage
    // This calls the Sandshrew RPC's alkanes_getstorageatstring method
    const contractId = `${alkaneId.block}:${alkaneId.tx}`;

    // For now, return default fee as we need to implement proper storage reading
    // TODO: Implement proper storage reading through WebProvider
    // The pool contract stores fee at path '/totalfeeper1000'
    console.log('[usePoolFee] TODO: Implement storage reading for contract:', contractId);

    return TOTAL_PROTOCOL_FEE;
  } catch (error) {
    console.error('[usePoolFee] Error fetching pool fee:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      alkaneId,
    });
  }

  console.log('[usePoolFee] Returning default fee:', TOTAL_PROTOCOL_FEE);
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
    queryFn: async () => {
      return queryPoolFeeWithProvider(provider, alkaneId);
    },
  });
};
