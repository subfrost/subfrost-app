/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * Uses provider.espoGetPools() (single indexed call) then filters client-side.
 * Same pattern as provider.espoGetAlkaneInfo() used in queries/market.ts.
 * Replaces N+1 alkanes_simulate calls via alkanesGetAllPoolsWithDetails.
 */
import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { queryKeys } from '@/queries/keys';

export type AlkanesTokenPair = {
  token0: { id: string; token0Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  token1: { id: string; token1Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  poolId?: { block: number | string; tx: number | string };
} & Partial<AlkanesTokenPairsResult>;

// ============================================================================
// Helpers
// ============================================================================

function getTokenSymbol(tokenId: string, rawName?: string): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;
  if (rawName) return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  return tokenId.split(':')[1] || 'UNK';
}

// Convert Map instances (from WASM serde) to plain objects
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

// ============================================================================
// Espo pool fetch (single indexed call via SDK)
// ============================================================================

async function fetchPoolsFromEspo(
  provider: any,
): Promise<AlkanesTokenPair[]> {
  const raw = await Promise.race([
    provider.espoGetPools(500),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('espoGetPools timeout (15s)')), 15000)),
  ]);
  const parsed = mapToObject(typeof raw === 'string' ? JSON.parse(raw) : raw);
  const poolsObj = parsed?.pools || {};

  // Handle both object-keyed format and array format
  const entries: [string, any][] = Array.isArray(poolsObj)
    ? poolsObj.map((p: any, i: number) => [p.pool_id || String(i), p])
    : Object.entries(poolsObj);

  console.log(`[useAlkanesTokenPairs] espoGetPools returned ${entries.length} pools`);

  const items: AlkanesTokenPair[] = [];

  for (const [poolId, p] of entries) {
    // Espo fields: base, quote, base_reserve, quote_reserve
    const token0Id = p.base || p.base_id || '';
    const token1Id = p.quote || p.quote_id || '';

    if (!token0Id || !token1Id) continue;

    const [poolBlockStr, poolTxStr] = poolId.split(':');

    // Get token names from pool_name
    let token0Name = (p.base_name || p.base_symbol || '').replace('SUBFROST BTC', 'frBTC');
    let token1Name = (p.quote_name || p.quote_symbol || '').replace('SUBFROST BTC', 'frBTC');

    const poolName = p.pool_name || p.name || '';
    if ((!token0Name || !token1Name) && poolName) {
      const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        token0Name = token0Name || match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1Name = token1Name || match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    items.push({
      token0: {
        id: token0Id,
        token0Amount: String(p.base_reserve || p.base_amount || '0'),
        alkaneId: parseAlkaneId(token0Id || '0:0'),
        name: token0Name,
        symbol: token0Name,
      },
      token1: {
        id: token1Id,
        token1Amount: String(p.quote_reserve || p.quote_amount || '0'),
        alkaneId: parseAlkaneId(token1Id || '0:0'),
        name: token1Name,
        symbol: token1Name,
      },
      poolId: { block: parseInt(poolBlockStr, 10) || 0, tx: parseInt(poolTxStr, 10) || 0 },
      poolName,
    } as AlkanesTokenPair);
  }

  return items;
}

// ============================================================================
// Hook
// ============================================================================

export function useAlkanesTokenPairs(
  alkaneId: string,
  limit?: number,
  offset?: number,
  sortBy?: 'tvl' | undefined,
  searchQuery?: string,
) {
  const normalizedId = alkaneId === 'btc' ? '32:0' : alkaneId;
  const { provider } = useAlkanesSDK();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  const paramsKey = `${limit ?? ''}|${offset ?? ''}|${sortBy ?? ''}|${searchQuery ?? ''}`;

  return useQuery({
    enabled: !!normalizedId && !!network && !!ALKANE_FACTORY_ID && !!provider,
    queryKey: queryKeys.pools.tokenPairs(network, normalizedId, paramsKey),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      if (!provider) throw new Error('SDK provider not available');

      const allPools = await fetchPoolsFromEspo(provider);
      console.log('[useAlkanesTokenPairs] espo returned', allPools.length, 'pools');

      if (allPools.length === 0) {
        throw new Error('No pools returned from espo');
      }

      // Filter to pools containing the requested token
      return allPools.filter(
        p => p.token0.id === normalizedId || p.token1.id === normalizedId,
      );
    },
  });
}
