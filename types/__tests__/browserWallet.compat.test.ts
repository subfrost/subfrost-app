/**
 * Drift check: our local `BrowserWalletInfo` / `WalletAccount` /
 * `PsbtSigningOptions` types must remain structurally compatible with the
 * SDK's exports. If the SDK bumps and changes a shape, this test fails at
 * compile time so we notice before a runtime crash.
 *
 * The test uses TypeScript's structural assignability via identity functions
 * — no runtime assertions; `tsc --noEmit` either accepts it or doesn't.
 */

import { describe, it, expect } from 'vitest';
import type {
  BrowserWalletInfo,
  WalletAccount,
  PsbtSigningOptions,
} from '@/types/browserWallet';
import type {
  BrowserWalletInfo as SdkBrowserWalletInfo,
  WalletAccount as SdkWalletAccount,
  PsbtSigningOptions as SdkPsbtSigningOptions,
} from '@alkanes/ts-sdk';

function assertSdkCompat<SdkT, LocalT extends SdkT>(_x: LocalT): void {
  // No-op at runtime. The type parameter constraint is what enforces
  // LocalT is assignable to SdkT (and vice versa via the flipped call).
}

describe('browserWallet type compat with @alkanes/ts-sdk', () => {
  it('BrowserWalletInfo is structurally compatible in both directions', () => {
    const local: BrowserWalletInfo = {
      id: 'unisat',
      name: 'Unisat Wallet',
      icon: 'data:image/png;base64,...',
      website: 'https://unisat.io',
      injectionKey: 'unisat',
      supportsPsbt: true,
      supportsTaproot: true,
      supportsOrdinals: true,
      mobileSupport: false,
    };
    assertSdkCompat<SdkBrowserWalletInfo, BrowserWalletInfo>(local);

    const fromSdk: SdkBrowserWalletInfo = local;
    assertSdkCompat<BrowserWalletInfo, SdkBrowserWalletInfo>(fromSdk);

    expect(local.id).toBe('unisat');
  });

  it('WalletAccount is structurally compatible', () => {
    const local: WalletAccount = {
      address: 'bc1p...',
      publicKey: '02...',
      paymentAddress: 'bc1q...',
      paymentPublicKey: '03...',
    };
    assertSdkCompat<SdkWalletAccount, WalletAccount>(local);

    const fromSdk: SdkWalletAccount = local;
    assertSdkCompat<WalletAccount, SdkWalletAccount>(fromSdk);

    expect(local.address).toBe('bc1p...');
  });

  it('PsbtSigningOptions is structurally compatible', () => {
    const local: PsbtSigningOptions = {
      autoFinalized: true,
      toSignInputs: [{ index: 0, address: 'bc1p...' }],
    };
    assertSdkCompat<SdkPsbtSigningOptions, PsbtSigningOptions>(local);

    const fromSdk: SdkPsbtSigningOptions = local;
    assertSdkCompat<PsbtSigningOptions, SdkPsbtSigningOptions>(fromSdk);

    expect(local.autoFinalized).toBe(true);
  });
});
