/**
 * Live pool state for swap/LP quote math.
 *
 * When the app data source is ESPO, reserves and LP supply are read through
 * the ESPO RPC path (`essentials.*`) instead of `alkanes_simulate` /
 * `metashrew_view("simulate")`. The simulate decoder below is retained for
 * non-ESPO networks and explicit metashrew configuration.
 *
 * PoolInfo byte layout for the metashrew fallback
 * (oyl-amm/alkanes/oylswap-library/src/lib.rs::PoolInfo::try_to_vec):
 *
 *   [  0.. 32]  token_a.block + token_a.tx   (2× u128 LE)
 *   [ 32.. 64]  token_b.block + token_b.tx   (2× u128 LE)
 *   [ 64.. 80]  reserve_a                    (u128 LE)
 *   [ 80.. 96]  reserve_b                    (u128 LE)
 *   [ 96..112]  total_supply                 (u128 LE)
 *   [112..116]  name_length                  (u32 LE)
 *   [116.. ]    pool_name                    (utf-8)
 */
import { getRpcUrl } from '@/utils/getConfig';
import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';
import { getAlkanesDataSource, type AlkanesDataSource } from '@/lib/alkanes/dataSource';

export interface LivePoolState {
  poolId: string;
  token0Id: string;
  token1Id: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  name: string;
}

async function espoRpcBatch<T extends any[]>(
  network: string,
  calls: Array<{ method: string; params: Record<string, unknown> }>,
): Promise<T> {
  const request = calls.map((call, index) => ({
    jsonrpc: '2.0',
    id: index + 1,
    method: call.method,
    params: call.params,
  }));

  const res = await fetch(`/api/rpc/${network || 'mainnet'}/espo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Espo batch HTTP ${res.status}`);

  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('Espo batch returned non-array response');

  const byId = new Map<number, any>();
  for (const item of json) {
    if (item?.error) {
      throw new Error(`Espo batch id=${item.id}: ${item.error?.message ?? JSON.stringify(item.error)}`);
    }
    if (typeof item?.id === 'number') byId.set(item.id, item.result);
  }

  return request.map((item) => byId.get(item.id)) as T;
}

function parseOkStringField(payload: any, field: string, method: string): string {
  if (!payload?.ok) throw new Error(`${method} returned not-ok: ${payload?.error ?? 'unknown'}`);
  const value = payload[field];
  if (value == null) throw new Error(`${method} missing ${field}`);
  return String(value);
}

/**
 * Espo-backed pool state. Reserves are the balances held by the pool alkane:
 *   reserve0 = balance(owner=poolId, alkane=token0Id)
 *   reserve1 = balance(owner=poolId, alkane=token1Id)
 * LP supply comes from the pool alkane's circulating supply.
 */
export async function fetchEspoPoolState(
  network: string,
  poolId: string,
  token0Id: string,
  token1Id: string,
): Promise<LivePoolState | null> {
  if (!poolId || !token0Id || !token1Id) return null;

  try {
    const [reserve0Resp, reserve1Resp, supplyResp, selfBalanceResp] = await espoRpcBatch<
      [any, any, any, any]
    >(network, [
      {
        method: 'essentials.get_alkane_balance_metashrew',
        params: { owner: poolId, alkane: token0Id },
      },
      {
        method: 'essentials.get_alkane_balance_metashrew',
        params: { owner: poolId, alkane: token1Id },
      },
      {
        method: 'essentials.get_circulating_supply',
        params: { alkane: poolId },
      },
      {
        method: 'essentials.get_alkane_balance_metashrew',
        params: { owner: poolId, alkane: poolId },
      },
    ]);
    const circulatingSupply = BigInt(parseOkStringField(supplyResp, 'supply', 'essentials.get_circulating_supply'));
    const selfBalance = BigInt(parseOkStringField(selfBalanceResp, 'balance', 'essentials.get_alkane_balance_metashrew'));
    const spendableLpSupply = circulatingSupply > selfBalance ? circulatingSupply - selfBalance : 0n;

    return {
      poolId,
      token0Id,
      token1Id,
      reserve0: parseOkStringField(reserve0Resp, 'balance', 'essentials.get_alkane_balance_metashrew'),
      reserve1: parseOkStringField(reserve1Resp, 'balance', 'essentials.get_alkane_balance_metashrew'),
      totalSupply: spendableLpSupply.toString(),
      name: `${token0Id}/${token1Id}`,
    };
  } catch (err) {
    console.warn('[poolState] espo reserve fetch failed:', err);
    return null;
  }
}

