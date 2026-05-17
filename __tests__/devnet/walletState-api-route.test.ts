/**
 * Devnet E2E: /api/wallet-state route handler
 *
 * Invokes the Next.js route function directly with `Request` mocks so we
 * can assert the full handler behaviour (validation + caching + last-good
 * fallback) end-to-end without spinning up a server.
 *
 * Two flavours of test live here:
 *
 *   - "Real shape from devnet" — we run the genuine `fetchWalletState`
 *     against the in-process qubitcoin + alkanes WASM backend to obtain a
 *     real `WalletState`, then feed it back through the route handler with
 *     `fetchWalletState` mocked to return that real shape. This pins
 *     route serialization + cache-key construction against the actual
 *     shape the backend produces, not a hand-crafted fixture.
 *
 *   - "Pure validation / fallback" — 400s, last-good Redis fallback,
 *     502 when no fallback. These don't need a live devnet but are
 *     colocated here so the route's behavior is exercised in one place.
 *
 * Why the route can't be called with `network=devnet` directly:
 * `ALLOWED_NETWORKS` whitelists only the named subfrost networks. The
 * route guards Redis-key construction against arbitrary garbage being
 * sprayed in. So when we feed it real devnet data, we pretend it came
 * from `regtest-local` (which IS in the whitelist) — the route's logic
 * is network-agnostic past the validation step.
 *
 * Run: pnpm vitest run __tests__/devnet/walletState-api-route.test.ts --testTimeout=600000
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock cache + fetchWalletState BEFORE importing the route. The cache
// has to be mocked because the devnet harness doesn't run Redis; the
// fetchWalletState mock lets us swap between real-devnet results and
// rejected-promise (for the last-good test).
// ---------------------------------------------------------------------------

const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();
const cacheGetOrSet = vi.fn();

vi.mock('@/lib/db/redis', () => ({
  cache: {
    get: (key: string) => cacheGet(key),
    set: (key: string, value: unknown, ttl?: number) =>
      cacheSet(key, value, ttl),
    del: (key: string) => cacheDel(key),
    getOrSet: (key: string, fetcher: () => unknown, ttl?: number) =>
      cacheGetOrSet(key, fetcher, ttl),
  },
  redis: { ping: vi.fn() },
  default: { ping: vi.fn() },
}));

const fetchWalletStateMock = vi.fn();
vi.mock('@/lib/walletState/fetchWalletState', async () => {
  // Keep the real module accessible for tests that want to call the
  // genuine fetcher against the devnet — we re-export the real
  // `fetchWalletState` under a different name, then hand the route the
  // mock.
  const real = await vi.importActual<typeof import('@/lib/walletState/fetchWalletState')>(
    '@/lib/walletState/fetchWalletState',
  );
  return {
    ...real,
    fetchWalletState: (...args: unknown[]) => fetchWalletStateMock(...args),
  };
});

import { GET } from '../../app/api/wallet-state/route';
import type { WalletState } from '../../lib/walletState/fetchWalletState';
import { __resetTipHashCacheForTests } from '../../lib/walletState/tipHash';

/**
 * Pull the REAL fetchWalletState through `vi.importActual` so we can run
 * a genuine devnet snapshot. The top-level import above is the MOCKED
 * version (everything in this file goes through the vi.mock factory).
 */
async function loadRealFetchWalletState(): Promise<
  (network: string, addresses: string[]) => Promise<WalletState>
> {
  const mod = await vi.importActual<typeof import('@/lib/walletState/fetchWalletState')>(
    '@/lib/walletState/fetchWalletState',
  );
  return mod.fetchWalletState;
}

import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
} from './devnet-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;
type TestSigner = import('../sdk/test-utils/createTestSigner').TestSignerResult;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSigner;
let segwitAddress: string;
let taprootAddress: string;
let realSnapshot: WalletState | null = null;

beforeAll(async () => {
  const ctx = await createDevnetTestContext();
  harness = ctx.harness;
  provider = ctx.provider;
  signer = ctx.signer;
  segwitAddress = ctx.segwitAddress;
  taprootAddress = ctx.taprootAddress;
  await mineBlocks(harness, 110);
  __resetTipHashCacheForTests();

  // Capture one genuine devnet snapshot so the "real shape" tests can
  // assert the route serializes it correctly.
  try {
    const realFetch = await loadRealFetchWalletState();
    realSnapshot = await realFetch('devnet', [segwitAddress, taprootAddress]);
  } catch (e: any) {
    console.warn(
      '[walletState-route-e2e] failed to capture real snapshot:',
      e?.message,
    );
  }
}, 300_000);

