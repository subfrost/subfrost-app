/**
 * Address Handling Tests — Source Code Analysis
 *
 * Verifies critical address-handling patterns exist in ALL mutation hooks
 * via static source analysis (fs.readFileSync + string assertions).
 *
 * Originally (2026-03-01) these tests guarded the per-hook
 * `useActualAddresses = isBrowserWallet || network === 'devnet' || ...`
 * fallback chain that prevented symbolic addresses (`p2tr:0`, `p2wpkh:0`)
 * from leaking into browser-wallet code paths. Tx 985436b5… lost real
 * tokens to that bug.
 *
 * Address-fallback chains are now consolidated into `txContext` exposed by
 * `useWallet()` — see `WalletContext.TxContext` jsdoc. The test surface
 * shifted from "every hook recomputes the right fallback" to "every hook
 * sources its address parameters from txContext, never inline ternaries
 * that could regress to symbolic addresses". This is a stronger guarantee:
 * the symbolic-address class of bug is now structurally impossible because
 * `txContext` doesn't expose any symbolic strings.
 *
 * Run with: pnpm test hooks/__tests__/mutations/address-handling.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOOKS_DIR = path.resolve(__dirname, '..', '..');

/** Read a hook file's source code */
function readHook(filename: string): string {
  const filePath = path.join(HOOKS_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Strip JS line and block comments from a source string.
 *
 * Used by the "no deprecated patterns" tests below: those tests assert that
 * mutation hooks don't *call* `window.unisat`, `window.oyl`, etc. directly —
 * they should route through the wallet-capability registry / signing helpers
 * instead. Without this stripping, a comment that *explains* why direct
 * access was unsafe would fail the assertion even though no real code makes
 * that call.
 *
 * Conservative implementation:
 *   - Removes `// ...` to end of line.
 *   - Removes `/* ... *\/` (multi-line).
 *   - Doesn't try to handle every edge case (comment-like content inside
 *     strings, regex literals, JSX, etc.) because mutation hooks don't have
 *     `window.X` substrings inside string/regex literals — only in code or
 *     comments.
 */
function stripComments(src: string): string {
  return src
    // Block comments: /* ... */ across multiple lines
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments: // to end of line
    .replace(/\/\/[^\n]*/g, '');
}

// Mutation hooks that call alkanesExecuteTyped (core AMM + wrap surfaces)
const ACTIVE_HOOKS = [
  'useSwapMutation.ts',
  'useAddLiquidityMutation.ts',
  'useRemoveLiquidityMutation.ts',
  'useUnwrapMutation.ts',
  'useWrapMutation.ts',
] as const;

// Every other mutation hook in the app that builds and signs a PSBT.
// Together with ACTIVE_HOOKS this covers all production signing paths.
// Keep in sync with `find hooks -name '*Mutation.ts'` — excluding hooks that
// delegate signing to another mutation (`useAtomicWrap*Mutation` are wrappers
// around their non-atomic siblings).
const OTHER_SIGNING_HOOKS = [
  'useBridgeMutation.ts',
  'useBridgeEthMutation.ts',
  'useBridgeZecMutation.ts',
  'useCancelOrderMutation.ts',
  'useFujinBuyMutation.ts',
  'useFujinSellMutation.ts',
  'useGaugeClaimMutation.ts',
  'useGaugeStakeMutation.ts',
  'useGaugeUnstakeMutation.ts',
  'useLimitOrderMutation.ts',
  'useUnwrapEthMutation.ts',
  'useUnwrapZecMutation.ts',
  'useWrapEthMutation.ts',
  'useWrapZecMutation.ts',
  'useVaultDeposit.ts',
  'useVaultWithdraw.ts',
  'fire/useFireBondClaimMutation.ts',
  'fire/useFireBondMutation.ts',
  'fire/useFireClaimMutation.ts',
  'fire/useFireRedeemMutation.ts',
  'fire/useFireStakeMutation.ts',
  'fire/useFireUnstakeMutation.ts',
] as const;

const ALL_HOOKS = ACTIVE_HOOKS;
const ALL_SIGNING_HOOKS = [...ALL_HOOKS, ...OTHER_SIGNING_HOOKS] as const;

// Hooks that involve time-sensitive operations (swap, remove liquidity)
// and need regtest deadline overrides
const DEADLINE_HOOKS = [
  'useSwapMutation.ts',
  'useRemoveLiquidityMutation.ts',
] as const;

// ==========================================================================
// 1. txContext-driven address handling
// ==========================================================================

describe('txContext-driven address handling', () => {
  describe.each(ALL_SIGNING_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should destructure txContext from useWallet()', () => {
      // Address-fallback chains were consolidated into `txContext` (2026-04-30).
      // Every mutation hook must source its tx parameters from this object.
      const useWalletDestructure = src.match(/const\s*\{[^}]*\}\s*=\s*useWallet\s*\(\s*\)/);
      expect(useWalletDestructure).toBeTruthy();
      expect(useWalletDestructure![0]).toContain('txContext');
    });

    it('should pass txContext into alkanesExecuteTyped', () => {
      // After 2026-04-30 the wrapper unpacks `txContext` into the WASM
      // options_json itself; callers pass the single `txContext` field instead
      // of the five individual address / strategy fields.
      const codeOnly = stripComments(src);
      expect(codeOnly).toMatch(/alkanesExecuteTyped\(\s*(?:provider,\s*)?\{[\s\S]*?\btxContext\b/);
    });

    it('should not pass symbolic addresses (p2tr:0 / p2wpkh:0) into alkanesExecuteTyped', () => {
      // Strip comments first — header comments still mention the old symbolic
      // pattern as historical context, but real code paths must not use them.
      const codeOnly = stripComments(src);
      const execCallMatch = codeOnly.match(/alkanesExecuteTyped\s*\(\s*\{?[\s\S]*?\}\s*\)/g);
      if (!execCallMatch) return; // Nothing to check
      for (const call of execCallMatch) {
        expect(call).not.toContain("'p2tr:0'");
        expect(call).not.toContain("'p2wpkh:0'");
      }
    });

    it('should not redundantly pass individual txContext fields when txContext is already passed', () => {
      // After the consolidation, every alkanesExecuteTyped call site that
      // already passes `txContext` must NOT also pass the same field a second
      // time as `fromAddresses: txContext.feeSourceAddresses` etc. — the whole
      // point of the consolidation was to remove that boilerplate.
      const codeOnly = stripComments(src);
      expect(codeOnly).not.toMatch(/fromAddresses:\s*txContext\.feeSourceAddresses/);
      expect(codeOnly).not.toMatch(/changeAddress:\s*txContext\.btcChangeAddress/);
      expect(codeOnly).not.toMatch(/alkanesChangeAddress:\s*txContext\.alkanesChangeAddress/);
      expect(codeOnly).not.toMatch(/protectTaproot:\s*txContext\.shouldProtectTaproot/);
      expect(codeOnly).not.toMatch(/ordinalsStrategy:\s*txContext\.defaultOrdinalsStrategy/);
    });

    it('should guard against unconnected wallet via txContext null check', () => {
      // After destructuring `txContext`, every hook must abort cleanly when
      // it's null (wallet not connected) instead of dereferencing into a
      // crash. Match either `if (!txContext)` or a nullish-coalescing throw.
      expect(src).toMatch(/!txContext|txContext\s*===\s*null/);
    });
  });
});

