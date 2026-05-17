/**
 * BTC price query: pin canonical-source behavior after the 2026-05-14
 * subpricer-via-backend swap.
 *
 * The frontend calls the same-origin `/api/btc-price` proxy, which the
 * backend fans out to subpricer (`mainnet.subfrost.io/v4/subfrost/
 * get-bitcoin-price` from subkube). No fallback chain — on failure we
 * return 0 and downstream USD displays render "—" instead of a
 * mismatched aggregator price.
 *
 * These tests pin: (1) the proxy is the only URL hit, (2) the response
 * shape `{usd: number}` is parsed correctly, and (3) failure modes
 * return 0 instead of bubbling.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { btcPriceQueryOptions } from '../market';

const PROXY_URL = '/api/btc-price';

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: { url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push({ url });
      return handler(url);
    }),
  );
  return calls;
}

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('btcPriceQueryOptions — canonical source only', () => {
  it('queries /api/btc-price proxy and returns the usd price', async () => {
    const calls = stubFetch(() => jsonResponse({ usd: 92_345.67, timestamp: 1 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(92_345.67);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PROXY_URL);
  });

  it('returns 0 on HTTP 502 (proxy reports subpricer outage)', async () => {
    const calls = stubFetch(() => jsonResponse({ usd: 0, error: 'subpricer down' }, 502));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PROXY_URL);
  });

  it('returns 0 on network throw', async () => {
    const calls = stubFetch(() => {
      throw new Error('network unreachable');
    });
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('returns 0 when proxy returns usd=0', async () => {
    const calls = stubFetch(() => jsonResponse({ usd: 0 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('returns 0 when proxy returns malformed JSON', async () => {
    const calls = stubFetch(() =>
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('NEVER calls subpricer direct (regression guard — must route through proxy)', async () => {
    const subpricerCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('subfrost.io')) subpricerCalls.push(url);
        return new Response('down', { status: 503 });
      }),
    );
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    await opts.queryFn!({} as never);
    expect(subpricerCalls).toEqual([]);
  });

  it('NEVER calls coingecko (regression guard for the deleted fallback)', async () => {
    const coingeckoCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('coingecko')) coingeckoCalls.push(url);
        return new Response('down', { status: 503 });
      }),
    );
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    await opts.queryFn!({} as never);
    expect(coingeckoCalls).toEqual([]);
  });
});
