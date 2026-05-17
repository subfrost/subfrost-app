/**
 * /api/wallet-state route tests.
 *
 * Asserts:
 *   - Param validation (addresses + network)
 *   - Cache key includes the resolved tip hash
 *   - Last-good fallback on upstream error
 *   - Cache write writes BOTH the tip-keyed entry AND the "last" pointer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the cache module BEFORE importing the route.
// We assert against the spy directly rather than going through ioredis.
// ---------------------------------------------------------------------------
const cacheGet = vi.fn();
const cacheSet = vi.fn();

vi.mock('@/lib/db/redis', () => ({
  cache: {
    get: (key: string) => cacheGet(key),
    set: (key: string, value: unknown, ttl?: number) => cacheSet(key, value, ttl),
    del: vi.fn(),
    getOrSet: vi.fn(),
  },
  redis: { ping: vi.fn() },
  default: { ping: vi.fn() },
}));

const fetchWalletStateMock = vi.fn();
vi.mock('@/lib/walletState/fetchWalletState', () => ({
  fetchWalletState: (...args: unknown[]) => fetchWalletStateMock(...args),
  ALKANE_DUST_MAX: 1000,
}));

import { GET } from '../route';

function makeRequest(qs: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/wallet-state');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' });
}

describe('GET /api/wallet-state', () => {
  beforeEach(() => {
    cacheGet.mockReset();
    cacheSet.mockReset();
    fetchWalletStateMock.mockReset();
  });

  it('returns 400 when addresses param is missing', async () => {
    const res = await GET(makeRequest({ network: 'mainnet' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/addresses/);
    expect(fetchWalletStateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when network is unknown', async () => {
    const res = await GET(makeRequest({ addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789', network: 'eth' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when an address looks malformed (XSS / injection)', async () => {
    const res = await GET(makeRequest({ addresses: "bc1p';DROP", network: 'mainnet' }));
    expect(res.status).toBe(400);
  });

  it('writes BOTH tip-keyed entry AND last-good pointer on success', async () => {
    const sampleState = {
      addresses: ['bc1pabcdefghijklmnopqrstuvwxyz0123456789'],
      metashrewHeight: 900_000,
      bitcoindHeight: 900_000,
      tipHash: 'deadbeef',
      utxos: [],
      btcSats: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0 },
      alkanes: {},
    };
    fetchWalletStateMock.mockResolvedValueOnce(sampleState);

    const res = await GET(makeRequest({ addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789', network: 'mainnet' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tipHash).toBe('deadbeef');

    // Tip-keyed write
    expect(cacheSet).toHaveBeenCalledWith(
      'wallet-state:mainnet:deadbeef:bc1pabcdefghijklmnopqrstuvwxyz0123456789',
      sampleState,
      600,
    );
    // Last-good pointer write
    expect(cacheSet).toHaveBeenCalledWith(
      'wallet-state:mainnet:last:bc1pabcdefghijklmnopqrstuvwxyz0123456789',
      sampleState,
      60 * 60 * 24,
    );
  });

  it('serves last-good on upstream failure with lastGood:true marker', async () => {
    fetchWalletStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce({
      addresses: ['bc1pabcdefghijklmnopqrstuvwxyz0123456789'],
      metashrewHeight: 899_999,
      bitcoindHeight: 900_000,
      tipHash: 'stale',
      utxos: [],
      btcSats: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0 },
      alkanes: { '2:0': '100' },
    });

    const res = await GET(makeRequest({ addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789', network: 'mainnet' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.lastGood).toBe(true);
    expect(body.alkanes).toEqual({ '2:0': '100' });
    expect(cacheGet).toHaveBeenCalledWith(
      'wallet-state:mainnet:last:bc1pabcdefghijklmnopqrstuvwxyz0123456789',
    );
  });

  it('returns 502 when upstream fails AND no last-good is cached', async () => {
    fetchWalletStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce(null);

    const res = await GET(makeRequest({ addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789', network: 'mainnet' }));
    expect(res.status).toBe(502);
  });

  it('sorts + dedupes addresses for stable cache keys', async () => {
    fetchWalletStateMock.mockResolvedValueOnce({
      addresses: ['bc1zzzzzzzzzzzzzzzzzzzzzzzzzzzz', 'bc1aaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      metashrewHeight: 1,
      bitcoindHeight: 1,
      tipHash: 'ab',
      utxos: [],
      btcSats: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0 },
      alkanes: {},
    });

    await GET(makeRequest({
      addresses: 'bc1zzzzzzzzzzzzzzzzzzzzzzzzzzzz,bc1aaaaaaaaaaaaaaaaaaaaaaaaaaa,bc1aaaaaaaaaaaaaaaaaaaaaaaaaaa',
      network: 'mainnet',
    }));

    expect(fetchWalletStateMock).toHaveBeenCalledWith(
      'mainnet',
      ['bc1aaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bc1zzzzzzzzzzzzzzzzzzzzzzzzzzzz'],
    );
    expect(cacheSet).toHaveBeenCalledWith(
      'wallet-state:mainnet:ab:bc1aaaaaaaaaaaaaaaaaaaaaaaaaaa,bc1zzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      expect.anything(),
      600,
    );
  });
});
