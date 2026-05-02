/**
 * FIRE Protocol Address Handling Tests
 *
 * Source analysis tests that verify all FIRE mutation hooks properly handle
 * browser wallet addresses. After the 2026-04-30 refactor, the address-
 * fallback chain (`isBrowserWallet ? [taprootAddress] : ['p2tr:0']` etc.)
 * lives in `WalletContext.txContext` rather than being recomputed in every
 * hook. These tests now assert that each FIRE mutation routes its address
 * parameters through `txContext` and never embeds symbolic addresses
 * directly.
 *
 * This still prevents regression of the original browser wallet output
 * address bug (see CLAUDE.md "2026-03-01: Browser Wallet Output Address
 * Bug") because `txContext` only ever yields actual user addresses.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const FIRE_MUTATION_HOOKS = [
  'useFireStakeMutation.ts',
  'useFireUnstakeMutation.ts',
  'useFireClaimMutation.ts',
  'useFireBondMutation.ts',
  'useFireBondClaimMutation.ts',
  'useFireRedeemMutation.ts',
];

const HOOKS_DIR = path.join(process.cwd(), 'hooks', 'fire');

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('FIRE mutation hooks browser wallet address handling', () => {
  for (const hookFile of FIRE_MUTATION_HOOKS) {
    describe(hookFile, () => {
      let source: string;

      try {
        source = fs.readFileSync(path.join(HOOKS_DIR, hookFile), 'utf-8');
      } catch {
        source = '';
      }

      it('should check for browser wallet type', () => {
        expect(source).toContain("walletType === 'browser'");
      });

      it('should destructure txContext from useWallet()', () => {
        const match = source.match(/const\s*\{[^}]*\}\s*=\s*useWallet\s*\(\s*\)/);
        expect(match).toBeTruthy();
        expect(match![0]).toContain('txContext');
      });

      it('should pass txContext into alkanesExecuteTyped (single-field consolidation)', () => {
        // After 2026-04-30 the wrapper unpacks `txContext` into options_json
        // itself; FIRE hooks pass the single `txContext` field instead of
        // the individual changeAddress / alkanesChangeAddress / ordinalsStrategy.
        const codeOnly = stripComments(source);
        expect(codeOnly).toMatch(/alkanesExecuteTyped\s*\(\s*\{[\s\S]*?\btxContext\b/);
      });

      it('should not redundantly pass individual txContext fields', () => {
        const codeOnly = stripComments(source);
        expect(codeOnly).not.toMatch(/changeAddress:\s*txContext\.btcChangeAddress/);
        expect(codeOnly).not.toMatch(/alkanesChangeAddress:\s*txContext\.alkanesChangeAddress/);
        expect(codeOnly).not.toMatch(/ordinalsStrategy:\s*txContext\.defaultOrdinalsStrategy/);
      });

      it('should never pass symbolic addresses (p2tr:0 / p2wpkh:0) to alkanesExecuteTyped', () => {
        const codeOnly = stripComments(source);
        const calls = codeOnly.match(/alkanesExecuteTyped\s*\(\s*\{?[\s\S]*?\}\s*\)/g) || [];
        for (const call of calls) {
          expect(call).not.toContain("'p2tr:0'");
          expect(call).not.toContain("'p2wpkh:0'");
        }
      });
    });
  }
});
