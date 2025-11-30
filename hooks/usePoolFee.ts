import { useQuery } from '@tanstack/react-query';
import { Buffer } from 'buffer';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useWallet } from '@/context/WalletContext';
import { getNetworkUrls } from '@/utils/alkanesProvider';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };

export const queryPoolFee = async (network: string, alkaneId?: AlkaneId) => {
  if (!alkaneId) return TOTAL_PROTOCOL_FEE;
  
  try {
    const networkUrls = getNetworkUrls(network as any);
    
    // Dynamic import WASM
    const { WebProvider } = await import('@/ts-sdk/build/wasm/alkanes_web_sys');
    const provider = new WebProvider(networkUrls.rpc, null);
    
    console.log('[usePoolFee] Fetching pool fee for:', {
      network,
      url: networkUrls.rpc,
      alkaneId,
    });

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

export const usePoolFee = (alkaneId?: AlkaneId) => {
  const { network } = useWallet();
  
  return useQuery({
    queryKey: ['poolFee', network, alkaneId],
    queryFn: async () => {
      return queryPoolFee(network, alkaneId);
    },
    enabled: !!alkaneId,
  });
};
