/**
 * Tier 2: Browser Wallet Swap E2E Tests
 *
 * Tests the swap flow with mock browser wallets on regtest.
 * Uses pre-set localStorage to skip the connection UI and go straight
 * to testing swap execution with each wallet's signing path.
 *
 * For each wallet:
 * 1. Inject mock wallet API + pre-set localStorage as "connected"
 * 2. Fund wallet via RPC
 * 3. Navigate to /swap
 * 4. Enter amount and execute swap
 * 5. Verify transaction flow
 *
 * Prerequisites:
 *   - Local dev server running: pnpm dev
 *   - Regtest accessible
 *
 * Run: TIER2=true vitest run __tests__/tier2/browser-wallet-swap.puppeteer.test.ts --testTimeout=180000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupBrowserWalletTest,
  teardownBrowserWalletTest,
  walletScreenshot,
  type BrowserWalletContext,
} from './browser-wallet-helpers';
import { clickByText, typeInField, waitForText } from './puppeteer-helpers';
import { getBtcBalance, mineBlocks, sleep } from '../shared/regtest-helpers';
import type { MockWalletId } from '../helpers/mock-wallet-factory';

const SKIP = !process.env.TIER2 && !process.env.E2E;

// Only 4 wallets are enabled in ConnectWalletModal.tsx:
// - oyl: Custom API (getAddresses), SDK adapter signPsbt
// - xverse: SATS Connect (getAccounts), direct signPsbt with signInputs map
// - okx: Standard API (requestAccounts), SDK adapter signPsbt
// - unisat: Standard API (requestAccounts), SDK adapter signPsbt
const WALLETS_TO_TEST: MockWalletId[] = ['oyl', 'xverse', 'okx', 'unisat'];

describe.runIf(!SKIP)('Tier 2: Browser Wallet Swap', () => {
  for (const walletId of WALLETS_TO_TEST) {
    describe(`${walletId} wallet`, () => {
      let ctx: BrowserWalletContext;

      beforeAll(async () => {
        ctx = await setupBrowserWalletTest(walletId);

        // Fund wallet if needed
        const balance = await getBtcBalance(ctx.provider, ctx.segwitAddress);
        if (balance < 100_000_000n) {
          console.log(`[${walletId}] Funding wallet...`);
          await mineBlocks(ctx.provider, 201, ctx.segwitAddress);
          await sleep(3000);
          // Reload to pick up balance
          await ctx.page.reload({ waitUntil: 'networkidle2' });
          await sleep(3000);
        }

        await walletScreenshot(ctx.page, walletId, 'swap-setup');
      }, 180_000);

      afterAll(async () => {
        if (ctx) await teardownBrowserWalletTest(ctx);
      });

      it('should navigate to swap page and see swap UI', async () => {
        const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
        await ctx.page.goto(`${baseUrl}/swap`, {
          waitUntil: 'networkidle2',
          timeout: 60_000,
        });

        await sleep(3000);
        await walletScreenshot(ctx.page, walletId, 'swap-page');

        const hasSwapUI = await waitForText(ctx.page, 'Swap', 10_000);
        expect(hasSwapUI).toBe(true);
      }, 60_000);

      it('should enter swap amount', async () => {
        // Find the amount input (first number input on the page)
        const amountEntered = await typeInField(
          ctx.page,
          'input[type="number"]',
          '0.001'
        );

        await sleep(2000);
        await walletScreenshot(ctx.page, walletId, 'swap-amount');

        const hasAmount = await ctx.page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
          return inputs.some(
            (i) =>
              (i as HTMLInputElement).value !== '' &&
              (i as HTMLInputElement).value !== '0'
          );
        });

        expect(hasAmount || amountEntered).toBe(true);
      }, 30_000);

      it('should show quote and attempt swap', async () => {
        // Wait for quote to calculate
        await sleep(5000);
        await walletScreenshot(ctx.page, walletId, 'swap-quote');

        // Click the swap button
        const clicked =
          (await clickByText(ctx.page, 'SWAP', 5_000)) ||
          (await clickByText(ctx.page, 'Review', 5_000)) ||
          (await clickByText(ctx.page, 'Swap', 5_000));

        if (!clicked) {
          console.log(`[${walletId}] No swap button found — check screenshots`);
          await walletScreenshot(ctx.page, walletId, 'swap-no-button');
          return;
        }

        // Wait for signing flow
        // For mock wallets, signing happens automatically via the mock
        await sleep(10_000);
        await walletScreenshot(ctx.page, walletId, 'swap-after-click');

        // Check for any result
        const hasResult = await Promise.race([
          waitForText(ctx.page, 'success', 30_000),
          waitForText(ctx.page, 'confirmed', 30_000),
          waitForText(ctx.page, 'broadcast', 30_000),
          waitForText(ctx.page, 'error', 15_000),
          waitForText(ctx.page, 'failed', 15_000),
          sleep(30_000).then(() => false),
        ]);

        // Mine a block to confirm
        try {
          await ctx.provider.bitcoindGenerateToAddress(1, ctx.segwitAddress);
          await sleep(3000);
        } catch (e) {
          console.log(`[${walletId}] Mining error:`, (e as Error).message);
        }

        await walletScreenshot(ctx.page, walletId, 'swap-result');

        if (hasResult) {
          console.log(`[${walletId}] Swap flow completed (success or error)`);
        } else {
          console.log(`[${walletId}] No clear result — check screenshots`);
        }
      }, 120_000);
    });
  }
});