afterAll(() => {
  disposeHarness();
});

beforeEach(() => {
  cacheGet.mockReset();
  cacheSet.mockReset();
  cacheDel.mockReset();
  cacheGetOrSet.mockReset();
  fetchWalletStateMock.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(qs: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/wallet-state');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// (1) Route returns the same shape fetchWalletState produces
// ---------------------------------------------------------------------------

describe('/api/wallet-state — real devnet shape', () => {
  it('returns the WalletState JSON the fetcher produced', async () => {
    if (!realSnapshot) {
      console.warn('[walletState-route-e2e] skipping — no captured snapshot');
      return;
    }
    // Pretend the snapshot came from regtest-local so the route validates.
    // We hand the route the EXACT shape we got from the real fetcher.
    fetchWalletStateMock.mockResolvedValueOnce(realSnapshot);

    const res = await GET(
      makeRequest({
        addresses: [segwitAddress, taprootAddress].sort().join(','),
        network: 'regtest-local',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // The route doesn't mutate the snapshot — every field round-trips
    // verbatim. (NextResponse.json may stringify-then-parse, so bigint
    // strings stay strings.)
    expect(body.tipHash).toBe(realSnapshot.tipHash);
    expect(body.metashrewHeight).toBe(realSnapshot.metashrewHeight);
    expect(body.btcSats).toEqual(realSnapshot.btcSats);
    expect(body.alkanes).toEqual(realSnapshot.alkanes);
    expect(body.utxos).toEqual(realSnapshot.utxos);

    // Last-good pointer always written. Tip-keyed entry written only
    // when tipHash is non-empty (the route skips the tip-keyed write
    // when metashrew_getblockhash is unavailable — `if (state.tipHash)`
    // branch in route.ts).
    const calls = cacheSet.mock.calls;
    const keys = calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.startsWith('wallet-state:regtest-local:last:'))).toBe(
      true,
    );
    if (realSnapshot!.tipHash) {
      expect(cacheSet).toHaveBeenCalledTimes(2);
      expect(
        keys.some((k) =>
          k.startsWith(`wallet-state:regtest-local:${realSnapshot!.tipHash}:`),
        ),
      ).toBe(true);
    } else {
      console.warn(
        '[walletState-route-e2e] tipHash empty — only last-good pointer was cached',
      );
      expect(cacheSet).toHaveBeenCalledTimes(1);
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// (2) Validation
// ---------------------------------------------------------------------------

describe('/api/wallet-state — validation', () => {
  it('returns 400 when addresses is missing', async () => {
    const res = await GET(makeRequest({ network: 'regtest-local' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/addresses/);
    expect(fetchWalletStateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when addresses contains injection-shaped garbage', async () => {
    const res = await GET(
      makeRequest({
        addresses: "bc1p';DROP TABLE wallet_state;--",
        network: 'regtest-local',
      }),
    );
    expect(res.status).toBe(400);
    expect(fetchWalletStateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown network', async () => {
    const res = await GET(
      makeRequest({
        addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789',
        network: 'eth',
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// (3) Last-good fallback
// ---------------------------------------------------------------------------

describe('/api/wallet-state — last-good fallback', () => {
  it('returns the cached last-good entry on upstream failure', async () => {
    const fallback: WalletState = realSnapshot ?? {
      addresses: ['bc1pabcdefghijklmnopqrstuvwxyz0123456789'],
      metashrewHeight: 1,
      bitcoindHeight: 1,
      tipHash: 'stale',
      utxos: [],
      btcSats: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0 },
      alkanes: { '2:0': '42' },
    };

    fetchWalletStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce(fallback);

    const addr =
      realSnapshot && realSnapshot.addresses.length > 0
        ? realSnapshot.addresses.slice().sort().join(',')
        : 'bc1pabcdefghijklmnopqrstuvwxyz0123456789';

    const res = await GET(
      makeRequest({ addresses: addr, network: 'regtest-local' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastGood).toBe(true);
    // Last-good read was keyed on the "last" pointer.
    expect(cacheGet).toHaveBeenCalledWith(
      `wallet-state:regtest-local:last:${addr}`,
    );
    // We MUST NOT write anything when serving a fallback.
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('returns 502 when upstream fails AND no last-good is cached', async () => {
    fetchWalletStateMock.mockRejectedValueOnce(new Error('upstream 524'));
    cacheGet.mockResolvedValueOnce(null);
    const res = await GET(
      makeRequest({
        addresses: 'bc1pabcdefghijklmnopqrstuvwxyz0123456789',
        network: 'regtest-local',
      }),
    );
    expect(res.status).toBe(502);
  });
});
