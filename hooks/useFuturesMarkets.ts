import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export type FuturesMarket = {
  id: string;
  symbol: string; // e.g., "BTC-PERP", "DIESEL-PERP"
  type: 'perpetual' | 'expiry';
  baseAsset: string;
  quoteAsset: string;
  markPrice: number;
  indexPrice: number;
  lastPrice: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate?: number; // Only for perpetuals
  nextFundingTime?: string; // Only for perpetuals
  expiryDate?: string; // Only for expiry futures
  maxLeverage: number;
  minOrderSize: number;
  tickSize: number;
};

export type UseFuturesMarketsParams = {
  type?: 'perpetual' | 'expiry' | 'all';
  baseAsset?: string;
};

/**
 * Hook to fetch futures markets data
 *
 * Note: This hook depends on indexer API methods that may not be available
 * in all WASM provider configurations.
 */
export function useFuturesMarkets(params: UseFuturesMarketsParams = {}) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery<FuturesMarket[]>({
    queryKey: ['futures-markets', network, params.type, params.baseAsset],
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) {
        return [];
      }

      try {
        console.log('[useFuturesMarkets] Fetching from provider...', {
          network,
          ...params,
        });

        // Try to call the method if available
        if (typeof (provider as any).getFuturesMarkets === 'function') {
          const response = await (provider as any).getFuturesMarkets({
            type: params.type,
            baseAsset: params.baseAsset,
          });

          // Transform API response to match our FuturesMarket type
          const markets: FuturesMarket[] = response.markets.map((m: any) => ({
            id: m.id,
            symbol: m.symbol,
            type: m.type,
            baseAsset: m.baseAsset,
            quoteAsset: m.quoteAsset,
            markPrice: m.markPrice,
            indexPrice: m.indexPrice,
            lastPrice: m.lastPrice,
            priceChange24h: m.priceChange24h,
            volume24h: m.volume24h,
            openInterest: m.openInterest,
            fundingRate: m.fundingRate,
            nextFundingTime: m.nextFundingTime,
            expiryDate: m.expiryDate,
            maxLeverage: m.maxLeverage,
            minOrderSize: m.minOrderSize,
            tickSize: m.tickSize,
          }));

          return markets;
        }

        // Fallback: return empty array if method not available
        console.log('[useFuturesMarkets] getFuturesMarkets not available on provider');
        return [];
      } catch (error) {
        console.error('[useFuturesMarkets] Error fetching markets:', error);
        return [];
      }
    },
  });
}

/**
 * Hook to fetch a specific futures market by ID
 */
export function useFuturesMarket(marketId: string) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery<FuturesMarket | null>({
    queryKey: ['futures-market', network, marketId],
    staleTime: 10_000,
    refetchInterval: 10_000,
    enabled: !!marketId && isInitialized && !!provider,
    queryFn: async () => {
      if (!provider) {
        return null;
      }

      try {
        console.log('[useFuturesMarket] Fetching market:', marketId);

        // Try to call the method if available
        if (typeof (provider as any).getFuturesMarket === 'function') {
          const response = await (provider as any).getFuturesMarket({ marketId });

          // Transform to our FuturesMarket type
          const market: FuturesMarket = {
            id: response.id,
            symbol: response.symbol,
            type: response.type,
            baseAsset: response.baseAsset,
            quoteAsset: response.quoteAsset,
            markPrice: response.markPrice,
            indexPrice: response.indexPrice,
            lastPrice: response.lastPrice,
            priceChange24h: response.priceChange24h,
            volume24h: response.volume24h,
            openInterest: response.openInterest,
            fundingRate: response.fundingRate,
            nextFundingTime: response.nextFundingTime,
            expiryDate: response.expiryDate,
            maxLeverage: response.maxLeverage,
            minOrderSize: response.minOrderSize,
            tickSize: response.tickSize,
          };

          return market;
        }

        // Fallback: return null if method not available
        console.log('[useFuturesMarket] getFuturesMarket not available on provider');
        return null;
      } catch (error) {
        console.error('[useFuturesMarket] Error fetching market:', error);
        return null;
      }
    },
  });
}
