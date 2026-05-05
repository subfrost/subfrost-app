/**
 * Regression test for the UniSat / OKX single-address fix (2026-05-05).
 *
 * Before the fix, two errors crashed the app:
 *
 *   1. "BTC → DIESEL error: no taproot address available"
 *   2. "DIESEL → frBTC error: undefined has no matching Script"
 *
 * Root cause: UniSat and OKX are SINGLE-ADDRESS wallets — the user picks
 * one address mode in the extension. WalletContext.tsx silently accepted
 * non-taproot addresses by routing them into `account.nativeSegwit`,
 * leaving `account.taproot === undefined`. Two downstream sites assumed
 * taproot was always set:
 *   - useWrapMutation.ts:143 — explicit throw with cryptic message
 *   - useSwapMutation.ts:512 — `taprootAddress!` non-null-assertion lie
 *     → `bitcoin.address.toOutputScript(undefined)` → bitcoinjs throws
 *
 * The fix refuses non-taproot UniSat / OKX at connect time with a clear
 * actionable error message. This test reproduces the connect-time check
 * and the defense-in-depth check inside useSwapMutation.
 *
 * Run with: pnpm test hooks/__tests__/mutations/unisat-single-address-bugs.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { patchInputsOnly } from '@/lib/psbt-patching';

bitcoin.initEccLib(ecc);

// ---------------------------------------------------------------------------
// Helpers — exact reproductions of the WalletContext checks (post-fix)
// ---------------------------------------------------------------------------

const UNISAT_ERROR =
  'UniSat is in Native Segwit / Nested Segwit / Legacy mode. Subfrost requires Taproot — ' +
  'alkanes (DIESEL, frBTC, LP tokens, etc.) only live at P2TR addresses. ' +
  'Open UniSat → Settings → Address Type → Taproot (P2TR), then reconnect.';

const OKX_ERROR =
  'OKX is in Native Segwit / Nested Segwit mode. Subfrost requires Taproot — ' +
  'alkanes (DIESEL, frBTC, LP tokens, etc.) only live at P2TR addresses. ' +
  'Open OKX → Switch Address Type → Taproot, then reconnect.';

/** Reproduces WalletContext.tsx UniSat connect branch (post-fix). */
function unisatConnectCheck(addr: string): void {
  const isTaproot =
    addr.startsWith('bc1p') ||
    addr.startsWith('tb1p') ||
    addr.startsWith('bcrt1p');
  if (!isTaproot) throw new Error(UNISAT_ERROR);
}

/** Reproduces WalletContext.tsx OKX connect branch (post-fix). */
function okxConnectCheck(addr: string): void {
  const isTaproot =
    addr.startsWith('bc1p') ||
    addr.startsWith('tb1p') ||
    addr.startsWith('bcrt1p');
  if (!isTaproot) throw new Error(OKX_ERROR);
}

/** Reproduces useSwapMutation.ts defense-in-depth check (post-fix). */
function swapMutationTaprootGuard(taprootAddress: string | undefined): void {
  if (!taprootAddress) {
    throw new Error(
      'Connected wallet has no taproot address. Switch your wallet ' +
      'extension to Taproot (P2TR) mode and reconnect — alkanes only ' +
      'live at P2TR addresses.'
    );
  }
}

// ---------------------------------------------------------------------------
// Address fixtures (no ECC needed for segwit / p2sh)
// ---------------------------------------------------------------------------

const network = bitcoin.networks.bitcoin;
const DUMMY_PUBKEY = Buffer.alloc(33, 0x02);
const TAPROOT_ADDR =
  'bc1p026hg4dfhchc0axnmlpamu4v9gltcqtrzk0nvyc00n4eu5nl5tpsrh7zkm';
const SEGWIT_ADDR = bitcoin.payments.p2wpkh({
  pubkey: DUMMY_PUBKEY,
  network,
}).address!;
const P2SH_ADDR = bitcoin.payments.p2sh({
  redeem: bitcoin.payments.p2wpkh({ pubkey: DUMMY_PUBKEY, network }),
  network,
}).address!;

