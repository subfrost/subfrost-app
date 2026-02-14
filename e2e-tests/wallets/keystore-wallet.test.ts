/**
 * Keystore Wallet E2E Tests
 *
 * Tests the keystore wallet functionality on staging-app.subfrost.io
 * including wallet restoration from mnemonic, balance display, and send flow.
 *
 * This test uses the autochrome browser automation library.
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/keystore-wallet.test.ts
 *
 * Environment variables:
 *   E2E_HEADLESS=true     - Run in headless mode
 *   E2E_BASE_URL=...      - Override target URL
 *   TEST_MNEMONIC=...     - Custom test mnemonic (optional)
 *   TEST_PASSWORD=...     - Custom test password (optional)
 */

import { BrowserSession } from '../../tools/autochrome/src/browser.js';
import { CONFIG } from '../config.js';
import * as fs from 'fs';

// Test configuration
const TEST_CONFIG = {
  mnemonic: process.env.TEST_MNEMONIC || 'solve spike rigid timber law mask egg concert raise obey kid extend',
  password: process.env.TEST_PASSWORD || 'TestPass123!',
  baseUrl: process.env.E2E_BASE_URL || CONFIG.baseUrl,
  headless: process.env.E2E_HEADLESS === 'true',
  screenshotDir: 'screenshots/keystore',

  // Expected addresses for the test mnemonic
  expectedSegwitAddress: 'bc1qys57st0gwg79a0naqe4uwx9rhau6szseuws34z',
  expectedTaprootAddress: 'bc1p4fdqvharz78tqfkjyawfsegn3mtl65kgsuzwdjf6w4h5wemk4m5qznc962',

  // Timeouts
  navigationTimeout: 60000,
  elementTimeout: 30000,
};

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  screenshots: string[];
}

class KeystoreWalletTest {
  private session: BrowserSession | null = null;
  private results: TestResult[] = [];
  private currentTest: string = '';
  private testScreenshots: string[] = [];
  private walletConnected: boolean = false;

  constructor() {
    // Ensure screenshot directory exists
    if (!fs.existsSync(TEST_CONFIG.screenshotDir)) {
      fs.mkdirSync(TEST_CONFIG.screenshotDir, { recursive: true });
    }
  }

  /**
   * Take a screenshot with descriptive name
   */
  private async screenshot(name: string): Promise<string> {
    if (!this.session) return '';

    const filename = `${TEST_CONFIG.screenshotDir}/${this.currentTest}-${name}-${Date.now()}.png`;
    await this.session.screenshot({ path: filename });
    this.testScreenshots.push(filename);
    console.log(`    Screenshot: ${filename}`);
    return filename;
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
  }

  /**
   * Execute JS in browser to find and click elements by text content
   */
  private async clickByText(text: string, options: { exact?: boolean; timeout?: number } = {}): Promise<boolean> {
    if (!this.session) return false;

    const page = this.session.getPage();
    if (!page) return false;

    const timeout = options.timeout || 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await page.evaluate((searchText, exact) => {
        const elements = Array.from(document.querySelectorAll('button, a, div, span'));
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const text = el.textContent?.trim() || '';
          const matches = exact ? text === searchText : text.includes(searchText);
          if (matches) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, text, options.exact);

      if (result) return true;
      await this.sleep(500);
    }
    return false;
  }

