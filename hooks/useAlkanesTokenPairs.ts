/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * Primary: Espo ammdata.get_pools (mainnet)
 * Secondary: ts-sdk dataApi.getPools
 * Fallback: RPC simulation for regtest
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
// Espo ammdata.get_pools (primary for mainnet — fast, no CORS issues)
// ============================================================================

const ESPO_RPC_URL = process.env.NEXT_PUBLIC_ESPO_RPC_URL || 'https://api.alkanode.com/rpc';

async function fetchPoolsFromEspo(): Promise<AlkanesTokenPair[]> {
  const response = await fetch(ESPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'ammdata.get_pools',
      params: {},
      id: 1,
    }),
  });

  if (!response.ok) throw new Error(`Espo HTTP error: ${response.status}`);
  const json = await response.json();
  const result = json.result;
  if (!result?.ok || !result.pools) throw new Error(result?.error || 'espo returned no pools');

  const items: AlkanesTokenPair[] = [];
  for (const [poolId, pool] of Object.entries(result.pools) as [string, any][]) {
    const [poolBlock, poolTx] = poolId.split(':');
    const baseId = pool.base;
    const quoteId = pool.quote;
    if (!baseId || !quoteId) continue;

    const baseParts = baseId.split(':');
    const quoteParts = quoteId.split(':');

    items.push({
      token0: {
        id: baseId,
        token0Amount: pool.base_reserve || '0',
        alkaneId: parseAlkaneId(baseId),
        name: getTokenSymbol(baseId),
        symbol: getTokenSymbol(baseId),
      },
      token1: {
        id: quoteId,
        token1Amount: pool.quote_reserve || '0',
        alkaneId: parseAlkaneId(quoteId),
        name: getTokenSymbol(quoteId),
        symbol: getTokenSymbol(quoteId),
      },
      poolId: { block: poolBlock, tx: poolTx },
      poolName: `${getTokenSymbol(baseId)} / ${getTokenSymbol(quoteId)}`,
    } as AlkanesTokenPair);
  }

  return items;
}

// ============================================================================
// Direct RPC simulation fallback (regtest — calls factory opcode 3 + pool opcode 97)
// ============================================================================

/**
 * Parse GetAllPools response (factory opcode 3).
 * Returns list of pool AlkaneIds as {block, tx} pairs.
 * Data format: first u128 = pool count, then pairs of u128 (block, tx).
 */
function parseGetAllPoolsData(hex: string): Array<{ block: string; tx: string }> {
  const data = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (data.length < 32) return [];

  // Read u128 values (16 bytes each, little-endian)
  const readU128 = (offset: number): bigint => {
    const bytes = data.slice(offset * 2, (offset + 16) * 2);
    if (bytes.length < 32) return 0n;
    // Little-endian: reverse byte pairs
    let val = 0n;
    for (let i = 0; i < 16; i++) {
      const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
      val += BigInt(byte) << BigInt(i * 8);
    }
    return val;
  };

  const poolCount = Number(readU128(0));
  const pools: Array<{ block: string; tx: string }> = [];
  for (let i = 0; i < poolCount; i++) {
    const block = readU128(16 + i * 32);
    const tx = readU128(16 + i * 32 + 16);
    pools.push({ block: block.toString(), tx: tx.toString() });
  }
  return pools;
}

/**
 * Parse PoolDetails response (pool opcode 999).
 * Data layout: token_a (2 x u128) + token_b (2 x u128) + reserve_a (u128) + reserve_b (u128) + ...
 */
function parsePoolDetailsData(hex: string): {
  token0Id: string; token1Id: string;
  reserve0: string; reserve1: string;
} | null {
  const data = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Need at least 6 x 16 bytes = 96 bytes = 192 hex chars
  if (data.length < 192) return null;

  const readU128 = (byteOffset: number): bigint => {
    const start = byteOffset * 2;
    const bytes = data.slice(start, start + 32);
    if (bytes.length < 32) return 0n;
    let val = 0n;
    for (let i = 0; i < 16; i++) {
      const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
      val += BigInt(byte) << BigInt(i * 8);
    }
    return val;
  };

  const tokenABlock = readU128(0);
  const tokenATx = readU128(16);
  const tokenBBlock = readU128(32);
  const tokenBTx = readU128(48);
  const reserveA = readU128(64);
  const reserveB = readU128(80);

  return {
    token0Id: `${tokenABlock}:${tokenATx}`,
    token1Id: `${tokenBBlock}:${tokenBTx}`,
    reserve0: reserveA.toString(),
    reserve1: reserveB.toString(),
  };
}

