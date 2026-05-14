/**
 * BTC price query: pin canonical-source behavior after the 2026-05-14
 * no-fallbacks strip.
 *
 * Removed three-way fallback chain (subpricer → rpc.ts /api/btc-price →
 * CoinGecko) in favor of subpricer as the only source. These tests pin
 * the new wire shape: exactly one fetch to subpricer, return 0 on any
 * failure (which downstream renders as "—" instead of a mismatched
 * fallback price).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { btcPriceQueryOptions } from '../market';

const SUBPRICER_URL = 'https://mainnet.subfrost.io/v4/subfrost/api/v1/bitcoin-price';

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
  it('queries the subpricer endpoint and returns the usd price', async () => {
    const calls = stubFetch(() => jsonResponse({ usd: 92_345.67 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(92_345.67);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SUBPRICER_URL);
  });

  it('accepts {price: N} response shape too', async () => {
    stubFetch(() => jsonResponse({ price: 80_000 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(80_000);
  });

  it('returns 0 on HTTP error (no CoinGecko fallback)', async () => {
    const calls = stubFetch(() => new Response('upstream down', { status: 503 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    // Critical invariant: ONE fetch call, no fallback chain.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SUBPRICER_URL);
  });

  it('returns 0 on network throw (no rpc.ts fallback)', async () => {
    const calls = stubFetch(() => {
      throw new Error('network unreachable');
    });
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('returns 0 when subpricer returns ok but price = 0 (no fallback chain)', async () => {
    const calls = stubFetch(() => jsonResponse({ usd: 0 }));
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    const result = await opts.queryFn!({} as never);
    expect(result).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('returns 0 when subpricer returns malformed JSON (no fallback chain)', async () => {
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

  it('NEVER calls /api/btc-price (regression guard for the deleted rpc.ts fallback)', async () => {
    const proxyCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/btc-price')) proxyCalls.push(url);
        return new Response('down', { status: 503 });
      }),
    );
    const opts = btcPriceQueryOptions('mainnet', {} as never, true, null);
    await opts.queryFn!({} as never);
    expect(proxyCalls).toEqual([]);
  });
});
