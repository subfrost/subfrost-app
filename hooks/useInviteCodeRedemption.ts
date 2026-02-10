/**
 * useInviteCodeRedemption — Persists and executes invite code redemption.
 *
 * BUG FIX (2026-02-10): Invite code redemptions were never recorded because
 * pendingInviteCodeRedemption was stored as ephemeral React state in
 * ConnectWalletModal. When resetForm() ran on modal close/reopen, it cleared
 * the pending code before the redemption useEffect could fire. Only 1 of 14
 * mainnet users had a recorded redemption.
 *
 * FIX: This hook persists the pending code to localStorage so it survives
 * modal resets and page refreshes. The code is only cleared after a
 * successful API call (or a definitive error like "invalid code").
 * Network errors leave the code in place for automatic retry.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'subfrost_pending_invite_redemption';

interface Addresses {
  taproot?: { address: string; pubkey?: string };
  nativeSegwit?: { address: string };
}

export function useInviteCodeRedemption(addresses: Addresses | null | undefined) {
  const [pendingCode, setPendingCodeRaw] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const setPendingCode = useCallback((code: string | null) => {
    setPendingCodeRaw(code);
    if (typeof window !== 'undefined') {
      if (code) {
        localStorage.setItem(STORAGE_KEY, code);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Fire redemption API when both pending code and addresses are available
  useEffect(() => {
    if (!pendingCode) return;
    if (!addresses?.taproot?.address) return;

    const redeemCode = async () => {
      try {
        const response = await fetch('/api/invite-codes/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: pendingCode,
            taprootAddress: addresses.taproot!.address,
            segwitAddress: addresses.nativeSegwit?.address,
            taprootPubkey: addresses.taproot!.pubkey,
          }),
        });
        const data = await response.json();
        if (data.success) {
          console.log('[InviteCode] Redeemed:', pendingCode, '->', addresses.taproot!.address);
          setPendingCode(null);
        } else {
          console.warn('[InviteCode] Redemption failed:', data.error);
          // Clear on definitive failures to avoid infinite retries
          setPendingCode(null);
        }
      } catch (err) {
        console.error('[InviteCode] Redemption error (will retry):', err);
        // Keep pending code in localStorage — network errors are transient
      }
    };

    redeemCode();
  }, [pendingCode, addresses?.taproot?.address, addresses?.nativeSegwit?.address, addresses?.taproot?.pubkey, setPendingCode]);

  return { pendingCode, setPendingCode };
}