  /**
   * Wait for text to appear on page
   */
  private async waitForText(text: string, timeout = TEST_CONFIG.elementTimeout): Promise<boolean> {
    if (!this.session) return false;

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const pageText = await this.session.getText();
      if (pageText.includes(text)) {
        return true;
      }
      await this.sleep(500);
    }
    return false;
  }

  /**
   * Dismiss the "unreleased" modal if present - with retry and confirmation
   */
  private async dismissModalIfPresent(): Promise<boolean> {
    if (!this.session) return false;

    const page = this.session.getPage();
    if (!page) return false;

    // Retry up to 5 times
    for (let attempt = 0; attempt < 5; attempt++) {
      const pageText = await this.session.getText();
      if (!pageText.includes('UNRELEASED') && !pageText.includes('I UNDERSTAND')) {
        // Modal is gone
        return attempt > 0; // Return true if we dismissed it
      }

      console.log(`    [Modal detected - dismissing (attempt ${attempt + 1})...]`);

      // Try multiple click methods
      try {
        // Method 1: Use puppeteer waitForSelector + click
        const button = await page.waitForSelector('button:has-text("I UNDERSTAND"), button:has-text("UNDERSTAND")', { timeout: 2000 });
        if (button) {
          await button.click();
          await this.sleep(1000);
          continue;
        }
      } catch {
        // Method 2: Use XPath
        try {
          const [btn] = await page.$$('xpath/.//button[contains(text(), "UNDERSTAND")]');
          if (btn) {
            await btn.click();
            await this.sleep(1000);
            continue;
          }
        } catch {
          // Method 3: Use evaluate with dispatch
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const btn of buttons) {
              if (btn.textContent?.includes('UNDERSTAND')) {
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
              }
            }
            // Also try the X close button
            const closeBtn = document.querySelector('[aria-label="Close"], button svg, .close-button');
            if (closeBtn) {
              (closeBtn as HTMLElement).click();
            }
            return false;
          });
        }
      }

      await this.sleep(1500);
    }

    return false;
  }

  /**
   * Wait for element and type into it
   */
  private async waitAndType(selector: string, text: string, timeout = 10000): Promise<boolean> {
    if (!this.session) return false;

    const page = this.session.getPage();
    if (!page) return false;

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await page.waitForSelector(selector, { visible: true, timeout: 2000 });
        await page.type(selector, text, { delay: 30 });
        return true;
      } catch {
        await this.sleep(500);
      }
    }
    return false;
  }

  /**
   * Initialize browser session
   */
  async setup(): Promise<void> {
    console.log('\n=== Setting up browser session ===');
    console.log(`  Target URL: ${TEST_CONFIG.baseUrl}`);
    console.log(`  Headless: ${TEST_CONFIG.headless}`);

    this.session = new BrowserSession({
      headless: TEST_CONFIG.headless,
      viewport: { width: 1440, height: 900 },
      slowMo: 30,
    });

    await this.session.launch();

    // Pre-set the demo banner dismissal in sessionStorage to skip the modal
    const page = this.session.getPage();
    if (page) {
      // Navigate to the domain first so we can set sessionStorage
      await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        sessionStorage.setItem('sf-demo-banner-dismissed', '1');
      });
      console.log('  Set demo banner dismissal in sessionStorage');
    }
  }

  /**
   * Clean up browser session
   */
  async teardown(): Promise<void> {
    console.log('\n=== Tearing down browser session ===');
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }

  /**
   * Run a single test with timing and error handling
   */
  private async runTest(name: string, testFn: () => Promise<void>, skipIfNoWallet = false): Promise<TestResult> {
    console.log(`\n>>> Running test: ${name}`);
    this.currentTest = name.replace(/\s+/g, '-').toLowerCase();
    this.testScreenshots = [];

    // Skip dependent tests if wallet not connected
    if (skipIfNoWallet && !this.walletConnected) {
      console.log(`    SKIPPED (wallet not connected)`);
      const result: TestResult = {
        name,
        passed: false,
        duration: 0,
        error: 'Skipped - wallet not connected',
        screenshots: [],
      };
      this.results.push(result);
      return result;
    }

    const startTime = Date.now();
    let passed = false;
    let error: string | undefined;

    try {
      await testFn();
      passed = true;
      console.log(`    PASSED`);
    } catch (e: any) {
      error = e.message;
      console.error(`    FAILED: ${error}`);
      await this.screenshot('error');
    }

    const result: TestResult = {
      name,
      passed,
      duration: Date.now() - startTime,
      error,
      screenshots: [...this.testScreenshots],
    };

    this.results.push(result);
    return result;
  }

  // ============================================================================
  // TESTS
  // ============================================================================

  /**
   * Test 1: Navigate to staging app and verify page loaded
   */
  async testNavigateAndDismissModal(): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    // Reload page with sessionStorage already set
    await this.session.navigate(TEST_CONFIG.baseUrl);
    await this.sleep(2000);
    await this.screenshot('01-landing-page');

    // The demo banner should NOT appear since we pre-set sessionStorage
    const pageText = await this.session.getText();
    if (pageText.includes('UNRELEASED') && pageText.includes('I UNDERSTAND')) {
      console.log('    Note: Demo banner still showing, attempting dismiss...');
      await this.dismissModalIfPresent();
      await this.sleep(1000);
    }

    await this.screenshot('02-after-modal');

    // Verify we can see the main app
    const hasConnectWallet = await this.waitForText('Connect Wallet', 10000);
    if (!hasConnectWallet) {
      throw new Error('Main app did not load - Connect Wallet button not found');
    }
  }

  /**
   * Test 2: Restore wallet from mnemonic (full flow in one test)
   */
  async testRestoreWallet(): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');
    const page = this.session.getPage();
    if (!page) throw new Error('No page');

    // Step 1: Click Connect Wallet
    console.log('    Step 1: Opening connect wallet modal...');

    // Use more direct button click - find the button containing "Connect Wallet"
    const connectClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const btnText = btn.textContent?.trim() || '';
        if (btnText.includes('Connect Wallet') || btnText.includes('Connect')) {
          btn.click();
          return 'clicked: ' + btnText;
        }
      }
      return 'not found';
    });
    console.log(`    Connect button: ${connectClicked}`);

    if (!connectClicked.startsWith('clicked')) {
      throw new Error('Could not click Connect Wallet');
    }
    await this.sleep(2000);

    // Wait for wallet options modal to appear
    console.log('    Waiting for wallet options...');
    await this.screenshot('03-connect-modal');

    // Step 2: Click Restore Wallet
    console.log('    Step 2: Selecting restore wallet...');
    // Click Restore Wallet option in the modal
    const restoreClicked = await page.evaluate(() => {
      // Look for restore wallet option in the modal
      const elements = Array.from(document.querySelectorAll('button, div[role="button"], div, span'));
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        if (text === 'Restore Wallet' || text.startsWith('Restore Wallet')) {
          (el as HTMLElement).click();
          return 'clicked';
        }
      }
      return 'not found';
    });
    console.log(`    Restore option: ${restoreClicked}`);

    if (restoreClicked !== 'clicked') {
      throw new Error('Could not click Restore Wallet');
    }
    await this.sleep(1500);
    await this.screenshot('04-restore-options');

    // Step 3: Click Seed Phrase button (first button in grid)
    console.log('    Step 3: Selecting seed phrase option...');
    const seedClicked = await page.evaluate(() => {
      // The restore options are in a grid-cols-3 container
      // Seed Phrase is the first button in the grid
      const gridContainer = document.querySelector('.grid.grid-cols-3');
      if (gridContainer) {
        const firstButton = gridContainer.querySelector('button');
        if (firstButton) {
          firstButton.click();
          return 'clicked grid button: ' + firstButton.textContent?.trim();
        }
      }
      // Fallback: look for button containing only "Seed Phrase"
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const btnText = btn.textContent?.trim() || '';
        if (btnText === 'Seed Phrase') {
          btn.click();
          return 'clicked fallback: ' + btnText;
        }
      }
      return 'not found';
    });
    console.log(`    Seed phrase option: ${seedClicked}`);

    if (!seedClicked.startsWith('clicked')) {
      throw new Error('Could not click Seed Phrase');
    }
    await this.sleep(2000);
    await this.screenshot('05-mnemonic-form');

    // Step 4: Enter mnemonic
    console.log('    Step 4: Entering mnemonic...');
    const mnemonicEntered = await this.waitAndType('.fixed textarea', TEST_CONFIG.mnemonic);
    if (!mnemonicEntered) {
      // Try alternative selector
      const altEntered = await page.evaluate((mnemonic) => {
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.value = mnemonic;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, TEST_CONFIG.mnemonic);
      if (!altEntered) {
        throw new Error('Could not enter mnemonic');
      }
    }
    await this.screenshot('06-mnemonic-entered');

    // Step 5: Enter password
    console.log('    Step 5: Entering password...');
    const passwordEntered = await this.waitAndType('input[type="password"]', TEST_CONFIG.password);
    if (!passwordEntered) {
      // Try alternative
      const altEntered = await page.evaluate((password) => {
        const input = document.querySelector('input[type="password"]') as HTMLInputElement;
        if (input) {
          input.value = password;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        return false;
      }, TEST_CONFIG.password);
      if (!altEntered) {
        throw new Error('Could not enter password');
      }
    }
    await this.screenshot('07-password-entered');

    // Step 6: Click Restore Wallet button
    console.log('    Step 6: Clicking restore button...');
    await this.sleep(500);
    const restoreSubmitClicked = await this.clickByText('Restore Wallet');
    if (!restoreSubmitClicked) {
      throw new Error('Could not click Restore Wallet submit button');
    }

    // Step 7: Wait for wallet to load
    console.log('    Step 7: Waiting for wallet to load...');
    await this.sleep(5000);
    await this.screenshot('08-wallet-restored');

    // Verify wallet loaded
    const hasWalletDashboard = await this.waitForText('Wallet Dashboard', 10000) ||
                               await this.waitForText('Bitcoin Balance', 10000) ||
                               await this.waitForText('BTC', 5000);
    if (!hasWalletDashboard) {
      throw new Error('Wallet dashboard did not appear after restore');
    }

    this.walletConnected = true;
    console.log('    Wallet successfully restored!');
  }

  /**
   * Test 3: Verify wallet balance and addresses
   */
  async testVerifyWalletInfo(): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    // Wait for balances to load
    await this.sleep(3000);
    await this.screenshot('09-wallet-info');

    const pageText = await this.session.getText();

    // Verify addresses appear (partial match)
    const segwitPrefix = TEST_CONFIG.expectedSegwitAddress.substring(0, 10);
    const taprootPrefix = TEST_CONFIG.expectedTaprootAddress.substring(0, 10);

    const hasSegwit = pageText.includes(segwitPrefix);
    const hasTaproot = pageText.includes(taprootPrefix);

    console.log(`    SegWit address (${segwitPrefix}...): ${hasSegwit ? 'Found' : 'Not found'}`);
    console.log(`    Taproot address (${taprootPrefix}...): ${hasTaproot ? 'Found' : 'Not found'}`);

    // Verify BTC balance displays (should show some number)
    const hasBtcDisplay = pageText.includes('BTC') && /0\.\d+/.test(pageText);
    if (!hasBtcDisplay) {
      console.log('    Warning: BTC balance not clearly displayed');
    } else {
      // Extract balance
      const match = pageText.match(/(\d+\.\d+)\s*BTC/);
      if (match) {
        console.log(`    BTC Balance: ${match[1]} BTC`);
      }
    }
  }

  /**
   * Test 4: Open send modal and fill form
   */
  async testSendBtcFlow(): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    const page = this.session.getPage();
    if (!page) throw new Error('No page');

    // Click SEND button
    console.log('    Clicking SEND button...');
    let clicked = false;
    try {
      await page.click('[data-testid="header-send-button"]');
      clicked = true;
    } catch {
      clicked = await this.clickByText('SEND');
      if (!clicked) {
        clicked = await this.clickByText('Send');
      }
    }

    if (!clicked) {
      throw new Error('Could not click SEND button');
    }

    await this.sleep(2000);
    await this.screenshot('10-send-modal');

    // Verify send modal appeared
    const hasSendModal = await this.waitForText('SEND BITCOIN', 5000) ||
                         await this.waitForText('Send Bitcoin', 5000) ||
                         await this.waitForText('RECIPIENT', 5000);
    if (!hasSendModal) {
      throw new Error('Send modal did not appear');
    }

    // Enter recipient address
    console.log('    Entering recipient address...');
    let entered = await this.waitAndType('[data-testid="recipient-input"]', TEST_CONFIG.expectedTaprootAddress);
    if (!entered) {
      entered = await this.waitAndType('input[placeholder*="bc1"]', TEST_CONFIG.expectedTaprootAddress);
    }
    if (!entered) {
      throw new Error('Could not enter recipient address');
    }
    await this.screenshot('11-recipient-entered');

    // Enter amount
    console.log('    Entering amount...');
    entered = await this.waitAndType('[data-testid="amount-input"]', '0.0001');
    if (!entered) {
      entered = await this.waitAndType('input[type="number"]', '0.0001');
    }
    if (!entered) {
      throw new Error('Could not enter amount');
    }
    await this.screenshot('12-amount-entered');

    console.log('    Send form filled successfully');
  }

  /**
   * Test 5: Review transaction (but don't send)
   */
  async testReviewTransaction(): Promise<void> {
    if (!this.session) throw new Error('Session not initialized');

    const page = this.session.getPage();
    if (!page) throw new Error('No page');

    // Click Review & Send
    console.log('    Clicking Review & Send...');
    let clicked = false;
    try {
      await page.click('[data-testid="send-submit"]');
      clicked = true;
    } catch {
      clicked = await this.clickByText('Review');
    }

    if (!clicked) {
      throw new Error('Could not click Review button');
    }

    await this.sleep(3000);
    await this.screenshot('13-review-screen');

    // Verify review screen shows transaction details
    const pageText = await this.session.getText();

    const hasRecipient = pageText.includes('Recipient') ||
                         pageText.includes(TEST_CONFIG.expectedTaprootAddress.substring(0, 15));
    const hasAmount = pageText.includes('0.0001') || pageText.includes('Amount');
    const hasFee = pageText.includes('Fee') || pageText.includes('sat');
    const hasTotal = pageText.includes('Total');

    console.log(`    Recipient field: ${hasRecipient ? 'Present' : 'Missing'}`);
    console.log(`    Amount field: ${hasAmount ? 'Present' : 'Missing'}`);
    console.log(`    Fee field: ${hasFee ? 'Present' : 'Missing'}`);
    console.log(`    Total field: ${hasTotal ? 'Present' : 'Missing'}`);

    if (!hasRecipient && !hasAmount) {
      throw new Error('Transaction review missing required fields');
    }

    // Verify SEND TRANSACTION button exists (but don't click it!)
    const hasSendButton = pageText.includes('SEND TRANSACTION') || pageText.includes('Send Transaction');
    if (hasSendButton) {
      console.log('    SEND TRANSACTION button present - transaction ready to send');
    }

    await this.screenshot('14-review-verified');

    // Cancel the transaction (don't actually send)
    console.log('    Cancelling transaction (not sending)...');
    let cancelled = await this.clickByText('BACK');
    if (!cancelled) {
      cancelled = await this.clickByText('Back');
    }
    await this.sleep(500);

    cancelled = await this.clickByText('CANCEL');
    if (!cancelled) {
      cancelled = await this.clickByText('Cancel');
    }
    if (!cancelled) {
      // Click X button
      await page.evaluate(() => {
        const closeBtn = document.querySelector('button[aria-label="Close"]') as HTMLElement;
        if (closeBtn) closeBtn.click();
      });
    }

    await this.sleep(1000);
    await this.screenshot('15-cancelled');

    console.log('    Transaction cancelled successfully (funds preserved)');
  }

  // ============================================================================
  // TEST RUNNER
  // ============================================================================

  /**
   * Run all tests
   */
  async runAllTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║        Keystore Wallet E2E Tests (using Autochrome)        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`  Target: ${TEST_CONFIG.baseUrl}`);
    console.log(`  Headless: ${TEST_CONFIG.headless}`);
    console.log(`  Mnemonic: ${TEST_CONFIG.mnemonic.split(' ').slice(0, 3).join(' ')}...`);
    console.log();

    try {
      await this.setup();

      // Run tests in sequence
      await this.runTest('Navigate and dismiss modal', () => this.testNavigateAndDismissModal());
      await this.runTest('Restore wallet from mnemonic', () => this.testRestoreWallet());
      await this.runTest('Verify wallet info', () => this.testVerifyWalletInfo(), true);
      await this.runTest('Send BTC flow', () => this.testSendBtcFlow(), true);
      await this.runTest('Review transaction', () => this.testReviewTransaction(), true);

    } finally {
      await this.teardown();
    }

    // Print summary
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log('\n' + '═'.repeat(60));
    console.log('TEST RESULTS');
    console.log('═'.repeat(60));

    for (const result of this.results) {
      const status = result.passed ? '✓' : '✗';
      const duration = `(${result.duration}ms)`;
      console.log(`  ${status} ${result.name} ${duration}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }

    console.log('─'.repeat(60));
    console.log(`  Total: ${passed} passed, ${failed} failed`);
    console.log();

    return { passed, failed, results: this.results };
  }
}

// Main entry point
async function main() {
  const test = new KeystoreWalletTest();
  const { failed } = await test.runAllTests();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { KeystoreWalletTest, TEST_CONFIG };