async function fetchPoolsViaRpcSimulation(
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  const rpcUrl = typeof window !== 'undefined' ? '/api/rpc' : (
    process.env.REGTEST_RPC_URL || 'https://regtest.subfrost.io/v4/subfrost'
  );

  // Step 1: Get all pool IDs from factory (opcode 3)
  const [factoryBlock, factoryTx] = factoryId.split(':');
  const getAllPoolsResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_simulate',
      params: [{
        target: factoryId,
        inputs: ['3'],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '999999',
        txindex: 0,
        vout: 0,
      }],
      id: 1,
    }),
  });

  if (!getAllPoolsResponse.ok) throw new Error(`RPC error: ${getAllPoolsResponse.status}`);
  const getAllPoolsJson = await getAllPoolsResponse.json();
  const execution = getAllPoolsJson.result?.execution;
  if (execution?.error || !execution?.data) throw new Error(execution?.error || 'no data');

  const poolIds = parseGetAllPoolsData(execution.data);
  if (poolIds.length === 0) return [];

  // Step 2: For each pool, query details (opcode 999) individually
  // NOTE: We send individual requests instead of batch because the /api/rpc proxy
  // routes batch (array) requests to /v4/jsonrpc which may not support alkanes_simulate.
  // Individual requests go to /v4/subfrost which reliably supports all alkanes methods.
  const items: AlkanesTokenPair[] = [];

  for (let i = 0; i < poolIds.length; i++) {
    const pool = poolIds[i];

    try {
      const detailResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{
            target: `${pool.block}:${pool.tx}`,
            inputs: ['999'],
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '999999',
            txindex: 0,
            vout: 0,
          }],
          id: 1,
        }),
      });

      if (!detailResp.ok) continue;
      const detailJson = await detailResp.json();
      const result = detailJson.result?.execution;
      if (!result?.data || result.error) continue;

      const details = parsePoolDetailsData(result.data);
      if (!details) continue;

      items.push({
        token0: {
          id: details.token0Id,
          token0Amount: details.reserve0,
          alkaneId: parseAlkaneId(details.token0Id),
          name: getTokenSymbol(details.token0Id),
          symbol: getTokenSymbol(details.token0Id),
        },
        token1: {
          id: details.token1Id,
          token1Amount: details.reserve1,
          alkaneId: parseAlkaneId(details.token1Id),
          name: getTokenSymbol(details.token1Id),
          symbol: getTokenSymbol(details.token1Id),
        },
        poolId: { block: pool.block, tx: pool.tx },
        poolName: `${getTokenSymbol(details.token0Id)} / ${getTokenSymbol(details.token1Id)}`,
      } as AlkanesTokenPair);
    } catch (e) {
      console.warn(`[fetchPoolsViaRpc] Failed to fetch details for pool ${pool.block}:${pool.tx}:`, e);
    }
  }

  return items;
}

// ============================================================================
// SDK fallback helpers
// ============================================================================

function extractPoolsArray(response: any): any[] {
  if (!response) return [];
  if (response instanceof Map) {
    const data = response.get('data');
    if (data instanceof Map) {
      const pools = data.get('pools');
      if (Array.isArray(pools)) return pools;
    }
    const directPools = response.get('pools');
    if (Array.isArray(directPools)) return directPools;
    return [];
  }
  if (response.data?.pools && Array.isArray(response.data.pools)) return response.data.pools;
  if (response.pools && Array.isArray(response.pools)) return response.pools;
  if (Array.isArray(response)) return response;
  return [];
}

function poolToObject(pool: any): any {
  if (pool instanceof Map) {
    const obj: any = {};
    pool.forEach((value: any, key: string) => { obj[key] = value; });
    return obj;
  }
  return pool;
}

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  let poolsArray: any[] = [];

  try {
    const poolsResponse = await provider.dataApiGetPools(factoryId);
    poolsArray = extractPoolsArray(poolsResponse);
  } catch (e) {
    console.warn('[useAlkanesTokenPairs] SDK dataApiGetPools failed:', e);
  }

  if (poolsArray.length === 0) {
    try {
      const rpcResult = await provider.alkanesGetAllPoolsWithDetails(factoryId);
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
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] SDK RPC failed:', e);
    }
  }

  if (poolsArray.length === 0) return [];

  const items: AlkanesTokenPair[] = [];
  for (const p of poolsArray) {
    const pool = poolToObject(p);
    const token0Id = pool.token0_id ||
      (pool.token0_block_id && pool.token0_tx_id ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '');
    const token1Id = pool.token1_id ||
      (pool.token1_block_id && pool.token1_tx_id ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '');

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

    const poolIdBlock = pool.pool_block_id || pool.pool_id?.split(':')[0] || 0;
    const poolIdTx = pool.pool_tx_id || pool.pool_id?.split(':')[1] || 0;

    if (!token0Id || !token1Id) continue;

    items.push({
      token0: {
        id: token0Id,
        token0Amount: pool.token0_amount || pool.reserve0 || '0',
        alkaneId: parseAlkaneId(token0Id || '0:0'),
        name: token0Name,
        symbol: token0Name,
      },
      token1: {
        id: token1Id,
        token1Amount: pool.token1_amount || pool.reserve1 || '0',
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
    enabled: !!normalizedId && !!network && !!ALKANE_FACTORY_ID,
    queryKey: queryKeys.pools.tokenPairs(network, normalizedId, paramsKey),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      let allPools: AlkanesTokenPair[] = [];
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';

      // Priority 1: Espo ammdata.get_pools (mainnet only — Espo returns mainnet data,
      // so using it on regtest would give wrong pool reserves for matching token IDs like 2:0/32:0)
      if (!isRegtest) {
        try {
          allPools = await fetchPoolsFromEspo();
          console.log('[useAlkanesTokenPairs] Espo returned', allPools.length, 'pools');
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] Espo failed:', e);
        }
      }

      // Priority 2: ts-sdk dataApi
      if (allPools.length === 0 && provider) {
        try {
          allPools = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID);
          console.log('[useAlkanesTokenPairs] SDK dataApi returned', allPools.length, 'pools');
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] SDK dataApi failed:', e);
        }
      }

      // Priority 3: Direct RPC simulation (regtest/universal fallback)
      if (allPools.length === 0) {
        try {
          allPools = await fetchPoolsViaRpcSimulation(ALKANE_FACTORY_ID);
          console.log('[useAlkanesTokenPairs] RPC simulation returned', allPools.length, 'pools');
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] RPC simulation failed:', e);
        }
      }

      if (allPools.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

      // Filter to pools containing the requested token
      return allPools.filter(
        p => p.token0.id === normalizedId || p.token1.id === normalizedId,
      );
    },
  });
}
