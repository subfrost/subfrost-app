/**
 * Server-side pool-state fan-out — single `alkanes_simulate` opcode 999
 * (PoolDetails) against metashrew, parsed into a structured payload.
 *
 * Cached at the API-route layer keyed by tip hash so identical requests
 * within the same block hit Redis. Espo's per-pool reserves are NOT
 * consulted here per Rule SoT-2 — slippage math must read live reserves
 * from the same indexer the swap will land against.
 *
 * Byte layout (matches `lib/alkanes/poolState.ts:9-19`, derived from
 * `oyl-amm/alkanes/oylswap-library/src/lib.rs::PoolInfo::try_to_vec`):
 *
 *   [  0.. 32]  token_a.block + token_a.tx   (2× u128 LE)
 *   [ 32.. 64]  token_b.block + token_b.tx   (2× u128 LE)
 *   [ 64.. 80]  reserve_a                    (u128 LE)
 *   [ 80.. 96]  reserve_b                    (u128 LE)
 *   [ 96..112]  total_supply                 (u128 LE)
 *   [112..116]  name_length                  (u32 LE)
 *   [116.. ]    pool_name                    (utf-8)
 *
 * The on-chain Pool::TotalFee opcode (20) returns the fee-per-1000.
 * We don't fetch it here because the API surface caller (`useSwapQuotes`)
 * already has the default fee constant; if a pool ever exposes a
 * non-default fee, fetching it via a second simulate call is the place
 * to add it.
 */

import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';
import { getCurrentTipHash } from './tipHash';
import { getHeight } from '@/lib/alkanes/rpc';

export interface PoolState {
  poolId: string;
  token0Id: string;
  token1Id: string;
  reserves0: string;
  reserves1: string;
  totalSupply: string;
  /**
   * Fee per 1000 base units (so 30 = 0.30 %, 100 = 1 %). Default 30
   * per oyl-amm Pool::DEFAULT_FEE — we don't issue a second simulate
   * call for the live fee on every pool fetch. Callers that need the
   * dynamic fee should fetch opcode 20 (GetTotalFee) separately.
   */
  fee: number;
  name: string;
  metashrewHeight: number;
  tipHash: string;
}

/** Default oyl-amm pool fee — matches `Pool::DEFAULT_FEE_PER_1000`. */
const DEFAULT_FEE_PER_1000 = 30;

/** Parse u32 LE from a hex string at a hex-character offset. */
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
 * Fetch live pool reserves + LP supply via opcode 999 (PoolDetails).
 *
 * Returns null when the simulate call fails or the payload is shorter
 * than the minimum 116-byte serialized PoolInfo — the route layer
 * surfaces that as 502 and the consumer hook can fall back to the
 * last-good Redis entry.
 */
export async function fetchPoolState(
  network: string,
  poolId: string,
): Promise<PoolState | null> {
  const [poolBlock, poolTx] = poolId.split(':');
  if (!poolBlock || !poolTx) return null;

  // Height + tipHash + simulate run in parallel. simulate is by far the
  // slowest of the three so the wall-clock cost is dominated by it
  // alone.
  const [tipHash, metashrewHeightRaw, detailsHex] = await Promise.all([
    getCurrentTipHash(network),
    getHeight(network).catch(() => 0),
    simulateContract(network, poolId, 999).catch((err) => {
      console.warn(`[poolState] opcode-999 simulate failed for ${poolId}:`, err);
      return null;
    }),
  ]);

  if (!detailsHex) return null;

  const poolInfo = extractField3Data(detailsHex, 116);
  if (!poolInfo || poolInfo.length < 232) {
    console.warn('[poolState] unexpected PoolDetails payload', {
      poolId,
      length: poolInfo?.length ?? 0,
    });
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
    reserves0: reserve0.toString(),
    reserves1: reserve1.toString(),
    totalSupply: totalSupply.toString(),
    fee: DEFAULT_FEE_PER_1000,
    name,
    metashrewHeight: Number(metashrewHeightRaw) || 0,
    tipHash,
  };
}
