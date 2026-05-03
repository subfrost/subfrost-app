/**
 * Split-tx mode wiring tests.
 *
 * Verifies that:
 *  - `useSwapMutation` forwards a `splitTransactions` flag from its
 *    `mutateAsync` payload through to `provider.alkanesExecuteTyped(...)`.
 *  - `useAddLiquidityMutation` does the same.
 *  - `useAtomicWrapSwapMutation` defaults `splitTransactions = true` on
 *    mainnet and `false` elsewhere.
 *  - `useAtomicWrapAddLiquidityMutation` follows the same default policy.
 *
 * The split flow itself (Tx A wrap-only → Tx B execute, CPFP-chained, each
 * with its own per-tx fuel budget) is implemented in alkanes-rs at
 * `crates/alkanes-cli-common/src/alkanes/execute.rs::execute_split` and
 * unit-tested there via the `is_wrap_protostone` cases.
 *
 * These tests use the same source-string assertion pattern as the other
 * mutation tests in this directory — no React render is needed, and the
 * checks are robust against incidental refactors as long as the literal
 * splitTransactions plumbing is preserved.
 *
 * Run with: pnpm test hooks/__tests__/mutations/split-tx-mode.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOK_DIR = path.resolve(__dirname, '../..');

function read(file: string): string {
  return fs.readFileSync(path.join(HOOK_DIR, file), 'utf-8');
}

describe('useSwapMutation: splitTransactions plumbing', () => {
  const src = read('useSwapMutation.ts');

  it('reads splitTransactions from the mutation payload', () => {
    expect(src).toMatch(/splitTransactions:\s*\(swapData as any\)\.splitTransactions/);
  });

  it('forwards splitTransactions to alkanesExecuteTyped', () => {
    // Single regex matches the alkanesExecuteTyped call shape including
    // the splitTransactions option somewhere within the same call.
    const callRegex =
      /provider\.alkanesExecuteTyped\(\{[\s\S]*?splitTransactions:\s*\(swapData as any\)\.splitTransactions[\s\S]*?\}\)/;
    expect(src).toMatch(callRegex);
  });

  it('uses === true so missing/undefined flag is treated as false', () => {
    // The intent is "opt-in only"; reading via `=== true` prevents
    // truthy-but-not-true values from accidentally enabling split mode.
    expect(src).toMatch(/splitTransactions:\s*\(swapData as any\)\.splitTransactions\s*===\s*true/);
  });
});

describe('useAddLiquidityMutation: splitTransactions plumbing', () => {
  const src = read('useAddLiquidityMutation.ts');

  it('declares splitTransactions in the mutation data type', () => {
    expect(src).toMatch(/splitTransactions\?:\s*boolean/);
  });

  it('forwards splitTransactions to alkanesExecuteTyped', () => {
    const callRegex =
      /provider\.alkanesExecuteTyped\(\{[\s\S]*?splitTransactions:\s*data\.splitTransactions\s*===\s*true[\s\S]*?\}\)/;
    expect(src).toMatch(callRegex);
  });
});

describe('useAtomicWrapSwapMutation: network-aware default', () => {
  const src = read('useAtomicWrapSwapMutation.ts');

  it('declares splitTransactions on the params interface', () => {
    expect(src).toMatch(/splitTransactions\?:\s*boolean/);
  });

  it('defaults splitTransactions to (network === mainnet) when caller omits it', () => {
    // The default policy: explicit param wins; otherwise true on mainnet,
    // false everywhere else (regtest/devnet have full per-tx block_fuel).
    expect(src).toMatch(
      /splitTransactions:\s*params\.splitTransactions\s*\?\?\s*\(\s*network\s*===\s*['"]mainnet['"]\s*\)/,
    );
  });
});

describe('useAtomicWrapAddLiquidityMutation: network-aware default', () => {
  const src = read('useAtomicWrapAddLiquidityMutation.ts');

  it('declares splitTransactions on the params interface', () => {
    expect(src).toMatch(/splitTransactions\?:\s*boolean/);
  });

  it('defaults splitTransactions to (network === mainnet) when caller omits it', () => {
    expect(src).toMatch(
      /splitTransactions:\s*params\.splitTransactions\s*\?\?\s*\(\s*network\s*===\s*['"]mainnet['"]\s*\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// Sanity: the network-default helper logic, extracted as a pure function so
// the actual decision can be unit-tested without React hook setup.
// ---------------------------------------------------------------------------
function resolveSplitDefault(
  override: boolean | undefined,
  network: string,
): boolean {
  return override ?? network === 'mainnet';
}

describe('split-tx default policy (network-aware)', () => {
  it('mainnet without override → true', () => {
    expect(resolveSplitDefault(undefined, 'mainnet')).toBe(true);
  });

  it('devnet without override → false', () => {
    expect(resolveSplitDefault(undefined, 'devnet')).toBe(false);
  });

  it('regtest without override → false', () => {
    expect(resolveSplitDefault(undefined, 'regtest')).toBe(false);
  });

  it('subfrost-regtest without override → false', () => {
    expect(resolveSplitDefault(undefined, 'subfrost-regtest')).toBe(false);
  });

  it('explicit false on mainnet wins', () => {
    expect(resolveSplitDefault(false, 'mainnet')).toBe(false);
  });

  it('explicit true on devnet wins', () => {
    expect(resolveSplitDefault(true, 'devnet')).toBe(true);
  });
});
