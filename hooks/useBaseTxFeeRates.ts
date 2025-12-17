import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export type BaseFeeRates = {
  slow: number;
  medium: number;
  fast: number;
};

/**
 * Hook to get fee rates from the global AlkanesSDK context.
 * Fee estimates are polled every 30 seconds via esplora_fee-estimates RPC.
 */
export function useBaseTxFeeRates() {
  const { feeEstimates, refreshFeeEstimates } = useAlkanesSDK();

  return {
    data: feeEstimates ? {
      slow: feeEstimates.slow,
      medium: feeEstimates.medium,
      fast: feeEstimates.fast,
    } : { slow: 2, medium: 8, fast: 25 },
    isLoading: !feeEstimates,
    isError: false,
    refetch: refreshFeeEstimates,
  };
}


