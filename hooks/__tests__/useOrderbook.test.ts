/** @vitest-environment jsdom */
/**
 * useOrderbook Hook Tests
 *
 * Tests for the useOrderbook hook which generates mock orderbook data.
 * Verifies structure, ordering, spread calculation, and edge cases.
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
    // Query should be disabled, data should be undefined
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

  it('returns valid orderbook structure with bids/asks/spread/midPrice', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data).toBeDefined();
    expect(data.bids).toBeDefined();
    expect(data.asks).toBeDefined();
    expect(typeof data.spread).toBe('string');
    expect(typeof data.spreadPercent).toBe('string');
    expect(typeof data.midPrice).toBe('string');
  });

  it('has 15 bid levels and 15 ask levels', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.bids).toHaveLength(15);
    expect(result.current.data!.asks).toHaveLength(15);
  });

  it('has correct bid ordering (highest price first, decreasing)', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const bids = result.current.data!.bids;
    for (let i = 1; i < bids.length; i++) {
      const prevPrice = parseFloat(bids[i - 1].price.replace(/,/g, ''));
      const currPrice = parseFloat(bids[i].price.replace(/,/g, ''));
      expect(prevPrice).toBeGreaterThan(currPrice);
    }
  });

  it('has correct ask ordering (lowest price first, increasing)', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const asks = result.current.data!.asks;
    for (let i = 1; i < asks.length; i++) {
      const prevPrice = parseFloat(asks[i - 1].price.replace(/,/g, ''));
      const currPrice = parseFloat(asks[i].price.replace(/,/g, ''));
      expect(prevPrice).toBeLessThan(currPrice);
    }
  });

  it('cumulative totals increase down the bid book', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const bids = result.current.data!.bids;
    for (let i = 1; i < bids.length; i++) {
      const prevTotal = parseFloat(bids[i - 1].total.replace(/,/g, ''));
      const currTotal = parseFloat(bids[i].total.replace(/,/g, ''));
      expect(currTotal).toBeGreaterThan(prevTotal);
    }
  });

  it('cumulative totals increase down the ask book', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const asks = result.current.data!.asks;
    for (let i = 1; i < asks.length; i++) {
      const prevTotal = parseFloat(asks[i - 1].total.replace(/,/g, ''));
      const currTotal = parseFloat(asks[i].total.replace(/,/g, ''));
      expect(currTotal).toBeGreaterThan(prevTotal);
    }
  });

  it('spread is the difference between best ask and best bid', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    // The mock uses midPrice=99875, halfSpread=25 => bestBid=99850, bestAsk=99900
    // spread = 50
    expect(data.spread).toBe('50.00');
  });

  it('mid price is the average of best bid and best ask', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    // midPrice should be 99875.00 formatted with locale
    expect(data.midPrice).toContain('99');
    expect(data.midPrice).toContain('875');
  });

  it('spread percent is correctly calculated', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    // spreadPercent = (50 / 99875) * 100 = 0.050...
    const spreadPct = parseFloat(data.spreadPercent);
    expect(spreadPct).toBeGreaterThan(0.04);
    expect(spreadPct).toBeLessThan(0.06);
  });

  it('each order level has valid price, amount, and total fields', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    const allLevels = [...data.bids, ...data.asks];
    for (const level of allLevels) {
      expect(typeof level.price).toBe('string');
      expect(typeof level.amount).toBe('string');
      expect(typeof level.total).toBe('string');
      // Amount should be a number string with decimals
      expect(parseFloat(level.amount)).toBeGreaterThan(0);
      // Price should be positive
      expect(parseFloat(level.price.replace(/,/g, ''))).toBeGreaterThan(0);
    }
  });

  it('returns the same cached book on subsequent calls', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const wrapper = createWrapper();
    const { result: result1 } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper },
    );

    await waitFor(() => expect(result1.current.isSuccess).toBe(true));

    const { result: result2 } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper },
    );

    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    // The amounts are random but the mock caches after first generation,
    // so the two results from the same query client should be the same data
    expect(result1.current.data!.spread).toBe(result2.current.data!.spread);
    expect(result1.current.data!.midPrice).toBe(result2.current.data!.midPrice);
  });

  it('bid prices are all below the mid price', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    const midPrice = parseFloat(data.midPrice.replace(/,/g, ''));
    for (const bid of data.bids) {
      const bidPrice = parseFloat(bid.price.replace(/,/g, ''));
      expect(bidPrice).toBeLessThan(midPrice);
    }
  });

  it('ask prices are all above the mid price', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    const midPrice = parseFloat(data.midPrice.replace(/,/g, ''));
    for (const ask of data.asks) {
      const askPrice = parseFloat(ask.price.replace(/,/g, ''));
      expect(askPrice).toBeGreaterThan(midPrice);
    }
  });
});
