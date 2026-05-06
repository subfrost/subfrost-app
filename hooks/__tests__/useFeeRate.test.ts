/** @vitest-environment jsdom */
/**
 * useFeeRate Hook Tests
 *
 * Tests fee rate selection, custom fee parsing, localStorage persistence,
 * and fallback defaults when fee estimates are unavailable.
 *
 * Run with: pnpm test hooks/__tests__/useFeeRate.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFeeEstimates = vi.fn();

vi.mock('@/context/AlkanesSDKContext', () => ({
  useAlkanesSDK: () => mockFeeEstimates(),
}));

// We need to mock useBaseTxFeeRates which depends on useAlkanesSDK
vi.mock('@/hooks/useBaseTxFeeRates', () => ({
  useBaseTxFeeRates: () => {
    const ctx = mockFeeEstimates();
    return {
      data: ctx.feeEstimates
        ? { slow: ctx.feeEstimates.slow, medium: ctx.feeEstimates.medium, fast: ctx.feeEstimates.fast }
        : { slow: 2, medium: 8, fast: 25 },
      isLoading: !ctx.feeEstimates,
      isError: false,
      refetch: ctx.refreshFeeEstimates,
    };
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useFeeRate, type FeeSelection } from '../useFeeRate';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

let storageMap: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => storageMap[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storageMap[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storageMap[key]; }),
  clear: vi.fn(() => { storageMap = {}; }),
  get length() { return Object.keys(storageMap).length; },
  key: vi.fn((i: number) => Object.keys(storageMap)[i] ?? null),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFeeRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap = {};
    mockFeeEstimates.mockReturnValue({
      feeEstimates: { slow: 3, medium: 10, fast: 30 },
      refreshFeeEstimates: vi.fn(),
    });
  });

  it('defaults to medium selection', () => {
    const { result } = renderHook(() => useFeeRate());
    expect(result.current.selection).toBe('medium');
  });

  it('returns medium fee rate by default', () => {
    const { result } = renderHook(() => useFeeRate());
    expect(result.current.feeRate).toBe(10);
  });

  it('returns slow fee rate when selection is slow', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => result.current.setSelection('slow'));
    expect(result.current.feeRate).toBe(3);
  });

  it('returns fast fee rate when selection is fast', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => result.current.setSelection('fast'));
    expect(result.current.feeRate).toBe(30);
  });

  it('returns custom fee rate when selection is custom', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('15');
    });
    expect(result.current.feeRate).toBe(15);
  });

  it('clamps custom fee to minimum of 1', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('0');
    });
    expect(result.current.feeRate).toBe(1);
  });

  it('clamps custom fee to maximum of 999', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('5000');
    });
    expect(result.current.feeRate).toBe(999);
  });

  it('floors custom fee to integer', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('7.8');
    });
    expect(result.current.feeRate).toBe(7);
  });

  it('defaults custom fee to 1 when input is not a number', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('abc');
    });
    expect(result.current.feeRate).toBe(1);
  });

  it('defaults custom fee to 1 when input is empty', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('');
    });
    // Empty string -> Number('') = 0 which is finite -> Math.max(1, Math.min(999, 0)) = 1
    expect(result.current.feeRate).toBe(1);
  });

  it('falls back to default 8 when fee estimates are null', () => {
    mockFeeEstimates.mockReturnValue({
      feeEstimates: null,
      refreshFeeEstimates: vi.fn(),
    });

    const { result } = renderHook(() => useFeeRate());
    // When base data is null, useBaseTxFeeRates returns defaults { slow: 2, medium: 8, fast: 25 }
    expect(result.current.feeRate).toBe(8);
  });

  it('returns default presets when fee estimates are null', () => {
    mockFeeEstimates.mockReturnValue({
      feeEstimates: null,
      refreshFeeEstimates: vi.fn(),
    });

    const { result } = renderHook(() => useFeeRate());
    expect(result.current.presets).toEqual({ slow: 2, medium: 8, fast: 25 });
  });

  it('returns fetched presets when fee estimates are available', () => {
    const { result } = renderHook(() => useFeeRate());
    expect(result.current.presets).toEqual({ slow: 3, medium: 10, fast: 30 });
  });

  it('persists selection to localStorage on change', async () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => result.current.setSelection('fast'));

    // Wait for the useEffect that persists to localStorage
    await waitFor(() => {
      const calls = mockLocalStorage.setItem.mock.calls.filter(
        (call: string[]) => call[0] === 'subfrost-fee-rate',
      );
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const persisted = JSON.parse(lastCall![1]);
      expect(persisted.selection).toBe('fast');
    });
  });

  it('hydrates selection from localStorage on mount', () => {
    storageMap['subfrost-fee-rate'] = JSON.stringify({ selection: 'slow', custom: '42' });

    const { result } = renderHook(() => useFeeRate());
    // After useEffect hydration, selection should be 'slow'
    expect(result.current.selection).toBe('slow');
  });

  it('hydrates custom value from localStorage on mount', () => {
    storageMap['subfrost-fee-rate'] = JSON.stringify({ selection: 'custom', custom: '42' });

    const { result } = renderHook(() => useFeeRate());
    expect(result.current.custom).toBe('42');
    expect(result.current.feeRate).toBe(42);
  });

  it('uses custom storageKey when provided', () => {
    const { result } = renderHook(() => useFeeRate({ storageKey: 'custom-key' }));
    act(() => result.current.setSelection('fast'));

    const lastCall = mockLocalStorage.setItem.mock.calls.find(
      (call: string[]) => call[0] === 'custom-key',
    );
    expect(lastCall).toBeDefined();
  });

  it('handles corrupted localStorage gracefully', () => {
    storageMap['subfrost-fee-rate'] = 'NOT VALID JSON';

    // Should not throw
    const { result } = renderHook(() => useFeeRate());
    expect(result.current.selection).toBe('medium');
  });

  it('handles negative custom fee by clamping to 1', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('-5');
    });
    expect(result.current.feeRate).toBe(1);
  });

  it('handles Infinity custom fee by falling back to 1', () => {
    const { result } = renderHook(() => useFeeRate());
    act(() => {
      result.current.setSelection('custom');
      result.current.setCustom('Infinity');
    });
    // Number('Infinity') is Infinity, !Number.isFinite(Infinity) is true -> returns 1
    expect(result.current.feeRate).toBe(1);
  });
});
