/**
 * Tests for `waitForIndexerSync` — the polling utility that replaces
 * the old "Indexer catching up — try again in a moment" hard-throw
 * that mutation hooks used to surface to the user.
 *
 * What we verify:
 *  - Returns immediately on local networks (no polling).
 *  - Reports progress on every poll (caller updates the overlay state).
 *  - Loops until lag === 0, then resolves.
 *  - Honours abort signal (throws AbortError, doesn't hang).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForIndexerSync } from '../waitForIndexerSync';

const realFetch = global.fetch;

function mockFetchSequence(heights: Array<{ metashrew: number; bitcoind: number }>) {
  // Each entry produces one round of paired metashrew_height +
  // btc_getblockcount responses (Promise.all in the impl).
  const responses: Array<number> = [];
  for (const h of heights) {
    responses.push(h.metashrew, h.bitcoind);
  }
  let i = 0;
  global.fetch = vi.fn(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    // serve the corresponding entry — matching by method order:
    // metashrew first, then bitcoind, matching impl's Promise.all.
    const entry = heights[Math.floor(i / 2)] ?? heights[heights.length - 1];
    const value = body.method === 'metashrew_height' ? entry.metashrew : entry.bitcoind;
    i++;
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: value.toString() }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as any;
}

afterEach(() => {
  global.fetch = realFetch;
  vi.useRealTimers();
});

describe('waitForIndexerSync', () => {
  it('returns immediately on local networks (no fetch calls)', async () => {
    global.fetch = vi.fn() as any;
    const result = await waitForIndexerSync({ network: 'devnet' });
    expect(result.lag).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns immediately on regtest-local', async () => {
    global.fetch = vi.fn() as any;
    await waitForIndexerSync({ network: 'regtest-local' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves immediately when already synced (lag=0 on first poll)', async () => {
    mockFetchSequence([{ metashrew: 100, bitcoind: 100 }]);
    const onProgress = vi.fn();
    const result = await waitForIndexerSync({
      network: 'mainnet',
      onProgress,
      intervalMs: 100,
    });
    expect(result.lag).toBe(0);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      metashrewHeight: 100,
      bitcoindHeight: 100,
      lag: 0,
    });
  });

  it('polls until lag resolves and reports progress on each poll', async () => {
    mockFetchSequence([
      { metashrew: 98, bitcoind: 100 }, // lag 2
      { metashrew: 99, bitcoind: 100 }, // lag 1
      { metashrew: 100, bitcoind: 100 }, // lag 0 — done
    ]);
    const onProgress = vi.fn();
    const result = await waitForIndexerSync({
      network: 'mainnet',
      onProgress,
      intervalMs: 1, // fast for tests
    });
    expect(result.lag).toBe(0);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0][0].lag).toBe(2);
    expect(onProgress.mock.calls[1][0].lag).toBe(1);
    expect(onProgress.mock.calls[2][0].lag).toBe(0);
  });

  it('throws AbortError when signal aborts mid-poll', async () => {
    // First poll returns lag=2; abort during the wait before the next poll.
    mockFetchSequence([
      { metashrew: 98, bitcoind: 100 },
      { metashrew: 99, bitcoind: 100 },
    ]);
    const controller = new AbortController();
    const onProgress = vi.fn(() => {
      // Abort right after first onProgress fires.
      controller.abort();
    });
    await expect(
      waitForIndexerSync({
        network: 'mainnet',
        onProgress,
        signal: controller.signal,
        intervalMs: 100,
      }),
    ).rejects.toThrow(/aborted/i);
  });

  it('treats bitcoindHeight=0 as "no remote" and returns without polling', async () => {
    mockFetchSequence([{ metashrew: 0, bitcoind: 0 }]);
    const onProgress = vi.fn();
    const result = await waitForIndexerSync({
      network: 'mainnet',
      onProgress,
      intervalMs: 1,
    });
    expect(result.bitcoindHeight).toBe(0);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
