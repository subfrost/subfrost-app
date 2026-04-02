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

import { useOrderbook, parseOrderbookResponse, readU128LE, readU32LE, type OrderbookData, type OrderLevel } from '../useOrderbook';

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

  it('returns empty bids and asks when carbine controller is not reachable', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Without a reachable carbine controller, the hook falls back to an empty orderbook
    expect(result.current.data!.bids).toHaveLength(0);
    expect(result.current.data!.asks).toHaveLength(0);
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

  it('spread is zero when orderbook is empty (no carbine controller)', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.spread).toBe('0.00');
  });

  it('mid price is zero when orderbook is empty', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.midPrice).toBe('0.00');
  });

  it('spread percent is zero when orderbook is empty', async () => {
    const { useWallet } = await import('@/context/WalletContext');
    (useWallet as any).mockReturnValue({ network: 'mainnet', account: null, browserWallet: null });

    const { result } = renderHook(
      () => useOrderbook('DIESEL', 'frBTC'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.spreadPercent).toBe('0.000');
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

// ===========================================================================
// Binary parsing tests — exercises the contract↔UI bridge directly
// ===========================================================================

/** Encode a number as 4-byte little-endian u32 */
function encodeU32LE(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n, 0);
  return buf;
}

/** Encode a bigint as 16-byte little-endian u128 */
function encodeU128LE(n: bigint): Buffer {
  const buf = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    buf[i] = Number((n >> BigInt(i * 8)) & 0xFFn);
  }
  return buf;
}

/**
 * Build a hex-encoded orderbook response matching the Carbine contract format.
 * Format: u32 numBids + bids*(u128 price, u128 amount) + u32 numAsks + asks*(u128 price, u128 amount)
 * Both bid and ask prices are stored as real prices (contract already un-inverts asks).
 */
function buildOrderbookHex(
  bids: [bigint, bigint][],
  asks: [bigint, bigint][],
): string {
  const parts: Buffer[] = [encodeU32LE(bids.length)];
  for (const [price, amount] of bids) {
    parts.push(encodeU128LE(price), encodeU128LE(amount));
  }
  parts.push(encodeU32LE(asks.length));
  for (const [price, amount] of asks) {
    parts.push(encodeU128LE(price), encodeU128LE(amount));
  }
  return Buffer.concat(parts).toString('hex');
}

describe('readU32LE', () => {
  it('decodes zero', () => {
    expect(readU32LE(Array.from(encodeU32LE(0)), 0)).toBe(0);
  });

  it('decodes 10', () => {
    expect(readU32LE(Array.from(encodeU32LE(10)), 0)).toBe(10);
  });

  it('decodes max u32', () => {
    expect(readU32LE(Array.from(encodeU32LE(0xFFFFFFFF)), 0)).toBe(4294967295);
  });

  it('reads at a non-zero offset', () => {
    const padding = Array.from(Buffer.alloc(4, 0xff));
    const encoded = Array.from(encodeU32LE(42));
    expect(readU32LE([...padding, ...encoded], 4)).toBe(42);
  });
});

describe('readU128LE', () => {
  it('decodes zero', () => {
    const bytes = Array.from(encodeU128LE(0n));
    expect(readU128LE(bytes, 0)).toBe(0n);
  });

  it('decodes 1', () => {
    const bytes = Array.from(encodeU128LE(1n));
    expect(readU128LE(bytes, 0)).toBe(1n);
  });

  it('decodes max u64', () => {
    const maxU64 = (1n << 64n) - 1n;
    const bytes = Array.from(encodeU128LE(maxU64));
    expect(readU128LE(bytes, 0)).toBe(maxU64);
  });

  it('decodes value larger than u64', () => {
    const val = (1n << 64n) + 42n;
    const bytes = Array.from(encodeU128LE(val));
    expect(readU128LE(bytes, 0)).toBe(val);
  });

  it('reads at a non-zero offset', () => {
    const padding = Array.from(Buffer.alloc(16, 0xff));
    const encoded = Array.from(encodeU128LE(12345n));
    const bytes = [...padding, ...encoded];
    expect(readU128LE(bytes, 16)).toBe(12345n);
  });
});

describe('parseOrderbookResponse', () => {
  it('returns null for empty input', () => {
    expect(parseOrderbookResponse('')).toBeNull();
  });

  it('returns null for truncated data (< 8 bytes)', () => {
    expect(parseOrderbookResponse('000000')).toBeNull();
  });

  it('returns null when both bids and asks are zero', () => {
    // numBids=0, numAsks=0
    const hex = buildOrderbookHex([], []);
    expect(parseOrderbookResponse(hex)).toBeNull();
  });

  it('parses single bid + single ask with correct spread', () => {
    // Values are in 1e8 (satoshi) scale — parser divides by 1e8 for display.
    // 50000 * 1e8 = 5_000_000_000_000 → displays as 50,000.00
    const bidPrice = 5_000_000_000_000n;   // 50000 after /1e8
    const bidAmount = 100_000_000_000n;    // 1000 after /1e8
    const askPrice = 5_100_000_000_000n;   // 51000 after /1e8
    const askAmount = 200_000_000_000n;    // 2000 after /1e8

    const hex = buildOrderbookHex(
      [[bidPrice, bidAmount]],
      [[askPrice, askAmount]],
    );
    const result = parseOrderbookResponse(hex);

    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
    expect(result!.asks).toHaveLength(1);

    expect(parseFloat(result!.bids[0].price.replace(/,/g, ''))).toBe(50000);
    expect(parseFloat(result!.asks[0].price.replace(/,/g, ''))).toBe(51000);
    expect(parseFloat(result!.bids[0].amount.replace(/,/g, ''))).toBe(1000);
    expect(parseFloat(result!.asks[0].amount.replace(/,/g, ''))).toBe(2000);

    expect(parseFloat(result!.spread.replace(/,/g, ''))).toBe(1000);
    expect(parseFloat(result!.midPrice.replace(/,/g, ''))).toBe(50500);
    expect(parseFloat(result!.spreadPercent)).toBeCloseTo(1.98, 1);
  });

  it('parses multiple bid levels with descending prices and cumulative totals', () => {
    // Values in 1e8 scale: price/1e8 = display price, amount/1e8 = display amount
    const bids: [bigint, bigint][] = [
      [5_000_000_000_000n, 10_000_000_000n],   // price=50000, amount=100
      [4_900_000_000_000n, 20_000_000_000n],   // price=49000, amount=200
      [4_800_000_000_000n, 30_000_000_000n],   // price=48000, amount=300
    ];
    const asks: [bigint, bigint][] = [
      [5_100_000_000_000n, 10_000_000_000n],   // price=51000, amount=100
    ];

    const hex = buildOrderbookHex(bids, asks);
    const result = parseOrderbookResponse(hex);

    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(3);

    const prices = result!.bids.map(b => parseFloat(b.price.replace(/,/g, '')));
    expect(prices[0]).toBe(50000);
    expect(prices[1]).toBe(49000);
    expect(prices[2]).toBe(48000);

    // Cumulative totals are cumulative AMOUNTS (not price*amount)
    const totals = result!.bids.map(b => parseFloat(b.total.replace(/,/g, '')));
    expect(totals[0]).toBe(100);
    expect(totals[1]).toBe(300);   // 100 + 200
    expect(totals[2]).toBe(600);   // 100 + 200 + 300
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1]);
    }
  });

  it('parses multiple ask levels with ascending prices', () => {
    // Values in 1e8 scale
    const bids: [bigint, bigint][] = [
      [5_000_000_000_000n, 10_000_000_000n],   // price=50000, amount=100
    ];
    const asks: [bigint, bigint][] = [
      [5_100_000_000_000n, 10_000_000_000n],   // price=51000, amount=100
      [5_200_000_000_000n, 20_000_000_000n],   // price=52000, amount=200
      [5_300_000_000_000n, 30_000_000_000n],   // price=53000, amount=300
    ];

    const hex = buildOrderbookHex(bids, asks);
    const result = parseOrderbookResponse(hex);

    expect(result).not.toBeNull();
    expect(result!.asks).toHaveLength(3);

    const prices = result!.asks.map(a => parseFloat(a.price.replace(/,/g, '')));
    expect(prices[0]).toBe(51000);
    expect(prices[1]).toBe(52000);
    expect(prices[2]).toBe(53000);

    // Cumulative totals (cumulative amounts)
    const totals = result!.asks.map(a => parseFloat(a.total.replace(/,/g, '')));
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1]);
    }
  });

  it('handles bids-only (no asks)', () => {
    // 50000 * 1e8 = 5_000_000_000_000
    const hex = buildOrderbookHex(
      [[5_000_000_000_000n, 100_000_000_000n]],
      [],
    );
    const result = parseOrderbookResponse(hex);
    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
    expect(result!.asks).toHaveLength(0);
    // spread = abs(0 - 50000) = 50000, midPrice = (50000+0)/2 = 25000
    expect(parseFloat(result!.spread.replace(/,/g, ''))).toBe(50000);
    expect(parseFloat(result!.midPrice.replace(/,/g, ''))).toBe(25000);
  });

  it('handles asks-only (no bids)', () => {
    // 51000 * 1e8 = 5_100_000_000_000
    const hex = buildOrderbookHex(
      [],
      [[5_100_000_000_000n, 100_000_000_000n]],
    );
    const result = parseOrderbookResponse(hex);
    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(0);
    expect(result!.asks).toHaveLength(1);
    // midPrice = (0 + 51000) / 2 = 25500
    expect(parseFloat(result!.midPrice.replace(/,/g, ''))).toBe(25500);
  });

  it('handles 0x prefix in hex data', () => {
    const hex = '0x' + buildOrderbookHex(
      [[5_000_000_000_000n, 100_000_000_000n]],
      [[5_100_000_000_000n, 100_000_000_000n]],
    );
    const result = parseOrderbookResponse(hex);
    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
  });

  it('returns null for numBids > 100 (overflow protection)', () => {
    const hex = encodeU32LE(101).toString('hex') + encodeU32LE(0).toString('hex');
    expect(parseOrderbookResponse(hex)).toBeNull();
  });

  it('values are divided by 1e8 for display', () => {
    // Contract stores values in 1e8 (satoshi) scale — parser divides by 1e8
    const hex = buildOrderbookHex(
      [[5_000_000_000_000n, 100_000_000_000n]],   // 50000, 1000 after /1e8
      [[5_100_000_000_000n, 200_000_000_000n]],   // 51000, 2000 after /1e8
    );
    const result = parseOrderbookResponse(hex);

    expect(result).not.toBeNull();
    expect(parseFloat(result!.bids[0].price.replace(/,/g, ''))).toBe(50000);
    expect(parseFloat(result!.asks[0].price.replace(/,/g, ''))).toBe(51000);
    expect(parseFloat(result!.bids[0].amount.replace(/,/g, ''))).toBe(1000);
    expect(parseFloat(result!.asks[0].amount.replace(/,/g, ''))).toBe(2000);
  });

  it('accepts number[] input (not just hex string)', () => {
    const hex = buildOrderbookHex(
      [[5_000_000_000_000n, 100_000_000_000n]],
      [[5_100_000_000_000n, 100_000_000_000n]],
    );
    const bytes = Array.from(Buffer.from(hex, 'hex'));
    const result = parseOrderbookResponse(bytes);

    expect(result).not.toBeNull();
    expect(result!.bids).toHaveLength(1);
    expect(result!.asks).toHaveLength(1);
  });
});
