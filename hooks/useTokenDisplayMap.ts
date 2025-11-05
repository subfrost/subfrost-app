import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { fetchAlkane } from '@/lib/oyl/alkanes/fetch';

export type TokenDisplay = { id: string; name?: string; symbol?: string };

export function useTokenDisplayMap(ids: string[] | undefined) {
  const { network } = useWallet();

  return useQuery<{ [id: string]: TokenDisplay}>({
    queryKey: ['token-display', network, (ids || []).sort().join(',')],
    enabled: Boolean(ids && ids.length > 0),
    queryFn: async () => {
      const unique = Array.from(new Set(ids));
      const results = await Promise.all(
        unique.map(async (id) => {
          try {
            const d = await fetchAlkane(id, network);
            return { id, name: d?.name, symbol: (d as any)?.symbol } as TokenDisplay;
          } catch {
            return { id } as TokenDisplay;
          }
        }),
      );
      const map: { [id: string]: TokenDisplay } = {};
      results.forEach((r) => { map[r.id] = r; });
      return map;
    },
  });
}


