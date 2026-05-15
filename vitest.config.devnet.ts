/**
 * Devnet vitest config — drops the `__tests__/devnet/**` exclude from the
 * base config so the in-process DevnetTestHarness suites can actually run.
 *
 * The base `vitest.config.ts` excludes devnet (and tier1/2/sdk/brc20-prog
 * etc.) so `npm test` stays fast; those suites are opt-in via dedicated
 * npm scripts. This config inherits everything from the base, then strips
 * just the devnet exclude.
 *
 * Use via:
 *   vitest run --config vitest.config.devnet.ts __tests__/devnet/<test>
 *   npm run test:devnet
 *   npm run test:devnet:cpfp
 */

import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

const baseExclude = (baseConfig.test?.exclude ?? []) as string[];

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: baseExclude.filter((p) => p !== '__tests__/devnet/**'),
    // Devnet bootstraps an in-process WASM harness + mines 201 blocks +
    // deploys the AMM stack. The 30s default kills it during `beforeAll`.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
