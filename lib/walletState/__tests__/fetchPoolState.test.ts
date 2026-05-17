/**
 * fetchPoolState tests — u128 LE parsing of opcode-999 PoolDetails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchPoolState } from '../fetchPoolState';
import { __resetTipHashCacheForTests } from '../tipHash';

function rpcResult(result: unknown) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  };
}

/**
 * Build a PoolDetails hex payload — the contract returns a protobuf
 * envelope where field 3 (tag 0x1a) holds the serialized PoolInfo. The
 * helper packs that envelope so the byte parser tests run against the
 * full pipeline (`extractField3Data` → `parseU128LE`), not just the
 * raw decoder.
 *
 * PoolInfo layout (oyl-amm/oylswap-library):
 *   [  0.. 32]  token_a.block + token_a.tx   (2× u128 LE)
 *   [ 32.. 64]  token_b.block + token_b.tx   (2× u128 LE)
 *   [ 64.. 80]  reserve_a                    (u128 LE)
 *   [ 80.. 96]  reserve_b                    (u128 LE)
 *   [ 96..112]  total_supply                 (u128 LE)
 *   [112..116]  name_length                  (u32 LE)
 *   [116.. ]    pool_name                    (utf-8)
 */
function u128LE(value: bigint): number[] {
  const bytes: number[] = [];
  let v = value;
  for (let i = 0; i < 16; i++) {
    bytes.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return bytes;
}

function u32LE(value: number): number[] {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
}

function buildPoolInfoHex(opts: {
  token0Block: bigint;
  token0Tx: bigint;
  token1Block: bigint;
  token1Tx: bigint;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  name: string;
}): string {
  const nameBytes = [...new TextEncoder().encode(opts.name)];
  const bodyBytes = [
    ...u128LE(opts.token0Block),
    ...u128LE(opts.token0Tx),
    ...u128LE(opts.token1Block),
    ...u128LE(opts.token1Tx),
    ...u128LE(opts.reserve0),
    ...u128LE(opts.reserve1),
    ...u128LE(opts.totalSupply),
    ...u32LE(nameBytes.length),
    ...nameBytes,
  ];

  // Wrap in protobuf field 3: tag 0x1a + varint length + bytes.
  // varint for length up to 127 is one byte; bodyBytes is 116 + name so
  // we encode multi-byte varint properly.
  const lengthVarint: number[] = [];
  let len = bodyBytes.length;
  while (len >= 0x80) {
    lengthVarint.push((len & 0x7f) | 0x80);
    len >>= 7;
  }
  lengthVarint.push(len);

  const all = [0x1a, ...lengthVarint, ...bodyBytes];
  return '0x' + all.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the method-dispatch mock — the four header/simulate fetches
 * race via Promise.all, so order-based mockResolvedValueOnce sequences
 * land on the wrong consumer. Dispatch by method instead.
 */
function stageSimulate(opts: {
  tipHeight: number;
  tipHash: string;
  metashrewHeight: number;
  simulateResult: unknown;
  simulateThrows?: boolean;
}): void {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? '{}'));
    const method = body.method as string;
    if (method === 'metashrew_height') {
      return rpcResult(opts.tipHeight) as Response;
    }
    if (method === 'metashrew_getblockhash') {
      return rpcResult(opts.tipHash) as Response;
    }
    if (method === 'metashrew_view') {
      if (opts.simulateThrows) throw new Error('simulate 502');
      return rpcResult(opts.simulateResult) as Response;
    }
    throw new Error(`unexpected RPC method: ${method}`);
  });
}

describe('fetchPoolState', () => {
  beforeEach(() => {
    __resetTipHashCacheForTests();
    mockFetch.mockReset();
  });

  it('parses reserves + supply + token ids from opcode-999 PoolDetails', async () => {
    stageSimulate({
      tipHeight: 900_000,
      tipHash: '0xabc',
      metashrewHeight: 900_000,
      simulateResult: buildPoolInfoHex({
        token0Block: 2n,
        token0Tx: 0n,
        token1Block: 32n,
        token1Tx: 0n,
        reserve0: 1_234_567_890n,
        reserve1: 9_876_543_210n,
        totalSupply: 50_000_000n,
        name: 'DIESEL/frBTC',
      }),
    });

    const state = await fetchPoolState('mainnet', '2:1234');

    expect(state).not.toBeNull();
    expect(state!.poolId).toBe('2:1234');
    expect(state!.token0Id).toBe('2:0');
    expect(state!.token1Id).toBe('32:0');
    expect(state!.reserves0).toBe('1234567890');
    expect(state!.reserves1).toBe('9876543210');
    expect(state!.totalSupply).toBe('50000000');
    expect(state!.name).toBe('DIESEL/frBTC');
    expect(state!.fee).toBe(30); // DEFAULT_FEE_PER_1000
    expect(state!.metashrewHeight).toBe(900_000);
    expect(state!.tipHash).toBe('abc');
  });

  it('handles full-range u128 values (no precision loss past 2^53)', async () => {
    const big = (1n << 100n) + 12345n;
    stageSimulate({
      tipHeight: 1,
      tipHash: 'aa',
      metashrewHeight: 1,
      simulateResult: buildPoolInfoHex({
        token0Block: 2n,
        token0Tx: 0n,
        token1Block: 32n,
        token1Tx: 0n,
        reserve0: big,
        reserve1: big - 1n,
        totalSupply: big / 2n,
        name: 'BIG',
      }),
    });

    const state = await fetchPoolState('mainnet', '2:99');
    expect(state!.reserves0).toBe(big.toString());
    expect(state!.reserves1).toBe((big - 1n).toString());
    expect(state!.totalSupply).toBe((big / 2n).toString());
  });

  it('returns null on malformed poolId', async () => {
    const state = await fetchPoolState('mainnet', 'not-a-pool-id');
    expect(state).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when simulate returns a short payload', async () => {
    stageSimulate({
      tipHeight: 1,
      tipHash: 'aa',
      metashrewHeight: 1,
      simulateResult: '0x1a020000', // 2-byte payload, well under 116
    });

    const state = await fetchPoolState('mainnet', '2:1');
    expect(state).toBeNull();
  });

  it('returns null when simulate throws', async () => {
    stageSimulate({
      tipHeight: 1,
      tipHash: 'aa',
      metashrewHeight: 1,
      simulateResult: null,
      simulateThrows: true,
    });

    const state = await fetchPoolState('mainnet', '2:1');
    expect(state).toBeNull();
  });
});
