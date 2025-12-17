/**
 * E2E Test Helpers for Vitest + Puppeteer
 *
 * Utilities for browser-based E2E testing with Puppeteer.
 * These helpers abstract common operations for cleaner test code.
 */

import type { Page, Browser } from 'puppeteer';
import { REGTEST_CONFIG } from './regtest.config';

// ============================================================================
// Wait Helpers
// ============================================================================

/**
 * Wait for page to stabilize after navigation or action
 */
export async function waitForPageReady(page: Page, timeout = 2000): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * Wait for element with selector
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = REGTEST_CONFIG.timeouts.uiInteraction
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

/**
 * Wait for text to appear on page
 */
export async function waitForText(
  page: Page,
  text: string,
  timeout: number = REGTEST_CONFIG.timeouts.uiInteraction
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (searchText: string) => document.body.textContent?.includes(searchText),
      { timeout },
      text
    );
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Interaction Helpers
// ============================================================================

/**
 * Click element and optionally wait for navigation
 */
export async function clickAndWait(
  page: Page,
  selector: string,
  waitForNavigation: boolean = false
): Promise<void> {
  if (waitForNavigation) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(selector),
    ]);
  } else {
    await page.click(selector);
  }
}

/**
 * Type text into input field (clears existing value first)
 */
export async function typeIntoField(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.waitForSelector(selector);
  await page.click(selector);
  // Clear existing value
  await page.evaluate((sel) => {
    const input = document.querySelector(sel) as HTMLInputElement;
    if (input) input.value = '';
  }, selector);
  await page.type(selector, text);
}

/**
 * Get text content from element
 */
export async function getText(page: Page, selector: string): Promise<string> {
  await page.waitForSelector(selector);
  return page.$eval(selector, (el) => el.textContent || '');
}

/**
 * Get input value
 */
export async function getInputValue(page: Page, selector: string): Promise<string> {
  await page.waitForSelector(selector);
  return page.$eval(selector, (el) => (el as HTMLInputElement).value);
}

// ============================================================================
// Button Helpers
// ============================================================================

/**
 * Find and click button by text content
 */
export async function clickButtonByText(
  page: Page,
  buttonText: string,
  options: { exact?: boolean; timeout?: number } = {}
): Promise<boolean> {
  const { exact = false, timeout = 5000 } = options;

  const clicked = await page.evaluate((text, exactMatch) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const btnText = b.textContent || '';
      return exactMatch
        ? btnText.trim() === text
        : btnText.toUpperCase().includes(text.toUpperCase());
    });
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, buttonText, exact);

  if (clicked) {
    await waitForPageReady(page, 300);
  }

  return clicked;
}

/**
 * Check if button with text exists
 */
export async function hasButton(page: Page, buttonText: string): Promise<boolean> {
  return page.evaluate((text) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(btn =>
      btn.textContent?.toUpperCase().includes(text.toUpperCase())
    );
  }, buttonText);
}

/**
 * Check if button is enabled
 */
export async function isButtonEnabled(page: Page, buttonText: string): Promise<boolean> {
  return page.evaluate((text) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b =>
      b.textContent?.toUpperCase().includes(text.toUpperCase())
    );
    return btn ? !btn.hasAttribute('disabled') : false;
  }, buttonText);
}

// ============================================================================
// Wallet Helpers
// ============================================================================

/**
 * Wait for wallet connection (address visible in UI)
 */
export async function waitForWalletConnection(
  page: Page,
  timeout: number = REGTEST_CONFIG.timeouts.walletConnect
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        // Look for Bitcoin address patterns
        return /bcrt1[a-z0-9]{39,59}|tb1[a-z0-9]{39,59}|bc1[a-z0-9]{39,59}/.test(text);
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Open wallet connect modal
 */
export async function openWalletModal(page: Page): Promise<boolean> {
  return clickButtonByText(page, 'CONNECT WALLET');
}

/**
 * Close any open modal
 */
export async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await waitForPageReady(page, 300);
}

