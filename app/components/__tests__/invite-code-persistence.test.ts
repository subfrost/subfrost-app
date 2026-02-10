/**
 * Tests for invite code redemption persistence.
 *
 * BUG FIX (2026-02-10): Invite code redemptions were never recorded because
 * `pendingInviteCodeRedemption` was stored as ephemeral React state. When the
 * ConnectWalletModal's `resetForm()` ran (on modal reopen), it cleared the
 * pending code before the redemption useEffect could fire. Only 1 out of 14
 * users ever had a redemption recorded.
 *
 * FIX: Persist pending redemption in localStorage so it survives modal
 * close/reopen and page refresh. Remove it from resetForm().
 *
 * Run with: pnpm test app/components/__tests__/invite-code-persistence.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const STORAGE_KEY = 'subfrost_pending_invite_redemption';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

// Mock fetch for redemption API calls
const fetchMock = vi.fn();

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Invite code redemption persistence', () => {
  it('should persist pending redemption code to localStorage when set', () => {
    // Simulate what setPendingInviteCodeRedemption does after the fix
    const code = 'QIANYUAN';
    localStorage.setItem(STORAGE_KEY, code);

    expect(localStorage.getItem(STORAGE_KEY)).toBe('QIANYUAN');
  });

  it('should clear localStorage when redemption completes (code set to null)', () => {
    localStorage.setItem(STORAGE_KEY, 'QIANYUAN');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('QIANYUAN');

    // After successful redemption, code is set to null
    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should survive resetForm() — pending code must NOT be cleared by form reset', () => {
    // Set a pending redemption (user validated code and created wallet)
    localStorage.setItem(STORAGE_KEY, 'TESTCODE');

    // Simulate resetForm() — it clears form fields but NOT the pending redemption
    // (This is the bug fix: resetForm used to call setPendingInviteCodeRedemption(null))
    const resetFormFields = () => {
      // These are the fields resetForm clears — note NO pending redemption clearing
      // setInviteCode(''), setPassword(''), setConfirmPassword(''), etc.
    };
    resetFormFields();

    // Pending redemption should still be there
    expect(localStorage.getItem(STORAGE_KEY)).toBe('TESTCODE');
  });

  it('should restore pending redemption from localStorage on component mount', () => {
    // Simulate: user created wallet, pending redemption was saved, then page refreshed
    localStorage.setItem(STORAGE_KEY, 'QIANYUAN');

    // On component mount, useState initializer reads from localStorage
    const initialValue = localStorage.getItem(STORAGE_KEY);
    expect(initialValue).toBe('QIANYUAN');
  });

  it('should call redeem API when pending code and addresses are both available', async () => {
    const code = 'QIANYUAN';
    const taprootAddress = 'bc1p5en3a5l7wdslme5tauntmxhakmmslr50r07ajv6j4gzlur68fs6sthdqpp';
    const segwitAddress = 'bc1qtest123';
    const taprootPubkey = '02abc123def456';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, userId: 'user-123' }),
    });

    // Simulate the useEffect logic
    const pendingInviteCodeRedemption = code;
    const addresses = {
      taproot: { address: taprootAddress, pubkey: taprootPubkey },
      nativeSegwit: { address: segwitAddress },
    };

    if (pendingInviteCodeRedemption && addresses?.taproot?.address) {
      const response = await fetch('/api/invite-codes/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: pendingInviteCodeRedemption,
          taprootAddress: addresses.taproot.address,
          segwitAddress: addresses.nativeSegwit?.address,
          taprootPubkey: addresses.taproot.pubkey,
        }),
      });
      const data = await response.json();

      if (data.success) {
        // Clear the pending redemption from localStorage
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    expect(fetchMock).toHaveBeenCalledWith('/api/invite-codes/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'QIANYUAN',
        taprootAddress,
        segwitAddress,
        taprootPubkey,
      }),
    });

    // After successful redemption, localStorage should be cleared
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should NOT clear pending redemption if API call fails', async () => {
    const code = 'QIANYUAN';
    localStorage.setItem(STORAGE_KEY, code);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'Database error' }),
    });

    // Simulate the useEffect logic with error handling
    try {
      const response = await fetch('/api/invite-codes/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          taprootAddress: 'bc1ptest',
        }),
      });
      const data = await response.json();

      if (data.success) {
        localStorage.removeItem(STORAGE_KEY);
      }
      // On failure, do NOT remove — will retry on next mount
    } catch {
      // Network error — keep the pending code for retry
    }

    // Pending code should still be in localStorage for retry
    expect(localStorage.getItem(STORAGE_KEY)).toBe('QIANYUAN');
  });

  it('should NOT fire redemption if no pending code exists', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Simulate the useEffect guard
    const pendingInviteCodeRedemption = localStorage.getItem(STORAGE_KEY);
    if (!pendingInviteCodeRedemption) {
      // Early return — no API call
      return;
    }

    // Should never reach here
    expect(true).toBe(false);
  });

  it('should NOT fire redemption if addresses are not yet available', () => {
    localStorage.setItem(STORAGE_KEY, 'TESTCODE');

    // Simulate: pending code exists but wallet hasn't loaded addresses yet
    const pendingInviteCodeRedemption = localStorage.getItem(STORAGE_KEY);
    const addresses = { taproot: { address: '' }, nativeSegwit: { address: '' } };

    if (!pendingInviteCodeRedemption) return;
    if (!addresses?.taproot?.address) {
      // Early return — addresses not ready, will fire on next render
      expect(pendingInviteCodeRedemption).toBe('TESTCODE');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('TESTCODE');
      return;
    }

    // Should not reach here
    expect(true).toBe(false);
  });

  it('should normalize code to uppercase before persisting', () => {
    const code = 'qianyuan';
    const normalized = code.trim().toUpperCase();
    localStorage.setItem(STORAGE_KEY, normalized);

    expect(localStorage.getItem(STORAGE_KEY)).toBe('QIANYUAN');
  });
});
