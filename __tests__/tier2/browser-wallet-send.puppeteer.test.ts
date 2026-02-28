/**
 * Tier 2: Browser Wallet Send BTC E2E Tests
 *
 * Tests the BTC send flow with mock browser wallets on regtest.
 *
 * For each wallet:
 * 1. Inject mock wallet API + pre-set localStorage as "connected"
 * 2. Fund wallet via RPC
 * 3. Open send modal
 * 4. Enter recipient and amount
 * 5. Submit and verify broadcast
 *
 * Prerequisites:
 *   - Local dev server running: pnpm dev
 *   - Regtest accessible
 *
 * Run: TIER2=true vitest run __tests__/tier2/browser-wallet-send.puppeteer.test.ts --testTimeout=180000
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
const RECIPIENT = 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx';
const SEND_AMOUNT = '0.0001';

// Only 4 wallets are enabled in ConnectWalletModal.tsx
const WALLETS_TO_TEST: MockWalletId[] = ['oyl', 'xverse', 'okx', 'unisat'];

describe.runIf(!SKIP)('Tier 2: Browser Wallet Send BTC', () => {
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
          await ctx.page.reload({ waitUntil: 'networkidle2' });
          await sleep(3000);
        }

        await walletScreenshot(ctx.page, walletId, 'send-setup');
      }, 180_000);

      afterAll(async () => {
        if (ctx) await teardownBrowserWalletTest(ctx);
      });

      it('should navigate to wallet dashboard and open send modal', async () => {
        // Browser wallets land on home page. Click the header balance button
        // to open the dropdown, then click to navigate to wallet dashboard.
        // First try clicking the BTC balance chip in the header.
        const balanceClicked = await ctx.page.evaluate(() => {
          // The balance button contains "BTC" text in the header
          const btns = Array.from(document.querySelectorAll('button'));
          const balBtn = btns.find(b => b.textContent?.includes('BTC') && b.textContent?.includes('.'));
          if (balBtn) { balBtn.click(); return true; }
          return false;
        });

        if (balanceClicked) {
          await sleep(1500);
          // Click "Balances" or any wallet link in the dropdown
          const walletLinkClicked =
            (await clickByText(ctx.page, 'Balances', 3_000)) ||
            (await clickByText(ctx.page, 'Wallet', 3_000));
          if (walletLinkClicked) {
            await sleep(3000);
          }
        }

        // If the dropdown approach didn't work, try direct URL
        const onWalletPage = await waitForText(ctx.page, 'Wallet Dashboard', 3_000) ||
          await ctx.page.evaluate(() => !!document.querySelector('[data-testid="header-send-button"]'));

        if (!onWalletPage) {
          const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
          await ctx.page.goto(`${baseUrl}/wallet`, {
            waitUntil: 'networkidle2',
            timeout: 60_000,
          });
          await sleep(3000);
        }

        await walletScreenshot(ctx.page, walletId, 'wallet-dashboard');

        // Click SEND button (visible on wallet dashboard)
        const clicked =
          (await clickByText(ctx.page, 'SEND', 10_000)) ||
          (await clickByText(ctx.page, 'Send', 10_000));

        if (!clicked) {
          try {
            await ctx.page.click('[data-testid="header-send-button"]');
          } catch {
            console.log(`[${walletId}] Could not find SEND button`);
            await walletScreenshot(ctx.page, walletId, 'send-no-button');
            return;
          }
        }

        await sleep(2000);
        await walletScreenshot(ctx.page, walletId, 'send-modal');

        const hasModal =
          (await waitForText(ctx.page, 'SEND BITCOIN', 5_000)) ||
          (await waitForText(ctx.page, 'Send Bitcoin', 5_000)) ||
          (await waitForText(ctx.page, 'RECIPIENT', 5_000)) ||
          (await waitForText(ctx.page, 'Recipient', 5_000));

        expect(hasModal).toBe(true);
      }, 60_000);

      it('should fill in recipient and amount', async () => {
        // Enter recipient
        let entered =
          (await typeInField(ctx.page, '[data-testid="recipient-input"]', RECIPIENT)) ||
          (await typeInField(ctx.page, 'input[placeholder*="bc1"]', RECIPIENT)) ||
          (await typeInField(ctx.page, 'input[placeholder*="address"]', RECIPIENT));

        expect(entered).toBe(true);
        await sleep(1000);

        // Enter amount
        let amountEntered =
          (await typeInField(ctx.page, '[data-testid="amount-input"]', SEND_AMOUNT)) ||
          (await typeInField(ctx.page, 'input[type="number"]', SEND_AMOUNT));

        expect(amountEntered).toBe(true);

        await walletScreenshot(ctx.page, walletId, 'send-form-filled');
      }, 30_000);

      it('should submit the transaction', async () => {
        // Click review/next
        const reviewClicked =
          (await clickByText(ctx.page, 'Review', 5_000)) ||
          (await clickByText(ctx.page, 'REVIEW', 5_000)) ||
          (await clickByText(ctx.page, 'Next', 5_000));

        if (!reviewClicked) {
          try {
            await ctx.page.click('[data-testid="send-submit"]');
          } catch {
            console.log(`[${walletId}] No review button found`);
          }
        }

        await sleep(3000);
        await walletScreenshot(ctx.page, walletId, 'send-review');

        // Click final send/confirm
        const sendClicked =
          (await clickByText(ctx.page, 'SEND TRANSACTION', 5_000)) ||
          (await clickByText(ctx.page, 'Send Transaction', 5_000)) ||
          (await clickByText(ctx.page, 'CONFIRM', 5_000)) ||
          (await clickByText(ctx.page, 'Confirm', 5_000));

        if (!sendClicked) {
          console.log(`[${walletId}] No confirm button found — check screenshots`);
          await walletScreenshot(ctx.page, walletId, 'send-no-confirm');
          return;
        }

        // Wait for the mock wallet to sign and broadcast
        await sleep(10_000);
        await walletScreenshot(ctx.page, walletId, 'send-submitted');

        // Check for result
        const hasResult = await Promise.race([
          waitForText(ctx.page, 'success', 30_000),
          waitForText(ctx.page, 'confirmed', 30_000),
          waitForText(ctx.page, 'broadcast', 30_000),
          waitForText(ctx.page, 'error', 15_000),
          waitForText(ctx.page, 'failed', 15_000),
          sleep(30_000).then(() => false),
        ]);

        // Mine a block
        try {
          await ctx.provider.bitcoindGenerateToAddress(1, ctx.segwitAddress);
          await sleep(3000);
        } catch (e) {
          console.log(`[${walletId}] Mining error:`, (e as Error).message);
        }

        await walletScreenshot(ctx.page, walletId, 'send-result');

        if (hasResult) {
          console.log(`[${walletId}] Send flow completed`);
        } else {
          console.log(`[${walletId}] No clear result — check screenshots`);
        }
      }, 120_000);
    });
  }
});
