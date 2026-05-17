/**
 * Devnet E2E: /api/pool-state/[poolId] route handler
 *
 * Mirrors walletState-api-route.test.ts: invokes the route function
 * directly with a `Request` mock, asserts validation, real-shape
 * serialization, and the last-good Redis fallback.
 *
 * Unlike the wallet-state route, deploying a real pool on the devnet
 * harness is non-trivial (see walletState-fetchPoolState.test.ts for
 * the full deploy stack). For the route-shape tests we use a
 * hand-crafted `PoolState` fixture matching the structure
 * `fetchPoolState` produces — this is OK because:
 *
 *   (a) The real-data path is already exercised in
 *       walletState-fetchPoolState.test.ts.
 *   (b) The fixture matches the `PoolState` interface, so any drift in
 *       the route's serialization would surface there.
 *
 * Run: pnpm vitest run __tests__/devnet/walletState-api-pool-route.test.ts --testTimeout=120000
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const cacheGet = vi.fn();
const cacheSet = vi.fn();

vi.mock('@/lib/db/redis', () => ({
  cache: {
    get: (key: string) => cacheGet(key),
    set: (key: string, value: unknown, ttl?: number) =>
      cacheSet(key, value, ttl),
    del: vi.fn(),
    getOrSet: vi.fn(),
  },
  redis: { ping: vi.fn() },
  default: { ping: vi.fn() },
}));

const fetchPoolStateMock = vi.fn();
vi.mock('@/lib/walletState/fetchPoolState', async () => {
  const real = await vi.importActual<typeof import('@/lib/walletState/fetchPoolState')>(
    '@/lib/walletState/fetchPoolState',
  );
  return {
    ...real,
    fetchPoolState: (...args: unknown[]) => fetchPoolStateMock(...args),
  };
});

import { GET } from '../../app/api/pool-state/[poolId]/route';
import type { PoolState } from '../../lib/walletState/fetchPoolState';

function makeRequest(qs: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/pool-state/foo');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' });
}

function sampleState(overrides: Partial<PoolState> = {}): PoolState {
  return {
    poolId: '2:123',
    token0Id: '2:0',
    token1Id: '32:0',
    reserves0: '100000000',
    reserves1: '1000000',
    totalSupply: '10000000',
    fee: 30,
    name: 'DIESEL/frBTC',
    metashrewHeight: 900_000,
    tipHash: 'feedfacecafebeef',
    ...overrides,
  };
}

beforeEach(() => {
  cacheGet.mockReset();
  cacheSet.mockReset();
  fetchPoolStateMock.mockReset();
});

// ---------------------------------------------------------------------------
// (1) Valid poolId → reserves JSON
// ---------------------------------------------------------------------------

describe('/api/pool-state/[poolId] — happy path', () => {
  it('returns the PoolState JSON for a valid poolId', async () => {
    const state = sampleState();
    fetchPoolStateMock.mockResolvedValueOnce(state);

    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: '2:123' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poolId).toBe('2:123');
    expect(body.token0Id).toBe('2:0');
    expect(body.token1Id).toBe('32:0');
    expect(body.reserves0).toBe('100000000');
    expect(body.reserves1).toBe('1000000');
    expect(body.fee).toBe(30);
    expect(body.tipHash).toBe('feedfacecafebeef');

    // BOTH the tip-keyed cache entry AND the last-good pointer were written.
    expect(cacheSet).toHaveBeenCalledTimes(2);
    const keys = cacheSet.mock.calls.map((c) => c[0] as string);
    expect(keys).toContain('pool-state:regtest-local:feedfacecafebeef:2:123');
    expect(keys).toContain('pool-state:regtest-local:last:2:123');
  });

  it('handles the Next 15 params-as-Promise shape', async () => {
    fetchPoolStateMock.mockResolvedValueOnce(sampleState({ poolId: '4:7020' }));
    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: Promise.resolve({ poolId: '4:7020' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poolId).toBe('4:7020');
  });
});

// ---------------------------------------------------------------------------
// (2) Validation
// ---------------------------------------------------------------------------

describe('/api/pool-state/[poolId] — validation', () => {
  it('returns 400 when poolId is not of the form block:tx', async () => {
    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: 'notapoolid' } },
    );
    expect(res.status).toBe(400);
    expect(fetchPoolStateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when poolId contains slashes (route injection)', async () => {
    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: '2:123/etc/passwd' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown network', async () => {
    const res = await GET(
      makeRequest({ network: 'eth' }),
      { params: { poolId: '2:123' } },
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// (3) Last-good fallback
// ---------------------------------------------------------------------------

describe('/api/pool-state/[poolId] — last-good fallback', () => {
  it('serves last-good with lastGood:true marker when the fetcher throws', async () => {
    const fallback = sampleState({ reserves0: '999', tipHash: 'stale' });
    fetchPoolStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce(fallback);

    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: '2:123' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastGood).toBe(true);
    expect(body.reserves0).toBe('999');
    expect(cacheGet).toHaveBeenCalledWith('pool-state:regtest-local:last:2:123');
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('serves last-good when the fetcher returns null (degraded simulate)', async () => {
    const fallback = sampleState({ reserves0: '777', tipHash: 'stale' });
    fetchPoolStateMock.mockResolvedValueOnce(null);
    cacheGet.mockResolvedValueOnce(fallback);

    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: '2:123' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastGood).toBe(true);
    expect(body.reserves0).toBe('777');
  });

  it('returns 502 when upstream fails AND no last-good is cached', async () => {
    fetchPoolStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce(null);
    const res = await GET(
      makeRequest({ network: 'regtest-local' }),
      { params: { poolId: '2:123' } },
    );
    expect(res.status).toBe(502);
  });
});