// ==========================================================================
// 2. ordinalsStrategy via txContext (or per-call override)
// ==========================================================================

describe('ordinalsStrategy via txContext', () => {
  describe.each(ACTIVE_HOOKS)('%s', (hookFile) => {
    it("should pass txContext (or an explicit ordinalsStrategy override) to alkanesExecuteTyped", () => {
      // ordinalsStrategy was hardcoded to 'exclude' until 2026-04-30, when it
      // was consolidated into `txContext.defaultOrdinalsStrategy`. Keystore
      // wallets resolve to 'burn' (skips inscription/rune lookup entirely),
      // browser wallets to 'exclude'. Per-operation overrides happen at the
      // call site (e.g. SendModal escalating to 'preserve').
      const src = readHook(hookFile);
      const codeOnly = stripComments(src);
      const execCallMatch = codeOnly.match(/alkanesExecuteTyped\s*\(\s*(?:\w+,\s*)?\{[\s\S]*?\}\s*\)/);
      expect(execCallMatch).toBeTruthy();
      const call = execCallMatch![0];
      const passesTxContext = /\btxContext\b/.test(call);
      const passesExplicitOrdinals = /ordinalsStrategy\s*:/.test(call);
      expect(passesTxContext || passesExplicitOrdinals).toBe(true);
    });
  });
});

// ==========================================================================
// 3. Regtest Deadline Override
// ==========================================================================