/**
 * Clear wallet storage
 */
export async function clearWalletStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('subfrost_encrypted_keystore');
    localStorage.removeItem('subfrost_wallet_network');
    localStorage.removeItem('subfrost_wallet_unlocked');
    localStorage.removeItem('alkanes_encrypted_keystore');
    localStorage.removeItem('alkanes_wallet_network');
  });
}

// ============================================================================
// Swap Helpers
// ============================================================================

/**
 * Enter swap amount in FROM field
 */
export async function enterSwapAmount(page: Page, amount: string): Promise<void> {
  const selector = 'input[type="text"], input[type="number"], input:not([type])';
  await typeIntoField(page, selector, amount);
}

/**
 * Get swap quote output amount
 */
export async function getSwapQuoteOutput(page: Page): Promise<string | null> {
  const inputs = await page.$$('input');
  if (inputs.length > 1) {
    const value = await inputs[1].evaluate(el => (el as HTMLInputElement).value);
    return value || null;
  }
  return null;
}

/**
 * Click swap button
 */
export async function clickSwapButton(page: Page): Promise<boolean> {
  // Try exact match first, then partial
  const clicked = await clickButtonByText(page, 'SWAP', { exact: true });
  if (!clicked) {
    return clickButtonByText(page, 'SWAP NOW');
  }
  return clicked;
}

// ============================================================================
// Token Selector Helpers
// ============================================================================

/**
 * Open FROM token selector
 */
export async function openFromTokenSelector(page: Page): Promise<boolean> {
  // The FROM selector is typically the first token button
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const fromBtn = buttons.find(btn => {
      const text = btn.textContent || '';
      return text.includes('BTC') || text.includes('Select');
    });
    if (fromBtn) {
      fromBtn.click();
      return true;
    }
    return false;
  });
}

/**
 * Select token by symbol in modal
 */
export async function selectToken(page: Page, symbol: string): Promise<boolean> {
  await waitForPageReady(page, 500);

  return page.evaluate((tokenSymbol) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const tokenBtn = buttons.find(btn =>
      btn.textContent?.includes(tokenSymbol)
    );
    if (tokenBtn) {
      tokenBtn.click();
      return true;
    }
    return false;
  }, symbol);
}

// ============================================================================
// Screenshot & Debug Helpers
// ============================================================================

/**
 * Take screenshot with timestamp
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  fullPage: boolean = true
): Promise<string> {
  const timestamp = Date.now();
  const dir = REGTEST_CONFIG.screenshots.dir;
  const path = `${dir}/${name}-${timestamp}.png` as `${string}.png`;

  await page.screenshot({ path, fullPage });
  console.log(`Screenshot saved: ${path}`);

  return path;
}

/**
 * Setup console log capture
 */
export function setupConsoleCapture(page: Page): string[] {
  const logs: string[] = [];

  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    if (REGTEST_CONFIG.logging.console) {
      console.log(text);
    }
  });

  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const text = `[ERROR] ${message}`;
    logs.push(text);
    console.error(text);
  });

  return logs;
}

/**
 * Get page content text
 */
export async function getPageText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.textContent || '');
}

/**
 * Check if page contains text
 */
export async function pageContains(page: Page, text: string): Promise<boolean> {
  const content = await getPageText(page);
  return content.includes(text);
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Extract transaction ID from page
 */
export async function extractTransactionId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.body.textContent || '';
    // Look for 64-character hex string (Bitcoin txid)
    const match = text.match(/[a-f0-9]{64}/i);
    return match ? match[0] : null;
  });
}

/**
 * Wait for transaction confirmation in UI
 */
export async function waitForTransactionSuccess(
  page: Page,
  timeout: number = REGTEST_CONFIG.timeouts.transactionConfirm
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || '';
        return text.includes('Success') ||
               text.includes('Confirmed') ||
               text.includes('Transaction submitted');
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}
