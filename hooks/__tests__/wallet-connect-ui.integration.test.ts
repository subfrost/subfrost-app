/**
 * Browser wallet connection UI integration tests
 *
 * Launches a real Chromium browser via Puppeteer, injects mock wallet extension
 * APIs into window, then clicks through the connect flow and verifies the wallet
 * state updates in the UI.
 *
 * Requires:
 * - INTEGRATION=true env var
 * - Dev server running on localhost:3000 (or set APP_URL env var)
 *
 * Run:
 *   INTEGRATION=true npx vitest run hooks/__tests__/wallet-connect-ui.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const INTEGRATION = process.env.INTEGRATION === 'true';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = 'e2e/screenshots';

// Test addresses — valid bech32/bech32m format
const TEST_TAPROOT = 'bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nljwv5fsxph6rj0sysspqqa9q69';
const TEST_SEGWIT = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const TEST_TAPROOT_PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const TEST_SEGWIT_PUBKEY = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';

// SDK wallet names (from @alkanes/ts-sdk BROWSER_WALLETS + local wallets.ts)
const WALLET_DISPLAY_NAMES: Record<string, string> = {
  xverse: 'Xverse Wallet',
  oyl: 'Oyl Wallet',
  unisat: 'Unisat Wallet',
  okx: 'OKX Wallet',
};

// Wallet mock injection scripts — these run in the browser BEFORE the page loads
const WALLET_MOCKS: Record<string, string> = {
  xverse: `
    window.XverseProviders = {
      BitcoinProvider: {
        request: async (method, params) => {
          console.log('[MOCK Xverse] request:', method, JSON.stringify(params));
          if (method === 'getAccounts') {
            return {
              result: [
                { address: '${TEST_TAPROOT}', publicKey: '${TEST_TAPROOT_PUBKEY}', addressType: 'p2tr', purpose: 'ordinals' },
                { address: '${TEST_SEGWIT}', publicKey: '${TEST_SEGWIT_PUBKEY}', addressType: 'p2wpkh', purpose: 'payment' },
              ],
            };
          }
          if (method === 'signPsbt') {
            console.log('[MOCK Xverse] signPsbt called — returning input PSBT unchanged');
            return { result: { psbt: params?.psbt || '' } };
          }
          throw new Error('[MOCK Xverse] Unexpected method: ' + method);
        },
        on: () => {},
        removeListener: () => {},
      },
    };
    console.log('[MOCK] Xverse wallet injected');
  `,
  oyl: `
    window.oyl = {
      getAddresses: async () => {
        console.log('[MOCK OYL] getAddresses called');
        return {
          taproot: { address: '${TEST_TAPROOT}', publicKey: '${TEST_TAPROOT_PUBKEY}' },
          nativeSegwit: { address: '${TEST_SEGWIT}', publicKey: '${TEST_SEGWIT_PUBKEY}' },
        };
      },
      signPsbt: async (psbtHex) => {
        console.log('[MOCK OYL] signPsbt called');
        return psbtHex;
      },
      on: () => {},
      removeListener: () => {},
    };
    console.log('[MOCK] OYL wallet injected');
  `,
  unisat: `
    window.unisat = {
      requestAccounts: async () => {
        console.log('[MOCK Unisat] requestAccounts called');
        return ['${TEST_TAPROOT}'];
      },
      getPublicKey: async () => {
        console.log('[MOCK Unisat] getPublicKey called');
        return '${TEST_TAPROOT_PUBKEY}';
      },
      signPsbt: async (psbtHex) => {
        console.log('[MOCK Unisat] signPsbt called');
        return psbtHex;
      },
      getAccounts: async () => ['${TEST_TAPROOT}'],
      on: () => {},
      removeListener: () => {},
    };
    console.log('[MOCK] Unisat wallet injected');
  `,
  okx: `
    window.okxwallet = {
      bitcoin: {
        connect: async () => {
          console.log('[MOCK OKX] bitcoin.connect called');
          return { address: '${TEST_TAPROOT}', publicKey: '${TEST_TAPROOT_PUBKEY}' };
        },
        signPsbt: async (psbtHex) => {
          console.log('[MOCK OKX] signPsbt called');
          return psbtHex;
        },
        on: () => {},
        removeListener: () => {},
      },
      on: () => {},
      removeListener: () => {},
    };
    console.log('[MOCK] OKX wallet injected');
  `,
};

// Helper: inject a wallet mock + navigate + clear storage
async function setupPage(page: any, walletId: string) {
  // Clear all storage via CDP
  const client = await page.createCDPSession();
  await client.send('Storage.clearDataForOrigin', {
    origin: APP_URL,
    storageTypes: 'all',
  });
  await client.detach();

  // Inject wallet mock BEFORE page loads
  await page.evaluateOnNewDocument(WALLET_MOCKS[walletId]);

  // Navigate — use 'load' event, not 'networkidle2' which hangs on dev server HMR
  await page.goto(APP_URL, { waitUntil: 'load', timeout: 30000 });

  // Wait for React hydration — look for the header with a button
  await page.waitForFunction(
    () => document.querySelector('header button') !== null,
    { timeout: 20000 },
  );

  // Small delay for React to finish rendering
  await new Promise(r => setTimeout(r, 1000));
}

// Helper: click button by visible text
async function clickButtonByText(page: any, text: string, timeout = 10000) {
  await page.waitForFunction(
    (txt: string) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent?.includes(txt) && !b.disabled);
    },
    { timeout },
    text,
  );

  await page.evaluate((txt: string) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes(txt) && !b.disabled);
    if (btn) btn.click();
    else throw new Error(`Button with text "${txt}" not found`);
  }, text);

  // Small delay for state update
  await new Promise(r => setTimeout(r, 500));
}

// Helper: click the wallet-specific button (by wallet display name)
async function clickWalletButton(page: any, walletName: string, timeout = 10000) {
  // The wallet button contains: <img alt="{walletName}"> and <div>{walletName}</div>
  // Try both img alt and text content matching
  await page.waitForFunction(
    (name: string) => {
      // Check for img with matching alt
      const imgs = Array.from(document.querySelectorAll('img'));
      if (imgs.some(img => img.alt === name)) return true;
      // Check for button containing the wallet name text
      const buttons = Array.from(document.querySelectorAll('button'));
      if (buttons.some(b => b.textContent?.includes(name))) return true;
      return false;
    },
    { timeout },
    walletName,
  );

  // Click via the button that contains the wallet name
  await page.evaluate((name: string) => {
    // First try: find button with img[alt=name]
    const imgs = Array.from(document.querySelectorAll('img'));
    const img = imgs.find(i => i.alt === name);
    if (img) {
      let el: HTMLElement | null = img;
      while (el && el.tagName !== 'BUTTON') el = el.parentElement;
      if (el) { el.click(); return; }
    }
    // Fallback: find button containing the text
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent?.includes(name));
    if (btn) { btn.click(); return; }
    throw new Error(`Wallet button for "${name}" not found in DOM`);
  }, walletName);
}

// Helper: wait for wallet to be connected (address visible in header)
async function waitForConnected(page: any, timeout = 15000): Promise<void> {
  // After connection, the header shows "X.XX BTC" and "Connect Wallet" disappears
  // The connect modal also closes
  await page.waitForFunction(
    () => {
      const headerEl = document.querySelector('header');
      if (!headerEl) return false;
      const headerText = headerEl.textContent || '';
      // Connected state shows BTC balance in the header
      return headerText.includes('BTC') && !headerText.includes('Connect Wallet');
    },
    { timeout },
  );
}

// Helper: collect console logs
function captureConsoleLogs(page: any): string[] {
  const logs: string[] = [];
  page.on('console', (msg: any) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
  });
  page.on('pageerror', (err: any) => {
    logs.push(`[pageerror] ${err.message || err}`);
  });
  return logs;
}

// Helper: take screenshot on failure
async function screenshotOnFailure(page: any, testName: string) {
  try {
    const fs = await import('fs');
    if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const filename = `${SCREENSHOTS_DIR}/wallet-ui-${testName}-${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`  Screenshot saved: ${filename}`);
  } catch {}
}

// Helper: dump console logs on failure
function dumpLogs(logs: string[], label: string) {
  console.log(`\n--- ${label} console logs (${logs.length}) ---`);
  // Show last 30 logs
  const tail = logs.slice(-30);
  tail.forEach(l => console.log(`  ${l}`));
  if (logs.length > 30) console.log(`  ... (${logs.length - 30} earlier logs omitted)`);
  console.log('--- end logs ---\n');
}

describe.skipIf(!INTEGRATION)('Browser wallet connection UI (INTEGRATION)', () => {
  let browser: any;
  let page: any;

  beforeAll(async () => {
    // Verify dev server is reachable
    try {
      const resp = await fetch(APP_URL, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`Dev server returned ${resp.status}`);
    } catch (e: any) {
      throw new Error(
        `Dev server not reachable at ${APP_URL}. Start it with: npm run dev\nError: ${e.message}`
      );
    }

    const puppeteer = await import('puppeteer');
    browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    if (page) await page.close().catch(() => {});
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
  });

  async function connectWalletViaUI(walletId: string): Promise<string[]> {
    const logs = captureConsoleLogs(page);
    const displayName = WALLET_DISPLAY_NAMES[walletId];

    await setupPage(page, walletId);

    console.log(`[${walletId}] Clicking Connect Wallet...`);
    await clickButtonByText(page, 'Connect Wallet');

    console.log(`[${walletId}] Clicking Connect Browser Extension...`);
    await clickButtonByText(page, 'Connect Browser Extension');

    console.log(`[${walletId}] Clicking ${displayName}...`);
    await clickWalletButton(page, displayName);

    console.log(`[${walletId}] Waiting for connection...`);
    await waitForConnected(page);

    return logs;
  }

  it('connects Xverse wallet through the UI', async () => {
    let logs: string[] = [];
    try {
      logs = await connectWalletViaUI('xverse');
    } catch (e) {
      dumpLogs(logs, 'Xverse');
      await screenshotOnFailure(page, 'xverse');
      throw e;
    }

    // Verify mock was called
    expect(logs.some(l => l.includes('[MOCK Xverse] request: getAccounts'))).toBe(true);

    // Verify connection success log
    expect(logs.some(l => l.includes('Connected to browser wallet'))).toBe(true);

    // Verify localStorage caching
    const storedId = await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_id'));
    expect(storedId).toBe('xverse');

    const storedAddrs = await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_addresses'));
    expect(storedAddrs).toBeTruthy();
    const parsed = JSON.parse(storedAddrs!);
    expect(parsed.taproot?.address).toBe(TEST_TAPROOT);
    expect(parsed.nativeSegwit?.address).toBe(TEST_SEGWIT);

    console.log('[Xverse] PASSED — taproot + segwit addresses cached');
  }, 45000);

  it('connects OYL wallet through the UI', async () => {
    let logs: string[] = [];
    try {
      logs = await connectWalletViaUI('oyl');
    } catch (e) {
      dumpLogs(logs, 'OYL');
      await screenshotOnFailure(page, 'oyl');
      throw e;
    }

    expect(logs.some(l => l.includes('[MOCK OYL] getAddresses called'))).toBe(true);
    expect(logs.some(l => l.includes('Connected to browser wallet'))).toBe(true);

    const storedId = await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_id'));
    expect(storedId).toBe('oyl');

    const parsed = JSON.parse(await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_addresses'))!);
    expect(parsed.taproot?.address).toBe(TEST_TAPROOT);
    expect(parsed.nativeSegwit?.address).toBe(TEST_SEGWIT);

    console.log('[OYL] PASSED — taproot + segwit addresses cached');
  }, 45000);

  it('connects Unisat wallet through the UI', async () => {
    let logs: string[] = [];
    try {
      logs = await connectWalletViaUI('unisat');
    } catch (e) {
      dumpLogs(logs, 'Unisat');
      await screenshotOnFailure(page, 'unisat');
      throw e;
    }

    expect(logs.some(l => l.includes('[MOCK Unisat] requestAccounts called'))).toBe(true);
    expect(logs.some(l => l.includes('Connected to browser wallet'))).toBe(true);

    const storedId = await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_id'));
    expect(storedId).toBe('unisat');

    const parsed = JSON.parse(await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_addresses'))!);
    expect(parsed.taproot?.address).toBe(TEST_TAPROOT);

    console.log('[Unisat] PASSED — taproot address cached');
  }, 45000);

  it('connects OKX wallet through the UI', async () => {
    let logs: string[] = [];
    try {
      logs = await connectWalletViaUI('okx');
    } catch (e) {
      dumpLogs(logs, 'OKX');
      await screenshotOnFailure(page, 'okx');
      throw e;
    }

    expect(logs.some(l => l.includes('[MOCK OKX] bitcoin.connect called'))).toBe(true);
    expect(logs.some(l => l.includes('Connected to browser wallet'))).toBe(true);

    const storedId = await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_id'));
    expect(storedId).toBe('okx');

    const parsed = JSON.parse(await page.evaluate(() => localStorage.getItem('subfrost_browser_wallet_addresses'))!);
    expect(parsed.taproot?.address).toBe(TEST_TAPROOT);

    console.log('[OKX] PASSED — taproot address cached');
  }, 45000);

  it('wallet persists after page reload (auto-reconnect from cache)', async () => {
    let logs: string[] = [];
    try {
      logs = await connectWalletViaUI('xverse');

      // Reload the page (wallet mock persists via evaluateOnNewDocument)
      console.log('[AutoReconnect] Reloading page...');
      await page.reload({ waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(
        () => document.querySelector('header button') !== null,
        { timeout: 20000 },
      );
      await new Promise(r => setTimeout(r, 2000));

      // Should auto-reconnect from cached addresses (no extension prompt)
      await waitForConnected(page);
    } catch (e) {
      dumpLogs(logs, 'AutoReconnect');
      await screenshotOnFailure(page, 'auto-reconnect');
      throw e;
    }

    expect(logs.some(l => l.includes('Restored browser wallet from cache'))).toBe(true);

    // Should NOT have called getAccounts again (auto-reconnect uses cache)
    const getAccountsCalls = logs.filter(l => l.includes('[MOCK Xverse] request: getAccounts'));
    expect(getAccountsCalls.length).toBe(1); // Only the initial connect

    console.log('[AutoReconnect] PASSED — wallet restored from cache without extension prompt');
  }, 60000);
});
