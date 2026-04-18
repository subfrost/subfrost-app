/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * Priority order for pool data:
 * 1. Direct REST call to /api/rpc/{network}/get-all-token-pairs (most reliable)
 * 2. dataApiGetAllTokenPairs — SDK wrapper for the above (may return empty {})
 * 2b. dataApiGetAllPoolsDetails — single REST call for all pools
 * 3. alkanesGetAllPoolsWithDetails — N+1 alkanes_simulate RPC calls (slowest, always works)
 *
 * Methods 1-2b use espo on devnet via the fetch interceptor.
 * Method 3 (alkanesGetAllPoolsWithDetails) has a metashrew_view response format
 * mismatch on devnet -- prefer Methods 1-2b.
 *
 * ## Troubleshooting: No Pools Returned
 *
 * If this hook returns 0 pools:
 * 1. Check browser console for "[fetchPoolsFromSDK]" and "[normalizePoolArray]" logs
 * 2. Verify REST endpoint is responding: check Network tab for /api/rpc/.../get-all-token-pairs
 * 3. Clear Next.js cache: `rm -rf .next && pnpm dev`
 *
 * ## Troubleshooting: Quotes Not Showing After Pool Selection
 *
 * If pools load but quotes don't appear in SwapInputs:
 * 1. This is usually Next.js caching stale hook versions
 * 2. Fix: `rm -rf .next && lsof -ti:3000 | xargs kill -9; pnpm dev`
 * 3. Then hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R
 *
 * JOURNAL ENTRY (2026-03-01): After fixing swap signing (PSBT patching removal),
 * quotes stopped showing. Root cause was Next.js module caching - hooks were
 * using stale versions. Always clear .next when debugging data flow issues.
 *
 * JOURNAL ENTRY (2026-02-11): Added dataApi methods as preferred sources over
 * alkanes_simulate. Previously only used alkanesGetAllPoolsWithDetails.
 */
import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { queryKeys } from '@/queries/keys';
import { getTokenPairs as rpcGetTokenPairs } from '@/lib/alkanes/rpc';

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
// SDK pool fetch — prefers dataApi/Espo, falls back to alkanes_simulate
// ============================================================================

function normalizePoolArray(raw: any): any[] {
  if (!raw) {
    console.log('[normalizePoolArray] raw is falsy:', raw);
    return [];
  }

  let parsed: any;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error('[normalizePoolArray] JSON.parse failed:', e, 'raw:', String(raw).slice(0, 200));
    return [];
  }

  // DIAGNOSTIC: Log what we're working with
  console.log('[normalizePoolArray] parsed type:', typeof parsed);
  console.log('[normalizePoolArray] parsed keys:', parsed ? Object.keys(parsed) : 'N/A');
  console.log('[normalizePoolArray] parsed.pools?:', parsed?.pools?.length ?? 'undefined');
  console.log('[normalizePoolArray] parsed.data?.pools?:', parsed?.data?.pools?.length ?? 'undefined');
  console.log('[normalizePoolArray] Array.isArray(parsed.data)?:', Array.isArray(parsed?.data), 'length:', parsed?.data?.length);
  console.log('[normalizePoolArray] Array.isArray(parsed)?:', Array.isArray(parsed), 'length:', Array.isArray(parsed) ? parsed.length : 'N/A');

  // Try multiple possible response shapes
  if (parsed?.pools && Array.isArray(parsed.pools)) {
    console.log('[normalizePoolArray] Using parsed.pools');
    return parsed.pools;
  }
  if (parsed?.data?.pools && Array.isArray(parsed.data.pools)) {
    console.log('[normalizePoolArray] Using parsed.data.pools');
    return parsed.data.pools;
  }
  if (Array.isArray(parsed?.data)) {
    console.log('[normalizePoolArray] Using parsed.data (array)');
    return parsed.data;
  }
  if (Array.isArray(parsed)) {
    console.log('[normalizePoolArray] Using parsed (array)');
    return parsed;
  }

  console.log('[normalizePoolArray] No valid pool array found, returning empty');
  return [];
}

