/**
 * @vitest-environment jsdom
 *
 * Tests for useInviteCodeRedemption hook — invite code persistence and redemption.
 *
 * BUG FIX (2026-02-10): Invite code redemptions were never recorded because
 * `pendingInviteCodeRedemption` was stored as ephemeral React state. When the
 * ConnectWalletModal's `resetForm()` ran (on modal close/reopen), it cleared
 * the pending code before the redemption useEffect could fire. Only 1 of 14
 * mainnet users had a recorded redemption.
 *
 * FIX: Extracted to `useInviteCodeRedemption` hook that persists to localStorage.
 * Code is only cleared after a successful API response.
 *
 * Run with: pnpm test app/components/__tests__/invite-code-persistence.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInviteCodeRedemption } from '@/hooks/useInviteCodeRedemption';

const STORAGE_KEY = 'subfrost_pending_invite_redemption';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('useInviteCodeRedemption', () => {
  // ---------------------------------------------------------------------------
  // localStorage persistence
  // ---------------------------------------------------------------------------
  describe('localStorage persistence', () => {
    it('initializes as null when localStorage is empty', () => {
      const { result } = renderHook(() => useInviteCodeRedemption(null));
      expect(result.current.pendingCode).toBeNull();
    });

    it('restores pending code from localStorage on mount', () => {
      localStorage.setItem(STORAGE_KEY, 'QIANYUAN');

      const { result } = renderHook(() => useInviteCodeRedemption(null));
      expect(result.current.pendingCode).toBe('QIANYUAN');
    });

    it('persists code to localStorage when setPendingCode is called', () => {
      const { result } = renderHook(() => useInviteCodeRedemption(null));

      act(() => {
        result.current.setPendingCode('TESTCODE');
      });

      expect(result.current.pendingCode).toBe('TESTCODE');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('TESTCODE');
    });

    it('removes from localStorage when setPendingCode(null) is called', () => {
      localStorage.setItem(STORAGE_KEY, 'TESTCODE');

      const { result } = renderHook(() => useInviteCodeRedemption(null));

      act(() => {
        result.current.setPendingCode(null);
      });

      expect(result.current.pendingCode).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('survives unmount and remount (simulates modal close/reopen)', () => {
      const { result, unmount } = renderHook(() => useInviteCodeRedemption(null));

      act(() => {
        result.current.setPendingCode('SURVIVES');
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBe('SURVIVES');

      // Unmount (modal closed)
      unmount();

      // Remount (modal reopened) — should restore from localStorage
      const { result: result2 } = renderHook(() => useInviteCodeRedemption(null));
      expect(result2.current.pendingCode).toBe('SURVIVES');
    });
  });

  // ---------------------------------------------------------------------------
  // Redemption API calls
  // ---------------------------------------------------------------------------
  describe('redemption useEffect', () => {
    it('does NOT call API when there is no pending code', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const addresses = {
        taproot: { address: 'bc1ptest', pubkey: '02abc' },
        nativeSegwit: { address: 'bc1qtest' },
      };

      renderHook(() => useInviteCodeRedemption(addresses));

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does NOT call API when addresses are not yet available', () => {
      localStorage.setItem(STORAGE_KEY, 'TESTCODE');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // No addresses yet (wallet not created)
      renderHook(() => useInviteCodeRedemption(null));

      expect(fetchSpy).not.toHaveBeenCalled();
      // Code should still be pending
      expect(localStorage.getItem(STORAGE_KEY)).toBe('TESTCODE');
    });

    it('calls redeem API when both pending code and addresses are available', async () => {
      localStorage.setItem(STORAGE_KEY, 'QIANYUAN');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, userId: 'user-123' }),
      } as Response);

      const addresses = {
        taproot: { address: 'bc1ptaproot', pubkey: '02abc123' },
        nativeSegwit: { address: 'bc1qsegwit' },
      };

      renderHook(() => useInviteCodeRedemption(addresses));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/invite-codes/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'QIANYUAN',
            taprootAddress: 'bc1ptaproot',
            segwitAddress: 'bc1qsegwit',
            taprootPubkey: '02abc123',
          }),
        });
      });
    });

    it('clears pending code after successful redemption', async () => {
      localStorage.setItem(STORAGE_KEY, 'TESTCODE');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, userId: 'user-abc' }),
      } as Response);

      const addresses = {
        taproot: { address: 'bc1ptaproot', pubkey: '02abc' },
        nativeSegwit: { address: 'bc1qsegwit' },
      };

      const { result } = renderHook(() => useInviteCodeRedemption(addresses));

      await waitFor(() => {
        expect(result.current.pendingCode).toBeNull();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('clears pending code on definitive API failure (invalid code)', async () => {
      localStorage.setItem(STORAGE_KEY, 'BADCODE');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, error: 'Invalid invite code' }),
      } as Response);

      const addresses = {
        taproot: { address: 'bc1ptaproot', pubkey: '02abc' },
        nativeSegwit: { address: 'bc1qsegwit' },
      };

      const { result } = renderHook(() => useInviteCodeRedemption(addresses));

      await waitFor(() => {
        expect(result.current.pendingCode).toBeNull();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('keeps pending code on network error for retry', async () => {
      localStorage.setItem(STORAGE_KEY, 'RETRYCODE');

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const addresses = {
        taproot: { address: 'bc1ptaproot', pubkey: '02abc' },
        nativeSegwit: { address: 'bc1qsegwit' },
      };

      renderHook(() => useInviteCodeRedemption(addresses));

      // Give the effect time to run and handle the error
      await new Promise((r) => setTimeout(r, 50));

      // Code should still be in localStorage for retry
      expect(localStorage.getItem(STORAGE_KEY)).toBe('RETRYCODE');
    });

    it('fires API when addresses become available after initial render', async () => {
      localStorage.setItem(STORAGE_KEY, 'DELAYED');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, userId: 'user-delayed' }),
      } as Response);

      // Start with no addresses
      const { result, rerender } = renderHook(
        ({ addr }) => useInviteCodeRedemption(addr),
        { initialProps: { addr: null as any } },
      );

      expect(fetchSpy).not.toHaveBeenCalled();

      // Addresses become available (wallet creation completes)
      rerender({
        addr: {
          taproot: { address: 'bc1ptaproot', pubkey: '02abc' },
          nativeSegwit: { address: 'bc1qsegwit' },
        },
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.current.pendingCode).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Full flow: set code → addresses arrive → API fires → cleared
  // ---------------------------------------------------------------------------
  describe('full redemption flow', () => {
    it('simulates wallet creation flow: set code, then addresses arrive', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, userId: 'user-flow' }),
      } as Response);

      // Step 1: Hook mounts with no code, no addresses (modal opens)
      const { result, rerender } = renderHook(
        ({ addr }) => useInviteCodeRedemption(addr),
        { initialProps: { addr: null as any } },
      );

      expect(result.current.pendingCode).toBeNull();

      // Step 2: User validates invite code and creates wallet
      // setPendingCode is called, addresses not yet available
      act(() => {
        result.current.setPendingCode('QIANYUAN');
      });

      expect(result.current.pendingCode).toBe('QIANYUAN');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('QIANYUAN');

      // Step 3: Wallet creation completes, addresses become available
      rerender({
        addr: {
          taproot: { address: 'bc1p5en3a5test', pubkey: '02def456' },
          nativeSegwit: { address: 'bc1qsegwittest' },
        },
      });

      // Step 4: useEffect fires, calls API, clears code
      await waitFor(() => {
        expect(result.current.pendingCode).toBeNull();
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      });
    });
  });
});
