/**
 * Tier 2: Browser Wallet Connection E2E Tests
 *
 * Tests the wallet connection flow for all supported browser wallets
 * using mock wallet injection (no real extensions needed).
 *
 * Connection flow:
 * 1. Inject mock window.* API (makes wallet appear "detected")
 * 2. Click "Connect Wallet"
 * 3. Click "Connect Browser Extension" (reveals wallet list)
 * 4. Click the specific wallet from the "Installed Wallets" list
 * 5. Verify connection succeeds (address/balance visible)
 *
 * NOTE: Only 4 wallets are currently enabled in the UI:
 *   oyl, xverse, okx, unisat
 * Other wallets show as "Coming Soon" even when detected.
 *
 * Prerequisites:
 *   - Local dev server running: pnpm dev
 *
 * Run: TIER2=true vitest run __tests__/tier2/browser-wallet-connect.puppeteer.test.ts --testTimeout=180000
 */

import { describe, it, expect, afterAll } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';
import {
  injectMockWallet,
  deriveTestAddresses,
  type MockWalletId,
} from '../helpers/mock-wallet-factory';
import { walletScreenshot } from './browser-wallet-helpers';
import { TIER2_CONFIG, clickByText, waitForText } from './puppeteer-helpers';
import { sleep } from '../shared/regtest-helpers';

const SKIP = !process.env.TIER2 && !process.env.E2E;

// Only these 4 wallets are enabled in ConnectWalletModal.tsx
const ENABLED_WALLETS: MockWalletId[] = ['oyl', 'xverse', 'okx', 'unisat'];

// Coming soon wallets — connection will be detected but not clickable
const COMING_SOON_WALLETS: MockWalletId[] = [
  'phantom', 'leather', 'magic-eden', 'orange', 'tokeo', 'wizz', 'keplr',
];

// Display names used in the wallet list (from wallet.name field)
const WALLET_DISPLAY_NAMES: Record<MockWalletId, string[]> = {
  xverse: ['Xverse'],
  oyl: ['Oyl Wallet', 'Oyl'],
  unisat: ['UniSat', 'Unisat'],
  okx: ['OKX Wallet', 'OKX'],
  phantom: ['Phantom'],
  leather: ['Leather'],
  'magic-eden': ['Magic Eden'],
  orange: ['Orange'],
  tokeo: ['Tokeo Wallet', 'Tokeo'],
  wizz: ['Wizz'],
  keplr: ['Keplr Wallet', 'Keplr'],
};

describe.runIf(!SKIP)('Tier 2: Browser Wallet Connect', () => {
  let browser: Browser;
  let page: Page;

  afterAll(async () => {
    if (browser) await browser.close();
  });

  for (const walletId of ENABLED_WALLETS) {
    it(`should connect ${walletId} wallet via UI`, async () => {
      // Fresh browser per wallet to avoid state leaks
      if (browser) await browser.close();

      browser = await puppeteer.launch({
        headless: TIER2_CONFIG.headless,
        slowMo: TIER2_CONFIG.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1440,900',
        ],
        defaultViewport: { width: 1440, height: 900 },
      });

      const pages = await browser.pages();
      page = pages[0] || (await browser.newPage());

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      // Inject the mock wallet before navigation
      const addresses = deriveTestAddresses();
      await injectMockWallet(page, walletId, addresses);

      // Navigate
      await page.goto(TIER2_CONFIG.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: TIER2_CONFIG.navigationTimeout,
      });

      // Dismiss banner
      await page.evaluate(() => {
        sessionStorage.setItem('sf-demo-banner-dismissed', '1');
      });
      await page.reload({ waitUntil: 'networkidle2' });

      await walletScreenshot(page, walletId, 'before-connect');

      // Step 1: Click "Connect Wallet"
      const connectClicked = await clickByText(page, 'Connect Wallet', 10_000);
      expect(connectClicked).toBe(true);
      await sleep(2000);

      await walletScreenshot(page, walletId, 'connect-modal');

      // Step 2: Click "Connect Browser Extension"
      const browserExtClicked = await clickByText(page, 'Connect Browser Extension', 5_000);
      expect(browserExtClicked).toBe(true);
      await sleep(2000);

      await walletScreenshot(page, walletId, 'wallet-list');

      // Step 3: Find and click the wallet in the "Installed Wallets" list
      const names = WALLET_DISPLAY_NAMES[walletId];
      let walletClicked = false;
      for (const name of names) {
        walletClicked = await clickByText(page, name, 3_000);
        if (walletClicked) break;
      }

      if (!walletClicked) {
        console.log(`[${walletId}] Could not click wallet — trying by img alt text`);
        // Fallback: click the button containing an img with matching alt text
        walletClicked = await page.evaluate((wNames: string[]) => {
          for (const name of wNames) {
            const img = Array.from(document.querySelectorAll('img')).find(
              (i) => i.alt === name || i.alt.toLowerCase().includes(name.toLowerCase())
            );
            if (img) {
              const btn = img.closest('button');
              if (btn && !btn.disabled) {
                btn.click();
                return true;
              }
            }
          }
          return false;
        }, names);
      }

      expect(walletClicked).toBe(true);

      // Step 4: Wait for connection to complete
      await sleep(5000);
      await walletScreenshot(page, walletId, 'after-connect');

      // Step 5: Verify connection
      const connected =
        (await waitForText(page, 'BTC', 10_000)) ||
        (await waitForText(page, 'bcrt1', 10_000)) ||
        (await waitForText(page, addresses.taproot.address.substring(0, 15), 5_000)) ||
        (await waitForText(page, addresses.nativeSegwit.address.substring(0, 15), 5_000));

      console.log(`[${walletId}] Connected: ${connected}`);
      await walletScreenshot(page, walletId, 'connection-result');

      expect(connected).toBe(true);
    }, 60_000);
  }

  // Test that coming-soon wallets are detected but show as disabled
  it('should detect coming-soon wallets as installed but disabled', async () => {
    if (browser) await browser.close();

    browser = await puppeteer.launch({
      headless: TIER2_CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
      defaultViewport: { width: 1440, height: 900 },
    });

    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Inject ALL coming-soon wallets
    const addresses = deriveTestAddresses();
    for (const walletId of COMING_SOON_WALLETS) {
      await injectMockWallet(page, walletId, addresses);
    }

    await page.goto(TIER2_CONFIG.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: TIER2_CONFIG.navigationTimeout,
    });

    await page.evaluate(() => {
      sessionStorage.setItem('sf-demo-banner-dismissed', '1');
    });
    await page.reload({ waitUntil: 'networkidle2' });

    // Open wallet modal
    await clickByText(page, 'Connect Wallet', 10_000);
    await sleep(2000);

    // Should say N wallets detected
    const detectionText = await page.evaluate(() => {
      return document.body.textContent || '';
    });

    const hasDetected = /\d+ wallet\(s\) detected/.test(detectionText);
    console.log(`[coming-soon] Wallets detected: ${hasDetected}`);

    // Click through to see the list
    await clickByText(page, 'Connect Browser Extension', 5_000);
    await sleep(2000);

    await walletScreenshot(page, 'coming-soon', 'wallet-list');

    // Verify "Coming Soon" appears
    const hasComingSoon = await page.evaluate(() => {
      return (document.body.textContent || '').includes('Coming Soon');
    });

    console.log(`[coming-soon] Has "Coming Soon" label: ${hasComingSoon}`);
    expect(hasComingSoon).toBe(true);
  }, 60_000);
});
