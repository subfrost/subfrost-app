/**
 * Unit tests for `lib/wallet/frostGuard.ts`.
 *
 * The guard gates wrap/unwrap/bridge mutations so non-taproot wallet users
 * (UniSat/OKX in Native SegWit / Nested SegWit / Legacy mode) get an
 * actionable error rather than silently passing an empty string into the
 * FROST signer protocol.
 */

import { describe, it, expect } from 'vitest';
import {
  FrostRequiresTaprootError,
  requireTaprootForFrost,
} from '../frostGuard';

describe('requireTaprootForFrost', () => {
  it('returns the address when present', () => {
    const addr = 'bc1p026hg4dfhchc0axnmlpamu4v9gltcqtrzk0nvyc00n4eu5nl5tpsrh7zkm';
    expect(requireTaprootForFrost(addr, 'wrap BTC')).toBe(addr);
  });

  it('throws FrostRequiresTaprootError when address is undefined', () => {
    expect(() =>
      requireTaprootForFrost(undefined, 'wrap BTC'),
    ).toThrow(FrostRequiresTaprootError);
  });

  it('throws when address is null', () => {
    expect(() =>
      requireTaprootForFrost(null, 'unwrap frBTC'),
    ).toThrow(FrostRequiresTaprootError);
  });

  it('throws when address is the empty string (segwit-only wallet)', () => {
    // WalletContext stubs `account.taproot.address` to '' for browser
    // wallets that only expose a segwit/nested-segwit address. The guard
    // must treat '' the same as missing.
    expect(() => requireTaprootForFrost('', 'bridge to EVM')).toThrow(
      FrostRequiresTaprootError,
    );
  });
});

describe('FrostRequiresTaprootError', () => {
  it('carries the operation in the message and on the error instance', () => {
    let caught: FrostRequiresTaprootError | null = null;
    try {
      requireTaprootForFrost(undefined, 'wrap to frETH');
    } catch (e) {
      caught = e as FrostRequiresTaprootError;
    }
    expect(caught).toBeInstanceOf(FrostRequiresTaprootError);
    expect(caught!.name).toBe('FrostRequiresTaprootError');
    expect(caught!.operation).toBe('wrap to frETH');
    expect(caught!.message).toContain('wrap to frETH');
  });

  it('error message is actionable — names UniSat/OKX and the menu path', () => {
    let caught: Error | null = null;
    try {
      requireTaprootForFrost(undefined, 'wrap BTC');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    // Message must mention Taproot (the cause) and the wallet menus where
    // the user fixes it (the cure). No bare "no taproot address available".
    expect(caught!.message).toMatch(/Taproot/);
    expect(caught!.message).toMatch(/UniSat/);
    expect(caught!.message).toMatch(/OKX/);
    expect(caught!.message).toMatch(/reconnect/i);
  });
});
