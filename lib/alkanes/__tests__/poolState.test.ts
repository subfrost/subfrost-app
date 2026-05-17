/**
 * Coverage for poolState.ts — the slippage-quote-critical decode path.
 *
 * Three surfaces:
 *
 *   1. `fetchEspoPoolState` — batch RPC against essentials.* (the ESPO
 *      data source). Reserves are owner=poolId balances; LP supply is
 *      the pool alkane's `/totalsupply` state key.
 *
 *   2. `fetchLivePoolState` — opcode 999 `PoolDetails` via metashrew
 *      simulate. The byte-offset decode is the failure-prone part:
 *      every u128 lives at a specific 32-hex-char offset, and a single
 *      off-by-one byte here produces a reserve number that's 256× off
 *      and a swap quote that swallows the user's tokens.
 *
 *   3. `fetchPoolStateFromDataSource` — dispatch between espo (always
 *      on mainnet) and the simulate path on other networks.
 *
 * The byte-offset assertions are the highest-leverage tests in the file
 * — they would have caught the 2026-01-15 reserve-shift incident where
 * a parser change moved reserve0 from offset 128 to 144 and turned every
 * AMM quote into a near-zero output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================================================
// Module mocks. We keep parseU128LE + extractField3Data REAL so the byte
// offset assertions actually exercise the production decode; only the
// network seam (`simulateContract`) is mocked.
// ===========================================================================

vi.mock('@/lib/fujin/rpc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fujin/rpc')>('@/lib/fujin/rpc');
  return {
    ...actual,
    simulateContract: vi.fn(),
  };
});

vi.mock('@/lib/alkanes/dataSource', () => ({
  getAlkanesDataSource: vi.fn((_n: string) => 'simulate' as const),
}));

vi.mock('@/utils/getConfig', () => ({
  getRpcUrl: vi.fn((n: string) => `https://${n}.subfrost.io/v4/subfrost`),
}));

import { fetchEspoPoolState, fetchLivePoolState, fetchPoolStateFromDataSource } from '../poolState';
import { simulateContract } from '@/lib/fujin/rpc';

// ===========================================================================
// Helpers — build a hand-crafted PoolInfo hex with the exact offsets the
// production decoder expects.
// ===========================================================================

function u128HexLE(value: bigint): string {
  let v = value;
  const bytes: string[] = [];
  for (let i = 0; i < 16; i++) {
    bytes.push((Number(v & 0xffn)).toString(16).padStart(2, '0'));
    v >>= 8n;
  }
  return bytes.join('');
}

function u32HexLE(value: number): string {
  const bytes: string[] = [];
  let v = value >>> 0;
  for (let i = 0; i < 4; i++) {
    bytes.push((v & 0xff).toString(16).padStart(2, '0'));
    v >>>= 8;
  }
  return bytes.join('');
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
  const nameHex = Buffer.from(opts.name, 'utf-8').toString('hex');
  return [
    u128HexLE(opts.token0Block),
    u128HexLE(opts.token0Tx),
    u128HexLE(opts.token1Block),
    u128HexLE(opts.token1Tx),
    u128HexLE(opts.reserve0),
    u128HexLE(opts.reserve1),
    u128HexLE(opts.totalSupply),
    u32HexLE(opts.name.length),
    nameHex,
  ].join('');
}

/**
 * Wrap a payload hex into a protobuf "field 3" varint-length envelope so
 * the real `extractField3Data` decoder unwraps it back to the same payload.
 *
 * field 3 wire-type 2 (length-delimited) → tag byte = 0x1a.
 * Then varint length (in bytes), then payload.
 */
