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

// Hooks that use the standard `alkanesExecuteTyped({ toAddresses, changeAddress,
// alkanesChangeAddress })` pattern with the conditional-address ternary for
// browser wallets. These get the full source-grep audit below.
const STANDARD_PATTERN_HOOKS = [
  'useFireUnstakeMutation.ts',
  'useFireClaimMutation.ts',
  'useFireBondMutation.ts',
  'useFireBondClaimMutation.ts',
  'useFireRedeemMutation.ts',
];

// Hooks that use the alternative `alkanesExecuteFull(JSON.stringify([taprootAddress]),
// ..., { from: [...], change_address, alkanes_change_address })` pattern. These
// pass actual addresses (not symbolic p2tr:0) directly via JSON.stringify, so
// the safe-address invariant holds — but the source-grep below doesn't apply.
//
// useFireStakeMutation uses this alternative pattern because it's a devnet/regtest
// staking primitive that needs explicit `mine_enabled` + `lock_alkanes` options
// only available via alkanesExecuteFull. Functionally equivalent for the
// safe-address contract.
const ALTERNATIVE_PATTERN_HOOKS = [
  'useFireStakeMutation.ts',
];

const HOOKS_DIR = path.join(process.cwd(), 'hooks', 'fire');

describe('FIRE mutation hooks browser wallet address handling', () => {
  for (const hookFile of STANDARD_PATTERN_HOOKS) {
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
        expect(source).toMatch(/(?:isBrowserWallet|useActualAddresses) \? \[taprootAddress\]/);
      });

      it('should use conditional changeAddress', () => {
        expect(source).toMatch(/(?:isBrowserWallet|useActualAddresses) \? \(segwitAddress \|\| taprootAddress\)/);
      });

      it('should use conditional alkanesChangeAddress', () => {
        expect(source).toMatch(/(?:isBrowserWallet|useActualAddresses) \? taprootAddress/);
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

  // Alternative pattern: alkanesExecuteFull with explicit JSON.stringify'd
  // address arrays. The contract is the same (no symbolic addresses) but the
  // assertion shape differs. We assert the alternative-pattern invariants.
  for (const hookFile of ALTERNATIVE_PATTERN_HOOKS) {
    describe(`${hookFile} (alkanesExecuteFull pattern)`, () => {
      let source: string;
      try {
        source = fs.readFileSync(path.join(HOOKS_DIR, hookFile), 'utf-8');
      } catch {
        source = '';
      }

      it('should call alkanesExecuteFull (alternative pattern) — not Typed', () => {
        expect(source).toContain('alkanesExecuteFull');
      });

      it('should pass real taprootAddress to alkanesExecuteFull (not symbolic)', () => {
        expect(source).toMatch(/JSON\.stringify\(\[taprootAddress\]\)/);
      });

      it('should pass real fromAddrs (segwit + taproot) — not symbolic', () => {
        expect(source).toMatch(/from:\s*fromAddrs|from:\s*\[segwitAddress[^\]]*taprootAddress/);
      });

      it('should pass real change_address — not symbolic', () => {
        expect(source).toMatch(/change_address:\s*segwitAddress\s*\|\|\s*taprootAddress|change_address:\s*taprootAddress/);
      });

      it('should pass real alkanes_change_address — not symbolic', () => {
        expect(source).toMatch(/alkanes_change_address:\s*taprootAddress/);
      });

      it('should NOT use bare p2tr:0 without conditional', () => {
        const lines = source.split('\n');
        for (const line of lines) {
          if (line.includes("'p2tr:0'") && !line.includes('?') && !line.includes(':')) {
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