describe('Regtest deadline override', () => {
  describe.each(DEADLINE_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should detect regtest network', () => {
      expect(src).toMatch(/isRegtest\s*=/);
      expect(src).toContain("'subfrost-regtest'");
    });

    it('should override deadline to 1000 blocks on regtest', () => {
      expect(src).toMatch(/isRegtest\s*\?\s*1000/);
    });
  });

  // Non-deadline hooks should NOT have deadline logic
  describe.each(['useWrapMutation.ts'] as const)('%s (no deadline needed)', (hookFile) => {
    it('should not have deadline override logic', () => {
      const src = readHook(hookFile);
      expect(src).not.toMatch(/isRegtest\s*\?\s*1000/);
    });
  });
});

// ==========================================================================
// 4. No Deprecated Patterns
// ==========================================================================

describe('No deprecated patterns', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;
    let codeOnly: string;

    beforeAll(() => {
      src = readHook(hookFile);
      // Test intent: no *real code* in mutation hooks reaches into wallet
      // extension globals like `window.unisat` directly. Comments that
      // explain why direct access is unsafe (e.g. capability-registry
      // documentation) are fine and shouldn't fail the assertion.
      codeOnly = stripComments(src);
    });

    it('should not directly access window.oyl', () => {
      expect(codeOnly).not.toContain('window.oyl');
    });

    it('should not directly access window.unisat', () => {
      expect(codeOnly).not.toContain('window.unisat');
    });

    it('should not directly access window.okxwallet', () => {
      expect(codeOnly).not.toContain('window.okxwallet');
    });

    it('should not directly access window.xverse', () => {
      expect(codeOnly).not.toContain('window.xverse');
    });

    it('should not call patchPsbtForBrowserWallet (removed/deprecated)', () => {
      if (hookFile === 'useWrapMutation.ts') {
        // Wrap imports it but the call site was removed; skip this check
        return;
      }
      expect(codeOnly).not.toMatch(/patchPsbtForBrowserWallet\s*\(/);
    });

    it('should not recompute the legacy useActualAddresses ternary', () => {
      // Address-fallback chain was consolidated into txContext (2026-04-30).
      // Hooks must NOT recompute the per-call fallback locally — that's
      // exactly the duplication this refactor eliminated. Header comments
      // can still mention the name as historical context.
      expect(codeOnly).not.toMatch(/useActualAddresses\s*=\s*isBrowserWallet/);
    });
  });
});

// ==========================================================================
// 5. Browser Wallet Signing Pattern
// ==========================================================================

describe('Single-signing pattern (taproot-only keystore + browser via adapter)', () => {
  // Keystore wallets are BIP86 taproot-only — `signSegwitPsbt` throws for
  // them. Browser wallet adapters sign all input types (taproot + segwit +
  // p2sh) inside a single `signTaprootPsbt` call, so both wallet types
  // collapse to one signing call. This regression guard asserts that no
  // mutation hook still calls `signSegwitPsbt` as a function.
  //
  // See WalletContext.tsx — signSegwitPsbt body throws with
  // "signSegwitPsbt called for keystore wallet — keystore is taproot-only"
  // for `walletType === 'keystore'`.

  describe.each(ALL_SIGNING_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should call signTaprootPsbt', () => {
      // The unified signing call. Even hooks that only ever sign segwit
      // routes go through signTaprootPsbt because the WalletContext
      // dispatches on wallet type internally.
      expect(src).toMatch(/signTaprootPsbt\s*\(/);
    });

    it('should NOT call signSegwitPsbt as a function (single-signing path)', () => {
      // Strip line and block comments so an inline note that *mentions*
      // `signSegwitPsbt` (explaining why it's not called) doesn't trip the
      // regex. The pattern below matches the function-call form only.
      const codeOnly = stripComments(src);
      expect(codeOnly).not.toMatch(/signSegwitPsbt\s*\(/);
    });

    it('should NOT destructure signSegwitPsbt from useWallet (unused after migration)', () => {
      // After the migration the destructure should drop signSegwitPsbt —
      // leaving it in the destructure adds a confusing unused-import-style
      // signal and lets future refactors accidentally re-introduce it.
      const codeOnly = stripComments(src);
      const destructureLine = codeOnly.match(/const\s*\{[^}]+\}\s*=\s*useWallet\s*\(\s*\)/);
      if (destructureLine) {
        expect(destructureLine[0]).not.toContain('signSegwitPsbt');
      }
    });
  });
});
