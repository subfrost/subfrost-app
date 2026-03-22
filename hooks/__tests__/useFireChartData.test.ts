/** @vitest-environment jsdom */
// @ts-nocheck — test file uses loose mock types
/**
 * useFireChartData Tests
 *
 * Tests the real-data-driven FIRE chart hook that replaces useFireMockData.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies
const mockStakingStats = vi.fn(() => ({ data: null }));
const mockTokenStats = vi.fn(() => ({ data: null }));
const mockTreasury = vi.fn(() => ({ data: null }));

vi.mock('@/hooks/fire/useFireStakingStats', () => ({
  useFireStakingStats: (...args: any[]) => mockStakingStats(...args),
}));

vi.mock('@/hooks/fire/useFireTokenStats', () => ({
  useFireTokenStats: (...args: any[]) => mockTokenStats(...args),
}));

vi.mock('@/hooks/fire/useFireTreasury', () => ({
  useFireTreasury: (...args: any[]) => mockTreasury(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

import { useFireChartData } from '../fire/useFireChartData';

describe('useFireChartData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStakingStats.mockReturnValue({ data: null });
    mockTokenStats.mockReturnValue({ data: null });
    mockTreasury.mockReturnValue({ data: null });
  });

  it('returns price history with 31 points (30 days + today)', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    expect(result.current.priceHistory.length).toBe(31);
  });

  it('returns TVL history with 31 points', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    expect(result.current.tvlHistory.length).toBe(31);
  });

  it('returns staker distribution with at least one entry', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    expect(result.current.stakerDistribution.length).toBeGreaterThan(0);
  });

  it('uses default values when no on-chain data available', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    // Default price is 0.00045
    const lastPrice = result.current.priceHistory[result.current.priceHistory.length - 1].value;
    expect(lastPrice).toBeCloseTo(0.00045, 3);
  });

  it('derives price from on-chain staking/supply ratio', () => {
    mockStakingStats.mockReturnValue({
      data: { totalStaked: '100000000000', emissionRate: '665000', currentEpoch: '1' },
    });
    mockTokenStats.mockReturnValue({
      data: {
        totalSupply: '210000000000000',
        maxSupply: '210000000000000',
        emissionPoolRemaining: '200000000000000',
        circulatingSupply: '10000000000000',
        name: 'FIRE',
        symbol: 'FIRE',
      },
    });

    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const lastPrice = result.current.priceHistory[result.current.priceHistory.length - 1].value;
    // Price derived from staked/circulating * 0.00045
    expect(lastPrice).toBeGreaterThan(0);
  });

  it('shows protocol breakdown when staking data available', () => {
    mockStakingStats.mockReturnValue({
      data: { totalStaked: '50000000000', emissionRate: '665000', currentEpoch: '1' },
    });
    mockTokenStats.mockReturnValue({
      data: {
        totalSupply: '210000000000000',
        emissionPoolRemaining: '160000000000000',
        circulatingSupply: '50000000000000',
        name: 'FIRE', symbol: 'FIRE', maxSupply: '210000000000000',
      },
    });
    mockTreasury.mockReturnValue({
      data: { totalBacking: '10000000000', allocations: '0', teamVested: '0', redemptionRate: '0' },
    });

    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const dist = result.current.stakerDistribution;
    expect(dist.length).toBeGreaterThan(1);
    expect(dist.some(d => d.address === 'Staked')).toBe(true);
    expect(dist.some(d => d.address === 'Emission Pool')).toBe(true);
  });

  it('shows 100% emission pool when no staking', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const dist = result.current.stakerDistribution;
    expect(dist.length).toBe(1);
    expect(dist[0].address).toBe('Emission Pool');
    expect(dist[0].percentage).toBe(100);
  });

  it('price history dates are in YYYY-MM-DD format', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    result.current.priceHistory.forEach(point => {
      expect(point.time).toMatch(datePattern);
    });
  });

  it('TVL values are positive', () => {
    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    result.current.tvlHistory.forEach(point => {
      expect(point.value).toBeGreaterThan(0);
    });
  });

  it('staker percentages sum to ~100', () => {
    mockStakingStats.mockReturnValue({
      data: { totalStaked: '50000000000', emissionRate: '665000', currentEpoch: '1' },
    });
    mockTokenStats.mockReturnValue({
      data: {
        totalSupply: '210000000000000',
        emissionPoolRemaining: '160000000000000',
        circulatingSupply: '50000000000000',
        name: 'FIRE', symbol: 'FIRE', maxSupply: '210000000000000',
      },
    });
    mockTreasury.mockReturnValue({
      data: { totalBacking: '0', allocations: '0', teamVested: '0', redemptionRate: '0' },
    });

    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const totalPct = result.current.stakerDistribution.reduce((sum, d) => sum + d.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it('uses real TVL from totalStaked when available', () => {
    const totalStakedSats = '500000000'; // 5 BTC
    mockStakingStats.mockReturnValue({
      data: { totalStaked: totalStakedSats, emissionRate: '665000', currentEpoch: '1' },
    });

    const { result } = renderHook(() => useFireChartData(), { wrapper: createWrapper() });
    const lastTvl = result.current.tvlHistory[result.current.tvlHistory.length - 1].value;
    // Should reflect the real staked amount (5 * 1e8 sats = 500_000_000)
    expect(lastTvl).toBeCloseTo(500000000, -4);
  });
});
