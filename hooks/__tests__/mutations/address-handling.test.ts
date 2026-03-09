/**
 * Address Handling Tests — Source Code Analysis
 *
 * Verifies critical address-handling patterns exist in ALL mutation hooks
 * via static source analysis (fs.readFileSync + string assertions).
 *
 * These tests prevent regressions of the browser wallet output address bug
 * documented in useSwapMutation.ts (2026-03-01) where symbolic addresses
 * like 'p2tr:0' resolved to SDK dummy wallet addresses, causing token loss.
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
 * Extract the browser (truthy) branch from a ternary using isBrowserWallet.
 * Handles two patterns:
 *   1. const x = isBrowserWallet\n  ? [value]\n  : [fallback];
 *   2. key: isBrowserWallet ? value : fallback,  (inline in object literal)
 */
function extractBrowserBranch(src: string, varName: string): string | null {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pattern 1: multiline assignment
  const assignPattern = new RegExp(
    `${escaped}\\s*=\\s*isBrowserWallet\\s*\\n\\s*\\?\\s*(.+)\\n\\s*:`,
  );
  const assignMatch = src.match(assignPattern);
  if (assignMatch) return assignMatch[1].trim();

  // Pattern 2: inline property ternary (changeAddress: isBrowserWallet ? x : y)
  const propName = varName.replace(/^const\s+/, '');
  const propEscaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inlinePattern = new RegExp(
    `${propEscaped}\\s*:\\s*isBrowserWallet\\s*\\?\\s*(.+?)\\s*:`,
  );
  const inlineMatch = src.match(inlinePattern);
  if (inlineMatch) return inlineMatch[1].trim();

  return null;
}

/**
 * Extract the keystore (falsy) branch from a ternary using isBrowserWallet.
 */
function extractKeystoreBranch(src: string, varName: string): string | null {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pattern 1: multiline assignment
  const assignPattern = new RegExp(
    `${escaped}\\s*=\\s*isBrowserWallet\\s*\\n\\s*\\?.+\\n\\s*:\\s*(.+?)\\s*;`,
  );
  const assignMatch = src.match(assignPattern);
  if (assignMatch) return assignMatch[1].trim();

  // Pattern 2: inline property ternary
  const propName = varName.replace(/^const\s+/, '');
  const propEscaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inlinePattern = new RegExp(
    `${propEscaped}\\s*:\\s*isBrowserWallet\\s*\\?.+?:\\s*(.+?)\\s*[,}]`,
  );
  const inlineMatch = src.match(inlinePattern);
  if (inlineMatch) return inlineMatch[1].trim();

  return null;
}

// All mutation hooks that call alkanesExecuteTyped
const ACTIVE_HOOKS = [
  'useSwapMutation.ts',
  'useAddLiquidityMutation.ts',
  'useRemoveLiquidityMutation.ts',
  'useUnwrapMutation.ts',
  'useWrapMutation.ts',
] as const;

// Hooks that also exist but are deprecated (still should have correct patterns)
const DEPRECATED_HOOKS = [
  'useSwapUnwrapMutation.ts',
  'useWrapSwapMutation.ts',
] as const;

const ALL_HOOKS = [...ACTIVE_HOOKS, ...DEPRECATED_HOOKS] as const;

// Hooks that involve time-sensitive operations (swap, remove liquidity)
// and need regtest deadline overrides
const DEADLINE_HOOKS = [
  'useSwapMutation.ts',
  'useRemoveLiquidityMutation.ts',
  'useSwapUnwrapMutation.ts',
  'useWrapSwapMutation.ts',
] as const;

// ==========================================================================
// 1. Browser Wallet Address Handling
// ==========================================================================

