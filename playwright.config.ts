/**
 * playwright.config.ts
 *
 * Playwright configuration for Subfrost orderbook user story tests.
 *
 * ## Test tiers
 *   e2e-tests/playwright/smoke.spec.ts       — boot + wallet creation (staging)
 *   e2e-tests/playwright/full-app.spec.ts    — full app navigation (staging)
 *   e2e-tests/playwright/orderbook.spec.ts   — CLOB user stories (local devnet)
 *
 * ## Running
 *   npx playwright test                                     # all specs
 *   npx playwright test orderbook                          # orderbook only
 *   npx playwright test orderbook --headed                 # watch mode
 *   npx playwright test orderbook --debug                  # step-through
 *
 * ## Prerequisites for orderbook tests
 *   1. `npm run dev` running on localhost:3000
 *   2. Devnet boots automatically in-browser on first load (~90s)
 *   3. No external services required — devnet is fully in-browser WASM
 *
 * ## "hellcat" note
 *   The user referenced "hellcat" — no public npm package with that name
 *   exists for testing. These tests use Playwright + Vitest as requested.
 *   If hellcat is an internal harness, slot it in at the fixtures layer below.
 *
 * Source: existing e2e-tests/playwright/ pattern + vitest.config.ts conventions.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-tests/playwright',

  // Each test file runs sequentially (serial) because they share devnet state.
  // The devnet boots once, wallet is created once, orders persist across tests.
  fullyParallel: false,

  // Fail the build on CI if test.only is left in source
  forbidOnly: !!process.env.CI,

  // No retries — flaky tests must be fixed, not retried
  retries: 0,

  // Single worker — devnet is single-instance, parallel workers would conflict
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    // Local dev server — orderbook tests require local devnet
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Record video and traces on failure only to keep CI fast
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // Generous timeout — devnet boot takes ~90s, order execution ~5s each
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-orderbook',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/orderbook.spec.ts',
    },
    {
      name: 'chromium-smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/smoke.spec.ts',
    },
    {
      name: 'chromium-full',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/full-app.spec.ts',
    },
  ],

  // Global test timeout — devnet boot (120s) + order placement (60s) + assertions (30s)
  timeout: 300_000,
});