/** Parse a u32 (little-endian) from a hex string at a hex-character offset. */
function parseU32LE(hexData: string, offset: number): number {
  const bytes = hexData.slice(offset, offset + 8);
  if (bytes.length !== 8) return 0;
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    if (!isNaN(byte)) value |= byte << (i * 8);
  }
  return value >>> 0;
}

/** Decode a utf-8 string from a hex-encoded run of bytes. */
function hexToUtf8(hex: string): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte) || byte === 0) break;
    out += String.fromCharCode(byte);
  }
  return out;
}

/**
 * Fetch fresh pool reserves + LP supply directly from the pool contract via
 * metashrew_view simulate. Returns null on transport / shape errors so
 * callers can fall back to cached markets data.
 *
 * `factoryId` is no longer needed by the on-chain call (kept in the
 * signature so existing callers don't have to change), but we still
 * validate it for parity with the prior contract.
 */
export async function fetchLivePoolState(
  network: string,
  factoryId: string,
  poolId: string,
): Promise<LivePoolState | null> {
  const [factoryBlock, factoryTx] = factoryId.split(':');
  const [poolBlock, poolTx] = poolId.split(':');
  if (!factoryBlock || !factoryTx || !poolBlock || !poolTx) return null;

  const rpcUrl = getRpcUrl(network);

  let detailsHex: string;
  try {
    detailsHex = await simulateContract(rpcUrl, poolId, 999);
  } catch (err) {
    console.warn('[poolState] opcode-999 simulate failed:', err);
    return null;
  }

  // PoolInfo serialization is exactly 116 bytes + variable name → 232 hex
  // chars minimum. Anything shorter is either a revert payload or a stub
  // implementation we can't decode.
  const poolInfo = extractField3Data(detailsHex, 116);
  if (!poolInfo || poolInfo.length < 232) {
    console.warn('[poolState] unexpected PoolDetails payload', { poolId, length: poolInfo?.length ?? 0 });
    return null;
  }

  const token0Block = parseU128LE(poolInfo, 0);
  const token0Tx = parseU128LE(poolInfo, 32);
  const token1Block = parseU128LE(poolInfo, 64);
  const token1Tx = parseU128LE(poolInfo, 96);
  const reserve0 = parseU128LE(poolInfo, 128);
  const reserve1 = parseU128LE(poolInfo, 160);
  const totalSupply = parseU128LE(poolInfo, 192);

  const nameLength = parseU32LE(poolInfo, 224);
  const nameStart = 232;
  const nameEnd = Math.min(nameStart + nameLength * 2, poolInfo.length);
  const name = hexToUtf8(poolInfo.slice(nameStart, nameEnd));

  return {
    poolId,
    token0Id: `${token0Block}:${token0Tx}`,
    token1Id: `${token1Block}:${token1Tx}`,
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
    totalSupply: totalSupply.toString(),
    name,
  };
}

export async function fetchPoolStateFromDataSource(
  network: string,
  factoryId: string,
  poolId: string,
  token0Id?: string,
  token1Id?: string,
  source: AlkanesDataSource = getAlkanesDataSource(network),
): Promise<LivePoolState | null> {
  const resolvedSource = network === 'mainnet' ? 'espo' : source;
  if (resolvedSource === 'espo') {
    if (!token0Id || !token1Id) {
      console.warn('[poolState] espo source requires token ids for pool', poolId);
      return null;
    }
    return fetchEspoPoolState(network, poolId, token0Id, token1Id);
  }

  return fetchLivePoolState(network, factoryId, poolId);
}
