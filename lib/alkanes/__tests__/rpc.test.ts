/**
 * Parity tests for `lib/alkanes/rpc.ts`.
 *
 * Runs in two modes:
 *
 * 1. Unit (default, no env var) — asserts the fetch call SHAPE (URL + body).
 *    Mocks `global.fetch`. Fast, CI-safe.
 *
 * 2. Integration (INTEGRATION=true) — hits real mainnet + regtest endpoints.
 *    Asserts the response is decoded JSON (NOT raw protobuf hex) and that the
 *    shape matches what the SDK's `provider.dataApi.*` returns today.
 *
 * Run:
 *   pnpm vitest run lib/alkanes/__tests__/rpc.test.ts                   # unit only
 *   INTEGRATION=true pnpm vitest run lib/alkanes/__tests__/rpc.test.ts  # + live parity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  alkanesSimulate,
  getProtorunesByAddress,
  getHeight,
  broadcastTransaction,
  getAllAmmPools,
  getPoolReserves,
  getTokenPairs,
  metashrewView,
  JsonRpcError,
} from '../rpc';

const INTEGRATION = process.env.INTEGRATION === 'true';

// ---------------------------------------------------------------------------
// Unit tests — mock fetch, assert request shape
// ---------------------------------------------------------------------------

describe('rpc.ts — unit (mock fetch)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockJsonResponse(result: unknown) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, result }),
    } as Response);
  }

  function mockJsonRpcError(code: number, message: string) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code, message } }),
    } as Response);
  }

  it('alkanesSimulate posts JSON-RPC with correct body shape', async () => {
    mockJsonResponse({
      execution: { alkanes: [], data: '0x', error: null, storage: [] },
      gasUsed: 0,
      status: 1,
    });

    await alkanesSimulate('mainnet', {
      target: '4:65498',
      inputs: ['4'],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://mainnet.subfrost.io/v4/subfrost');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('alkanes_simulate');
    expect(body.params[0]).toMatchObject({
      target: '4:65498',
      inputs: ['4'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '1',
      txindex: 0,
      vout: 0,
    });
  });

  it('getProtorunesByAddress posts correct body', async () => {
    mockJsonResponse({ balances: { entries: [] }, outpoints: [] });

    await getProtorunesByAddress('regtest', 'bc1p...');

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe('alkanes_protorunesbyaddress');
    expect(body.params[0]).toEqual({ address: 'bc1p...', protocolTag: '1' });
  });

  it('broadcastTransaction sends the hex string as first param', async () => {
    mockJsonResponse('abc123');

    const txid = await broadcastTransaction('mainnet', 'deadbeef');

    expect(txid).toBe('abc123');
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe('esplora_tx::broadcast');
    expect(body.params).toEqual(['deadbeef']);
  });

  it('metashrewView forwards viewFn, hex, block tag', async () => {
    mockJsonResponse('0xabcd');

    const out = await metashrewView('mainnet', 'simulate', '0xdead', 'latest');

    expect(out).toBe('0xabcd');
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe('metashrew_view');
    expect(body.params).toEqual(['simulate', '0xdead', 'latest']);
  });

  it('getHeight races metashrew_height then esplora after 2s', async () => {
    mockJsonResponse(500_000);

    const height = await getHeight('mainnet');

    expect(height).toBe(500_000);
    // Primary call only — fast path should not require the fallback.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.method).toBe('metashrew_height');
  });

  it('getAllAmmPools hits api.alkanode.com/rpc', async () => {
    mockJsonResponse({
      ok: true,
      page: 1,
      limit: 100,
      has_more: false,
      pools: { '2:77087': { base: '2:0', base_reserve: '1', quote: '32:0', quote_reserve: '2', source: 'live' } },
      total: 1,
    });

    await getAllAmmPools();

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.alkanode.com/rpc');
    const body = JSON.parse(init.body);
    expect(body.method).toBe('ammdata.get_pools');
  });

  it('getPoolReserves filters getAllAmmPools by poolId', async () => {
    mockJsonResponse({
      ok: true,
      pools: {
        '2:77087': { base: '2:0', base_reserve: '100', quote: '32:0', quote_reserve: '200', source: 'live' },
        '2:55555': { base: '2:1', base_reserve: '300', quote: '32:0', quote_reserve: '400', source: 'live' },
      },
    });

    const r = await getPoolReserves('2:77087');

    expect(r).toEqual({ base: '2:0', base_reserve: '100', quote: '32:0', quote_reserve: '200', source: 'live' });
  });

  it('getPoolReserves returns null for unknown pool', async () => {
    mockJsonResponse({ ok: true, pools: {} });

    const r = await getPoolReserves('2:999999999');

    expect(r).toBeNull();
  });

  it('JsonRpcError thrown on server-level error response', async () => {
    mockJsonRpcError(-32601, 'Method not found');

    await expect(
      alkanesSimulate('mainnet', { target: '4:65498', inputs: ['4'] }),
    ).rejects.toBeInstanceOf(JsonRpcError);
  });

  it('HTTP error thrown on non-200 response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(
      alkanesSimulate('mainnet', { target: '4:65498', inputs: ['4'] }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('AbortSignal is threaded to fetch', async () => {
    mockJsonResponse({ execution: { data: '0x', error: null, storage: [], alkanes: [] }, gasUsed: 0, status: 1 });

    const ctrl = new AbortController();
    await alkanesSimulate('mainnet', { target: '4:65498', inputs: ['4'] }, ctrl.signal);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.signal).toBe(ctrl.signal);
  });

  it('getTokenPairs prefers app REST endpoint over alkanode fallback', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ pools: { '2:77087': { base: '2:0', base_reserve: '1', quote: '32:0', quote_reserve: '2', source: 'live' } } }),
    } as Response);

    const pairs = await getTokenPairs('mainnet');

    expect(pairs['2:77087']).toBeDefined();
    // Only the primary source should have been called — fallback stays cold.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Integration parity tests — live network
// ---------------------------------------------------------------------------

const itIntegration = INTEGRATION ? it : it.skip;

describe('rpc.ts — integration parity (live)', () => {
  itIntegration('alkanes_simulate returns decoded JSON on mainnet', async () => {
    // factory get-num-pools opcode 4 — known to work on mainnet
    const res = await alkanesSimulate('mainnet', {
      target: '4:65498',
      inputs: ['4'],
    });
    expect(typeof res).toBe('object');
    expect(res.execution).toBeDefined();
    expect(res.execution.data).toMatch(/^0x/);
    // Critical: if server returns raw hex for `result` instead of decoded JSON,
    // the `alkanes-jsonrpc` shim is not in front of this metashrew. Stop everything.
    expect(res.status).toBeTypeOf('number');
  }, 15_000);

  itIntegration('alkanes_simulate returns decoded JSON on regtest', async () => {
    const res = await alkanesSimulate('regtest', {
      target: '4:65498',
      inputs: ['4'],
    });
    expect(res.execution).toBeDefined();
  }, 15_000);

  itIntegration('alkanes_protorunesbyaddress decoded on mainnet', async () => {
    // Any mainnet address — empty response has known shape.
    const res = await getProtorunesByAddress(
      'mainnet',
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr5tpqh4c8x9',
    );
    expect(res).toHaveProperty('outpoints');
    expect(Array.isArray(res.outpoints)).toBe(true);
  }, 15_000);

  itIntegration('getHeight returns a positive integer', async () => {
    const h = await getHeight('mainnet');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  }, 15_000);

  itIntegration('getPoolReserves returns known mainnet pool', async () => {
    const r = await getPoolReserves('2:77087');
    expect(r).not.toBeNull();
    expect(r?.base).toBe('2:0');
    expect(r?.quote).toBe('32:0');
    expect(BigInt(r!.base_reserve)).toBeGreaterThan(0n);
  }, 20_000);

  itIntegration('getAllAmmPools returns a non-empty pools map on mainnet', async () => {
    const all = await getAllAmmPools();
    expect(all.ok).toBe(true);
    expect(Object.keys(all.pools).length).toBeGreaterThan(0);
    expect(all.pools['2:77087']).toBeDefined();
  }, 20_000);

  itIntegration('broadcastTransaction rejects bad hex with a sane error shape', async () => {
    await expect(
      broadcastTransaction('mainnet', 'not-hex'),
    ).rejects.toBeInstanceOf(Error);
  }, 15_000);
});
