/**
 * Tier 2: Puppeteer helpers for keystore wallet E2E tests.
 *
 * Launches headless Chrome, navigates to the local dev server,
 * and restores a keystore wallet from the test mnemonic.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import { REGTEST } from '../shared/regtest-constants';
import { createRegtestProvider, mineBlocks, sleep } from '../shared/regtest-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export const TIER2_CONFIG = {
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
  headless: process.env.E2E_HEADLESS !== 'false', // Default headless=true
  slowMo: parseInt(process.env.E2E_SLOW_MO || '0'),
  navigationTimeout: 60_000,
  elementTimeout: 30_000,
  transactionTimeout: 120_000,
  screenshotDir: 'e2e-tests/screenshots/tier2',
  testPassword: 'TestPass123!',
};

export interface Tier2Context {
  browser: Browser;
  page: Page;
  provider: WebProvider;
  taprootAddress: string;
  segwitAddress: string;
}

/**
 * Launch browser and set up a complete test context.
 */
export async function setupTier2(): Promise<Tier2Context> {
  // Ensure screenshot directory exists
  fs.mkdirSync(TIER2_CONFIG.screenshotDir, { recursive: true });

  // Create regtest provider for mining/balance checks
  const provider = await createRegtestProvider();

  // Launch Puppeteer
  const browser = await puppeteer.launch({
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
  const page = pages[0] || (await browser.newPage());

  // Remove webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Navigate and dismiss demo banner
  await page.goto(TIER2_CONFIG.baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: TIER2_CONFIG.navigationTimeout,
  });

  await page.evaluate(() => {
    sessionStorage.setItem('sf-demo-banner-dismissed', '1');
  });

  // Reload with banner dismissed
  await page.goto(TIER2_CONFIG.baseUrl, {
    waitUntil: 'networkidle2',
    timeout: TIER2_CONFIG.navigationTimeout,
  });

  // Restore keystore wallet
  const addresses = await restoreKeystoreWallet(page);

  return {
    browser,
    page,
    provider,
    ...addresses,
  };
}

/**
 * Restore a keystore wallet from mnemonic via the UI.
 */
async function restoreKeystoreWallet(page: Page): Promise<{
  taprootAddress: string;
  segwitAddress: string;
}> {
  console.log('[puppeteer] Restoring keystore wallet...');

  // Step 1: Click Connect Wallet
  await clickByText(page, 'Connect Wallet');
  await sleep(2000);

  // Step 2: Click Restore Wallet
  await clickByText(page, 'Restore Wallet');
  await sleep(1500);

  // Step 3: Click Seed Phrase option
  const seedClicked = await page.evaluate(() => {
    const gridContainer = document.querySelector('.grid.grid-cols-3');
    if (gridContainer) {
      const firstButton = gridContainer.querySelector('button');
      if (firstButton) {
        firstButton.click();
        return true;
      }
    }
    // Fallback
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.textContent?.trim() === 'Seed Phrase') {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!seedClicked) {
    throw new Error('Could not click Seed Phrase option');
  }
  await sleep(2000);

  // Step 4: Enter mnemonic
  const mnemonicEntered = await typeInField(page, 'textarea', REGTEST.TEST_MNEMONIC);
  if (!mnemonicEntered) {
    // Fallback: set value directly
    await page.evaluate((mnemonic) => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = mnemonic;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, REGTEST.TEST_MNEMONIC);
  }

  // Step 5: Enter password
  await typeInField(page, 'input[type="password"]', TIER2_CONFIG.testPassword);

  // Step 6: Submit
  await clickByText(page, 'Restore Wallet');
  await sleep(5000);

  // Step 7: Wait for wallet to load — look for BTC balance or address
  const walletLoaded = await waitForText(page, 'BTC', 15000) ||
    await waitForText(page, 'bcrt1', 15000);

  if (!walletLoaded) {
    await screenshot(page, 'wallet-restore-failed');
    throw new Error('Wallet did not load after restore');
  }

  console.log('[puppeteer] Wallet restored successfully');

  // Extract addresses from page (they should be visible somewhere)
  const addresses = await page.evaluate(() => {
    const pageText = document.body.textContent || '';
    const taprootMatch = pageText.match(/bcrt1p[a-z0-9]{58}/);
    const segwitMatch = pageText.match(/bcrt1q[a-z0-9]{38,42}/);
    return {
      taproot: taprootMatch?.[0] || '',
      segwit: segwitMatch?.[0] || '',
    };
  });

  // Use createTestSigner-derived addresses as fallback
  const { createTestSigner, TEST_MNEMONIC } = await import('../sdk/test-utils/createTestSigner');
  const signerResult = await createTestSigner(TEST_MNEMONIC, 'subfrost-regtest');

  return {
    taprootAddress: addresses.taproot || signerResult.addresses.taproot.address,
    segwitAddress: addresses.segwit || signerResult.addresses.nativeSegwit.address,
  };
}

/**
 * Tear down the browser.
 */
export async function teardownTier2(ctx: Tier2Context): Promise<void> {
  if (ctx.browser) {
    await ctx.browser.close();
  }
}

// ---------------------------------------------------------------------------
// UI interaction helpers
// ---------------------------------------------------------------------------

export async function clickByText(
  page: Page,
  text: string,
  timeout: number = 10_000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate((searchText: string) => {
      const elements = Array.from(
        document.querySelectorAll('button, a, div[role="button"]')
      );
      for (const el of elements) {
        const elText = el.textContent?.trim() || '';
        if (elText.includes(searchText)) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, text);

    if (result) return true;
    await sleep(500);
  }
  return false;
}

export async function typeInField(
  page: Page,
  selector: string,
  text: string,
  timeout: number = 10_000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 2000 });
      await page.type(selector, text, { delay: 30 });
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

export async function waitForText(
  page: Page,
  text: string,
  timeout: number = 10_000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const found = await page.evaluate(
      (searchText: string) => document.body.textContent?.includes(searchText) || false,
      text
    );
    if (found) return true;
    await sleep(500);
  }
  return false;
}

export async function screenshot(page: Page, name: string): Promise<string> {
  const path = `${TIER2_CONFIG.screenshotDir}/${name}-${Date.now()}.png`;
  await page.screenshot({ path });
  console.log(`[puppeteer] Screenshot: ${path}`);
  return path;
}

/**
 * Fund the test wallet via RPC mining.
 */
export async function fundWalletViaRpc(
  provider: WebProvider,
  address: string,
  blocks: number = 201
): Promise<void> {
  console.log(`[puppeteer] Mining ${blocks} blocks to fund wallet...`);
  await mineBlocks(provider, blocks, address);
}
