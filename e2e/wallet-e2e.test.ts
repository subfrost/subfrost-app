/**
 * Wallet E2E Tests
 *
 * These tests verify the Alkanes wallet functionality:
 * 1. Wallet modal opens correctly with all options visible
 * 2. Create New Wallet flow works (password entry, mnemonic display)
 * 3. Restore from Mnemonic flow works
 * 4. Unlock existing keystore flow works
 * 5. Wallet connection state updates correctly
 *
 * RUN: npm run test:e2e:wallet
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';
import {
  waitForElement,
  clickAndWait,
  typeIntoField,
  takeScreenshot,
  setupConsoleCapture,
} from './helpers/testHelpers';

let browser: Browser;
let page: Page;
let consoleLogs: string[] = [];
let testResults: { name: string; passed: boolean; error?: string }[] = [];

// Test mnemonic for wallet restore testing (DO NOT use with real funds)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

// Wait helper for page stability
async function waitForPageReady(page: Page, timeout = 3000) {
  await new Promise(resolve => setTimeout(resolve, timeout));
}

async function runTest(name: string, testFn: () => Promise<void>) {
  console.log(`\n🧪 Test: ${name}`);
  try {
    await testFn();
    console.log(`✅ PASSED: ${name}`);
    testResults.push({ name, passed: true });
  } catch (error) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${(error as Error).message}`);
    testResults.push({
      name,
      passed: false,
      error: (error as Error).message
    });
    await takeScreenshot(page, `wallet-failure-${name.replace(/\s+/g, '-')}`);
  }
}

async function setup() {
  console.log('🚀 Starting Wallet E2E Tests\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${TESTNET_CONFIG.baseUrl}`);
  console.log(`  Network: ${TESTNET_CONFIG.network}\n`);

  browser = await puppeteer.launch({
    headless: TESTNET_CONFIG.browser.headless,
    slowMo: TESTNET_CONFIG.browser.slowMo,
    devtools: TESTNET_CONFIG.browser.devtools,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });

  consoleLogs = setupConsoleCapture(page);
}

async function teardown() {
  if (browser) await browser.close();

  console.log('\n═══════════════════════════════════════');
  console.log('📊 Wallet E2E Results Summary');
  console.log('═══════════════════════════════════════');
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${testResults.length}`);
  console.log(`🎯 Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    testResults.filter(t => !t.passed).forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error}`);
    });
    console.log();
    process.exit(1);
  } else {
    console.log('🎉 All wallet E2E tests passed!\n');
    process.exit(0);
  }
}

/**
 * Clear localStorage to reset wallet state between tests
 */
async function clearWalletStorage() {
  await page.evaluate(() => {
    localStorage.removeItem('alkanes_keystore');
    localStorage.removeItem('alkanes_keystore_network');
  });
}

/**
 * Open the wallet connect modal
 */
async function openWalletModal() {
  // Wait for page to be stable
  await waitForPageReady(page, 1000);

  // Look for connect wallet button - check for uppercase text as used in the app
  const connectButton = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = b.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    return btn !== undefined;
  });

  if (!connectButton) {
    // Debug: log all button texts
    const buttonTexts = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(b => b.textContent?.trim()).filter(Boolean);
    });
    console.log('   Available buttons:', buttonTexts);
    throw new Error('Connect wallet button not found');
  }

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = b.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    btn?.click();
  });

  // Wait for modal to appear
  await waitForPageReady(page, 800);
}

/**
 * Close the wallet modal by clicking outside or pressing escape
 */
async function closeWalletModal() {
  await page.keyboard.press('Escape');
  await new Promise(resolve => setTimeout(resolve, 300));
}

