/**
 * Browser wallet types used across subfrost-app.
 *
 * Duplicated from `@alkanes/ts-sdk` rather than re-exported so that
 * callers can import types without traversing the SDK barrel. The
 * shape must match the SDK's `BrowserWalletInfo` / `WalletAccount` /
 * `PsbtSigningOptions` exactly — we still mix SDK wallet entries
 * (with base64 icons) into our ordered list in `constants/wallets.ts`.
 *
 * If the SDK's shape changes, update this file to match. There is a
 * structural compatibility test in the test suite that will fail
 * loudly if they drift.
 */

export interface BrowserWalletInfo {
  id: string;
  name: string;
  icon: string;
  website: string;
  injectionKey: string;
  supportsPsbt: boolean;
  supportsTaproot: boolean;
  supportsOrdinals: boolean;
  mobileSupport: boolean;
  deepLinkScheme?: string;
}

export interface WalletAccount {
  address: string;
  publicKey?: string;
  addressType?: string;
  /** Payment address for dual-address wallets (Xverse, Leather, Magic Eden) */
  paymentAddress?: string;
  /** Payment public key for dual-address wallets */
  paymentPublicKey?: string;
}

export interface PsbtSigningOptions {
  autoFinalized?: boolean;
  toSignInputs?: Array<{
    index: number;
    address?: string;
    sighashTypes?: number[];
    disableTweakedPublicKey?: boolean;
  }>;
}
