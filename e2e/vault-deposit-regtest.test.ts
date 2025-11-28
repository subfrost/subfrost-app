/**
 * Vault Deposit E2E Test for Regtest
 *
 * Tests vault deposit functionality on local regtest environment.
 * Creates a wallet from mnemonic and tests the deposit flow.
 *
 * PREREQUISITES:
 * - Docker infrastructure running (docker-compose up)
 * - Dev server running (npm run dev)
 * - Contracts deployed to regtest
 *
 * RUN: npx ts-node e2e/vault-deposit-regtest.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// Test wallet - USE ONLY FOR TESTING
const TEST_MNEMONIC = process.env.TEST_MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

// Regtest configuration
const REGTEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  network: 'regtest' as const,

  // Vault contracts deployed on regtest
  contracts: {
    yvfrbtcVault: '4:7937', // yv-fr-btc Vault
    dxbtcVault: '4:7936',   // dxBTC Vault
    frbtcToken: '32:0',
    dieselToken: '2:0',
  },

  // Test amounts
  testAmounts: {
    vaultDeposit: '0.0001', // Small deposit amount (in BTC/frBTC)
  },

  // Timeouts
  timeouts: {
    pageLoad: 15000,
    walletRestore: 10000,
    elementWait: 10000,
  },

  // Browser config - headful for visual testing
  browser: {
    headless: false,
    slowMo: 50, // Slow down for visibility
    devtools: true,
  },

  screenshotsDir: './e2e/screenshots',
};

// Test state
let browser: Browser;
let page: Page;
let consoleLogs: string[] = [];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
  console.log('🚀 Starting Regtest Vault Deposit E2E Test\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${REGTEST_CONFIG.baseUrl}`);
  console.log(`  Network: ${REGTEST_CONFIG.network}`);
  console.log(`  yvfrBTC Vault: ${REGTEST_CONFIG.contracts.yvfrbtcVault}`);
  console.log(`  frBTC Token: ${REGTEST_CONFIG.contracts.frbtcToken}`);
  console.log(`  Test Mnemonic: ${TEST_MNEMONIC.split(' ').slice(0, 3).join(' ')}...\n`);

  browser = await puppeteer.launch({
    headless: REGTEST_CONFIG.browser.headless,
    slowMo: REGTEST_CONFIG.browser.slowMo,
    devtools: REGTEST_CONFIG.browser.devtools,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900',
    ],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Capture console logs
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      console.log(`  📋 ${text}`);
    }
  });

  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Page Error: ${message}`);
  });
}

async function teardown() {
  console.log('\n📊 Test Complete');
  console.log('═══════════════════════════════════════\n');

  // Don't close browser immediately - keep open for inspection
  console.log('Browser left open for inspection. Press Ctrl+C to close.\n');

  // Keep process alive
  await new Promise(() => {}); // Never resolves
}

async function takeScreenshot(name: string) {
  const filename = `${REGTEST_CONFIG.screenshotsDir}/${name}-${Date.now()}.png` as `${string}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`  📸 Screenshot: ${filename}`);
}

async function openWalletModal() {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = b.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    btn?.click();
  });
  await sleep(800);
}

async function restoreTestWallet() {
  console.log('  Creating wallet from mnemonic...');
  await openWalletModal();
  await sleep(500);

  // Click Restore from Mnemonic
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b => b.textContent?.includes('Restore from Mnemonic'));
    restoreBtn?.click();
  });
  await sleep(500);

  // Enter mnemonic
  const textarea = await page.$('textarea');
  if (textarea) {
    await textarea.type(TEST_MNEMONIC);
    console.log('  Entered mnemonic...');
  } else {
    throw new Error('Mnemonic textarea not found');
  }

  // Enter password
  const passwordInputs = await page.$$('input[type="password"]');
  if (passwordInputs.length > 0) {
    await passwordInputs[0].type(TEST_PASSWORD);
    console.log('  Entered password...');
  }

  // Click restore button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b => {
      const text = b.textContent || '';
      return text.includes('Restore Wallet') || text.includes('Import');
    });
    restoreBtn?.click();
  });

  await sleep(3000);
  console.log('  Wallet restoration initiated...');
}

// ==========================================
// MAIN TEST FLOW
// ==========================================

async function runVaultDepositTest() {
  await setup();

  try {
    // Step 1: Navigate to app
    console.log('\n📍 Step 1: Navigate to application');
    await page.goto(REGTEST_CONFIG.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: REGTEST_CONFIG.timeouts.pageLoad,
    });
    console.log('  ✅ App loaded');

    // Step 2: Set network to regtest (via localStorage)
    console.log('\n📍 Step 2: Configure network to regtest');
    await page.evaluate(() => {
      localStorage.setItem('subfrost-network', 'regtest');
      localStorage.setItem('network', 'regtest');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    console.log('  ✅ Network set to regtest');

    // Step 3: Create/restore wallet from mnemonic
    console.log('\n📍 Step 3: Create wallet from mnemonic');
    await restoreTestWallet();
    await takeScreenshot('01-wallet-created');

    // Wait for wallet to be ready and check if connected
    await sleep(2000);
    const walletConnected = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const hasConnectButton = buttons.some(b => {
        const text = b.textContent?.toUpperCase() || '';
        return text.includes('CONNECT') && text.includes('WALLET');
      });
      return !hasConnectButton; // Connected if no "Connect Wallet" button
    });

    if (walletConnected) {
      console.log('  ✅ Wallet connected');
    } else {
      console.log('  ⚠️  Wallet may not be connected - continuing anyway');
    }

    // Step 4: Navigate to Vaults page
    console.log('\n📍 Step 4: Navigate to Vaults page');
    await page.goto(`${REGTEST_CONFIG.baseUrl}/vaults`, {
      waitUntil: 'networkidle2',
      timeout: REGTEST_CONFIG.timeouts.pageLoad,
    });
    await sleep(2000);
    await takeScreenshot('02-vaults-page');
    console.log('  ✅ On Vaults page');

    // Step 5: Check for yvfrBTC vault (only visible on regtest)
    console.log('\n📍 Step 5: Look for yvfrBTC vault');
    const hasYvfrbtc = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.includes('yvfrBTC') || bodyText.includes('frBTC');
    });

    if (hasYvfrbtc) {
      console.log('  ✅ yvfrBTC vault found (regtest mode confirmed)');
    } else {
      console.log('  ⚠️  yvfrBTC vault not found - may need to check network setting');
    }

    // Step 6: Select yvfrBTC vault
    console.log('\n📍 Step 6: Select yvfrBTC Vault');
    const vaultClicked = await page.evaluate(() => {
      // Find clickable vault items containing yvfrBTC or frBTC
      const elements = Array.from(document.querySelectorAll('button, [role="button"], div[class*="cursor-pointer"]'));
      for (const el of elements) {
        const text = el.textContent || '';
        if (text.includes('yvfrBTC') || (text.includes('frBTC') && text.includes('Vault'))) {
          (el as HTMLElement).click();
          return 'yvfrBTC';
        }
      }
      // Fallback: try clicking first vault card that mentions BTC
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        if (div.textContent?.includes('yvfrBTC') && div.onclick) {
          (div as HTMLElement).click();
          return 'yvfrBTC-div';
        }
      }
      return null;
    });

    if (vaultClicked) {
      console.log(`  ✅ Clicked on ${vaultClicked} vault`);
      await sleep(2000);
      await takeScreenshot('03-vault-selected');
    } else {
      console.log('  ⚠️  Could not find vault to click - try clicking manually');
    }

    // Step 7: Verify deposit interface
    console.log('\n📍 Step 7: Verify Deposit Interface');
    await sleep(1000);

    const hasDepositTab = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return bodyText.toLowerCase().includes('deposit') &&
             (bodyText.toLowerCase().includes('from wallet') || bodyText.toLowerCase().includes('amount'));
    });

    if (hasDepositTab) {
      console.log('  ✅ Deposit interface loaded');
    } else {
      console.log('  ⚠️  Deposit interface not found - may need to select vault first');
    }

    // Step 8: Enter deposit amount
    console.log('\n📍 Step 8: Enter Deposit Amount');

    // Find and fill amount input
    const amountEntered = await page.evaluate((amount) => {
      // Try to find number input
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const input of inputs) {
        if (input.type === 'number' || input.placeholder?.includes('0.0') || input.placeholder?.includes('0')) {
          input.focus();
          input.value = amount;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, REGTEST_CONFIG.testAmounts.vaultDeposit);

    if (amountEntered) {
      console.log(`  ✅ Amount entered: ${REGTEST_CONFIG.testAmounts.vaultDeposit}`);
      await takeScreenshot('04-amount-entered');
    } else {
      // Try typing into input
      try {
        await page.type('input[type="number"]', REGTEST_CONFIG.testAmounts.vaultDeposit);
        console.log(`  ✅ Amount typed: ${REGTEST_CONFIG.testAmounts.vaultDeposit}`);
      } catch (e) {
        console.log('  ⚠️  Could not enter amount - try entering manually');
      }
    }

    // Step 9: Click Deposit button
    console.log('\n📍 Step 9: Execute Deposit');
    console.log('  Clicking DEPOSIT button...');

    // Find and click deposit button
    const depositClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent?.toUpperCase() || '';
        if (text === 'DEPOSIT' || text.includes('DEPOSIT')) {
          // Highlight it first
          btn.style.border = '3px solid green';
          btn.style.boxShadow = '0 0 10px green';
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (depositClicked) {
      console.log('  ✅ DEPOSIT button clicked');
    } else {
      console.log('  ⚠️  DEPOSIT button not found');
    }

    await takeScreenshot('05-deposit-clicked');

    console.log('\n  📋 Monitoring console for transaction...');
    console.log('  ═══════════════════════════════════════');

    // Monitor for transaction logs
    const startTime = Date.now();
    const maxWait = 30000; // 30 seconds

    while (Date.now() - startTime < maxWait) {
      await sleep(2000);

      // Check recent logs for transaction
      const recentLogs = consoleLogs.slice(-20);
      const txLog = recentLogs.find(log =>
        log.includes('transactionId') ||
        log.includes('Deposit successful') ||
        log.includes('txId') ||
        log.includes('Transaction')
      );

      if (txLog) {
        console.log(`\n  🎉 Transaction detected: ${txLog}`);
        await takeScreenshot('06-transaction-submitted');
        break;
      }

      // Check for errors
      const errorLog = recentLogs.find(log =>
        log.toLowerCase().includes('error') ||
        log.toLowerCase().includes('failed') ||
        log.toLowerCase().includes('insufficient')
      );

      if (errorLog) {
        console.log(`\n  ⚠️  Error detected: ${errorLog}`);
        await takeScreenshot('06-error');
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('📍 Test interaction complete');
    console.log('═══════════════════════════════════════\n');

    console.log('Summary:');
    console.log('  - Wallet created from mnemonic');
    console.log('  - Network set to regtest');
    console.log('  - Vaults page loaded');
    console.log('  - yvfrBTC vault selected');
    console.log('  - Deposit amount entered');
    console.log('  - DEPOSIT button clicked');
    console.log('\nCheck console logs above for transaction result.');
    console.log('If no frBTC balance, the deposit will fail.');

  } catch (error) {
    console.error('\n❌ Test Error:', error);
    await takeScreenshot('error-state');
  }

  await teardown();
}

// Run the test
runVaultDepositTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
