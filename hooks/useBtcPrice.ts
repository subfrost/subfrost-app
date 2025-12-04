import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export function useBtcPrice() {
  const { provider, isInitialized, bitcoinPrice } = useAlkanesSDK();

  return useQuery<number>({
    queryKey: ['btcPrice'],
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      // First try to use the cached price from context
      if (bitcoinPrice && bitcoinPrice.usd > 0) {
        return bitcoinPrice.usd;
      }

      // Otherwise try to fetch via provider
      if (!provider) {
        return 90000; // Fallback price
      }

      try {
        const response = await provider.dataApiGetBitcoinPrice();
        const price = typeof response === 'number'
          ? response
          : (response as { usd?: number; price?: number })?.usd ?? (response as { price?: number })?.price ?? 0;
        return price > 0 ? price : 90000;
      } catch {
        return 90000;
      }
    },
  });
}
