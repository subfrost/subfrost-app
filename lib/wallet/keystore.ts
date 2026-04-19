/**
 * Keystore shim — re-exports from @alkanes/ts-sdk.
 *
 * Phase 5 of the ts-sdk minimization plan.
 *
 * This file exists so app-level imports go through a local module we control.
 * The SDK's keystore implementation (PBKDF2 + AES-GCM, ~500 LOC, pure TS
 * depending only on @noble/hashes + bip39 which are already direct deps)
 * is still the source of truth — we have not inlined it yet.
 *
 * ## Why a shim instead of an inline
 *
 * The SDK's keystore uses the same crypto primitives the WASM provider uses
 * internally. Getting the PBKDF2 iteration count, salt format, or nonce
 * handling wrong by a single byte produces keystores that decrypt with the
 * same password to DIFFERENT mnemonics — silent data loss. Inlining is
 * correct only when we can test byte-for-byte round-tripping against the SDK
 * across a representative set of fixture keystores. Until then, delegate.
 *
 * ## Migration path
 *
 * When we do inline, every call site imports from `@/lib/wallet/keystore`
 * and the change is confined to this file — no hook / context / component
 * changes needed.
 *
 * ## Current call sites
 *
 * - `app/wallet/components/WalletSettings.tsx` — uses `unlockKeystore` for
 *   password-protected mnemonic export
 * - `lib/oyl/alkanes/wallet-integration-real.ts` — uses all three exports
 *   for the wallet creation / import / unlock flow
 */

export {
  createKeystore,
  unlockKeystore,
  KeystoreManager,
} from '@alkanes/ts-sdk';

export type { Keystore, WalletConfig } from '@alkanes/ts-sdk';
