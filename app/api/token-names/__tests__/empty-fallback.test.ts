/**
 * 200-with-empty fallback in `/api/token-names`.
 *
 * Subfrost's `/get-alkanes` intermittently returns valid HTTP 200 with
 * `data: { tokens: [] }` during indexer drift (same incident shape as
 * PRs #108, #111, #112, #113 for sibling endpoints). The original route
 * only fell back on network errors / non-2xx — empty 200s slipped through
 * and the swap page showed `Loaded 0 token entries` while pair pickers
 * rendered as numeric IDs.
 *
 * This suite mocks `fetch` at the upstream layer to exercise:
 *   - primary 200 with empty tokens → fallback fires and is used
 *   - primary 200 with non-empty tokens → fallback NOT fired
 *   - primary 200 empty + fallback also empty → empty result returned (no crash)
 *   - primary 200 empty + fallback throws → empty result, no crash
 *   - non-mainnet networks → no fallback configured, primary used as-is
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { GET } from '../route';

const SUBFROST_URL = 'https://mainnet.subfrost.io/v4/subfrost/get-alkanes';
const ALKANODE_URL = 'https://oyl.alkanode.com/get-alkanes';

function makeReq(network: string, limit?: number) {
  const url = new URL('http://localhost/api/token-names');
  url.searchParams.set('network', network);
  if (limit) url.searchParams.set('limit', String(limit));
  return new Request(url.toString());
}

function tokenResp(tokens: Array<{ block: number; tx: number; name?: string; symbol?: string; priceUsd?: number }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        tokens: tokens.map((t) => ({
          id: { block: t.block, tx: t.tx },
          name: t.name,
          symbol: t.symbol,
          priceUsd: t.priceUsd,
        })),
      },
    }),
  } as unknown as Response;
}

describe('token-names route — 200-with-empty fallback', () => {
  const fetchSpy = vi.fn();
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    // Force a unique limit per test so the route's in-process `fresh` cache
    // never serves a hit from a sibling test's previous run.
    vi.clearAllMocks();
    fetchSpy.mockReset();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('falls back to alkanode when subfrost returns 200 with empty tokens', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === SUBFROST_URL) return Promise.resolve(tokenResp([]));
      if (url === ALKANODE_URL) {
        return Promise.resolve(
          tokenResp([
            { block: 2, tx: 0, name: 'DIESEL', symbol: 'DIESEL' },
            { block: 32, tx: 0, name: 'frBTC', symbol: 'frBTC' },
          ]),
        );
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const res = await GET(makeReq('mainnet', 501));
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe(SUBFROST_URL);
    expect(fetchSpy.mock.calls[1][0]).toBe(ALKANODE_URL);
    expect(body.count).toBe(2);
    expect(body.names['2:0']).toEqual({ name: 'DIESEL', symbol: 'DIESEL' });
  });

  it('does NOT fall back when subfrost returns at least one token', async () => {
    fetchSpy.mockResolvedValueOnce(
      tokenResp([{ block: 2, tx: 0, name: 'DIESEL', symbol: 'DIESEL' }]),
    );

    const res = await GET(makeReq('mainnet', 502));
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(SUBFROST_URL);
    expect(body.count).toBe(1);
    expect(body.names['2:0']).toEqual({ name: 'DIESEL', symbol: 'DIESEL' });
  });

  it('returns empty result (no crash) when both subfrost AND alkanode return empty', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(tokenResp([])));

    const res = await GET(makeReq('mainnet', 503));
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(body.count).toBe(0);
    expect(body.names).toEqual({});
  });

  it('returns empty result (no crash) when fallback fetch throws', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === SUBFROST_URL) return Promise.resolve(tokenResp([]));
      if (url === ALKANODE_URL) return Promise.reject(new Error('connection refused'));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const res = await GET(makeReq('mainnet', 504));
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(body.count).toBe(0);
  });

  it('does not trigger fallback on non-mainnet networks (no fallback configured)', async () => {
    fetchSpy.mockResolvedValueOnce(tokenResp([]));

    const res = await GET(makeReq('regtest', 505));
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Verify upstream was regtest's, NOT alkanode's
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://regtest.subfrost.io/v4/subfrost/get-alkanes',
    );
    expect(body.count).toBe(0);
  });

  it('preserves price extraction from fallback response (regression: PR #112 fields)', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === SUBFROST_URL) return Promise.resolve(tokenResp([]));
      if (url === ALKANODE_URL) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              tokens: [
                {
                  id: { block: 2, tx: 0 },
                  name: 'DIESEL',
                  symbol: 'DIESEL',
                  priceUsd: 0.0042,
                  priceInSatoshi: 5,
                },
              ],
            },
          }),
        } as unknown as Response);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const res = await GET(makeReq('mainnet', 506));
    const body = await res.json();

    expect(body.prices['2:0']).toEqual({ priceUsd: 0.0042, priceInSatoshi: 5 });
  });
});