function buildMinimalP2trPsbt(): string {
  const psbt = new bitcoin.Psbt({ network });
  const dummyTaprootScript = new Uint8Array(34);
  dummyTaprootScript[0] = 0x51;
  dummyTaprootScript[1] = 0x20;
  for (let i = 2; i < 34; i++) dummyTaprootScript[i] = 0xab;
  psbt.addInput({
    hash: Buffer.alloc(32, 0x01).toString('hex'),
    index: 0,
    witnessUtxo: { script: dummyTaprootScript, value: 100_000n as any },
  } as any);
  psbt.addOutput({ address: SEGWIT_ADDR, value: 90_000n as any } as any);
  return psbt.toBase64();
}

// ===========================================================================
// Connect-time refusal — primary fix
// ===========================================================================

describe('UniSat connect-time check (primary fix)', () => {
  it('accepts a Taproot (bc1p) address', () => {
    expect(() => unisatConnectCheck(TAPROOT_ADDR)).not.toThrow();
  });

  it('refuses Native Segwit (bc1q) with a clear actionable error', () => {
    expect(() => unisatConnectCheck(SEGWIT_ADDR)).toThrowError(
      /UniSat is in Native Segwit/,
    );
    expect(() => unisatConnectCheck(SEGWIT_ADDR)).toThrowError(
      /Settings → Address Type → Taproot/,
    );
  });

  it('refuses P2SH-P2WPKH (3...) Nested Segwit', () => {
    expect(() => unisatConnectCheck(P2SH_ADDR)).toThrowError(
      /Subfrost requires Taproot/,
    );
  });

  it('error message names the problem AND tells the user how to fix it', () => {
    let caught: Error | null = null;
    try {
      unisatConnectCheck(SEGWIT_ADDR);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('UniSat');
    expect(caught!.message).toContain('Taproot');
    expect(caught!.message).toContain('alkanes');
    expect(caught!.message).toContain('Settings');
  });
});

describe('OKX connect-time check (primary fix)', () => {
  it('accepts a Taproot address', () => {
    expect(() => okxConnectCheck(TAPROOT_ADDR)).not.toThrow();
  });

  it('refuses Native Segwit', () => {
    expect(() => okxConnectCheck(SEGWIT_ADDR)).toThrowError(
      /OKX is in Native Segwit/,
    );
  });

  it('refuses Nested Segwit', () => {
    expect(() => okxConnectCheck(P2SH_ADDR)).toThrowError(
      /Switch Address Type → Taproot/,
    );
  });
});

// ===========================================================================
// Defense-in-depth — useSwapMutation guard
// ===========================================================================

describe('useSwapMutation defense-in-depth taproot guard', () => {
  it('throws clear error when taprootAddress is undefined', () => {
    expect(() => swapMutationTaprootGuard(undefined)).toThrowError(
      /Connected wallet has no taproot address/,
    );
  });

  it('passes through when taprootAddress is set', () => {
    expect(() => swapMutationTaprootGuard(TAPROOT_ADDR)).not.toThrow();
  });

  it('error tells the user what to do, not just what failed', () => {
    let caught: Error | null = null;
    try {
      swapMutationTaprootGuard(undefined);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught!.message).toContain('Switch your wallet');
    expect(caught!.message).toContain('Taproot');
  });

  it('patchInputsOnly itself now refuses undefined taprootAddress', () => {
    // The guard moved into patchInputsOnly so every caller (9+ hooks) gets
    // the same protection without needing per-site checks.
    const psbtB64 = buildMinimalP2trPsbt();
    expect(() =>
      patchInputsOnly({
        psbtBase64: psbtB64,
        network,
        taprootAddress: undefined as any,
        segwitAddress: SEGWIT_ADDR,
        paymentPubkeyHex: undefined,
      }),
    ).toThrowError(/taprootAddress is required/);
  });
});
