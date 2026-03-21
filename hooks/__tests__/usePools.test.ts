/** @vitest-environment jsdom */
// @ts-nocheck — test file uses loose mock types
/**
 * usePools Hook Tests
 *
 * Tests for pool data fetching, parsing, fallback logic, and helper functions.
 * The hook uses a cascade: Data API -> REST pools-details -> REST token-pairs ->
 * SDK token-pairs -> SDK RPC fallback.
 *
 * Run with: pnpm test hooks/__tests__/usePools.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProvider = {
  dataApiGetAllPoolsDetails: vi.fn(),
  dataApiGetAllTokenPairs: vi.fn(),
  alkanesGetAllPoolsWithDetails: vi.fn(),
};

const mockUseWallet = vi.fn(() => ({
  network: 'mainnet',
  account: null,
  browserWallet: null,
}));

const mockUseAlkanesSDK = vi.fn(() => ({
  provider: mockProvider,
  isReady: true,
}));

vi.mock('@/context/WalletContext', () => ({
  useWallet: (...args: any[]) => mockUseWallet(...args),
}));

vi.mock('@/context/AlkanesSDKContext', () => ({
  useAlkanesSDK: (...args: any[]) => mockUseAlkanesSDK(...args),
}));

vi.mock('@/utils/getConfig', () => ({
  getConfig: vi.fn(() => ({
    ALKANE_FACTORY_ID: '4:65498',
    RPC_URL: 'https://mainnet.subfrost.io/v4/subfrost',
  })),
}));

vi.mock('@/queries/keys', () => ({
  queryKeys: {
    pools: {
      list: (network: string, paramsKey: string) => ['pools', network, paramsKey],
    },
  },
}));

vi.mock('@/lib/alkanes-client', () => ({
  KNOWN_TOKENS: {
    '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
    '32:0': { symbol: 'frBTC', name: 'frBTC', decimals: 8 },
    '2:56801': { symbol: 'bUSD', name: 'bUSD', decimals: 8 },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makePoolApiResponse(overrides: any = {}) {
  return {
    pools: [
      {
        poolId: { block: '2', tx: '77087' },
        poolName: 'DIESEL / frBTC LP',
        token0: { alkaneId: { block: '2', tx: '0' }, name: 'DIESEL', symbol: 'DIESEL' },
        token1: { alkaneId: { block: '32', tx: '0' }, name: 'frBTC', symbol: 'frBTC' },
        poolTvlInUsd: 150000,
        token0TvlInUsd: 75000,
        token1TvlInUsd: 75000,
        poolVolume1dInUsd: 12000,
        poolVolume7dInUsd: 56000,
        poolVolume30dInUsd: 200000,
        poolApr: 15.5,
        token0Amount: '35700000000000',
        token1Amount: '2170000000',
        tokenSupply: '1000000000',
        ...overrides,
      },
    ],
  };
}

function makeSDKFallbackResponse() {
  return {
    pools: [
      {
        pool_id_block: 2,
        pool_id_tx: 77087,
        details: {
          token_a_block: 2,
          token_a_tx: 0,
          token_b_block: 32,
          token_b_tx: 0,
          token_a_name: 'DIESEL',
          token_b_name: 'SUBFROST BTC',
          pool_name: 'DIESEL / SUBFROST BTC LP',
          reserve_a: '35700000000000',
          reserve_b: '2170000000',
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { usePools, type PoolsListItem } from '../usePools';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockUseWallet.mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });
    mockUseAlkanesSDK.mockReturnValue({ provider: mockProvider, isReady: true });
    // Default: token-names returns empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ names: {} }),
    });
  });

  it('is disabled when network is empty', () => {
    mockUseWallet.mockReturnValue({ network: '', account: null, browserWallet: null });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when provider is null', () => {
    mockUseAlkanesSDK.mockReturnValue({ provider: null, isReady: false });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches pools from Data API primary path', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data!.items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].id).toBe('2:77087');
    expect(items[0].token0.symbol).toBe('DIESEL');
    expect(items[0].token1.symbol).toBe('frBTC');
  });

  it('parses TVL, volume, and APR from data API response', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pool = result.current.data!.items[0];
    expect(pool.tvlUsd).toBe(150000);
    expect(pool.vol24hUsd).toBe(12000);
    expect(pool.vol30dUsd).toBe(200000);
    expect(pool.apr).toBe(15.5);
  });

  it('parses reserve amounts from data API response', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pool = result.current.data!.items[0];
    expect(pool.token0Amount).toBe('35700000000000');
    expect(pool.token1Amount).toBe('2170000000');
  });

  it('falls back to REST pools-details when Data API fails', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockRejectedValue(new Error('API down'));

    // Mock the REST fallback fetch
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('get-all-pools-details')) {
        return {
          ok: true,
          json: async () => makePoolApiResponse(),
        };
      }
      // token-names
      return { ok: true, json: async () => ({ names: {} }) };
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.items.length).toBeGreaterThanOrEqual(1);
    expect(result.current.data!.items[0].token0.symbol).toBe('DIESEL');
  });

  it('falls back to REST token-pairs when pools-details REST also fails', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockRejectedValue(new Error('API down'));

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('get-all-pools-details')) {
        return { ok: false, status: 500 };
      }
      if (typeof url === 'string' && url.includes('get-all-token-pairs')) {
        return {
          ok: true,
          json: async () => makePoolApiResponse(),
        };
      }
      return { ok: true, json: async () => ({ names: {} }) };
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.items.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to SDK RPC when all REST paths fail', async () => {
    // Use regtest to bypass the MIN_TVL_USD filter (SDK fallback returns tvlUsd=0)
    mockUseWallet.mockReturnValue({ network: 'subfrost-regtest', account: null, browserWallet: null });
    mockProvider.dataApiGetAllPoolsDetails.mockRejectedValue(new Error('API down'));
    mockProvider.dataApiGetAllTokenPairs.mockRejectedValue(new Error('API down'));

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('get-all-pools-details')) {
        return { ok: false, status: 500 };
      }
      if (typeof url === 'string' && url.includes('get-all-token-pairs')) {
        return { ok: false, status: 500 };
      }
      return { ok: true, json: async () => ({ names: {} }) };
    });

    mockProvider.alkanesGetAllPoolsWithDetails.mockResolvedValue(makeSDKFallbackResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data!.items;
    expect(items.length).toBe(1);
    // SDK fallback has no TVL
    expect(items[0].tvlUsd).toBe(0);
    // SUBFROST BTC should be replaced with frBTC via KNOWN_TOKENS
    expect(items[0].token1.symbol).toBe('frBTC');
  });

  it('skips pools with missing token IDs', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue({
      pools: [
        {
          poolId: { block: '2', tx: '100' },
          poolName: 'DIESEL / frBTC LP',
          token0: null, // missing token0
          token1: { alkaneId: { block: '32', tx: '0' } },
          poolTvlInUsd: 1000,
        },
        // Valid pool
        ...makePoolApiResponse().pools,
      ],
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Only the valid pool should remain
    expect(result.current.data!.items.length).toBe(1);
    expect(result.current.data!.items[0].id).toBe('2:77087');
  });

  it('constructs correct pair label', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.items[0].pairLabel).toBe('DIESEL / frBTC LP');
  });

  it('constructs correct icon URLs', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pool = result.current.data!.items[0];
    expect(pool.token0.iconUrl).toBe('https://cdn.subfrost.io/alkanes/2_0');
    expect(pool.token1.iconUrl).toBe('https://cdn.subfrost.io/alkanes/32_0');
  });

  it('replaces SUBFROST BTC with frBTC in pool names via KNOWN_TOKENS', async () => {
    // Token 32:0 is in KNOWN_TOKENS as frBTC, so even with SUBFROST BTC in poolName
    // the symbol should resolve to frBTC
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue({
      pools: [
        {
          poolId: { block: '2', tx: '77087' },
          poolName: 'DIESEL / SUBFROST BTC LP',
          token0: { alkaneId: { block: '2', tx: '0' } },
          token1: { alkaneId: { block: '32', tx: '0' } },
          poolTvlInUsd: 100,
        },
      ],
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // KNOWN_TOKENS for 32:0 returns 'frBTC' regardless of poolName
    expect(result.current.data!.items[0].token1.symbol).toBe('frBTC');
  });

  it('returns total count matching items length', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.total).toBe(result.current.data!.items.length);
  });

  it('defaults missing TVL/volume/APR fields to zero for known tokens', async () => {
    // Use regtest to bypass MIN_TVL_USD=5 filter (pools with tvlUsd=0 get filtered on mainnet)
    mockUseWallet.mockReturnValue({ network: 'subfrost-regtest', account: null, browserWallet: null });
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue({
      pools: [
        {
          poolId: { block: '2', tx: '77087' },
          poolName: 'DIESEL / frBTC LP',
          token0: { alkaneId: { block: '2', tx: '0' } },
          token1: { alkaneId: { block: '32', tx: '0' } },
          // No TVL/volume/APR fields
        },
      ],
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const pool = result.current.data!.items[0];
    expect(pool.tvlUsd).toBe(0);
    expect(pool.vol24hUsd).toBe(0);
    expect(pool.apr).toBe(0);
  });

  it('handles Data API returning 0 pools and falls through to SDK', async () => {
    // Use regtest to bypass MIN_TVL_USD filter (SDK fallback returns tvlUsd=0)
    mockUseWallet.mockReturnValue({ network: 'subfrost-regtest', account: null, browserWallet: null });
    // Primary returns empty
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue({ pools: [] });
    // dataApiGetAllTokenPairs also empty
    mockProvider.dataApiGetAllTokenPairs.mockResolvedValue({ pools: [] });
    // SDK fallback returns data
    mockProvider.alkanesGetAllPoolsWithDetails.mockResolvedValue(makeSDKFallbackResponse());

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && (url.includes('get-all-pools-details') || url.includes('get-all-token-pairs'))) {
        return { ok: true, json: async () => ({ pools: [] }) };
      }
      return { ok: true, json: async () => ({ names: {} }) };
    });

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should have fallen through to SDK fallback
    expect(result.current.data!.items.length).toBe(1);
  });

  it('parses lpTotalSupply from tokenSupply field', async () => {
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(makePoolApiResponse());

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.items[0].lpTotalSupply).toBe('1000000000');
  });

  it('sets lpTotalSupply undefined when tokenSupply missing', async () => {
    const response = makePoolApiResponse();
    delete response.pools[0].tokenSupply;
    mockProvider.dataApiGetAllPoolsDetails.mockResolvedValue(response);

    const { result } = renderHook(() => usePools(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.items[0].lpTotalSupply).toBeUndefined();
  });
});
