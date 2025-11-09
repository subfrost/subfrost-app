/**
 * Testnet E2E Test Helpers
 * 
 * Utilities for Puppeteer-based E2E testing on testnet.
 * These helpers abstract common operations and provide transaction verification.
 */

import type { Page, Browser } from 'puppeteer';
import { TESTNET_CONFIG } from '../testnet.config';

/**
 * Wait for element with retry
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 30000
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

/**
 * Click element and wait for navigation if needed
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
 * Type into input field
 */
export async function typeIntoField(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.waitForSelector(selector);
  await page.click(selector); // Focus
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
 * Wait for transaction confirmation
 * Polls the transaction page until confirmed or timeout
 */
export async function waitForTransactionConfirmation(
  page: Page,
  txId: string,
  timeout: number = TESTNET_CONFIG.timeouts.transactionConfirm
): Promise<{ confirmed: boolean; error?: string }> {
  const startTime = Date.now();
  const checkInterval = TESTNET_CONFIG.retries.checkInterval;
  
  while (Date.now() - startTime < timeout) {
    try {
      // Navigate to transaction page
      await page.goto(`${TESTNET_CONFIG.baseUrl}/transaction/${txId}`, {
        waitUntil: 'networkidle2',
      });
      
      // Check for confirmation status
      // Adjust selectors based on your transaction page structure
      const isConfirmed = await page.evaluate(() => {
        // Look for confirmation indicators
        const confirmationText = document.body.textContent || '';
        return confirmationText.includes('Confirmed') || confirmationText.includes('Success');
      });
      
      if (isConfirmed) {
        return { confirmed: true };
      }
      
      // Check for errors
      const hasError = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('Failed') || bodyText.includes('Error');
      });
      
      if (hasError) {
        const errorMsg = await page.evaluate(() => document.body.textContent || '');
        return { confirmed: false, error: errorMsg };
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.warn('Error checking transaction status:', error);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  return { confirmed: false, error: 'Transaction confirmation timeout' };
}

/**
 * Take screenshot on failure
 */
export async function takeScreenshot(
  page: Page,
  filename: string
): Promise<void> {
  if (TESTNET_CONFIG.screenshotsOnFailure) {
    const filePath = `${TESTNET_CONFIG.screenshotsDir}/${filename}-${Date.now()}.png` as `${string}.png`;
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Screenshot saved: ${filePath}`);
  }
}

/**
 * Get console logs from page
 */
export function setupConsoleCapture(page: Page): string[] {
  const logs: string[] = [];
  
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    console.log(text);
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
 * Extract transaction ID from page after submission
 * This depends on your UI showing the transaction ID
 */
export async function extractTransactionId(page: Page): Promise<string | null> {
  try {
    // Wait for transaction success message or modal
    await page.waitForSelector('[data-testid="transaction-id"], .transaction-id, [class*="transaction"]', {
      timeout: 10000,
    });
    
    // Try multiple possible locations for transaction ID
    const txId = await page.evaluate(() => {
      // Check data attributes
      const dataTestId = document.querySelector('[data-testid="transaction-id"]');
      if (dataTestId?.textContent) return dataTestId.textContent.trim();
      
      // Check console logs for transaction ID pattern
      // Look for hex strings that match transaction ID pattern
      const bodyText = document.body.textContent || '';
      const txMatch = bodyText.match(/[a-f0-9]{64}/i);
      if (txMatch) return txMatch[0];
      
      return null;
    });
    
    return txId;
  } catch (error) {
    console.warn('Could not extract transaction ID from page:', error);
    return null;
  }
}

/**
 * Wait for wallet connection
 */
export async function waitForWalletConnection(
  page: Page,
  timeout: number = TESTNET_CONFIG.timeouts.walletConnect
): Promise<boolean> {
  try {
    // Wait for wallet address to appear in UI
    await page.waitForFunction(
      () => {
        const bodyText = document.body.textContent || '';
        // Look for Bitcoin testnet address pattern (starts with tb1, m, n, or 2)
        return /tb1[a-z0-9]{39,59}|[mn2][a-zA-Z0-9]{25,34}/.test(bodyText);
      },
      { timeout }
    );
    return true;
  } catch (error) {
    console.error('Wallet connection timeout:', error);
    return false;
  }
}

/**
 * Get current wallet balance from UI
 */
export async function getWalletBalance(
  page: Page,
  tokenSymbol: string
): Promise<string | null> {
  try {
    // This depends on your UI structure
    const balance = await page.evaluate((symbol) => {
      const elements = Array.from(document.querySelectorAll('*'));
      for (const el of elements) {
        const text = el.textContent || '';
        // Look for pattern like "You have 0.5 DIESEL"
        const match = text.match(new RegExp(`(\\d+\\.?\\d*)\\s*${symbol}`, 'i'));
        if (match) return match[1];
      }
      return null;
    }, tokenSymbol);
    
    return balance;
  } catch (error) {
    console.warn('Could not extract wallet balance:', error);
    return null;
  }
}

/**
 * Check if transaction succeeded on blockchain
 * This would query a block explorer or indexer
 */
export async function verifyTransactionOnChain(
  txId: string,
  expectedOutputs?: { token: string; minAmount: string }[]
): Promise<{ success: boolean; outputs?: any[]; error?: string }> {
  // TODO: Integrate with actual block explorer API or indexer
  // For now, this is a placeholder structure
  
  // Example: Query mempool.space testnet API
  // const response = await fetch(`https://mempool.space/testnet/api/tx/${txId}`);
  
  return {
    success: false,
    error: 'Blockchain verification not yet implemented - manual verification required',
  };
}
