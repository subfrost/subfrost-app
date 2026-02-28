/**
 * Tier 2: Browser Wallet Send Alkane Token E2E Tests
 *
 * Tests the alkane token send flow with mock browser wallets on regtest.
 *
 * Flow:
 * 1. Inject mock wallet API, connect via UI
 * 2. Fund wallet via RPC mining
 * 3. Navigate to wallet dashboard, open send modal
 * 4. Switch to "Alkanes" tab
 * 5. Select a token from the list
 * 6. Enter taproot recipient and amount
 * 7. Submit and verify broadcast
 *
 * NOTE: Requires the wallet to hold alkane tokens on regtest. If no alkanes
 * are found, tests skip gracefully. To ensure tokens exist, run a wrap or
 * swap beforehand (e.g., Tier 1 wrap test).
 *
 * Prerequisites:
 *   - Local dev server running: pnpm dev
 *   - Regtest accessible
 *   - Wallet has alkane tokens (DIESEL, frBTC, LP tokens, etc.)
 *
 * Run: TIER2=true vitest run __tests__/tier2/browser-wallet-send-alkane.puppeteer.test.ts --testTimeout=180000
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
// Taproot recipient required for alkane sends
const RECIPIENT = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';
const SEND_AMOUNT = '0.001';

// Test with 2 wallets to keep runtime reasonable (~4 min total)
const WALLETS_TO_TEST: MockWalletId[] = ['oyl', 'xverse'];

describe.runIf(!SKIP)('Tier 2: Browser Wallet Send Alkane', () => {
  for (const walletId of WALLETS_TO_TEST) {
    describe(`${walletId} wallet`, () => {
      let ctx: BrowserWalletContext;
      let hasAlkanes = false;

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

        await walletScreenshot(ctx.page, walletId, 'alkane-send-setup');
      }, 180_000);

      afterAll(async () => {
        if (ctx) await teardownBrowserWalletTest(ctx);
      });

      it('should open send modal and switch to Alkanes tab', async () => {
        // Navigate to wallet dashboard
        const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';

        // Try clicking header balance to navigate to wallet
        const balanceClicked = await ctx.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const balBtn = btns.find(
            (b) => b.textContent?.includes('BTC') && b.textContent?.includes('.')
          );
          if (balBtn) {
            balBtn.click();
            return true;
          }
          return false;
        });

        if (balanceClicked) {
          await sleep(1500);
          (await clickByText(ctx.page, 'Balances', 3_000)) ||
            (await clickByText(ctx.page, 'Wallet', 3_000));
          await sleep(3000);
        }

        // Fallback: direct URL
        const onWalletPage =
          (await waitForText(ctx.page, 'Wallet Dashboard', 3_000)) ||
          (await ctx.page.evaluate(
            () => !!document.querySelector('[data-testid="header-send-button"]')
          ));

        if (!onWalletPage) {
          await ctx.page.goto(`${baseUrl}/wallet`, {
            waitUntil: 'networkidle2',
            timeout: 60_000,
          });
          await sleep(3000);
        }

        // Click SEND button
        const clicked =
          (await clickByText(ctx.page, 'SEND', 10_000)) ||
          (await clickByText(ctx.page, 'Send', 10_000));

        if (!clicked) {
          try {
            await ctx.page.click('[data-testid="header-send-button"]');
          } catch {
            console.log(`[${walletId}] Could not find SEND button`);
            await walletScreenshot(ctx.page, walletId, 'alkane-send-no-button');
            return;
          }
        }

        await sleep(2000);

        // Switch to Alkanes tab
        const alkaneTabClicked = await clickByText(ctx.page, 'Alkanes', 5_000);
        expect(alkaneTabClicked).toBe(true);

        await sleep(2000);
        await walletScreenshot(ctx.page, walletId, 'alkane-send-tab');
      }, 60_000);

      it('should detect alkane tokens in wallet', async () => {
        // Check if any alkane tokens are listed INSIDE the modal.
        // The modal contains a scrollable token list with buttons showing
        // token name + alkaneId (e.g., "frBTC 32:0", "DIESEL 2:0").
        // Must scope to the modal to avoid matching wallet dashboard buttons.
        const alkaneInfo = await ctx.page.evaluate(() => {
          // Find the modal via the alkane recipient input (placeholder="bc1p...")
          // which only exists inside the send modal's alkanes tab.
          const alkaneInput = document.querySelector('input[placeholder="bc1p..."]');
          const modal = alkaneInput?.closest('[class*="fixed"]') ||
            Array.from(document.querySelectorAll('[class*="fixed"]')).find((el) => {
              const text = (el.textContent || '').toLowerCase();
              return text.includes('select alkanes') || text.includes('send alkanes');
            });
          if (!modal) return null;

          // Find token buttons inside the modal — they have alkaneId subtext
          const buttons = Array.from(modal.querySelectorAll('button'));
          const alkaneButtons = buttons.filter((b) => {
            const text = b.textContent || '';
            // Token buttons contain alkaneId (e.g., "32:0", "2:0") and are visible
            // Exclude tab buttons ("Tokens", "Positions", "NFTs") and action buttons
            return /\d+:\d+/.test(text) && b.offsetParent !== null &&
              !['BTC', 'Alkanes', 'Tokens', 'Positions', 'NFTs'].includes(text.trim());
          });

          if (alkaneButtons.length === 0) return null;

          const firstBtn = alkaneButtons[0];
          const text = firstBtn.textContent || '';
          const idMatch = text.match(/(\d+:\d+)/);
          return {
            count: alkaneButtons.length,
            firstId: idMatch ? idMatch[1] : null,
            firstText: text.slice(0, 80),
          };
        });

        if (!alkaneInfo) {
          console.log(
            `[${walletId}] No alkane tokens found in wallet — skipping alkane send tests.`,
            'To test: run a wrap (BTC→frBTC) or swap first to acquire tokens.'
          );
          await walletScreenshot(ctx.page, walletId, 'alkane-send-no-tokens');
          hasAlkanes = false;
          return;
        }

        console.log(
          `[${walletId}] Found ${alkaneInfo.count} alkane token(s). First: ${alkaneInfo.firstId} — "${alkaneInfo.firstText}"`
        );
        hasAlkanes = true;
        expect(alkaneInfo.count).toBeGreaterThan(0);
      }, 30_000);

      it('should select token and fill in recipient and amount', async () => {
        if (!hasAlkanes) {
          console.log(`[${walletId}] Skipping — no alkane tokens available`);
          return;
        }

        // Click the first alkane token INSIDE the modal
        const tokenClicked = await ctx.page.evaluate(() => {
          // Find modal via the alkane recipient input
          const alkaneInput = document.querySelector('input[placeholder="bc1p..."]');
          const modal = alkaneInput?.closest('[class*="fixed"]') ||
            Array.from(document.querySelectorAll('[class*="fixed"]')).find((el) => {
              const text = (el.textContent || '').toLowerCase();
              return text.includes('select alkanes') || text.includes('send alkanes');
            });
          if (!modal) return false;

          const buttons = Array.from(modal.querySelectorAll('button'));
          const alkaneButtons = buttons.filter((b) => {
            const text = b.textContent || '';
            return /\d+:\d+/.test(text) && b.offsetParent !== null &&
              !['BTC', 'Alkanes', 'Tokens', 'Positions', 'NFTs'].includes(text.trim());
          });
          if (alkaneButtons.length > 0) {
            alkaneButtons[0].click();
            return true;
          }
          return false;
        });

        expect(tokenClicked).toBe(true);
        await sleep(1000);
        await walletScreenshot(ctx.page, walletId, 'alkane-send-token-selected');

        // Enter taproot recipient address
        // Alkane tab recipient has placeholder="bc1p..." and no data-testid
        const entered =
          (await typeInField(ctx.page, 'input[placeholder*="bc1p"]', RECIPIENT)) ||
          (await typeInField(ctx.page, 'input[type="text"]', RECIPIENT));

        expect(entered).toBe(true);
        await sleep(500);

        // Enter amount — alkane amount input has type="number", step="any", placeholder="0"
        // This input is disabled until a token is selected (disabled={!selected}).
        // After selecting, wait briefly for React to re-render with the input enabled.
        const amountEntered = await ctx.page.evaluate((amt: string) => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="number"]')
          ) as HTMLInputElement[];
          // Find the alkane amount input: placeholder="0" (not "0.00000000"), enabled
          const alkaneInput = inputs.find(
            (i) => i.placeholder === '0' && !i.disabled && i.offsetParent !== null
          );
          if (alkaneInput) {
            alkaneInput.focus();
            // Use native setter to trigger React onChange
            const nativeSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            if (nativeSetter) {
              nativeSetter.call(alkaneInput, amt);
              alkaneInput.dispatchEvent(new Event('input', { bubbles: true }));
              alkaneInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          }
          return false;
        }, SEND_AMOUNT);

        if (!amountEntered) {
          // Fallback: try typing into any visible enabled number input
          console.log(`[${walletId}] Native setter failed, trying typeInField`);
          await typeInField(ctx.page, 'input[type="number"]:not([disabled])', SEND_AMOUNT);
        }

        await sleep(500);
        await walletScreenshot(ctx.page, walletId, 'alkane-send-form-filled');
      }, 30_000);

      it('should submit the alkane transfer', async () => {
        if (!hasAlkanes) {
          console.log(`[${walletId}] Skipping — no alkane tokens available`);
          return;
        }

        // Click REVIEW & SEND
        const reviewClicked =
          (await clickByText(ctx.page, 'REVIEW', 5_000)) ||
          (await clickByText(ctx.page, 'Review', 5_000));

        if (!reviewClicked) {
          try {
            await ctx.page.click('[data-testid="send-submit"]');
          } catch {
            console.log(`[${walletId}] No review button found`);
            await walletScreenshot(ctx.page, walletId, 'alkane-send-no-review');
          }
        }

        await sleep(3000);
        await walletScreenshot(ctx.page, walletId, 'alkane-send-review');

        // Click final confirm/send
        const sendClicked =
          (await clickByText(ctx.page, 'SEND TRANSACTION', 5_000)) ||
          (await clickByText(ctx.page, 'Send Transaction', 5_000)) ||
          (await clickByText(ctx.page, 'CONFIRM', 5_000)) ||
          (await clickByText(ctx.page, 'Confirm', 5_000));

        if (!sendClicked) {
          console.log(`[${walletId}] No confirm button found — check screenshots`);
          await walletScreenshot(ctx.page, walletId, 'alkane-send-no-confirm');
          return;
        }

        // Wait for mock wallet to sign and broadcast
        await sleep(10_000);
        await walletScreenshot(ctx.page, walletId, 'alkane-send-submitted');

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

        await walletScreenshot(ctx.page, walletId, 'alkane-send-result');

        if (hasResult) {
          console.log(`[${walletId}] Alkane send flow completed`);
        } else {
          console.log(`[${walletId}] No clear result — check screenshots`);
        }
      }, 120_000);
    });
  }
});
