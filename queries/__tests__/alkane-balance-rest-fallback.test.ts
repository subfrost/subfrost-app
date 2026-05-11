/**
 * REST fallback path in `queries/account.ts::fetchAlkaneBalancesViaProtobuf`.
 *
 * Originally added in PR #112 to recover the balance display when subfrost's
 * per-outpoint indexer drifts and returns `balance_sheet.cached.balances: []`
 * for every dust UTXO at an address. Originally fetched
 * `https://oyl.alkanode.com/get-alkanes-by-address` directly from the browser
 * — a CLAUDE.md "no raw fetch in app code" violation that also relied on
 * permissive third-party CORS AND silently failed to read
 * `process.env.ESPO_MAINNET_FALLBACK_URL` (no `NEXT_PUBLIC_` prefix).
 *
 * Refactored 2026-05-11 (port of PR #115 idea, adapted to our canon):
 *   - Routes through `/api/rpc/{network}/get-alkanes-by-address` so the
 *     server-side proxy resolves the upstream. Per flex, REST sub-paths go
 *     directly to canon Espo (alkanode) with NO subfrost.io fallback.
 *   - The fallback fires when subfrost's per-outpoint fanout produces no
 *     usable data — either uniformly empty results OR every outpoint failed
 *     (Promise.allSettled). The OR-failed branch is unique to our canon and
 *     covers the case where subfrost is timing out (5+ blocks behind tip).
 *
 * This suite mocks the rpc helpers + global fetch and asserts the fallback
 * fires when (and only when) the documented signature matches.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the rpc.ts helpers BEFORE importing account.ts so the imported
// `fetchAlkaneBalancesViaProtobuf` picks up the mocks.
vi.mock('@/lib/alkanes/rpc', () => ({
  getAddressUtxos: vi.fn(),
  getProtorunesByOutpoint: vi.fn(),
  getAddressMempoolTxs: vi.fn(),
  getAlkaneInfoBatch: vi.fn(),
}));

import { fetchAlkaneBalancesViaProtobuf } from '../account';
import * as rpc from '@/lib/alkanes/rpc';

const ADDRESS = 'bc1p0eyy0testaddressformockingpurposesonly0000000';

// Helpers --------------------------------------------------------------

function makeDustUtxos(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    txid: 'a'.repeat(64).slice(0, 63) + i.toString(16),
    vout: 0,
    value: 546,
  }));
}

function emptyBalanceSheet() {
  return { balance_sheet: { cached: { balances: [] } } };
}

function balanceSheet(block: number, tx: number, amount: string | number) {
  return { balance_sheet: { cached: { balances: [{ block, tx, amount }] } } };
}

function mockFallbackResponse(items: Array<{ block: string; tx: string; balance: string }>) {
  return {
    ok: true,
    json: async () => ({
      data: items.map((i) => ({
        alkaneId: { block: i.block, tx: i.tx },
        balance: i.balance,
      })),
    }),
  } as unknown as Response;
}

// Test suite -----------------------------------------------------------

describe('fetchAlkaneBalancesViaProtobuf — REST fallback', () => {
  const fetchSpy = vi.fn();
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockReset();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('fires fallback when subfrost returns empty for every dust UTXO on mainnet', async () => {
    const dust = makeDustUtxos(3);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());

    fetchSpy.mockResolvedValue(
      mockFallbackResponse([{ block: '2', tx: '0', balance: '264482' }]),
    );

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/rpc/mainnet/get-alkanes-by-address');
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: ADDRESS }),
    });
    expect(result).toEqual([
      { alkaneId: { block: '2', tx: '0' }, balance: '264482' },
    ]);
  });

  it('fires fallback when EVERY per-outpoint call fails (subfrost timing out)', async () => {
    // Unique to our canon: with Promise.allSettled, individual failures
    // don't poison Promise.all. When all 3 outpoints fail, aggregate.size === 0
    // AND failures === dustUtxos.length, so the fallback fires.
    const dust = makeDustUtxos(3);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockRejectedValue(
      new Error('subfrost timeout'),
    );

    fetchSpy.mockResolvedValue(
      mockFallbackResponse([{ block: '2', tx: '0', balance: '264482' }]),
    );

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { alkaneId: { block: '2', tx: '0' }, balance: '264482' },
    ]);
  });

  it('does NOT fire fallback when subfrost returns at least one balance', async () => {
    const dust = makeDustUtxos(3);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint)
      .mockResolvedValueOnce(balanceSheet(2, 0, 100))
      .mockResolvedValueOnce(emptyBalanceSheet())
      .mockResolvedValueOnce(emptyBalanceSheet());

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual([
      { alkaneId: { block: '2', tx: '0' }, balance: '100' },
    ]);
  });

  it('partial failures do NOT poison results — successes are aggregated', async () => {
    // 1 success + 2 failures: aggregate has the success, no fallback fires
    // because aggregate.size > 0. (failures > 0 alone is not the trigger.)
    const dust = makeDustUtxos(3);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint)
      .mockResolvedValueOnce(balanceSheet(2, 0, 100))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual([
      { alkaneId: { block: '2', tx: '0' }, balance: '100' },
    ]);
  });

  it('does NOT fire fallback on non-mainnet networks (alkanode hosts mainnet only)', async () => {
    const dust = makeDustUtxos(3);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());

    const result = await fetchAlkaneBalancesViaProtobuf('regtest', ADDRESS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('does NOT fire fallback when address has no dust UTXOs', async () => {
    // Wallet holds only BTC, no token-carrying dust outpoints. The
    // empty-aggregate signature alone is not enough — we also require
    // dustUtxos.length > 0, otherwise the user just doesn't hold alkanes.
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue([
      { txid: 'a'.repeat(64), vout: 0, value: 100_000 }, // non-dust BTC
    ]);

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(rpc.getProtorunesByOutpoint).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('returns empty when fallback itself returns no data (subfrost + REST both empty)', async () => {
    // Genuinely empty wallet that happens to have a few dust UTXOs (e.g. spent
    // inscription dust). Fallback fires, returns empty, primary's empty
    // aggregate is returned — no phantom data injected.
    const dust = makeDustUtxos(2);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());

    fetchSpy.mockResolvedValue(mockFallbackResponse([]));

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('routes through proxy URL — never raw alkanode.com from the browser', async () => {
    // Hard guarantee: no client-side raw fetch to oyl.alkanode.com.
    // The proxy resolves the upstream server-side via REST_PRIMARY_BASE_URLS
    // (alkanode primary on mainnet, per flex 2026-05-10).
    const dust = makeDustUtxos(1);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());
    fetchSpy.mockResolvedValue(mockFallbackResponse([]));

    await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    for (const call of fetchSpy.mock.calls) {
      const url = String(call[0]);
      expect(url).not.toMatch(/alkanode\.com/);
      expect(url).not.toMatch(/^https?:\/\//); // must be same-origin
    }
  });

  it('survives fallback fetch throwing (network error) without crashing the caller', async () => {
    const dust = makeDustUtxos(1);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);

    // Fallback exception is caught; the primary's empty aggregate is returned.
    expect(result).toEqual([]);
  });

  it('survives fallback returning non-2xx without crashing the caller', async () => {
    const dust = makeDustUtxos(1);
    vi.mocked(rpc.getAddressUtxos).mockResolvedValue(dust);
    vi.mocked(rpc.getProtorunesByOutpoint).mockResolvedValue(emptyBalanceSheet());
    fetchSpy.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as unknown as Response);

    const result = await fetchAlkaneBalancesViaProtobuf('mainnet', ADDRESS);
    expect(result).toEqual([]);
  });
});
