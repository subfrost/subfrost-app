/**
 * Live pool state via espo's `/get-pool-details` REST endpoint.
 *
 * Espo writes a fresh pool snapshot every indexed block (see
 * espo/src/modules/ammdata/utils/index_pool_metrics.rs:565). The endpoint is
 * not TTL-cached — it just returns whatever the indexer wrote at the latest
 * block. Lag = indexer lag (~1-2 sec after block), same magnitude as
 * `alkanes_simulate` against state trie.
 *
 * Use whenever a downstream computation must agree with what the contract
 * sees at submit time — slippage params for AddLiquidity / RemoveLiquidity
 * are the canonical case.
 */
import { getRpcUrl } from '@/utils/getConfig';

export interface LivePoolState {
  poolId: string;
  token0Id: string;
  token1Id: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  name: string;
}

function asString(value: unknown): string {
  if (value == null) return '0';
  return String(value);
}

function buildAlkaneIdString(obj: any): string {
  if (!obj) return '';
  const block = obj.block ?? obj.alkaneId?.block;
  const tx = obj.tx ?? obj.alkaneId?.tx;
  if (block == null || tx == null) return '';
  return `${block}:${tx}`;
}

/**
 * Fetch fresh pool reserves + LP supply from espo. Returns null on transport /
 * shape errors so callers can fall back to cached markets data.
 */
export async function fetchLivePoolState(
  network: string,
  factoryId: string,
  poolId: string,
): Promise<LivePoolState | null> {
  const [factoryBlock, factoryTx] = factoryId.split(':');
  const [poolBlock, poolTx] = poolId.split(':');
  if (!factoryBlock || !factoryTx || !poolBlock || !poolTx) return null;

  let resp: Response;
  try {
    resp = await fetch(`${getRpcUrl(network)}/get-pool-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factoryId: { block: factoryBlock, tx: factoryTx },
        poolId: { block: poolBlock, tx: poolTx },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.warn('[poolState] /get-pool-details fetch failed:', err);
    return null;
  }

  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  const data = json?.data ?? json;
  if (!data) return null;

  const token0Id = buildAlkaneIdString(data.token0);
  const token1Id = buildAlkaneIdString(data.token1);
  if (!token0Id || !token1Id) return null;

  // Espo emits both `token0Amount`/`token1Amount` and lower-level reserves —
  // accept whichever shape the network returns.
  const reserve0 = data.token0Amount ?? data.reserve0 ?? data.token0?.token0Amount;
  const reserve1 = data.token1Amount ?? data.reserve1 ?? data.token1?.token1Amount;
  const totalSupply = data.tokenSupply ?? data.lpTotalSupply ?? data.totalSupply;
  if (reserve0 == null || reserve1 == null || totalSupply == null) return null;

  return {
    poolId,
    token0Id,
    token1Id,
    reserve0: asString(reserve0),
    reserve1: asString(reserve1),
    totalSupply: asString(totalSupply),
    name: typeof data.poolName === 'string' ? data.poolName : '',
  };
}