// Normalize pool data from multiple API response formats into a flat schema.
// get-all-token-pairs nests token IDs under alkaneId: token0.alkaneId.block
// get-all-pools-details has them flat: token0.block
// RPC fallback uses details.token_a_block
function toPoolRow(p: any): any {
  // Handle multiple API response shapes:
  // - dataApiGetAllTokenPairs: token0.alkaneId.block, token0.alkaneId.tx
  // - dataApiGetAllPoolsDetails: token0.block, token0.tx
  // - alkanesGetAllPoolsWithDetails: details.token_a_block, details.token_a_tx
  return {
    pool_block_id: p.pool_block_id ?? p.pool_id_block ?? p.poolId?.block ?? 0,
    pool_tx_id: p.pool_tx_id ?? p.pool_id_tx ?? p.poolId?.tx ?? 0,
    token0_block_id: p.token0_block_id ?? p.details?.token_a_block ?? p.token0?.alkaneId?.block ?? p.token0?.block ?? 0,
    token0_tx_id: p.token0_tx_id ?? p.details?.token_a_tx ?? p.token0?.alkaneId?.tx ?? p.token0?.tx ?? 0,
    token1_block_id: p.token1_block_id ?? p.details?.token_b_block ?? p.token1?.alkaneId?.block ?? p.token1?.block ?? 0,
    token1_tx_id: p.token1_tx_id ?? p.details?.token_b_tx ?? p.token1?.alkaneId?.tx ?? p.token1?.tx ?? 0,
    token0_amount: p.token0_amount ?? p.token0Amount ?? p.reserve0 ?? p.token0?.token0Amount ?? p.details?.reserve_a ?? '0',
    token1_amount: p.token1_amount ?? p.token1Amount ?? p.reserve1 ?? p.token1?.token1Amount ?? p.details?.reserve_b ?? '0',
    pool_name: p.pool_name ?? p.poolName ?? p.details?.pool_name ?? '',
  };
}

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
  network: string,
): Promise<AlkanesTokenPair[]> {
  console.log('[fetchPoolsFromSDK] ENTRY - factoryId:', factoryId, 'network:', network);
  console.log('[fetchPoolsFromSDK] provider available:', !!provider);
  console.log('[fetchPoolsFromSDK] provider.dataApiGetAllTokenPairs:', typeof provider?.dataApiGetAllTokenPairs);

  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)),
    ]);

  let poolsArray: any[] = [];

  // Method 1: rpc.getTokenPairs — hedged primary (same REST endpoint as before)
  // with alkanode fallback. Behavior-equivalent to prior direct fetch for the
  // primary path. On devnet the fetch interceptor still routes through espo.
  if (poolsArray.length === 0) {
    try {
      const pools = await withTimeout(
        rpcGetTokenPairs(network, factoryId),
        15000,
        'rpc.getTokenPairs',
      );
      // rpc.getTokenPairs returns Record<string, AmmPoolData>; convert to the
      // shape normalizePoolArray expects (array of rows) so `toPoolRow` downstream
      // can unify it with the other methods.
      const arr = Object.entries(pools).map(([poolId, data]) => {
        const [pb, pt] = poolId.split(':');
        const [tab, tat] = (data.base || ':').split(':');
        const [tbb, tbt] = (data.quote || ':').split(':');
        return {
          pool_block_id: pb,
          pool_tx_id: pt,
          token0_block_id: tab,
          token0_tx_id: tat,
          token1_block_id: tbb,
          token1_tx_id: tbt,
          token0_amount: data.base_reserve,
          token1_amount: data.quote_reserve,
        };
      });
      const normalized = normalizePoolArray(arr);
      if (normalized.length > 0) {
        poolsArray = normalized.map(toPoolRow);
        console.log('[useAlkanesTokenPairs] rpc.getTokenPairs returned', poolsArray.length, 'pools');
      }
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] rpc.getTokenPairs failed:', e);
    }
  }

  // Method 2: SDK dataApiGetAllTokenPairs
  if (poolsArray.length === 0 ) {
    try {
      const result = await withTimeout(provider.dataApiGetAllTokenPairs(factoryId), 15000, 'dataApiGetAllTokenPairs');
      // DIAGNOSTIC: Log raw SDK return value to debug pool fetching issues
      console.log('[useAlkanesTokenPairs] dataApiGetAllTokenPairs RAW result type:', typeof result);
      console.log('[useAlkanesTokenPairs] dataApiGetAllTokenPairs RAW result:',
        typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result)?.slice(0, 500));
      const pools = normalizePoolArray(result);
      console.log('[useAlkanesTokenPairs] dataApiGetAllTokenPairs normalized pools count:', pools.length);
      if (pools.length > 0) {
        poolsArray = pools.map(toPoolRow);
        console.log('[useAlkanesTokenPairs] dataApiGetAllTokenPairs returned', poolsArray.length, 'pools');
      }
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] dataApiGetAllTokenPairs failed:', e);
    }
  }

  // Method 2b: dataApiGetAllPoolsDetails — single REST call
  if (poolsArray.length === 0 ) {
    try {
      const result = await withTimeout(provider.dataApiGetAllPoolsDetails(factoryId), 15000, 'dataApiGetAllPoolsDetails');
      // DIAGNOSTIC: Log raw SDK return value
      console.log('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails RAW result type:', typeof result);
      console.log('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails RAW result:',
        typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result)?.slice(0, 500));
      const pools = normalizePoolArray(result);
      console.log('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails normalized pools count:', pools.length);
      if (pools.length > 0) {
        poolsArray = pools.map(toPoolRow);
        console.log('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails returned', poolsArray.length, 'pools');
      }
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails failed:', e);
    }
  }

  // Method 3: alkanesGetAllPoolsWithDetails — N+1 alkanes_simulate RPC calls (fallback)
  if (poolsArray.length === 0) {
    try {
      const rpcResult = await withTimeout(provider.alkanesGetAllPoolsWithDetails(factoryId), 30000, 'alkanesGetAllPoolsWithDetails');
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

      const allPools = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID, network);
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
