/**
 * @vitest-environment jsdom
 *
 * useBtcBalance: pin the source-of-truth swap (2026-05-14).
 *
 * Previously the hook called `getSpendableTotalBalance()` via the SDK
 * provider, which returned a different value than the wallet header's
 * `useEnrichedWalletData()` source — verified live: keystore wallet's
 * futures Investment-Amount form showed `Balance 0.000000 BTC` while
 * the header correctly showed `0.00096 BTC` for the same wallet. The
 * SDK path returned 0 spendable while the prewarmed enriched-data path
 * returned the right value.
 *
 * After the fix, both surfaces derive from the SAME prewarmed source.
 * This test pins the wiring so a regression that re-routes the hook
 * back to the SDK path (or any other divergent source) trips loud.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../useEnrichedWalletData', () => ({
  useEnrichedWalletData: vi.fn(),
}));

import { useBtcBalance } from '../useBtcBalance';
import { useEnrichedWalletData } from '../useEnrichedWalletData';

const mockedHook = useEnrichedWalletData as unknown as ReturnType<typeof vi.fn>;

function baseEnriched(overrides: Partial<{
  btcFast: { p2wpkh: number; p2tr: number; total: number; spendable: number; pendingIn: number } | null;
  bitcoin: { p2wpkh: number; p2tr: number; total: number; spendable: number };
  isBtcFastLoading: boolean;
  isLoading: boolean;
}> = {}) {
  return {
    btcFast: overrides.btcFast ?? null,
    balances: {
      bitcoin: overrides.bitcoin ?? { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0 },
    },
    isBtcFastLoading: overrides.isBtcFastLoading ?? false,
    isLoading: overrides.isLoading ?? false,
  };
}

describe('useBtcBalance — single source of truth', () => {
  it('prefers btcFast.spendable when fast-path data is present', () => {
    mockedHook.mockReturnValue(baseEnriched({
      btcFast: { p2wpkh: 95_000, p2tr: 1_000, total: 96_000, spendable: 95_500, pendingIn: 0 },
      // Even if enriched bitcoin has a wildly different total, the fast
      // path wins. Pinned to catch a regression that drops fast-path
      // preference and silently switches between sources.
      bitcoin: { p2wpkh: 0, p2tr: 0, total: 5_000_000, spendable: 5_000_000 },
    }));
    const { result } = renderHook(() => useBtcBalance());
    expect(result.current.data).toBe(95_500);
  });

  it('falls back to balances.bitcoin.spendable when btcFast is null (keystore wallet path)', () => {
    // Keystore wallets do not populate the wallet-cache fast path (no
    // UniSat `getBitcoinUtxos` adapter). They MUST read from the
    // enriched aggregate or the user sees zero — the original bug.
    mockedHook.mockReturnValue(baseEnriched({
      btcFast: null,
      bitcoin: { p2wpkh: 0, p2tr: 96_000, total: 96_000, spendable: 96_000 },
    }));
    const { result } = renderHook(() => useBtcBalance());
    expect(result.current.data).toBe(96_000);
  });

  it('falls back to enriched when btcFast.total is 0 (cache present but empty)', () => {
    mockedHook.mockReturnValue(baseEnriched({
      btcFast: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, pendingIn: 0 },
      bitcoin: { p2wpkh: 0, p2tr: 50_000, total: 50_000, spendable: 50_000 },
    }));
    const { result } = renderHook(() => useBtcBalance());
    expect(result.current.data).toBe(50_000);
  });

  it('returns 0 when both sources are empty', () => {
    mockedHook.mockReturnValue(baseEnriched({ btcFast: null }));
    const { result } = renderHook(() => useBtcBalance());
    expect(result.current.data).toBe(0);
  });

  it('exposes the correct loading flag for each path', () => {
    // Fast path active → mirror its loading flag.
    mockedHook.mockReturnValueOnce(baseEnriched({
      btcFast: { p2wpkh: 1_000, p2tr: 0, total: 1_000, spendable: 1_000, pendingIn: 0 },
      isBtcFastLoading: true,
      isLoading: false,
    }));
    let { result, rerender } = renderHook(() => useBtcBalance());
    expect(result.current.isLoading).toBe(true);

    // Fast path absent → mirror enriched loading flag.
    mockedHook.mockReturnValue(baseEnriched({
      btcFast: null,
      isBtcFastLoading: false,
      isLoading: true,
    }));
    rerender();
    expect(result.current.isLoading).toBe(true);
  });
});
