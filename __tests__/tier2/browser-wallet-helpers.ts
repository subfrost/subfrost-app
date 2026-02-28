/**
 * Tier 2: Browser wallet helpers for Puppeteer E2E tests.
 *
 * Sets up a browser with a mock browser wallet injected, simulating
 * the connect → sign → broadcast flow without real wallet extensions.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import {
  injectMockWallet,
  setWalletLocalStorage,
  deriveTestAddresses,
  type MockWalletId,
  type MockWalletAddresses,
} from '../helpers/mock-wallet-factory';
import { createRegtestProvider, sleep } from '../shared/regtest-helpers';
import { TIER2_CONFIG } from './puppeteer-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export interface BrowserWalletContext {
  browser: Browser;
  page: Page;
  provider: WebProvider;
  walletId: MockWalletId;
  addresses: MockWalletAddresses;
  taprootAddress: string;
  segwitAddress: string;
}

/**
 * Launch browser with a mock wallet injected and "connected".
 */
export async function setupBrowserWalletTest(
  walletId: MockWalletId
): Promise<BrowserWalletContext> {
  const screenshotDir = `${TIER2_CONFIG.screenshotDir}/browser-wallets`;
  fs.mkdirSync(screenshotDir, { recursive: true });

  const provider = await createRegtestProvider();
  const addresses = deriveTestAddresses();

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

  // Inject the mock wallet BEFORE navigating (evaluateOnNewDocument)
  await injectMockWallet(page, walletId, addresses);

  // Navigate to the app
  await page.goto(TIER2_CONFIG.baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: TIER2_CONFIG.navigationTimeout,
  });

  // Dismiss demo banner
  await page.evaluate(() => {
    sessionStorage.setItem('sf-demo-banner-dismissed', '1');
  });

  // Reload with banner dismissed
  await injectMockWallet(page, walletId, addresses);
  await page.goto(TIER2_CONFIG.baseUrl, {
    waitUntil: 'networkidle2',
    timeout: TIER2_CONFIG.navigationTimeout,
  });

  // Connect through UI: Connect Wallet → Connect Browser Extension → select wallet
  const { clickByText, waitForText } = await import('./puppeteer-helpers');

  const connectClicked = await clickByText(page, 'Connect Wallet', 10_000);
  if (connectClicked) {
    await sleep(2000);
    await clickByText(page, 'Connect Browser Extension', 5_000);
    await sleep(2000);

    // Click the wallet by name
    const walletNames: Record<string, string[]> = {
      oyl: ['Oyl Wallet', 'Oyl'],
      xverse: ['Xverse'],
      okx: ['OKX Wallet', 'OKX'],
      unisat: ['UniSat', 'Unisat'],
    };
    const names = walletNames[walletId] || [walletId];
    for (const name of names) {
      const clicked = await clickByText(page, name, 3_000);
      if (clicked) break;
    }

    // Wait for connection to complete and wallet dashboard to load
    await sleep(5000);
  }

  // Verify connected
  const connected = await waitForText(page, 'BTC', 10_000);
  if (!connected) {
    console.log(`[${walletId}] Warning: wallet may not be connected`);
  }

  return {
    browser,
    page,
    provider,
    walletId,
    addresses,
    taprootAddress: addresses.taproot.address,
    segwitAddress: addresses.nativeSegwit.address,
  };
}

/**
 * Connect the mock wallet through the UI.
 * Flow: Connect Wallet → Connect Browser Extension → click wallet
 * Use this instead of pre-setting localStorage if you want to test the connection flow.
 */
export async function connectWalletViaUI(
  page: Page,
  walletId: MockWalletId
): Promise<boolean> {
  const { clickByText, waitForText } = await import('./puppeteer-helpers');

  // Step 1: Click "Connect Wallet"
  const connectClicked = await clickByText(page, 'Connect Wallet', 10_000);
  if (!connectClicked) return false;
  await sleep(2000);

  // Step 2: Click "Connect Browser Extension"
  const browserExtClicked = await clickByText(page, 'Connect Browser Extension', 5_000);
  if (!browserExtClicked) return false;
  await sleep(2000);

  // Step 3: Find and click the wallet in the list
  const walletNames: Record<MockWalletId, string[]> = {
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

  const names = walletNames[walletId];
  let walletClicked = false;
  for (const name of names) {
    walletClicked = await clickByText(page, name, 3_000);
    if (walletClicked) break;
  }

  if (!walletClicked) {
    console.log(`[browser-wallet] Could not find ${walletId} in wallet list`);
    return false;
  }

  await sleep(5000);

  // Check if connected (should see address or BTC balance)
  const connected =
    (await waitForText(page, 'BTC', 10_000)) ||
    (await waitForText(page, 'bcrt1', 10_000));

  return connected;
}

/**
 * Take a screenshot with wallet-specific naming.
 */
export async function walletScreenshot(
  page: Page,
  walletId: string,
  name: string
): Promise<string> {
  const dir = `${TIER2_CONFIG.screenshotDir}/browser-wallets`;
  fs.mkdirSync(dir, { recursive: true });
  const path = `${dir}/${walletId}-${name}-${Date.now()}.png`;
  await page.screenshot({ path });
  console.log(`[${walletId}] Screenshot: ${path}`);
  return path;
}

/**
 * Tear down browser wallet test context.
 */
export async function teardownBrowserWalletTest(
  ctx: BrowserWalletContext
): Promise<void> {
  if (ctx.browser) {
    await ctx.browser.close();
  }
}
