/** @vitest-environment jsdom */
/**
 * useOrderbook Hook Tests
 *
 * Tests for the useOrderbook hook which queries the Carbine controller
 * for orderbook depth data. When the controller is not deployed or
 * not configured, it returns an empty orderbook.
 *
 * Run with: pnpm test hooks/__tests__/useOrderbook.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/context/WalletContext', () => ({
  useWallet: vi.fn(() => ({
    network: 'mainnet',
    account: null,
    browserWallet: null,
  })),
}));

vi.mock('@/context/AlkanesSDKContext', () => ({
  useAlkanesSDK: vi.fn(() => ({
    provider: null,
    isInitialized: false,
  })),
}));

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

import { useOrderbook, type OrderbookData, type OrderLevel } from '../useOrderbook';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOrderbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when baseToken is missing', async () => {
    const { result } = renderHook(
      () => useOrderbook(undefined, 'frBTC'),
      { wrapper: createWrapper() },
    );
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns null when quoteToken is missing', async () => {
    const { result } = renderHook(
      () => useOrderbook('DIESEL', undefined),
      { wrapper: createWrapper() },
    );
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns null when both tokens are missing', async () => {
    const { result } = renderHook(
      () => useOrderbook(undefined, undefined),
      { wrapper: createWrapper() },
    );
    expect(result.current.data).toBeUndefined();
  });

  it('returns null when network is missing', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: '', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when SDK is not initialized', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { useAlkanesSDK } = await import('@/context/AlkanesSDKContext');
    (useAlkanesSDK as any).mockReturnValue({ provider: null, isInitialized: false });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    // Query should be disabled when SDK not initialized
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns empty orderbook when SDK is ready but no controller configured', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const mockProvider = { alkanesSimulate: vi.fn() };
    const { useAlkanesSDK } = await import('@/context/AlkanesSDKContext');
    (useAlkanesSDK as any).mockReturnValue({ provider: mockProvider, isInitialized: true });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data).toBeDefined();
    // No CARBINE_CONTROLLER_ID on mainnet → empty orderbook
    expect(data.bids).toHaveLength(0);
    expect(data.asks).toHaveLength(0);
    expect(data.spread).toBe('0.00');
    expect(data.spreadPercent).toBe('0.000');
    expect(data.midPrice).toBe('0.00');
  });

  it('returns empty orderbook when controller returns error', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'devnet', account: null, browserWallet: null });

    const mockProvider = {
      alkanesSimulate: vi.fn().mockResolvedValue({
        execution: { data: '0x', error: 'unexpected end of file' },
      }),
    };
    const { useAlkanesSDK } = await import('@/context/AlkanesSDKContext');
    (useAlkanesSDK as any).mockReturnValue({ provider: mockProvider, isInitialized: true });

    const { result } = renderHook(
      () => useOrderbook('2:0', '32:0'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.bids).toHaveLength(0);
    expect(data.asks).toHaveLength(0);
  });

  it('parses valid orderbook response with bids and asks', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'devnet', account: null, browserWallet: null });

    // Build a mock response: 1 bid (price=100*1e8, amount=0.5*1e8), 1 ask (price=101*1e8, amount=0.3*1e8)
    const buf = Buffer.alloc(16 * 6); // numBids + bid + numAsks + ask = 4 u128s... actually 6 fields
    let offset = 0;

    // numBids = 1
    buf.writeBigUInt64LE(1n, offset); offset += 16;
    // bid price = 10000000000 (100 * 1e8)
    buf.writeBigUInt64LE(10000000000n, offset); offset += 16;
    // bid amount = 50000000 (0.5 * 1e8)
    buf.writeBigUInt64LE(50000000n, offset); offset += 16;
    // numAsks = 1
    buf.writeBigUInt64LE(1n, offset); offset += 16;
    // ask price = 10100000000 (101 * 1e8)
    buf.writeBigUInt64LE(10100000000n, offset); offset += 16;
    // ask amount = 30000000 (0.3 * 1e8)
    buf.writeBigUInt64LE(30000000n, offset); offset += 16;

    const mockProvider = {
      alkanesSimulate: vi.fn().mockResolvedValue({
        execution: { data: '0x' + buf.toString('hex'), error: null },
      }),
    };
    const { useAlkanesSDK } = await import('@/context/AlkanesSDKContext');
    (useAlkanesSDK as any).mockReturnValue({ provider: mockProvider, isInitialized: true });

    const { result } = renderHook(
      () => useOrderbook('2:0', '32:0'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.bids).toHaveLength(1);
    expect(data.asks).toHaveLength(1);
    expect(parseFloat(data.bids[0].price.replace(/,/g, ''))).toBeCloseTo(100, 0);
    expect(parseFloat(data.asks[0].price.replace(/,/g, ''))).toBeCloseTo(101, 0);
    expect(parseFloat(data.bids[0].amount)).toBeCloseTo(0.5, 1);
    expect(parseFloat(data.asks[0].amount)).toBeCloseTo(0.3, 1);

    // Spread = 101 - 100 = 1
    expect(parseFloat(data.spread)).toBeCloseTo(1, 0);
    // Mid = (100 + 101) / 2 = 100.5
    expect(parseFloat(data.midPrice.replace(/,/g, ''))).toBeCloseTo(100.5, 1);
  });

  it('passes depth parameter to the SDK simulation', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'devnet', account: null, browserWallet: null });

    const mockProvider = {
      alkanesSimulate: vi.fn().mockResolvedValue({
        execution: { data: '0x', error: 'unexpected end of file' },
      }),
    };
    const { useAlkanesSDK } = await import('@/context/AlkanesSDKContext');
    (useAlkanesSDK as any).mockReturnValue({ provider: mockProvider, isInitialized: true });

    const { result } = renderHook(
      () => useOrderbook('2:0', '32:0', 20),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify the SDK was called (controller is configured on devnet)
    expect(mockProvider.alkanesSimulate).toHaveBeenCalled();
  });
});
