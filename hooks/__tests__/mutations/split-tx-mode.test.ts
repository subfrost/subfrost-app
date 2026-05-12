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
    expect(src).toMatch(/const\s+wantsSplit\s*=\s*\(swapData as any\)\.splitTransactions\s*===\s*true/);
  });

  it('forwards splitTransactions to alkanesExecuteTyped', () => {
    // The hook used to inline the options object directly into the call
    // site. After 2026-05-04 it factored it into `buildExecuteOpts()` so
    // the indexer-sync retry loop can rebuild the same options on retry.
    // Either shape is acceptable as long as `splitTransactions` is part
    // of the options object the SDK is called with.
    const inlineForm =
      /provider\.alkanesExecuteTyped\(\{[\s\S]*?splitTransactions:\s*(?:\(swapData as any\)\.splitTransactions\s*===\s*true|wantsSplit)[\s\S]*?\}\)/;
    const factoryForm =
      /buildExecuteOpts\s*=\s*\(\)\s*=>\s*\(\{[\s\S]*?splitTransactions:\s*(?:\(swapData as any\)\.splitTransactions\s*===\s*true|wantsSplit)[\s\S]*?\}\)[\s\S]*?provider\.alkanesExecuteTyped\(\s*buildExecuteOpts\(\)/;
    expect(inlineForm.test(src) || factoryForm.test(src)).toBe(true);
  });

  it('uses === true so missing/undefined flag is treated as false', () => {
    // The intent is "opt-in only"; reading via `=== true` prevents
    // truthy-but-not-true values from accidentally enabling split mode.
    expect(src).toMatch(/const\s+wantsSplit\s*=\s*\(swapData as any\)\.splitTransactions\s*===\s*true/);
  });

  it('forces SDK auto-confirm when split mode is requested', () => {
    // Rust's execute_split path needs SDK-side signing/broadcast so Tx A can
    // enter mempool before Tx B is built. The browser unsigned-PSBT branch is
    // single-tx only.
    expect(src).toMatch(/const\s+useAutoConfirm\s*=\s*isKeystoreWallet\s*\|\|\s*wantsSplit/);
    expect(src).toMatch(/autoConfirm:\s*useAutoConfirm/);
  });
});

describe('useAddLiquidityMutation: splitTransactions plumbing', () => {
  const src = read('useAddLiquidityMutation.ts');

  it('declares splitTransactions in the mutation data type', () => {
    expect(src).toMatch(/splitTransactions\?:\s*boolean/);
  });

  it('reads splitTransactions from the mutation payload via === true gate', () => {
    // Hook reads `data.splitTransactions === true` (and stores into a local
    // `wantsSplit` for use by both the autoConfirm switch and the SDK call).
    // The `=== true` ensures missing/undefined flag → false (opt-in only).
    expect(src).toMatch(/data\.splitTransactions\s*===\s*true/);
  });

  it('forwards splitTransactions to alkanesExecuteTyped', () => {
    // The call may write `splitTransactions: data.splitTransactions === true`
    // directly OR (current) `splitTransactions: wantsSplit` after pulling the
    // gate result into a local. Either form is acceptable as long as the
    // value comes from `data.splitTransactions === true`.
    const callRegex =
      /provider\.alkanesExecuteTyped\(\{[\s\S]*?splitTransactions:\s*(?:data\.splitTransactions\s*===\s*true|wantsSplit)[\s\S]*?\}\)/;
    expect(src).toMatch(callRegex);
  });

  it('uses autoConfirm=true when split mode is requested', () => {
    // Split-tx requires the SDK's `execute_full` path (PSBT-return path is
    // single-tx only). When the caller asks for split mode, the hook flips
    // autoConfirm so the SDK signs + broadcasts both Tx A and Tx B itself.
    // Without this conditional flip, splitTransactions=true was a silent
    // no-op for atomic wrap+addLiquidity (regression seen 2026-05-03 on
    // mainnet — wrap+addLiquidity OOG'd because split mode never fired).
    expect(src).toMatch(/const\s+useAutoConfirm\s*=\s*wantsSplit/);
    expect(src).toMatch(/autoConfirm:\s*useAutoConfirm/);
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

// ---------------------------------------------------------------------------
// Wrapper-layer forwarding. The mutation hooks pass `splitTransactions`
// to `provider.alkanesExecuteTyped({...})`, which serializes it into the
// options JSON consumed by the WASM provider. If the wrapper drops it,
// the entire upstream plumbing is dead code — exactly the regression
// fixed in `lib/alkanes/__tests__/executeTyped-splitTransactions.test.ts`.
// ---------------------------------------------------------------------------
describe('lib/alkanes/execute.ts: wrapper forwards splitTransactions to options JSON', () => {
  const src = fs.readFileSync(
    path.resolve(HOOK_DIR, '../lib/alkanes/execute.ts'),
    'utf-8',
  );

  it('writes options.split_transactions when params.splitTransactions is set', () => {
    expect(src).toMatch(
      /params\.splitTransactions\s*!==\s*undefined[^\n]*options\.split_transactions\s*=\s*params\.splitTransactions/,
    );
  });
});

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
