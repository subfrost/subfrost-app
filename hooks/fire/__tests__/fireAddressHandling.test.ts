/**
 * FIRE Protocol Address Handling Tests
 *
 * Source analysis tests that verify all FIRE mutation hooks properly handle
 * browser wallet addresses. Follows the pattern from
 * hooks/__tests__/mutations/address-handling.test.ts.
 *
 * This prevents regression of the browser wallet output address bug
 * (see CLAUDE.md "2026-03-01: Browser Wallet Output Address Bug").
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

      it('should use conditional toAddresses', () => {
        expect(source).toContain('isBrowserWallet ? [taprootAddress]');
      });

      it('should use conditional changeAddress', () => {
        expect(source).toContain('isBrowserWallet ? (segwitAddress || taprootAddress)');
      });

      it('should use conditional alkanesChangeAddress', () => {
        expect(source).toContain('isBrowserWallet ? taprootAddress');
      });

      it('should NOT use bare p2tr:0 without conditional', () => {
        // Every p2tr:0 usage should be inside a ternary (after a colon)
        const lines = source.split('\n');
        for (const line of lines) {
          if (line.includes("'p2tr:0'") && !line.includes('?') && !line.includes(':')) {
            // Allow in comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
            throw new Error(`Found bare p2tr:0 usage: ${line.trim()}`);
          }
        }
      });

      it('should NOT use bare p2wpkh:0 without conditional', () => {
        const lines = source.split('\n');
        for (const line of lines) {
          if (line.includes("'p2wpkh:0'") && !line.includes('?') && !line.includes(':')) {
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
            throw new Error(`Found bare p2wpkh:0 usage: ${line.trim()}`);
          }
        }
      });
    });
  }
});
