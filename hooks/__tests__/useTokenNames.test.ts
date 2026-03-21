/** @vitest-environment jsdom */
// @ts-nocheck — test file uses loose mock types
/**
 * useTokenNames Hook & resolveTokenDisplay Tests
 *
 * Tests token name resolution from multiple data sources with priority ordering:
 * tokenNamesMap -> idToUserCurrency -> walletAlkaneNames -> fallback
 *
 * Run with: pnpm test hooks/__tests__/useTokenNames.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseWallet = vi.fn(() => ({
  network: 'mainnet',
}));

vi.mock('@/context/WalletContext', () => ({
  useWallet: (...args: any[]) => mockUseWallet(...args),
}));

// eslint-disable-next-line prefer-const -- initialized once, reassigned per test in beforeEach
let mockFetch = vi.fn();
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
// Import after mocks
// ---------------------------------------------------------------------------

import { useTokenNames, resolveTokenDisplay, type TokenNameEntry } from '../useTokenNames';

// ---------------------------------------------------------------------------
// resolveTokenDisplay tests (pure function)
// ---------------------------------------------------------------------------

describe('resolveTokenDisplay', () => {
  it('returns current symbol when it is already a proper name', () => {
    const result = resolveTokenDisplay('2:0', 'DIESEL', 'DIESEL');
    expect(result.symbol).toBe('DIESEL');
    expect(result.name).toBe('DIESEL');
  });

  it('returns current symbol/name when symbol is proper but name is undefined', () => {
    const result = resolveTokenDisplay('2:0', 'DIESEL', undefined);
    expect(result.symbol).toBe('DIESEL');
    expect(result.name).toBe('DIESEL');
  });

  it('falls back to name when symbol is numeric-only', () => {
    const result = resolveTokenDisplay('2:100', '100', 'METHANE');
    expect(result.symbol).toBe('METHANE');
    expect(result.name).toBe('METHANE');
  });

  it('uses tokenNamesMap (priority 1) when symbol is numeric', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:100', { name: 'METHANE', symbol: 'CH4' });

    const result = resolveTokenDisplay('2:100', '100', undefined, tokenNamesMap);
    expect(result.symbol).toBe('CH4');
    expect(result.name).toBe('METHANE');
  });

  it('uses tokenNamesMap name when only name is non-numeric', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:100', { name: 'METHANE', symbol: '100' });

    const result = resolveTokenDisplay('2:100', '100', undefined, tokenNamesMap);
    expect(result.symbol).toBe('METHANE');
    expect(result.name).toBe('METHANE');
  });

  it('skips tokenNamesMap when both name and symbol are numeric', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:100', { name: '100', symbol: '200' });

    const walletNames = new Map<string, { name: string; symbol: string }>();
    walletNames.set('2:100', { name: 'GOOD_NAME', symbol: 'GN' });

    const result = resolveTokenDisplay('2:100', '100', undefined, tokenNamesMap, undefined, walletNames);
    expect(result.symbol).toBe('GN');
    expect(result.name).toBe('GOOD_NAME');
  });

  it('uses idToUserCurrency (priority 2) when tokenNamesMap has no match', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    // No entry for 2:999

    const idToUserCurrency = new Map<string, any>();
    idToUserCurrency.set('2:999', { name: 'FOOBAR', symbol: 'FOO' });

    const result = resolveTokenDisplay('2:999', '999', undefined, tokenNamesMap, idToUserCurrency);
    expect(result.symbol).toBe('FOO');
    expect(result.name).toBe('FOOBAR');
  });

  it('skips idToUserCurrency when its values contain colons', () => {
    const idToUserCurrency = new Map<string, any>();
    idToUserCurrency.set('2:999', { name: '2:999', symbol: '2:999' });

    const result = resolveTokenDisplay('2:999', '999', undefined, undefined, idToUserCurrency);
    // Should fall through to fallback
    expect(result.symbol).toBe('999');
  });

  it('uses walletAlkaneNames (priority 3) as last named source', () => {
    const walletNames = new Map<string, { name: string; symbol: string }>();
    walletNames.set('2:42', { name: 'GALAXY', symbol: 'GLX' });

    const result = resolveTokenDisplay('2:42', '42', undefined, undefined, undefined, walletNames);
    expect(result.symbol).toBe('GLX');
    expect(result.name).toBe('GALAXY');
  });

  it('falls back to current values when no sources have a match', () => {
    const result = resolveTokenDisplay('2:999', '999', undefined);
    expect(result.symbol).toBe('999');
    expect(result.name).toBe('999');
  });

  it('does not overwrite a proper symbol with map data', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:0', { name: 'DIFFERENT', symbol: 'DIFF' });

    // Symbol is already proper (not numeric, no colon)
    const result = resolveTokenDisplay('2:0', 'DIESEL', 'DIESEL', tokenNamesMap);
    expect(result.symbol).toBe('DIESEL');
  });

  it('treats colon-containing symbols as needing resolution', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:0', { name: 'DIESEL', symbol: 'DIESEL' });

    const result = resolveTokenDisplay('2:0', '2:0', undefined, tokenNamesMap);
    expect(result.symbol).toBe('DIESEL');
  });

  it('returns name for both fields when only name is available in tokenNamesMap', () => {
    const tokenNamesMap = new Map<string, TokenNameEntry>();
    tokenNamesMap.set('2:55', { name: 'ONLYNAME', symbol: '' });

    // symbol='' is falsy, so it falls to name
    const result = resolveTokenDisplay('2:55', '55', undefined, tokenNamesMap);
    // Empty symbol is falsy -> mSym is null, mName is 'ONLYNAME'
    expect(result.symbol).toBe('ONLYNAME');
    expect(result.name).toBe('ONLYNAME');
  });
});

// ---------------------------------------------------------------------------
// useTokenNames hook tests
// ---------------------------------------------------------------------------

describe('useTokenNames', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as any);
    mockUseWallet.mockReturnValue({ network: 'mainnet' });
  });

  it('is disabled when network is empty', () => {
    mockUseWallet.mockReturnValue({ network: '' });

    const { result } = renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches token names on mount when network is set', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        names: {
          '2:0': { name: 'DIESEL', symbol: 'DIESEL' },
          '32:0': { name: 'frBTC', symbol: 'frBTC' },
        },
      }),
    });

    const { result } = renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    const map = result.current.data!;
    expect(map.size).toBe(2);
    expect(map.get('2:0')).toEqual({ name: 'DIESEL', symbol: 'DIESEL' });
    expect(map.get('32:0')).toEqual({ name: 'frBTC', symbol: 'frBTC' });
  });

  it('returns empty map when API returns error status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(result.current.data!.size).toBe(0);
  });

  it('returns empty map when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    // fetchTokenNames catches errors and returns empty map, so isSuccess should become true
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(result.current.data!.size).toBe(0);
  });

  it('calls the correct API endpoint with network parameter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ names: {} }),
    });

    renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled(), { timeout: 5000 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/token-names?network=mainnet&limit=500'),
    );
  });

  it('handles response with missing names field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}), // no .names
    });

    const { result } = renderHook(() => useTokenNames(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 });

    expect(result.current.data!.size).toBe(0);
  });
});
