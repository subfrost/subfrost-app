/**
 * Base Wallet E2E Test Suite
 *
 * This file provides the base test class and utilities for testing
 * wallet integrations on staging-app.subfrost.io.
 *
 * Each wallet type should extend this base to implement wallet-specific
 * behavior (popup handling, signing flow, etc.)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import { CONFIG, SELECTORS, WalletType } from '../config.js';

export interface WalletTestContext {
  browser: Browser;
  page: Page;
  walletPopup?: Page;
}

export abstract class BaseWalletTest {
  protected context: WalletTestContext | null = null;
  protected walletType: WalletType;
  protected screenshots: string[] = [];

  constructor(walletType: WalletType) {
    this.walletType = walletType;
  }

  /**
   * Get the extension path for this wallet
   */
  protected getExtensionPath(): string | undefined {
    const path = CONFIG.extensions[this.walletType as keyof typeof CONFIG.extensions];
    if (path && fs.existsSync(path)) {
      return path;
    }
    return undefined;
  }

  /**
   * Launch browser with wallet extension
   */
  async setup(): Promise<void> {
    const extensionPath = this.getExtensionPath();

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${CONFIG.viewport.width},${CONFIG.viewport.height}`,
    ];

    if (extensionPath) {
      args.push(`--disable-extensions-except=${extensionPath}`);
      args.push(`--load-extension=${extensionPath}`);
      console.log(`[${this.walletType}] Loading extension from: ${extensionPath}`);
    } else {
      console.warn(`[${this.walletType}] Extension not found - running without extension`);
    }

    const browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args,
      defaultViewport: CONFIG.viewport,
      slowMo: CONFIG.slowMo,
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // Remove webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    this.context = { browser, page };

    // Navigate to staging app
    console.log(`[${this.walletType}] Navigating to ${CONFIG.baseUrl}`);
    await page.goto(CONFIG.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout,
    });
  }

  /**
   * Teardown browser
   */
  async teardown(): Promise<void> {
    if (this.context?.browser) {
      await this.context.browser.close();
    }
  }

  /**
   * Take a screenshot with timestamp
   */
  async screenshot(name: string): Promise<string> {
    if (!this.context?.page) throw new Error('No page available');

    const filename = `screenshots/${this.walletType}-${name}-${Date.now()}.png`;
    await this.context.page.screenshot({ path: filename });
    this.screenshots.push(filename);
    console.log(`[${this.walletType}] Screenshot: ${filename}`);
    return filename;
  }

  /**
   * Wait for element with logging
   */
  async waitFor(selector: string, timeout?: number): Promise<void> {
    if (!this.context?.page) throw new Error('No page available');

    console.log(`[${this.walletType}] Waiting for: ${selector}`);
    await this.context.page.waitForSelector(selector, {
      visible: true,
      timeout: timeout || CONFIG.elementTimeout,
    });
  }

  /**
   * Click element with logging
   */
  async click(selector: string): Promise<void> {
    if (!this.context?.page) throw new Error('No page available');

    await this.waitFor(selector);
    console.log(`[${this.walletType}] Clicking: ${selector}`);
    await this.context.page.click(selector);
  }

  /**
   * Type into element
   */
  async type(selector: string, text: string): Promise<void> {
    if (!this.context?.page) throw new Error('No page available');

    await this.waitFor(selector);
    console.log(`[${this.walletType}] Typing into: ${selector}`);
    await this.context.page.type(selector, text, { delay: 50 });
  }

  /**
   * Get text content of element
   */
  async getText(selector: string): Promise<string> {
    if (!this.context?.page) throw new Error('No page available');

    await this.waitFor(selector);
    return await this.context.page.$eval(selector, el => el.textContent || '');
  }

  /**
   * Wait for wallet popup to appear
   */
  async waitForWalletPopup(): Promise<Page> {
    if (!this.context?.browser) throw new Error('No browser available');

    console.log(`[${this.walletType}] Waiting for wallet popup...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Wallet popup did not appear within timeout'));
      }, CONFIG.elementTimeout);

      this.context!.browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const popup = await target.page();
          if (popup) {
            clearTimeout(timeout);
            this.context!.walletPopup = popup;
            console.log(`[${this.walletType}] Wallet popup detected`);
            resolve(popup);
          }
        }
      });
    });
  }

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by each wallet type
  // ============================================================================

  /**
   * Handle wallet-specific connection approval in popup
   */
  abstract approveConnection(): Promise<void>;

  /**
   * Handle wallet-specific transaction signing in popup
   */
  abstract signTransaction(): Promise<void>;

  /**
   * Check if wallet is properly connected
   */
  abstract isConnected(): Promise<boolean>;

  // ============================================================================
  // TEST WORKFLOWS
  // ============================================================================

  /**
   * Test: Connect wallet
   */
  async testConnect(): Promise<boolean> {
    try {
      console.log(`\n[${this.walletType}] === TEST: Connect Wallet ===`);

      // Click connect wallet button
      await this.click(SELECTORS.connectWalletButton);
      await this.screenshot('wallet-modal');

      // Select this wallet type
      await this.click(SELECTORS.walletOption(this.walletType));

      // Wait for and handle wallet popup
      await this.waitForWalletPopup();
      await this.approveConnection();

      // Verify connection
      await this.waitFor(SELECTORS.walletAddress);
      const address = await this.getText(SELECTORS.walletAddress);
      console.log(`[${this.walletType}] Connected: ${address}`);

      await this.screenshot('connected');
      return true;
    } catch (error: any) {
      console.error(`[${this.walletType}] Connect failed: ${error.message}`);
      await this.screenshot('connect-error');
      return false;
    }
  }

  /**
   * Test: Send BTC
   */
  async testSendBtc(recipient: string, amount: string): Promise<string | null> {
    try {
      console.log(`\n[${this.walletType}] === TEST: Send BTC ===`);
      console.log(`[${this.walletType}] To: ${recipient}, Amount: ${amount}`);

      // Ensure connected
      if (!await this.isConnected()) {
        throw new Error('Wallet not connected');
      }

      // Open send modal
      await this.click(SELECTORS.sendButton);
      await this.waitFor(SELECTORS.sendModal);
      await this.screenshot('send-modal');

      // Fill form
      await this.type(SELECTORS.recipientInput, recipient);
      await this.type(SELECTORS.amountInput, amount);
      await this.screenshot('send-filled');

      // Submit
      await this.click(SELECTORS.sendSubmitButton);

      // Wait for and handle wallet signing
      await this.waitForWalletPopup();
      await this.signTransaction();

      // Wait for transaction result
      await this.waitFor(SELECTORS.txidDisplay, CONFIG.transactionTimeout);
      const txid = await this.getText(SELECTORS.txidDisplay);

      console.log(`[${this.walletType}] Transaction sent: ${txid}`);
      await this.screenshot('send-success');
      return txid;
    } catch (error: any) {
      console.error(`[${this.walletType}] Send failed: ${error.message}`);
      await this.screenshot('send-error');
      return null;
    }
  }

  /**
   * Run all tests for this wallet
   */
  async runAllTests(): Promise<{ passed: number; failed: number; results: Record<string, boolean> }> {
    const results: Record<string, boolean> = {};

    try {
      await this.setup();

      // Test 1: Connect
      results['connect'] = await this.testConnect();

      // Test 2: Send (only if connected)
      if (results['connect']) {
        const txid = await this.testSendBtc(CONFIG.testRecipient, CONFIG.testAmount);
        results['send'] = txid !== null;
      } else {
        results['send'] = false;
      }

    } finally {
      await this.teardown();
    }

    const passed = Object.values(results).filter(r => r).length;
    const failed = Object.values(results).filter(r => !r).length;

    console.log(`\n[${this.walletType}] === RESULTS ===`);
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    for (const [test, result] of Object.entries(results)) {
      console.log(`  ${result ? '✓' : '✗'} ${test}`);
    }

    return { passed, failed, results };
  }
}