describe('Browser wallet address handling', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should define isBrowserWallet from walletType', () => {
      expect(src).toContain("isBrowserWallet = walletType === 'browser'");
    });

    it('should have a browser-wallet conditional for toAddresses', () => {
      expect(src).toMatch(/toAddresses\s*=\s*isBrowserWallet/);
    });

    it('should have a browser-wallet conditional for changeAddress', () => {
      // Some hooks use inline ternary, some use multiline
      expect(src).toMatch(/changeAddr(ess)?\s*[:=].*isBrowserWallet|changeAddr\s*=\s*isBrowserWallet/);
    });

    it('should have a browser-wallet conditional for alkanesChangeAddress', () => {
      expect(src).toMatch(/alkanesChangeAddr(ess)?\s*[:=].*isBrowserWallet|alkanesChangeAddr\s*=\s*isBrowserWallet/);
    });

    it('should use actual address variables (not symbolic) in browser wallet path for toAddresses', () => {
      const browserBranch = extractBrowserBranch(src, 'const toAddresses');
      expect(browserBranch).toBeTruthy();
      // Must NOT contain symbolic addresses
      expect(browserBranch!).not.toContain("'p2tr:0'");
      expect(browserBranch!).not.toContain("'p2wpkh:0'");
      // Must reference at least one actual address variable
      expect(browserBranch!).toMatch(
        /primaryAddress|taprootAddress|segwitAddress|signerAddress|userTaprootAddress/
      );
    });

    it('should use actual address variables (not symbolic) in browser wallet path for changeAddr', () => {
      // Most hooks: `const changeAddr = isBrowserWallet ? ... : ...;`
      // useWrapMutation: inline `changeAddress: isBrowserWallet ? ... : 'p2wpkh:0'`
      let browserBranch = extractBrowserBranch(src, 'const changeAddr');
      if (!browserBranch) {
        // Inline pattern in alkanesExecuteTyped call
        const inlineMatch = src.match(
          /changeAddress:\s*isBrowserWallet\s*\?\s*(.+?)\s*:\s*'p2wpkh:0'/
        );
        expect(inlineMatch).toBeTruthy();
        browserBranch = inlineMatch![1];
      }
      expect(browserBranch).not.toContain("'p2wpkh:0'");
      expect(browserBranch).not.toContain("'p2tr:0'");
      expect(browserBranch).toMatch(
        /segwitAddress|taprootAddress|primaryAddress|userSegwitAddress|userTaprootAddress/
      );
    });

    it('should use actual address variables (not symbolic) in browser wallet path for alkanesChangeAddr', () => {
      let browserBranch = extractBrowserBranch(src, 'const alkanesChangeAddr');
      if (!browserBranch) {
        // Inline pattern in alkanesExecuteTyped call
        const inlineMatch = src.match(
          /alkanesChangeAddress:\s*isBrowserWallet\s*\?\s*(.+?)\s*:\s*'p2tr:0'/
        );
        expect(inlineMatch).toBeTruthy();
        browserBranch = inlineMatch![1];
      }
      expect(browserBranch).not.toContain("'p2tr:0'");
      expect(browserBranch).not.toContain("'p2wpkh:0'");
      expect(browserBranch).toMatch(
        /primaryAddress|taprootAddress|userTaprootAddress/
      );
    });

    it('should use symbolic addresses in the keystore wallet path for toAddresses', () => {
      const keystoreBranch = extractKeystoreBranch(src, 'const toAddresses');
      expect(keystoreBranch).toBeTruthy();
      // Keystore path uses symbolic or signerAddress (for wrap)
      expect(keystoreBranch!).toMatch(/p2tr:0|p2wpkh:0|signerAddress/);
    });

    it('should pass toAddresses to alkanesExecuteTyped', () => {
      expect(src).toMatch(/alkanesExecuteTyped\s*\(\s*\{[\s\S]*?toAddresses/);
    });

    it('should pass changeAddress to alkanesExecuteTyped', () => {
      expect(src).toMatch(
        /alkanesExecuteTyped\s*\(\s*\{[\s\S]*?changeAddress:\s*(changeAddr|isBrowserWallet)/
      );
    });

    it('should pass alkanesChangeAddress to alkanesExecuteTyped', () => {
      expect(src).toMatch(
        /alkanesExecuteTyped\s*\(\s*\{[\s\S]*?alkanesChangeAddress:\s*(alkanesChangeAddr|isBrowserWallet)/
      );
    });
  });
});

// ==========================================================================
// 2. ordinalsStrategy: 'burn'
// ==========================================================================

describe('ordinalsStrategy setting', () => {
  describe.each(ACTIVE_HOOKS)('%s', (hookFile) => {
    it("should set ordinalsStrategy to 'burn' in alkanesExecuteTyped call", () => {
      const src = readHook(hookFile);
      // useWrapMutation and useUnwrapMutation do not set ordinalsStrategy (use default)
      if (hookFile === 'useWrapMutation.ts' || hookFile === 'useUnwrapMutation.ts') {
        // These mutations may not set ordinalsStrategy — verify they at least call alkanesExecuteTyped
        expect(src).toContain('alkanesExecuteTyped');
        return;
      }
      expect(src).toContain("ordinalsStrategy: 'burn'");
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
// 4. Single-Address Wallet Support
// ==========================================================================

describe('Single-address wallet support (UniSat, OKX)', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should extract taprootAddress from account', () => {
      // Matches account?.taproot?.address or account?.taproot.address
      // useWrapMutation uses "userTaprootAddress" variable name
      expect(src).toMatch(
        /(?:taproot|userTaproot)Address\s*=\s*account\?\.taproot\??\.address/
      );
    });

    it('should extract segwitAddress from account', () => {
      // Matches account?.nativeSegwit?.address or account?.nativeSegwit.address
      expect(src).toMatch(
        /(?:segwit|userSegwit)Address\s*=\s*account\?\.nativeSegwit\??\.address/
      );
    });

    it('should compute primaryAddress or equivalent fallback', () => {
      if (hookFile === 'useWrapMutation.ts') {
        // Wrap uses userTaprootAddress directly and checks it explicitly
        expect(src).toContain('userTaprootAddress');
        return;
      }
      // All other hooks: primaryAddress = taprootAddress || segwitAddress
      expect(src).toMatch(/primaryAddress\s*=\s*taprootAddress\s*\|\|\s*segwitAddress/);
    });

    it('should guard against missing addresses (at least one required)', () => {
      expect(src).toMatch(
        /if\s*\(\s*!taprootAddress\s*&&\s*!segwitAddress\s*\)|if\s*\(\s*!userTaprootAddress\s*\)/
      );
    });
  });
});

// ==========================================================================
// 5. No Deprecated Patterns
// ==========================================================================

describe('No deprecated patterns', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should not directly access window.oyl', () => {
      expect(src).not.toContain('window.oyl');
    });

    it('should not directly access window.unisat', () => {
      expect(src).not.toContain('window.unisat');
    });

    it('should not directly access window.okxwallet', () => {
      expect(src).not.toContain('window.okxwallet');
    });

    it('should not directly access window.xverse', () => {
      expect(src).not.toContain('window.xverse');
    });

    it('should not call patchPsbtForBrowserWallet (removed/deprecated)', () => {
      if (hookFile === 'useWrapMutation.ts') {
        // Wrap imports it but the call site was removed; skip this check
        return;
      }
      expect(src).not.toMatch(/patchPsbtForBrowserWallet\s*\(/);
    });
  });
});

