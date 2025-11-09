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
        // TODO: Replace with actual indexer API endpoint when available
        // The indexer should expose something like:
        // const response = await api.getFuturesMarkets({
        //   network,
        //   type: params.type,
        //   baseAsset: params.baseAsset,
        // });
        
        // For now, return mock data structure
        // This shows the expected data format from the indexer
        console.log('[useFuturesMarkets] Fetching from indexer...', {
          network,
          ...params,
        });

        // Mock data - replace with actual indexer call
        const mockMarkets: FuturesMarket[] = [
          {
            id: 'btc-perp',
            symbol: 'BTC-PERP',
            type: 'perpetual',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            markPrice: 43250.50,
            indexPrice: 43245.30,
            lastPrice: 43255.00,
            priceChange24h: 2.35,
            volume24h: 15234567,
            openInterest: 8934521,
            fundingRate: 0.0123,
            nextFundingTime: '2h 15m',
            maxLeverage: 20,
            minOrderSize: 0.001,
            tickSize: 0.5,
          },
          {
            id: 'diesel-perp',
            symbol: 'DIESEL-PERP',
            type: 'perpetual',
            baseAsset: 'DIESEL',
            quoteAsset: 'USDT',
            markPrice: 1.45,
            indexPrice: 1.44,
            lastPrice: 1.46,
            priceChange24h: 5.67,
            volume24h: 234567,
            openInterest: 156789,
            fundingRate: 0.0089,
            nextFundingTime: '2h 15m',
            maxLeverage: 10,
            minOrderSize: 1.0,
            tickSize: 0.01,
          },
        ];

        // Filter by type if specified
        let filtered = mockMarkets;
        if (params.type && params.type !== 'all') {
          filtered = filtered.filter((m) => m.type === params.type);
        }

        // Filter by base asset if specified
        if (params.baseAsset) {
          filtered = filtered.filter((m) => m.baseAsset === params.baseAsset);
        }

        return filtered;
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
    queryFn: async () => {
      try {
        console.log('[useFuturesMarket] Fetching market:', marketId);
        
        // TODO: Replace with actual indexer API call
        // const response = await api.getFuturesMarket({ marketId, network });
        
        // Mock data for now
        return null;
      } catch (error) {
        console.error('[useFuturesMarket] Error fetching market:', error);
        throw error;
      }
    },
  });
}
