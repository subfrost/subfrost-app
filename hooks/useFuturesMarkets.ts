import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useApiProvider } from '@/hooks/useApiProvider';

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
 * Hook to fetch futures markets data from the indexer
 * 
 * The indexer provides:
 * - Mark price (fair market value)
 * - Index price (spot reference)
 * - Funding rates (for perpetuals)
 * - Open interest
 * - 24h volume and price changes
 */
export function useFuturesMarkets(params: UseFuturesMarketsParams = {}) {
  const { network } = useWallet();
  const api = useApiProvider();

  return useQuery<FuturesMarket[]>({
    queryKey: ['futures-markets', network, params.type, params.baseAsset],
    staleTime: 30_000, // 30 seconds - futures data needs to be fresh
    refetchInterval: 30_000, // Auto-refresh every 30 seconds
    queryFn: async () => {
      try {
        console.log('[useFuturesMarkets] Fetching from indexer...', {
          network,
          ...params,
        });

        // Call the actual indexer API
        const response = await api.getFuturesMarkets({
          type: params.type,
          baseAsset: params.baseAsset,
        });

        // Transform API response to match our FuturesMarket type
        const markets: FuturesMarket[] = response.markets.map((m) => ({
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
      } catch (error) {
        console.error('[useFuturesMarkets] Error fetching markets:', error);
        throw error;
      }
    },
  });
}

/**
 * Hook to fetch a specific futures market by ID
 */
export function useFuturesMarket(marketId: string) {
  const { network } = useWallet();
  const api = useApiProvider();

  return useQuery<FuturesMarket | null>({
    queryKey: ['futures-market', network, marketId],
    staleTime: 10_000, // 10 seconds for individual market
    refetchInterval: 10_000,
    enabled: !!marketId, // Only run if marketId is provided
    queryFn: async () => {
      try {
        console.log('[useFuturesMarket] Fetching market:', marketId);
        
        // Call the actual indexer API
        const response = await api.getFuturesMarket({ marketId });
        
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
      } catch (error) {
        console.error('[useFuturesMarket] Error fetching market:', error);
        throw error;
      }
    },
  });
}
