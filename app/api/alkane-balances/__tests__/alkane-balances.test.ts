/**
 * Alkane Balance API Tests
 *
 * Tests the alkanes_protorunesbyaddress RPC aggregation flow.
 *
 * Run with: pnpm test app/api/alkane-balances/__tests__/alkane-balances.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '../route';

// Helper to create a mock NextRequest with query params
function createRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/alkane-balances');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: 'GET' });
}

// Helper: build an RPC response with outpoints
function rpcResponse(outpoints: any[]) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result: { outpoints } }),
  };
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

  it('returns empty balances when address has no alkanes', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
  });

  it('aggregates alkane balances across outpoints', async () => {
    mockFetch.mockResolvedValueOnce(
      rpcResponse([
        {
          balance_sheet: {
            cached: {
              balances: [
                { block: 2, tx: 0, amount: '3000' },
                { block: 32, tx: 0, amount: '1000' },
              ],
            },
          },
        },
        {
          balance_sheet: {
            cached: {
              balances: [
                { block: 2, tx: 0, amount: '2000' },
              ],
            },
          },
        },
      ]),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toHaveLength(2);

    const diesel = data.balances.find((b: any) => b.alkaneId === '2:0');
    const frbtc = data.balances.find((b: any) => b.alkaneId === '32:0');
    expect(diesel.balance).toBe('5000'); // 3000 + 2000
    expect(frbtc.balance).toBe('1000');
  });

  it('handles missing metadata fields gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      rpcResponse([
        {
          balance_sheet: {
            cached: {
              balances: [{ block: 2, tx: 0, amount: '42' }],
            },
          },
        },
      ]),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toEqual([
      {
        alkaneId: '2:0',
        balance: '42',
        name: '',
        symbol: '',
        priceUsd: 0,
        priceInSatoshi: 0,
        tokenImage: '',
      },
    ]);
  });

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Network error');
  });

  it('handles non-ok response from RPC', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
    });

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('RPC failed: 502');
  });

  it('uses correct endpoint per network', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'regtest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://regtest.subfrost.io/v4/subfrost',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alkanes_protorunesbyaddress',
          params: [{ address: 'bc1ptest', protocolTag: '1' }],
        }),
      },
    );
  });

  it('defaults to mainnet when network param is missing', async () => {
    mockFetch.mockResolvedValueOnce(rpcResponse([]));

    const request = createRequest({ address: 'bc1ptest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet.subfrost.io/v4/subfrost',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('makes only one fetch call per request', async () => {
    mockFetch.mockResolvedValueOnce(
      rpcResponse([
        {
          balance_sheet: {
            cached: {
              balances: [
                { block: 2, tx: 0, amount: '100' },
                { block: 32, tx: 0, amount: '200' },
                { block: 2, tx: 5, amount: '300' },
              ],
            },
          },
        },
      ]),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
