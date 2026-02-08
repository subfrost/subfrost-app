/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * All pool data comes from the SDK's dataApiGetPools / alkanesGetAllPoolsWithDetails
 * which route through subfrost endpoints. No external services (alkanode/Espo) are used.
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

// ============================================================================
// SDK pool fetch (primary and only data source — alkanesGetAllPoolsWithDetails)
// ============================================================================

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  let poolsArray: any[] = [];

  // alkanesGetAllPoolsWithDetails: alkanes_simulate RPC calls through /api/rpc proxy.
  // This is the only reliable method — dataApiGetPools calls subfrost /get-pools which
  // returns bare pool IDs without token/reserve data, then tries unsupported endpoints.
  try {
    const rpcResult = await Promise.race([
      provider.alkanesGetAllPoolsWithDetails(factoryId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('alkanesGetAllPoolsWithDetails timeout (30s)')), 30000)),
    ]);
    const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
    const rpcPools = parsed?.pools || [];
    poolsArray = rpcPools.map((p: any) => ({
      pool_block_id: p.pool_id_block,
      pool_tx_id: p.pool_id_tx,
      token0_block_id: p.details?.token_a_block,
      token0_tx_id: p.details?.token_a_tx,
      token1_block_id: p.details?.token_b_block,
      token1_tx_id: p.details?.token_b_tx,
      token0_amount: p.details?.reserve_a || '0',
      token1_amount: p.details?.reserve_b || '0',
      pool_name: p.details?.pool_name || '',
    }));
    console.log('[useAlkanesTokenPairs] alkanesGetAllPoolsWithDetails returned', poolsArray.length, 'pools');
  } catch (e) {
    console.warn('[useAlkanesTokenPairs] alkanesGetAllPoolsWithDetails failed:', e);
  }

  if (poolsArray.length === 0) return [];

  const items: AlkanesTokenPair[] = [];
  for (const pool of poolsArray) {
    const token0Id = pool.token0_block_id && pool.token0_tx_id
      ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '';
    const token1Id = pool.token1_block_id && pool.token1_tx_id
      ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '';

    let token0Name = '';
    let token1Name = '';
    const poolName = pool.pool_name || '';
    if (poolName) {
      const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const poolIdBlock = pool.pool_block_id || 0;
    const poolIdTx = pool.pool_tx_id || 0;

    if (!token0Id || !token1Id) continue;

    items.push({
      token0: {
        id: token0Id,
        token0Amount: pool.token0_amount || '0',
        alkaneId: parseAlkaneId(token0Id || '0:0'),
        name: token0Name,
        symbol: token0Name,
      },
      token1: {
        id: token1Id,
        token1Amount: pool.token1_amount || '0',
        alkaneId: parseAlkaneId(token1Id || '0:0'),
        name: token1Name,
        symbol: token1Name,
      },
      poolId: { block: poolIdBlock, tx: poolIdTx },
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
      if (!provider) {
        throw new Error('SDK provider not available');
      }

      const allPools = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID);
      console.log('[useAlkanesTokenPairs] SDK returned', allPools.length, 'pools');

      if (allPools.length === 0) {
        throw new Error('Failed to fetch pools from SDK');
      }

      // Filter to pools containing the requested token
      return allPools.filter(
        p => p.token0.id === normalizedId || p.token1.id === normalizedId,
      );
    },
  });
}