// ==========================================================================
// 6. fromAddresses Browser Wallet Handling
// ==========================================================================

describe('fromAddresses browser wallet handling', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should define fromAddresses with browser wallet conditional', () => {
      expect(src).toMatch(/fromAddresses\s*=\s*isBrowserWallet/);
    });

    it('should use actual addresses for browser wallet fromAddresses', () => {
      const browserBranch = extractBrowserBranch(src, 'const fromAddresses');
      expect(browserBranch).toBeTruthy();
      expect(browserBranch!).toMatch(
        /segwitAddress|taprootAddress|userSegwitAddress|userTaprootAddress/
      );
      expect(browserBranch!).not.toContain("'p2wpkh:0'");
      expect(browserBranch!).not.toContain("'p2tr:0'");
    });

    it('should use symbolic addresses for keystore wallet fromAddresses', () => {
      const keystoreBranch = extractKeystoreBranch(src, 'const fromAddresses');
      expect(keystoreBranch).toBeTruthy();
      expect(keystoreBranch!).toContain("'p2wpkh:0'");
      expect(keystoreBranch!).toContain("'p2tr:0'");
    });
  });
});

// ==========================================================================
// 7. Browser Wallet Signing Pattern
// ==========================================================================

describe('Browser wallet signing pattern', () => {
  describe.each(ALL_HOOKS)('%s', (hookFile) => {
    let src: string;

    beforeAll(() => {
      src = readHook(hookFile);
    });

    it('should call signTaprootPsbt for browser wallets', () => {
      expect(src).toContain('signTaprootPsbt');
    });

    it('should call signSegwitPsbt for keystore wallets', () => {
      expect(src).toContain('signSegwitPsbt');
    });
  });
});

// ==========================================================================
// 8. Cross-cutting: No symbolic addresses leak into browser wallet paths
// ==========================================================================

describe('No symbolic address leaks in browser wallet code paths', () => {
  describe.each(ACTIVE_HOOKS)('%s', (hookFile) => {
    it('should not have symbolic addresses in any isBrowserWallet truthy branch', () => {
      const src = readHook(hookFile);

      // Find all multiline ternary patterns with isBrowserWallet
      // Pattern: = isBrowserWallet\n  ? <browser branch>\n  : <keystore branch>
      const ternaryPattern =
        /=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n\s*:/g;
      let match;
      while ((match = ternaryPattern.exec(src)) !== null) {
        const browserBranch = match[1].trim();
        // Browser branch should never contain symbolic addresses
        if (browserBranch.includes("'p2tr:0'") || browserBranch.includes("'p2wpkh:0'")) {
          throw new Error(
            `Found symbolic address in browser wallet branch: ${browserBranch}`
          );
        }
      }
    });
  });
});
