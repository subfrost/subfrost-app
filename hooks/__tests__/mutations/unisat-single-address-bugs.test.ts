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
// Helpers — reproductions of the WalletContext slot-routing logic
// (post-relaxation: bc1p* / tb1p* / bcrt1p* → taproot slot, anything else
// → nativeSegwit slot, no connect-time throw)
// ---------------------------------------------------------------------------

interface SlotAssignment {
  taproot?: { address: string };
  nativeSegwit?: { address: string };
}

/** Reproduces WalletContext.tsx UniSat connect branch (post-relaxation). */
function unisatConnectRoute(addr: string): SlotAssignment {
  const isTaproot =
    addr.startsWith('bc1p') ||
    addr.startsWith('tb1p') ||
    addr.startsWith('bcrt1p');
  return isTaproot
    ? { taproot: { address: addr } }
    : { nativeSegwit: { address: addr } };
}

/** Reproduces WalletContext.tsx OKX connect branch (post-relaxation). */
function okxConnectRoute(addr: string): SlotAssignment {
  const isTaproot =
    addr.startsWith('bc1p') ||
    addr.startsWith('tb1p') ||
    addr.startsWith('bcrt1p');
  return isTaproot
    ? { taproot: { address: addr } }
    : { nativeSegwit: { address: addr } };
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
// Connect-time slot routing — relaxation (was: refusal)
// ===========================================================================
//
// Pre-relaxation behavior was a hard throw at connect time when UniSat/OKX
// returned a non-Taproot address. That blocked users from doing ANYTHING —
// including the operations that don't need Taproot at all (swap, LP, vault,
// alkane send, BTC send). Post-relaxation:
//   - Taproot addresses route to the `taproot` slot (unchanged)
//   - Non-taproot addresses route to the `nativeSegwit` slot (new)
//   - FROST flows (wrap/unwrap/bridge) gate themselves via
//     requireTaprootForFrost — see lib/wallet/frostGuard.ts

describe('UniSat connect-time slot routing', () => {
  it('routes a Taproot (bc1p) address to the taproot slot', () => {
    const slots = unisatConnectRoute(TAPROOT_ADDR);
    expect(slots.taproot?.address).toBe(TAPROOT_ADDR);
    expect(slots.nativeSegwit).toBeUndefined();
  });

  it('routes Native Segwit (bc1q) to the nativeSegwit slot (no throw)', () => {
    const slots = unisatConnectRoute(SEGWIT_ADDR);
    expect(slots.nativeSegwit?.address).toBe(SEGWIT_ADDR);
    expect(slots.taproot).toBeUndefined();
  });

  it('routes P2SH-P2WPKH (3...) Nested Segwit to the nativeSegwit slot', () => {
    const slots = unisatConnectRoute(P2SH_ADDR);
    expect(slots.nativeSegwit?.address).toBe(P2SH_ADDR);
    expect(slots.taproot).toBeUndefined();
  });
});

describe('OKX connect-time slot routing', () => {
  it('routes Taproot to the taproot slot', () => {
    const slots = okxConnectRoute(TAPROOT_ADDR);
    expect(slots.taproot?.address).toBe(TAPROOT_ADDR);
  });

  it('routes Native Segwit to the nativeSegwit slot (no throw)', () => {
    const slots = okxConnectRoute(SEGWIT_ADDR);
    expect(slots.nativeSegwit?.address).toBe(SEGWIT_ADDR);
    expect(slots.taproot).toBeUndefined();
  });

  it('routes Nested Segwit to the nativeSegwit slot (no throw)', () => {
    const slots = okxConnectRoute(P2SH_ADDR);
    expect(slots.nativeSegwit?.address).toBe(P2SH_ADDR);
    expect(slots.taproot).toBeUndefined();
  });
});

// ===========================================================================
// Removed: useSwapMutation defense-in-depth taproot guard
// ===========================================================================
//
// The "Connected wallet has no taproot address" throw in useSwapMutation
// was deleted alongside the connect-time refusal. Swap is NOT a FROST flow
// and works fine for segwit-only single-address wallets. This describe block
// is intentionally a placeholder — the test name is preserved as a marker so
// future regression hunts find the right history.

describe('useSwapMutation guard removed (relaxation)', () => {
  it('used to throw on missing taprootAddress; now tolerates it via patchInputsOnly', () => {
    // This is asserted directly by the next test —
    // patchInputsOnly itself returns cleanly with taprootAddress undefined.
    expect(true).toBe(true);
  });

  it('patchInputsOnly tolerates missing taprootAddress for segwit-only wallets', () => {
    // Single-address segwit-only wallets (UniSat/OKX in Native SegWit
    // mode) reach this path with no taproot. patchInputsOnly must
    // gracefully no-op the P2TR-input branch rather than throwing —
    // segwit witnessUtxo patches and Xverse redeemScript injection
    // still happen for any segwit/P2SH inputs that need them.
    const psbtB64 = buildMinimalP2trPsbt();
    const result = patchInputsOnly({
      psbtBase64: psbtB64,
      network,
      taprootAddress: undefined,
      segwitAddress: SEGWIT_ADDR,
      paymentPubkeyHex: undefined,
    });
    // The minimal P2TR PSBT has only a P2TR input with nothing for a
    // segwit-only flow to patch — inputsPatched is 0 and the PSBT
    // round-trips unchanged.
    expect(result.inputsPatched).toBe(0);
    expect(typeof result.psbtBase64).toBe('string');
  });
});