function wrapField3(payloadHex: string): string {
  const byteLength = payloadHex.length / 2;
  const varintBytes: number[] = [];
  let v = byteLength;
  while (v >= 0x80) {
    varintBytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  varintBytes.push(v & 0x7f);
  const varintHex = varintBytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return '1a' + varintHex + payloadHex;
}

const simulateMock = simulateContract as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===========================================================================

describe('fetchLivePoolState — opcode-999 PoolDetails byte-offset decode', () => {
  beforeEach(() => simulateMock.mockReset());

  it('decodes a well-formed PoolInfo at the canonical byte offsets', async () => {
    const payload = buildPoolInfoHex({
      token0Block: 2n,
      token0Tx: 0n,
      token1Block: 32n,
      token1Tx: 0n,
      reserve0: 100_000_000_000n, // 1000 DIESEL at 1e8
      reserve1: 10_000_000_000n, //  100 frBTC at 1e8
      totalSupply: 31_622_776_601n,
      name: 'DIESEL/frBTC',
    });
    simulateMock.mockResolvedValueOnce(wrapField3(payload));

    const result = await fetchLivePoolState('mainnet', '4:65522', '2:77087');
    expect(result).not.toBeNull();
    expect(result).toEqual({
      poolId: '2:77087',
      token0Id: '2:0',
      token1Id: '32:0',
      reserve0: '100000000000',
      reserve1: '10000000000',
      totalSupply: '31622776601',
      name: 'DIESEL/frBTC',
    });
  });

  it('preserves full u128 precision (reserves > 2^53 must NOT be rounded)', async () => {
    // 2^60 is well past JS Number precision — if the decoder ever fell
    // back to Number(), this assertion would fail by lossy rounding.
    const huge = 1n << 60n;
    const payload = buildPoolInfoHex({
      token0Block: 2n, token0Tx: 0n,
      token1Block: 32n, token1Tx: 0n,
      reserve0: huge,
      reserve1: huge * 2n,
      totalSupply: huge / 2n,
      name: 'X/Y',
    });
    simulateMock.mockResolvedValueOnce(wrapField3(payload));

    const result = await fetchLivePoolState('mainnet', '4:65522', '2:1');
    expect(result?.reserve0).toBe(huge.toString());
    expect(result?.reserve1).toBe((huge * 2n).toString());
    expect(result?.totalSupply).toBe((huge / 2n).toString());
  });

  it('parses the name from the variable-length utf-8 trailer', async () => {
    const payload = buildPoolInfoHex({
      token0Block: 2n, token0Tx: 0n,
      token1Block: 32n, token1Tx: 0n,
      reserve0: 1n, reserve1: 1n, totalSupply: 1n,
      name: 'METHANE-bUSD-VIP',
    });
    simulateMock.mockResolvedValueOnce(wrapField3(payload));
    const result = await fetchLivePoolState('mainnet', '4:65522', '2:99');
    expect(result?.name).toBe('METHANE-bUSD-VIP');
  });

  it('returns null when the simulate payload is shorter than 116 bytes (revert / stub)', async () => {
    // 200 hex chars = 100 bytes, below the 116-byte minimum.
    simulateMock.mockResolvedValueOnce(wrapField3('00'.repeat(100)));
    const result = await fetchLivePoolState('mainnet', '4:65522', '2:1');
    expect(result).toBeNull();
  });

  it('returns null when simulateContract throws (transport error)', async () => {
    simulateMock.mockRejectedValueOnce(new Error('upstream 502'));
    const result = await fetchLivePoolState('mainnet', '4:65522', '2:1');
    expect(result).toBeNull();
  });

  it('returns null when factoryId is malformed (e.g. missing colon)', async () => {
    const result = await fetchLivePoolState('mainnet', 'not-an-id', '2:1');
    expect(result).toBeNull();
    expect(simulateMock).not.toHaveBeenCalled();
  });

  it('returns null when poolId is malformed', async () => {
    const result = await fetchLivePoolState('mainnet', '4:65522', '');
    expect(result).toBeNull();
    expect(simulateMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================

describe('fetchEspoPoolState — batched essentials.* RPC', () => {
  function stubEspoBatch(reply: unknown[], opts: { status?: number } = {}) {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse((init?.body as string) ?? '{}') });
        return new Response(JSON.stringify(reply), {
          status: opts.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    return calls;
  }

  it('posts a 3-call batch (token0 balance, token1 balance, /totalsupply)', async () => {
    const calls = stubEspoBatch([
      { jsonrpc: '2.0', id: 1, result: { ok: true, balance: '500' } },
      { jsonrpc: '2.0', id: 2, result: { ok: true, balance: '600' } },
      {
        jsonrpc: '2.0', id: 3,
        result: { ok: true, items: { '/totalsupply': { value_u128: '700' } } },
      },
    ]);
    const result = await fetchEspoPoolState('mainnet', '2:77087', '2:0', '32:0');
    expect(result).toEqual({
      poolId: '2:77087',
      token0Id: '2:0',
      token1Id: '32:0',
      reserve0: '500',
      reserve1: '600',
      totalSupply: '700',
      name: '2:0/32:0',
    });

    // One batched POST.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/rpc/mainnet/espo');
    const batch = calls[0].body as Array<{
      method: string;
      params: Record<string, unknown>;
    }>;
    expect(batch).toHaveLength(3);
    expect(batch[0].method).toBe('essentials.get_alkane_balance_metashrew');
    expect(batch[0].params).toEqual({ owner: '2:77087', alkane: '2:0' });
    expect(batch[1].params).toEqual({ owner: '2:77087', alkane: '32:0' });
    expect(batch[2].method).toBe('essentials.get_keys');
    expect(batch[2].params).toEqual({ alkane: '2:77087', keys: ['/totalsupply'] });
  });

  it('routes the batch to /api/rpc/{network}/espo (subfrost-regtest case)', async () => {
    const calls = stubEspoBatch([
      { jsonrpc: '2.0', id: 1, result: { ok: true, balance: '1' } },
      { jsonrpc: '2.0', id: 2, result: { ok: true, balance: '1' } },
      {
        jsonrpc: '2.0', id: 3,
        result: { ok: true, items: { '/totalsupply': { value_u128: '1' } } },
      },
    ]);
    await fetchEspoPoolState('subfrost-regtest', '2:1', '2:0', '32:0');
    expect(calls[0].url).toBe('/api/rpc/subfrost-regtest/espo');
  });

  it('returns null when any required id is missing (early return, no fetch)', async () => {
    const calls = stubEspoBatch([]);
    expect(await fetchEspoPoolState('mainnet', '', '2:0', '32:0')).toBeNull();
    expect(await fetchEspoPoolState('mainnet', '2:1', '', '32:0')).toBeNull();
    expect(await fetchEspoPoolState('mainnet', '2:1', '2:0', '')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null on HTTP error (espo down → no quote)', async () => {
    stubEspoBatch([], { status: 503 });
    const result = await fetchEspoPoolState('mainnet', '2:1', '2:0', '32:0');
    expect(result).toBeNull();
  });

  it('returns null when essentials reports an error for any call', async () => {
    stubEspoBatch([
      { jsonrpc: '2.0', id: 1, result: { ok: true, balance: '1' } },
      { jsonrpc: '2.0', id: 2, error: { code: -1, message: 'unknown alkane' } },
      {
        jsonrpc: '2.0', id: 3,
        result: { ok: true, items: { '/totalsupply': { value_u128: '1' } } },
      },
    ]);
    const result = await fetchEspoPoolState('mainnet', '2:1', '2:0', '32:0');
    expect(result).toBeNull();
  });

  it('returns null when essentials returns ok=false (catches "not-ok" gating)', async () => {
    stubEspoBatch([
      { jsonrpc: '2.0', id: 1, result: { ok: false, error: 'balance unavailable' } },
      { jsonrpc: '2.0', id: 2, result: { ok: true, balance: '1' } },
      {
        jsonrpc: '2.0', id: 3,
        result: { ok: true, items: { '/totalsupply': { value_u128: '1' } } },
      },
    ]);
    const result = await fetchEspoPoolState('mainnet', '2:1', '2:0', '32:0');
    expect(result).toBeNull();
  });

  it('returns null when /totalsupply value_u128 is missing', async () => {
    stubEspoBatch([
      { jsonrpc: '2.0', id: 1, result: { ok: true, balance: '1' } },
      { jsonrpc: '2.0', id: 2, result: { ok: true, balance: '1' } },
      { jsonrpc: '2.0', id: 3, result: { ok: true, items: { '/totalsupply': {} } } },
    ]);
    const result = await fetchEspoPoolState('mainnet', '2:1', '2:0', '32:0');
    expect(result).toBeNull();
  });
});

// ===========================================================================

describe('fetchPoolStateFromDataSource — dispatch rules', () => {
  beforeEach(() => simulateMock.mockReset());

  it('mainnet ALWAYS uses espo, even when source arg says "metashrew"', async () => {
    const calls: { url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push({ url });
        return new Response(
          JSON.stringify([
            { jsonrpc: '2.0', id: 1, result: { ok: true, balance: '1' } },
            { jsonrpc: '2.0', id: 2, result: { ok: true, balance: '2' } },
            {
              jsonrpc: '2.0', id: 3,
              result: { ok: true, items: { '/totalsupply': { value_u128: '3' } } },
            },
          ]),
          { status: 200 },
        );
      }),
    );
    const result = await fetchPoolStateFromDataSource(
      'mainnet', '4:65522', '2:1', '2:0', '32:0', 'metashrew',
    );
    expect(result?.reserve0).toBe('1');
    expect(result?.reserve1).toBe('2');
    expect(result?.totalSupply).toBe('3');
    // Espo URL was hit; simulate was NOT called.
    expect(calls[0].url).toBe('/api/rpc/mainnet/espo');
    expect(simulateMock).not.toHaveBeenCalled();
  });

  it('non-mainnet falls through to the requested source — simulate path', async () => {
    const payload = buildPoolInfoHex({
      token0Block: 2n, token0Tx: 0n,
      token1Block: 32n, token1Tx: 0n,
      reserve0: 7n, reserve1: 8n, totalSupply: 9n,
      name: 'T',
    });
    simulateMock.mockResolvedValueOnce(wrapField3(payload));

    const result = await fetchPoolStateFromDataSource(
      'subfrost-regtest', '4:65522', '2:1', undefined, undefined, 'metashrew',
    );
    expect(result?.reserve0).toBe('7');
    expect(simulateMock).toHaveBeenCalledTimes(1);
  });

  it('non-mainnet with espo source rejects when token ids are missing (no batch fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await fetchPoolStateFromDataSource(
      'subfrost-regtest', '4:65522', '2:1', undefined, undefined, 'espo',
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
