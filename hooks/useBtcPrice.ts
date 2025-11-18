import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from '@/hooks/useApiProvider';

export function useBtcPrice() {
  const api = useApiProvider();

  return useQuery<number>({
    queryKey: ['btcPrice'],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const response = await api.getBtcPrice();
        const price = typeof response === 'number' ? response : (response as { price?: number })?.price ?? 0;
        return price > 0 ? price : 90000;
      } catch {
        return 90000;
      }
    },
  });
}
