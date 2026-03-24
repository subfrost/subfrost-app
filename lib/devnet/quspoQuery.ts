/**
 * Quspo Tertiary Indexer Query Utility
 *
 * Quspo is loaded as a tertiary indexer during devnet boot. It provides
 * rich query views (pools, balances, FIRE stats, dxBTC, gauges, activity)
 * via the `metashrew_view` JSON-RPC method.
 *
 * All views: input is UTF-8 JSON hex-encoded, output is hex-encoded UTF-8 JSON.
 *
 * This replaces the broken Espo/REST data API calls on devnet where the
 * devnet server maps REST endpoints to wrong RPC methods.
 */

import { getRpcUrl } from '@/utils/getConfig';

/**
 * Call a quspo view function via metashrew_view RPC.
 *
 * @param viewName - e.g. 'get_pools', 'get_alkanes_by_address'
 * @param input - string (address) or object (JSON payload), will be hex-encoded
 * @param network - network name (uses getRpcUrl for routing)
 * @returns parsed JSON result, or null on failure
 */
export async function quspoView<T = any>(
  viewName: string,
  input: string | object,
  network: string,
): Promise<T | null> {
  const rpcUrl = getRpcUrl(network);
  const payloadStr = typeof input === 'string' ? input : JSON.stringify(input);
  const hexInput = '0x' + Buffer.from(payloadStr, 'utf-8').toString('hex');

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'metashrew_view',
      params: [viewName, hexInput, 'latest'],
      id: 1,
    }),
  });

  const data = await resp.json();
  if (!data?.result) return null;

  const hex = (data.result as string).replace(/^0x/, '');
  if (!hex) return null;

  const jsonStr = Buffer.from(hex, 'hex').toString('utf-8');
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

// ── Typed helpers for common quspo views ──────────────────────────

export interface QuspoAlkaneBalance {
  alkaneId: { block: string; tx: string };
  name: string;
  symbol: string;
  balance: string;
}

export async function quspoGetAlkanesByAddress(
  address: string,
  network: string,
): Promise<QuspoAlkaneBalance[]> {
  const result = await quspoView<QuspoAlkaneBalance[]>(
    'get_alkanes_by_address',
    address,
    network,
  );
  return result || [];
}

export interface QuspoPool {
  poolId: { block: string; tx: string };
  token0: { block: string; tx: string };
  token1: { block: string; tx: string };
  reserve0: string;
  reserve1: string;
  fee: string;
  lpTokenSupply: string;
  name?: string;
}

export interface QuspoPoolsResponse {
  pools: QuspoPool[];
}

export async function quspoGetPools(
  factoryId: string,
  network: string,
): Promise<QuspoPool[]> {
  const [block, tx] = factoryId.split(':');
  const result = await quspoView<QuspoPoolsResponse>(
    'get_pools',
    { block, tx },
    network,
  );
  return result?.pools || [];
}

export interface QuspoDxBtcStats {
  totalSupply: string;
  feesDeposited: string;
}

export async function quspoGetDxBtcStats(
  vaultId: string,
  network: string,
): Promise<QuspoDxBtcStats | null> {
  const [block, tx] = vaultId.split(':');
  return quspoView<QuspoDxBtcStats>('get_dxbtc_stats', { block, tx }, network);
}

export interface QuspoGaugeStats {
  totalStaked: string;
  gaugeType: string;
}

export async function quspoGetGaugeStats(
  gaugeId: string,
  network: string,
): Promise<QuspoGaugeStats | null> {
  const [block, tx] = gaugeId.split(':');
  return quspoView<QuspoGaugeStats>('get_gauge_stats', { block, tx }, network);
}

export interface QuspoFireStats {
  totalSupply?: string;
  emissionRate?: string;
  totalStaked?: string;
  epoch?: string;
}

export async function quspoGetFireStakingStats(
  stakingId: string,
  network: string,
): Promise<QuspoFireStats | null> {
  const [block, tx] = stakingId.split(':');
  return quspoView<QuspoFireStats>('get_fire_staking_stats', { block, tx }, network);
}
