/**
 * Pool query options: pool listings, dynamic pools, token pairs, pool fees, pool metadata.
 *
 * The heavy fetching logic stays in the hook files (usePools.ts, useAlkanesTokenPairs.ts, etc.)
 * since it contains multi-step fallback chains. This file re-exports queryOptions wrappers
 * that call into those existing fetch functions.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';

type AlkaneId = { block: number | string; tx: number | string };

// ---------------------------------------------------------------------------
// Pool fee (static — no RPC needed)
// ---------------------------------------------------------------------------

export function poolFeeQueryOptions(network: string, alkaneId?: AlkaneId) {
  const alkaneKey = alkaneId ? `${alkaneId.block}:${alkaneId.tx}` : '';
  return queryOptions<number>({
    queryKey: queryKeys.pools.fee(network, alkaneKey),
    enabled: !!alkaneId,
    queryFn: async () => TOTAL_PROTOCOL_FEE,
  });
}

// ---------------------------------------------------------------------------
// Pools metadata (used by AMM history for enrichment)
// ---------------------------------------------------------------------------

type PoolMetadata = {
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  poolName: string;
};

const NETWORK_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
};

async function fetchPoolMetadataById(
  apiUrl: string,
  poolBlockId: string,
  poolTxId: string,
): Promise<PoolMetadata | null> {
  try {
    const response = await fetch(`${apiUrl}/get-pool-by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId: { block: poolBlockId, tx: poolTxId } }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    const pool = result?.data?.pool || result?.pool || result?.data || result;
    if (!pool || !pool.token0_block_id) return null;
    return {
      token0BlockId: pool.token0_block_id,
      token0TxId: pool.token0_tx_id,
      token1BlockId: pool.token1_block_id,
      token1TxId: pool.token1_tx_id,
      poolName: pool.pool_name || '',
    };
  } catch {
    return null;
  }
}

export function poolsMetadataQueryOptions(
  network: string,
  poolIds: string[],
  factoryId: string,
) {
  const poolIdsKey = poolIds.sort().join(',');
  const [factoryBlock, factoryTx] = (factoryId || '4:65522').split(':');

  return queryOptions<Record<string, PoolMetadata>>({
    queryKey: queryKeys.pools.metadata(network, poolIdsKey),
    enabled: !!network && poolIds.length > 0,
    queryFn: async () => {
      const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
      const poolMap: Record<string, PoolMetadata> = {};

      try {
        const response = await fetch(`${apiUrl}/get-pools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factoryId: { block: factoryBlock, tx: factoryTx } }),
        });

        if (response.ok) {
          const result = await response.json();
          const pools = result?.data?.pools || result?.pools || [];
          for (const pool of pools) {
            const poolId = `${pool.pool_block_id}:${pool.pool_tx_id}`;
            poolMap[poolId] = {
              token0BlockId: pool.token0_block_id,
              token0TxId: pool.token0_tx_id,
              token1BlockId: pool.token1_block_id,
              token1TxId: pool.token1_tx_id,
              poolName: pool.pool_name || '',
            };
          }
          const missingPools = poolIds.filter((id) => !poolMap[id]);
          if (missingPools.length === 0) return poolMap;
        }
      } catch (error) {
        console.log('[poolsMetadata] get-pools failed, falling back:', error);
      }

      const missingPools = poolIds.filter((id) => !poolMap[id]);
      await Promise.all(
        missingPools.map(async (poolId) => {
          const [blockId, txId] = poolId.split(':');
          const metadata = await fetchPoolMetadataById(apiUrl, blockId, txId);
          if (metadata) poolMap[poolId] = metadata;
        }),
      );

      return poolMap;
    },
  });
}
