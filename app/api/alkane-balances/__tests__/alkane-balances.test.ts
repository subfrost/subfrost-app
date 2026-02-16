/**
 * Alkane Balance API Tests
 *
 * Tests the get-alkanes-by-address REST proxy flow.
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

// Helper: build a data API response
function dataApiResponse(items: any[]) {
  return {
    ok: true,
    json: async () => ({ statusCode: 200, data: items }),
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
    mockFetch.mockResolvedValueOnce(dataApiResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
  });

  it('maps alkane balances with metadata', async () => {
    mockFetch.mockResolvedValueOnce(
      dataApiResponse([
        {
          alkaneId: { block: 2, tx: 0 },
          balance: '5000',
          name: 'DIESEL',
          symbol: 'DSL',
          priceUsd: 0.01,
          priceInSatoshi: '100',
          tokenImage: 'https://example.com/diesel.png',
        },
        {
          alkaneId: { block: 32, tx: 0 },
          balance: '1000',
          name: 'frBTC',
          symbol: 'frBTC',
          priceUsd: 90000,
          priceInSatoshi: '100000000',
          tokenImage: 'https://example.com/frbtc.png',
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
    expect(diesel.balance).toBe('5000');
    expect(diesel.name).toBe('DIESEL');
    expect(diesel.symbol).toBe('DSL');
    expect(frbtc.balance).toBe('1000');
    expect(frbtc.name).toBe('frBTC');
  });

  it('handles missing metadata fields gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      dataApiResponse([
        {
          alkaneId: { block: 2, tx: 0 },
          balance: '42',
          // no name, symbol, price, or image
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

  it('handles non-ok response from data API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
    });

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Data API failed: 502');
  });

  it('uses correct endpoint per network', async () => {
    mockFetch.mockResolvedValueOnce(dataApiResponse([]));

    const request = createRequest({ address: 'bc1ptest', network: 'regtest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://regtest.subfrost.io/v4/subfrost/get-alkanes-by-address',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: 'bc1ptest' }),
      }),
    );
  });

  it('defaults to mainnet when network param is missing', async () => {
    mockFetch.mockResolvedValueOnce(dataApiResponse([]));

    const request = createRequest({ address: 'bc1ptest' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet.subfrost.io/v4/subfrost/get-alkanes-by-address',
      expect.any(Object),
    );
  });

  it('makes only one fetch call per request', async () => {
    mockFetch.mockResolvedValueOnce(
      dataApiResponse([
        { alkaneId: { block: 2, tx: 0 }, balance: '100' },
        { alkaneId: { block: 32, tx: 0 }, balance: '200' },
        { alkaneId: { block: 2, tx: 5 }, balance: '300' },
      ]),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    await GET(request as any);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
