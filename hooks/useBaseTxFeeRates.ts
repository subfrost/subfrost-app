import { useQuery } from '@tanstack/react-query';

export type BaseFeeRates = {
  slow: number;
  medium: number;
  fast: number;
};

export function useBaseTxFeeRates() {
  return useQuery<BaseFeeRates>({
    queryKey: ['baseTxFeeRates'],
    refetchInterval: 30_000,
    queryFn: async () => {
      try {
        const res = await fetch('/api/fees', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch fee estimates');
        const data = (await res.json()) as BaseFeeRates;
        return {
          slow: Math.max(1, Number(data.slow ?? 1)),
          medium: Math.max(1, Number(data.medium ?? 1)),
          fast: Math.max(1, Number(data.fast ?? 1)),
        };
      } catch {
        return { slow: 2, medium: 8, fast: 25 };
      }
    },
  });
}


