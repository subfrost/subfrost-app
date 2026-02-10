/**
 * Alkane Balance API Tests
 *
 * Tests the server-side parallel protorunesbyoutpoint + Redis cache flow.
 *
 * Run with: pnpm test app/api/alkane-balances/__tests__/alkane-balances.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis cache
vi.mock('@/lib/db/redis', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock global fetch for RPC calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { cache } from '@/lib/db/redis';
import { GET } from '../route';

// Helper to create a mock NextRequest with query params
function createRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/alkane-balances');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: 'GET' });
}

// Helper: build a JSON-RPC response
function rpcResponse(result: any) {
  return { ok: true, json: async () => ({ jsonrpc: '2.0', result, id: 1 }) };
}

describe('GET /api/alkane-balances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when address is missing', async () => {
    const request = createRequest({ network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('address parameter is required');
  });

  it('returns empty balances when address has no UTXOs', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
  });

  it('fetches outpoint balances and aggregates them', async () => {
    // esplora returns 2 UTXOs
    mockFetch.mockResolvedValueOnce(
      rpcResponse([
        { txid: 'aaa111', vout: 0, value: 546 },
        { txid: 'bbb222', vout: 1, value: 546 },
      ]),
    );

    // Both cache misses
    vi.mocked(cache.get).mockResolvedValue(null);

    // protorunesbyoutpoint for aaa111:0 — has DIESEL
    mockFetch.mockResolvedValueOnce(
      rpcResponse({
        balance_sheet: {
          cached: {
            balances: [{ block: 2, tx: 0, amount: '5000' }],
          },
        },
      }),
    );

    // protorunesbyoutpoint for bbb222:1 — has DIESEL + frBTC
    mockFetch.mockResolvedValueOnce(
      rpcResponse({
        balance_sheet: {
          cached: {
            balances: [
              { block: 2, tx: 0, amount: '3000' },
              { block: 32, tx: 0, amount: '1000' },
            ],
          },
        },
      }),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toHaveLength(2);

    const diesel = data.balances.find((b: any) => b.alkaneId === '2:0');
    const frbtc = data.balances.find((b: any) => b.alkaneId === '32:0');
    expect(diesel.balance).toBe('8000'); // 5000 + 3000
    expect(frbtc.balance).toBe('1000');
  });

  it('uses Redis cache for known outpoints', async () => {
    // esplora returns 1 UTXO
    mockFetch.mockResolvedValueOnce(
      rpcResponse([{ txid: 'cached111', vout: 0, value: 546 }]),
    );

    // Redis cache hit — no RPC call needed for this outpoint
    vi.mocked(cache.get).mockResolvedValueOnce([
      { block: 2, tx: 0, amount: '9999' },
    ]);

    const request = createRequest({ address: 'bc1ptest', network: 'regtest' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toEqual([{ alkaneId: '2:0', balance: '9999' }]);

    // Only 1 fetch call (esplora), NOT 2 (no protorunesbyoutpoint call)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Cache was checked
    expect(cache.get).toHaveBeenCalledWith('alkane-bal:cached111:0');
  });

  it('caches outpoint balances permanently after fetch', async () => {
    // esplora returns 1 UTXO
    mockFetch.mockResolvedValueOnce(
      rpcResponse([{ txid: 'new111', vout: 2, value: 546 }]),
    );

    // Cache miss
    vi.mocked(cache.get).mockResolvedValueOnce(null);

    // RPC returns balances
    mockFetch.mockResolvedValueOnce(
      rpcResponse({
        balance_sheet: {
          cached: {
            balances: [{ block: 2, tx: 0, amount: '42' }],
          },
        },
      }),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    await GET(request as any);

    // Should cache with no TTL (permanent)
    expect(cache.set).toHaveBeenCalledWith('alkane-bal:new111:2', [
      { block: 2, tx: 0, amount: '42' },
    ]);
  });

  it('caches empty balance sheets too', async () => {
    // esplora returns 1 UTXO with no alkanes
    mockFetch.mockResolvedValueOnce(
      rpcResponse([{ txid: 'empty111', vout: 0, value: 100000 }]),
    );

    vi.mocked(cache.get).mockResolvedValueOnce(null);

    // protorunesbyoutpoint returns empty balances
    mockFetch.mockResolvedValueOnce(
      rpcResponse({
        balance_sheet: { cached: { balances: [] } },
      }),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(data.balances).toEqual([]);
    // Empty array cached to avoid rechecking
    expect(cache.set).toHaveBeenCalledWith('alkane-bal:empty111:0', []);
  });

  it('handles RPC failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('RPC timeout'));

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('RPC timeout');
  });

  it('uses correct RPC endpoint per network', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'regtest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://regtest.subfrost.io/v4/subfrost',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('esplora_address::utxo'),
      }),
    );
  });

  it('handles mixed cache hits and misses across UTXOs', async () => {
    // esplora returns 3 UTXOs
    mockFetch.mockResolvedValueOnce(
      rpcResponse([
        { txid: 'tx1', vout: 0, value: 546 },
        { txid: 'tx2', vout: 0, value: 546 },
        { txid: 'tx3', vout: 1, value: 546 },
      ]),
    );

    // tx1:0 cached, tx2:0 not cached, tx3:1 cached
    vi.mocked(cache.get)
      .mockResolvedValueOnce([{ block: 2, tx: 0, amount: '100' }])   // tx1:0 HIT
      .mockResolvedValueOnce(null)                                     // tx2:0 MISS
      .mockResolvedValueOnce([{ block: 32, tx: 0, amount: '500' }]); // tx3:1 HIT

    // Only tx2:0 needs RPC
    mockFetch.mockResolvedValueOnce(
      rpcResponse({
        balance_sheet: {
          cached: {
            balances: [{ block: 2, tx: 0, amount: '200' }],
          },
        },
      }),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);

    const diesel = data.balances.find((b: any) => b.alkaneId === '2:0');
    const frbtc = data.balances.find((b: any) => b.alkaneId === '32:0');
    expect(diesel.balance).toBe('300'); // 100 + 200
    expect(frbtc.balance).toBe('500');

    // 1 esplora call + 1 protorunesbyoutpoint call (only for cache miss)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('defaults to mainnet when network param is missing', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet.subfrost.io/v4/subfrost',
      expect.any(Object),
    );
  });
});
