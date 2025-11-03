import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from './useApiProvider';

export const useBtcPrice = () => {
  const api = useApiProvider();
  return useQuery({
    queryKey: ['btc-price'],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<{ usd: number }> => {
      const response = await api.getBtcPrice();
      // API returns { data: { bitcoin: { usd } } }
      return response?.data?.bitcoin ?? { usd: 0 };
    },
  });
};


