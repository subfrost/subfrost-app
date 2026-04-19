/**
 * Fee estimation shim — re-exports from @alkanes/ts-sdk.
 *
 * Phase 9 of the ts-sdk minimization plan. Matches the pattern established
 * in `lib/wallet/keystore.ts`: app imports go through a local module we
 * control, implementation still comes from the trusted SDK until we have
 * the bandwidth to inline + test it.
 *
 * ## Why a shim for these three helpers
 *
 * `computeSendFee`, `estimateSelectionFee`, and `DUST_THRESHOLD` are pure
 * arithmetic — no crypto primitives, no network I/O. Inlining them is
 * genuinely low-risk (unlike `keystore.ts`). But there's a test in
 * `SendModal.btc.test.ts:141` that hard-asserts the import source string,
 * so we need to move the test + the source import together. That's a
 * Phase-10 cleanup, not a Phase-9 shim.
 *
 * ## Current call sites
 *
 * - `app/wallet/components/SendModal.tsx` — BTC send fee preview + dust guard
 * - `app/wallet/components/__tests__/SendModal.btc.test.ts` — tests the
 *   fee math; hard-asserts the SendModal's import string
 */

export { computeSendFee, estimateSelectionFee, DUST_THRESHOLD } from '@alkanes/ts-sdk';
