import { useQuery } from '@tanstack/react-query';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { poolFeeQueryOptions } from '@/queries/pools';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Standalone function for use outside React (e.g. in swap quote calculation).
 * Pool fee is hardcoded — no RPC call needed.
 */
export const queryPoolFeeWithProvider = async (
  _provider: WebProvider | null,
  alkaneId?: AlkaneId,
): Promise<number> => {
  return TOTAL_PROTOCOL_FEE;
};

/**
 * Hook to get pool fee for a specific alkane
 */
export const usePoolFee = (alkaneId?: AlkaneId) => {
  const { network } = useWallet();

  return useQuery(poolFeeQueryOptions(network, alkaneId));
};
