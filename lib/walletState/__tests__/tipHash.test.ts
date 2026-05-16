/**
 * tipHash module tests.
 *
 * Asserts the 5s in-memory cache + the empty-string-on-error contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getCurrentTipHash,
  refreshTipHash,
  __resetTipHashCacheForTests,
} from '../tipHash';

function heightResult(height: number) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result: height }),
  };
}

function hashResult(hash: string) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result: hash }),
  };
}

describe('tipHash', () => {
  beforeEach(() => {
    __resetTipHashCacheForTests();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes by fanning out height + getblockhash', async () => {
    mockFetch
      .mockResolvedValueOnce(heightResult(900_000))
      .mockResolvedValueOnce(hashResult('0xdeadbeef'));

    const hash = await refreshTipHash('mainnet');
    expect(hash).toBe('deadbeef'); // 0x prefix stripped
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First fetch is metashrew_height
    const heightBody = JSON.parse(mockFetch.mock.calls[0][1]?.body ?? '{}');
    expect(heightBody.method).toBe('metashrew_height');

    // Second fetch is getblockhash with the returned height
    const hashBody = JSON.parse(mockFetch.mock.calls[1][1]?.body ?? '{}');
    expect(hashBody.method).toBe('metashrew_getblockhash');
    expect(hashBody.params).toEqual([900_000]);
  });

  it('returns cached value within the 5s TTL window', async () => {
    mockFetch
      .mockResolvedValueOnce(heightResult(900_000))
      .mockResolvedValueOnce(hashResult('abc123'));

    const first = await getCurrentTipHash('mainnet');
    expect(first).toBe('abc123');

    // Second call should NOT touch fetch — both prior fetches consumed.
    const second = await getCurrentTipHash('mainnet');
    expect(second).toBe('abc123');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after the 5s TTL expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch
      .mockResolvedValueOnce(heightResult(900_000))
      .mockResolvedValueOnce(hashResult('aaa'))
      .mockResolvedValueOnce(heightResult(900_001))
      .mockResolvedValueOnce(hashResult('bbb'));

    const first = await getCurrentTipHash('mainnet');
    expect(first).toBe('aaa');

    // Advance past TTL
    vi.advanceTimersByTime(6_000);

    const second = await getCurrentTipHash('mainnet');
    expect(second).toBe('bbb');
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('returns empty string on RPC error (height fetch fails)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('upstream 524'));
    const hash = await refreshTipHash('mainnet');
    expect(hash).toBe('');
  });

  it('returns empty string when getblockhash fails after height succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(heightResult(900_000))
      .mockRejectedValueOnce(new Error('getblockhash 408'));
    const hash = await refreshTipHash('mainnet');
    expect(hash).toBe('');
  });

  it('returns empty string when metashrew_height returns 0 (no tip)', async () => {
    mockFetch.mockResolvedValueOnce(heightResult(0));
    const hash = await refreshTipHash('mainnet');
    expect(hash).toBe('');
    // No getblockhash call when height was invalid
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
