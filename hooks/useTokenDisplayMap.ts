import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

export type TokenDisplay = { id: string; name?: string; symbol?: string };

// Hardcoded fallbacks for well-known tokens
const KNOWN_TOKENS: Record<string, TokenDisplay> = {
  btc: { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  frbtc: { id: 'frbtc', name: 'frBTC', symbol: 'frBTC' },
};

/**
 * Batch-fetch alkane names via Espo essentials.get_alkane_info RPC.
 * Uses JSON-RPC 2.0 batch format through the /api/rpc proxy which
 * routes essentials.* calls to the Espo endpoint (api.alkanode.com/rpc).
 */
async function fetchAlkaneNamesBatch(alkaneIds: string[]): Promise<Record<string, TokenDisplay>> {
  const map: Record<string, TokenDisplay> = {};
  if (alkaneIds.length === 0) return map;

  const batch = alkaneIds.map((id, i) => ({
    jsonrpc: '2.0',
    id: i,
    method: 'essentials.get_alkane_info',
    params: { alkane: id },
  }));

  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    console.warn('[useTokenDisplayMap] Espo batch failed:', response.status);
    return map;
  }

  const results: Array<{ id: number; result?: { name?: string; symbol?: string }; error?: any }> =
    await response.json();

  for (const res of results) {
    const alkaneId = alkaneIds[res.id];
    if (!alkaneId) continue;
    if (res.result && res.result.name) {
      const name = res.result.name.replace('SUBFROST BTC', 'frBTC');
      map[alkaneId] = { id: alkaneId, name, symbol: res.result.symbol || '' };
    } else {
      map[alkaneId] = { id: alkaneId };
    }
  }

  return map;
}

export function useTokenDisplayMap(ids: string[] | undefined) {
  const { network } = useWallet();

  return useQuery<{ [id: string]: TokenDisplay}>({
    queryKey: ['token-display', network, (ids || []).sort().join(',')],
    enabled: Boolean(ids && ids.length > 0),
    queryFn: async () => {
      const unique = Array.from(new Set(ids));
      const map: Record<string, TokenDisplay> = {};

      // Resolve known tokens immediately, collect the rest for batch RPC
      const toFetch: string[] = [];
      for (const id of unique) {
        if (KNOWN_TOKENS[id]) {
          map[id] = KNOWN_TOKENS[id];
        } else {
          toFetch.push(id);
        }
      }

      if (toFetch.length > 0) {
        const batchResults = await fetchAlkaneNamesBatch(toFetch);
        Object.assign(map, batchResults);
      }

      return map;
    },
  });
}