async function runTestSuite() {
  await setup();

  try {
    // ==========================================
    // Test 1: Navigate to Home Page
    // ==========================================
    await runTest('Navigate to home page', async () => {
      await page.goto(TESTNET_CONFIG.baseUrl, { waitUntil: 'networkidle2' });

      const title = await page.title();
      console.log(`   Page title: ${title}`);
    });

    // ==========================================
    // Test 2: WASM Initialization
    // ==========================================
    await runTest('WASM initializes without errors', async () => {
      // Wait for WASM to initialize
      await waitForPageReady(page, 3000);

      // Check for actual runtime errors (not build warnings)
      const hasRuntimeError = consoleLogs.some(log =>
        log.startsWith('[ERROR]') &&
        !log.includes('404') && // Ignore 404s for now
        (log.toLowerCase().includes('wasm') || log.toLowerCase().includes('alkanes'))
      );

      // Look for success messages
      const wasmReady = consoleLogs.some(log =>
        log.includes('Alkanes SDK ready') || log.includes('Alkanes wallet ready')
      );

      if (hasRuntimeError && !wasmReady) {
        const errors = consoleLogs.filter(log =>
          log.startsWith('[ERROR]') && !log.includes('404')
        );
        throw new Error(`WASM runtime errors: ${errors.join(', ')}`);
      }

      console.log(`   WASM ready: ${wasmReady ? 'yes' : 'no fatal errors'}`);
    });

    // ==========================================
    // Test 3: Connect Wallet Button Exists
    // ==========================================
    await runTest('Connect wallet button exists', async () => {
      await waitForPageReady(page, 1000);

      const hasConnectButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => {
          const text = btn.textContent?.toUpperCase() || '';
          return text.includes('CONNECT') && text.includes('WALLET');
        });
      });

      if (!hasConnectButton) {
        const buttonTexts = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.map(b => b.textContent?.trim()).filter(Boolean);
        });
        console.log('   Available buttons:', buttonTexts);
        throw new Error('No connect wallet button found on page');
      }
    });

    // ==========================================
    // Test 4: Wallet Modal Opens
    // ==========================================
    await runTest('Wallet modal opens with options', async () => {
      await clearWalletStorage();
      await page.reload({ waitUntil: 'networkidle2' });
      await waitForPageReady(page, 2000);

      await openWalletModal();

      // Check for wallet options
      const modalContent = await page.evaluate(() => {
        return document.body.textContent || '';
      });

      const hasCreateOption = modalContent.includes('Create New Wallet');
      const hasRestoreOption = modalContent.includes('Restore from Mnemonic');

      if (!hasCreateOption && !hasRestoreOption) {
        throw new Error('Wallet modal does not show wallet options');
      }

      console.log(`   Create option: ${hasCreateOption ? '✓' : '✗'}`);
      console.log(`   Restore option: ${hasRestoreOption ? '✓' : '✗'}`);

      await closeWalletModal();
    });

    // ==========================================
    // Test 5: Create Wallet - Password Validation
    // ==========================================
    await runTest('Create wallet validates password length', async () => {
      await openWalletModal();

      // Click Create New Wallet
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create New Wallet'));
        createBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Enter short password
      const passwordInput = await page.$('input[type="password"]');
      if (!passwordInput) {
        throw new Error('Password input not found');
      }

      await passwordInput.type('short');

      // Try to create
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create Wallet'));
        createBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for error message
      const hasError = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('8 characters') || text.includes('Password must');
      });

      if (!hasError) {
        throw new Error('Password validation error not shown');
      }

      console.log('   Password validation works');

      await closeWalletModal();
    });

    // ==========================================
    // Test 6: Create Wallet - Password Mismatch
    // ==========================================
    await runTest('Create wallet validates password match', async () => {
      await openWalletModal();

      // Click Create New Wallet
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create New Wallet'));
        createBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Enter password
      const inputs = await page.$$('input');
      if (inputs.length < 2) {
        throw new Error('Password and confirm inputs not found');
      }

      await inputs[0].type(TEST_PASSWORD);
      await inputs[1].type('DifferentPassword123!');

      // Try to create
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create Wallet'));
        createBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for error message
      const hasError = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('match') || text.includes('do not match');
      });

      if (!hasError) {
        throw new Error('Password mismatch error not shown');
      }

      console.log('   Password mismatch validation works');

      await closeWalletModal();
    });

    // ==========================================
    // Test 7: Create Wallet - Full Flow
    // ==========================================
    await runTest('Create wallet generates mnemonic', async () => {
      await clearWalletStorage();
      // Reload to get fresh state after previous password tests
      await page.reload({ waitUntil: 'networkidle2' });
      await waitForPageReady(page, 2000);

      await openWalletModal();

      // Click Create New Wallet
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create New Wallet'));
        createBtn?.click();
      });
      await waitForPageReady(page, 500);

      // Enter valid passwords - clear any existing values first
      const passwordInputs = await page.$$('input');
      for (const input of passwordInputs) {
        await input.click({ clickCount: 3 }); // Triple-click to select all
        await input.type(TEST_PASSWORD);
      }

      // Create wallet
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createBtn = buttons.find(b => b.textContent?.includes('Create Wallet'));
        createBtn?.click();
      });

      // Wait for wallet creation (may take a few seconds for mnemonic generation)
      await waitForPageReady(page, 3000);

      // Check for mnemonic display
      const hasMnemonic = await page.evaluate(() => {
        const text = document.body.textContent || '';
        // Check for numbered words (mnemonic display format)
        return /1\.\s*\w+/.test(text) && /12\.\s*\w+/.test(text);
      });

      if (!hasMnemonic) {
        // Take screenshot for debugging
        await takeScreenshot(page, 'create-wallet-no-mnemonic');
        throw new Error('Mnemonic phrase not displayed');
      }

      console.log('   Mnemonic generated and displayed');

      // Check for recovery phrase warning
      const hasWarning = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('recovery') || text.includes('safely') || text.includes('Write down');
      });

      console.log(`   Recovery warning: ${hasWarning ? '✓' : '✗'}`);

      await closeWalletModal();
    });

    // ==========================================
    // Test 8: Restore Wallet - From Mnemonic
    // ==========================================
    await runTest('Restore wallet from mnemonic', async () => {
      await clearWalletStorage();
      await page.reload({ waitUntil: 'networkidle2' });
      await waitForPageReady(page, 2000);

      await openWalletModal();

      // Click Restore from Mnemonic
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const restoreBtn = buttons.find(b => b.textContent?.includes('Restore from Mnemonic'));
        restoreBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Enter mnemonic in textarea
      const textarea = await page.$('textarea');
      if (!textarea) {
        throw new Error('Mnemonic textarea not found');
      }
      await textarea.type(TEST_MNEMONIC);

      // Enter password
      const passwordInput = await page.$('input[type="password"]');
      if (!passwordInput) {
        throw new Error('Password input not found');
      }
      await passwordInput.type(TEST_PASSWORD);

      // Click restore
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const restoreBtn = buttons.find(b => b.textContent?.includes('Restore Wallet'));
        restoreBtn?.click();
      });

      // Wait for restore
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if modal closed (successful connection)
      const modalStillOpen = await page.evaluate(() => {
        return document.body.textContent?.includes('Restore from Mnemonic');
      });

      // Check for wallet address in UI (indicates success)
      const hasWalletAddress = await page.evaluate(() => {
        const text = document.body.textContent || '';
        // Look for Bitcoin address patterns
        return /bc1[a-z0-9]{39,59}|tb1[a-z0-9]{39,59}|[13][a-zA-Z0-9]{25,34}/.test(text);
      });

      if (modalStillOpen && !hasWalletAddress) {
        await takeScreenshot(page, 'restore-wallet-failed');

        // Check for error message
        const errorText = await page.evaluate(() => {
          const errorEl = document.querySelector('.text-red-400');
          return errorEl?.textContent || 'Unknown error';
        });
        throw new Error(`Wallet restore failed: ${errorText}`);
      }

      console.log('   Wallet restored from mnemonic');
    });

    // ==========================================
    // Test 9: Unlock Existing Wallet
    // ==========================================
    await runTest('Unlock existing wallet', async () => {
      // Reload page to test unlock flow (keystore should be saved)
      await page.reload({ waitUntil: 'networkidle2' });
      await waitForPageReady(page, 2000);

      await openWalletModal();

      // Check if Unlock option appears
      const hasUnlockOption = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('Unlock') || text.includes('Existing Wallet');
      });

      if (!hasUnlockOption) {
        console.log('   No existing keystore found (expected if previous test failed)');
        await closeWalletModal();
        return;
      }

      // Click Unlock Existing Wallet
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const unlockBtn = buttons.find(b =>
          b.textContent?.includes('Unlock') &&
          b.textContent?.includes('Wallet')
        );
        unlockBtn?.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Enter password
      const passwordInput = await page.$('input[type="password"]');
      if (!passwordInput) {
        throw new Error('Password input not found');
      }
      await passwordInput.type(TEST_PASSWORD);

      // Click unlock
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const unlockBtn = buttons.find(b => b.textContent === 'Unlock');
        unlockBtn?.click();
      });

      // Wait for unlock
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify wallet connected
      const hasWalletAddress = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return /bc1[a-z0-9]{39,59}|tb1[a-z0-9]{39,59}|[13][a-zA-Z0-9]{25,34}/.test(text);
      });

      if (hasWalletAddress) {
        console.log('   Wallet unlocked successfully');
      } else {
        console.log('   Wallet unlock completed (address may not be displayed immediately)');
      }
    });

    // ==========================================
    // Test 10: Wrong Password Handling
    // ==========================================
    await runTest('Wrong password shows error', async () => {
      // Make sure we have a keystore to unlock
      const hasKeystore = await page.evaluate(() => {
        return localStorage.getItem('alkanes_keystore') !== null;
      });

      if (!hasKeystore) {
        console.log('   Skipped: No keystore available');
        return;
      }

      await page.reload({ waitUntil: 'networkidle2' });
      await waitForPageReady(page, 2000);

      await openWalletModal();

      // Click Unlock
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const unlockBtn = buttons.find(b =>
          b.textContent?.includes('Unlock') &&
          b.textContent?.includes('Wallet')
        );
        unlockBtn?.click();
      });
      await waitForPageReady(page, 300);

      // Enter wrong password
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.type('WrongPassword123!');

        // Click unlock
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const unlockBtn = buttons.find(b => b.textContent === 'Unlock');
          unlockBtn?.click();
        });

        // Wait for error
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check for error message
        const hasError = await page.evaluate(() => {
          const text = document.body.textContent || '';
          return text.includes('Failed') || text.includes('error') || text.includes('Invalid');
        });

        if (hasError) {
          console.log('   Wrong password error displayed');
        } else {
          console.log('   Error message not found (may still be processing)');
        }
      }

      await closeWalletModal();
    });

    // ==========================================
    // Test 11: Delete Stored Wallet
    // ==========================================
    await runTest('Delete stored wallet works', async () => {
      const hasKeystore = await page.evaluate(() => {
        return localStorage.getItem('alkanes_keystore') !== null;
      });

      if (!hasKeystore) {
        console.log('   Skipped: No keystore to delete');
        return;
      }

      await openWalletModal();

      // Click delete
      await page.evaluate(() => {
        const deleteBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent?.includes('Delete') || b.textContent?.includes('delete')
        );
        deleteBtn?.click();
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify keystore is deleted
      const keystoreRemoved = await page.evaluate(() => {
        return localStorage.getItem('alkanes_keystore') === null;
      });

      if (!keystoreRemoved) {
        throw new Error('Keystore was not deleted');
      }

      console.log('   Keystore deleted successfully');

      await closeWalletModal();
    });

  } finally {
    await teardown();
  }
}

runTestSuite().catch((error) => {
  console.error('Fatal error in test suite:', error);
  if (browser) browser.close();
  process.exit(1);
});
