/** @vitest-environment jsdom */
/**
 * useLPPositions Hook Tests
 *
 * Tests LP position detection from wallet data, including filtering by pool map,
 * LP name patterns, staked position detection, and metadata parsing.
 *
 * Run with: pnpm test hooks/__tests__/useLPPositions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseEnrichedWalletData = vi.fn();
const mockUsePools = vi.fn();
const mockUseBtcPrice = vi.fn();

vi.mock('@/hooks/useEnrichedWalletData', () => ({
  useEnrichedWalletData: () => mockUseEnrichedWalletData(),
}));

vi.mock('@/hooks/usePools', () => ({
  usePools: () => mockUsePools(),
}));

vi.mock('@/hooks/useBtcPrice', () => ({
  useBtcPrice: () => mockUseBtcPrice(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useLPPositions } from '../useLPPositions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlkane(overrides: any = {}) {
  return {
    alkaneId: '2:77087',
    symbol: 'DIESEL/frBTC LP',
    name: 'DIESEL/frBTC LP',
    balance: '100000000', // 1.0 with 8 decimals
    decimals: 8,
    ...overrides,
  };
}

function makePoolItem(overrides: any = {}) {
  return {
    id: '2:77087',
    pairLabel: 'DIESEL / frBTC LP',
    token0: { id: '2:0', symbol: 'DIESEL', name: 'DIESEL' },
    token1: { id: '32:0', symbol: 'frBTC', name: 'frBTC' },
    tvlUsd: 150000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLPPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBtcPrice.mockReturnValue({ data: 100000 });
    mockUsePools.mockReturnValue({ data: { items: [] }, isLoading: false });
    mockUseEnrichedWalletData.mockReturnValue({
      balances: { alkanes: [] },
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('returns empty positions when wallet has no alkanes', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: { alkanes: null },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toEqual([]);
  });

  it('returns empty positions when alkanes array is empty', () => {
    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toEqual([]);
  });

  it('detects LP token by "LP" in symbol', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ alkaneId: '2:999', symbol: 'FOO/BAR LP', name: 'FOO/BAR LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toHaveLength(1);
    expect(result.current.positions[0].token0Symbol).toBe('FOO');
    expect(result.current.positions[0].token1Symbol).toBe('BAR');
  });

  it('detects LP token by "LP" in name', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ alkaneId: '2:999', symbol: '999', name: 'Some LP Token' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toHaveLength(1);
  });

  it('detects staked positions by POS- prefix', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ alkaneId: '2:888', symbol: 'POS-DIESEL', name: 'POS-DIESEL' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toHaveLength(1);
  });

  it('detects LP token by pool map match', () => {
    const pool = makePoolItem({ id: '2:77087' });
    mockUsePools.mockReturnValue({ data: { items: [pool] }, isLoading: false });

    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ alkaneId: '2:77087', symbol: '77087', name: '77087' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toHaveLength(1);
    expect(result.current.positions[0].token0Symbol).toBe('DIESEL');
    expect(result.current.positions[0].token1Symbol).toBe('frBTC');
  });

  it('uses pool data for token symbols and IDs when matched', () => {
    const pool = makePoolItem();
    mockUsePools.mockReturnValue({ data: { items: [pool] }, isLoading: false });

    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane()],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    const pos = result.current.positions[0];
    expect(pos.token0Symbol).toBe('DIESEL');
    expect(pos.token1Symbol).toBe('frBTC');
    expect(pos.token0Id).toBe('2:0');
    expect(pos.token1Id).toBe('32:0');
  });

  it('parses LP symbol pattern "TOKEN0/TOKEN1 LP" when no pool match', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ alkaneId: '2:555', symbol: 'FOO/BAR LP', name: 'FOO/BAR LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions[0].token0Symbol).toBe('FOO');
    expect(result.current.positions[0].token1Symbol).toBe('BAR');
  });

  it('formats balance correctly with 4 decimal places', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ balance: '123456789', decimals: 8, symbol: 'A/B LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    // 123456789 / 10^8 = 1.23456789 -> "1.2345"
    expect(result.current.positions[0].amount).toBe('1.2345');
  });

  it('formats large balance correctly', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ balance: '10000000000', decimals: 8, symbol: 'A/B LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    // 10000000000 / 10^8 = 100 -> "100.0000"
    expect(result.current.positions[0].amount).toBe('100.0000');
  });

  it('does not include non-LP, non-pool tokens', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [
          makeAlkane({ alkaneId: '2:0', symbol: 'DIESEL', name: 'DIESEL' }),
          makeAlkane({ alkaneId: '32:0', symbol: 'frBTC', name: 'frBTC' }),
        ],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.positions).toHaveLength(0);
  });

  it('returns isLoading true when wallet data is loading', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: { alkanes: null },
      isLoading: true,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isLoading true when pools data is loading', () => {
    mockUsePools.mockReturnValue({ data: null, isLoading: true });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.isLoading).toBe(true);
  });

  it('provides a refresh function', () => {
    const mockRefresh = vi.fn();
    mockUseEnrichedWalletData.mockReturnValue({
      balances: { alkanes: [] },
      isLoading: false,
      refresh: mockRefresh,
    });

    const { result } = renderHook(() => useLPPositions());
    expect(result.current.refresh).toBe(mockRefresh);
  });

  it('calculates USD value using BTC price', () => {
    mockUseBtcPrice.mockReturnValue({ data: 50000 });
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ balance: '100000000', decimals: 8, symbol: 'A/B LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    // 100000000 / 10^8 = 1.0; 1.0 * 50000 = 50000
    expect(result.current.positions[0].valueUSD).toBe(50000);
  });

  it('uses Pool ID as last resort label when symbol matches alkaneId', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({
          alkaneId: '2:555',
          // symbol is same as alkaneId, no LP pattern
          symbol: '2:555',
          name: '2:555',
        })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });
    // Put it in the pool map so it gets detected as an LP
    mockUsePools.mockReturnValue({
      data: { items: [makePoolItem({ id: '2:555' })] },
      isLoading: false,
    });

    const { result } = renderHook(() => useLPPositions());
    // Pool data supplies the token symbols
    expect(result.current.positions[0].token0Symbol).toBe('DIESEL');
  });

  it('initializes gain/loss as zero placeholders', () => {
    mockUseEnrichedWalletData.mockReturnValue({
      balances: {
        alkanes: [makeAlkane({ symbol: 'X/Y LP' })],
      },
      isLoading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useLPPositions());
    const gl = result.current.positions[0].gainLoss;
    expect(gl.token0.amount).toBe('0');
    expect(gl.token1.amount).toBe('0');
  });
});
