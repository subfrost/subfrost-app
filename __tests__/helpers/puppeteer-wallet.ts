/**
 * Puppeteer helpers for automated browser wallet testing
 *
 * Usage:
 *   import { setupBrowserWallet, sendBtcWithBrowserWallet } from '../helpers/puppeteer-wallet';
 *
 *   const { browser, page } = await setupBrowserWallet();
 *   await sendBtcWithBrowserWallet(page, {
 *     recipient: 'bcrt1q...',
 *     amount: '0.01',
 *     feeRate: 1
 *   });
 *   await browser.close();
 */

import puppeteer, { Browser, Page } from 'puppeteer';

export interface BrowserWalletSetup {
  browser: Browser;
  page: Page;
}

export interface SendBtcParams {
  recipient: string;
  amount: string;
  feeRate: number;
}

/**
 * Launch browser and set up mock browser wallet
 */
export async function setupBrowserWallet(appUrl = 'http://localhost:3000'): Promise<BrowserWalletSetup> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Listen to console logs and errors from the page
  page.on('console', msg => console.log('[Browser Console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[Browser Error]', err));

  // Inject mock browser wallet API (simulates Xverse/Leather)
  await page.evaluateOnNewDocument(() => {
    // Mock Xverse wallet API
    (window as any).XverseProviders = {
      BitcoinProvider: {
        request: async (method: string, params: any) => {
          console.log('[MockWallet] Request:', method, params);

          if (method === 'getAccounts') {
            return {
              result: [
                {
                  address: 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x',
                  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
                  purpose: 'payment',
                  addressType: 'p2wpkh',
                },
              ],
            };
          }

          if (method === 'getAddresses') {
            return {
              addresses: [
                {
                  address: 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x',
                  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
                  purpose: 'payment',
                },
              ],
            };
          }

          if (method === 'signPsbt') {
            // Mock signing - in reality this would sign with wallet keys
            // For testing, just return the same PSBT (simulating a signed PSBT)
            const psbtHex = typeof params === 'string' ? params : params?.psbt;
            console.log('[MockWallet] Signing PSBT');
            return psbtHex;
          }

          throw new Error(`Mock wallet: unsupported method ${method}`);
        },
        signPsbt: async (psbtHex: string) => {
          console.log('[MockWallet] signPsbt called');
          return psbtHex;
        },
      },
    };

    // Set localStorage with correct subfrost keys to simulate connected wallet state
    localStorage.setItem('subfrost_wallet_type', 'browser');
    localStorage.setItem('subfrost_browser_wallet_id', 'xverse');
    localStorage.setItem('subfrost_browser_wallet_addresses', JSON.stringify({
      nativeSegwit: {
        address: 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x',
        publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      },
    }));
  });

  await page.goto(appUrl);
  await page.waitForSelector('body', { timeout: 10000 });

  return { browser, page };
}

/**
 * Navigate to Send modal and execute BTC send
 */
export async function sendBtcWithBrowserWallet(
  page: Page,
  params: SendBtcParams
): Promise<string> {
  const { recipient, amount, feeRate } = params;

  // Navigate to wallet page (wait for React hydration)
  await page.goto('http://localhost:3000/wallet', { waitUntil: 'networkidle2' });

  // Wait for header send button (BTC send) - should appear once wallet is "connected"
  await page.waitForSelector('[data-testid="header-send-button"]', { timeout: 15000 });

  // Click header send button to open BTC send modal
  // Use JavaScript click to ensure React event handlers are triggered
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="header-send-button"]') as HTMLButtonElement;
    if (button) {
      button.click();
    }
  });

  await page.waitForSelector('[data-testid="send-modal"]', { timeout: 10000 });

  // Wait for modal to be fully loaded
  await new Promise(resolve => setTimeout(resolve, 500));

  // Fill in recipient
  await page.click('[data-testid="recipient-input"]');
  await page.type('[data-testid="recipient-input"]', recipient);

  // Fill in amount
  await page.click('[data-testid="amount-input"]');
  await page.type('[data-testid="amount-input"]', amount);

  // Fee rate is managed by button selector, use default (medium)
  // Wait a bit for form validation
  await new Promise(resolve => setTimeout(resolve, 500));

  // Submit
  console.log('[BtcSend] Clicking submit button...');
  await page.evaluate(() => {
    const submitButton = document.querySelector('[data-testid="send-submit"]') as HTMLButtonElement;
    if (submitButton) {
      submitButton.click();
    }
  });

  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Check for errors or success
  const pageState = await page.evaluate(() => {
    const txidEl = document.querySelector('[data-testid="txid"]');
    const errorText = Array.from(document.querySelectorAll('*')).find(el =>
      el.textContent?.toLowerCase().includes('error') ||
      el.textContent?.toLowerCase().includes('failed') ||
      el.textContent?.toLowerCase().includes('insufficient')
    )?.textContent;

    return {
      hasTxid: !!txidEl,
      txid: txidEl?.textContent || null,
      error: errorText || null,
      submitButtonExists: !!document.querySelector('[data-testid="send-submit"]'),
      submitButtonDisabled: (document.querySelector('[data-testid="send-submit"]') as HTMLButtonElement)?.disabled,
    };
  });

  console.log('[BtcSend] Page state after submit:', JSON.stringify(pageState, null, 2));

  // Screenshot for debugging
  await page.screenshot({ path: '/tmp/after-submit.png' });
  console.log('[BtcSend] Screenshot saved to /tmp/after-submit.png');

  // Wait for success (up to 60 seconds for transaction to broadcast)
  await page.waitForSelector('[data-testid="txid"]', { timeout: 60000 });

  // Extract txid
  const txid = await page.$eval('[data-testid="txid"]', (el) => el.textContent || '');

  return txid;
}

/**
 * Get BTC balance from wallet page
 */
export async function getBtcBalance(page: Page): Promise<number> {
  await page.goto('http://localhost:3000/wallet');
  await page.waitForSelector('[data-testid="btc-balance"]', { timeout: 5000 });

  const balanceText = await page.$eval('[data-testid="btc-balance"]', (el) => el.textContent || '0');
  return parseFloat(balanceText);
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTxConfirmation(
  page: Page,
  txid: string,
  maxAttempts = 10
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await page.goto(`http://localhost:3000/tx/${txid}`);

    const confirmed = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="tx-status"]');
      return el?.textContent?.includes('Confirmed') || false;
    });

    if (confirmed) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return false;
}
