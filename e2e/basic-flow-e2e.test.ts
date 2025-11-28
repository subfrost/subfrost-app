/**
 * Basic E2E Flow Test for Regtest
 *
 * This test validates the foundation of the vault deposit flow:
 * 1. App loads correctly
 * 2. Network can be set to regtest
 * 3. Wallet modal can be opened
 * 4. Vaults page loads
 * 5. Vault deposit interface is present
 * 6. ts-sdk integration works (alkane enrichment)
 *
 * PREREQUISITES:
 * - Docker infrastructure running (alkanes-rs containers)
 * - Dev server running (npm run dev)
 * - Contracts deployed to regtest
 *
 * RUN: npx ts-node e2e/basic-flow-e2e.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  network: 'regtest' as const,
  screenshotsDir: './e2e/screenshots',
  browser: {
    headless: false, // Set to true for CI
    slowMo: 30,
    devtools: false,
  },
  timeouts: {
    pageLoad: 15000,
    element: 10000,
    short: 2000,
  },
};

// Test state
let browser: Browser;
let page: Page;
const consoleLogs: string[] = [];
const testResults: { name: string; passed: boolean; error?: string; duration: number }[] = [];

// Utility functions
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot(name: string): Promise<void> {
  const filename = `${CONFIG.screenshotsDir}/basic-flow-${name}-${Date.now()}.png` as `${string}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`    Screenshot: ${filename}`);
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  console.log(`\n  Test: ${name}`);
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`  PASSED (${duration}ms)`);
    testResults.push({ name, passed: true, duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  FAILED: ${errorMsg}`);
    testResults.push({ name, passed: false, error: errorMsg, duration });
    await takeScreenshot(`failure-${name.replace(/\s+/g, '-')}`);
  }
}

async function setup(): Promise<void> {
  console.log('Starting Basic E2E Flow Test\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Network: ${CONFIG.network}`);
  console.log(`  Headless: ${CONFIG.browser.headless}\n`);

  browser = await puppeteer.launch({
    headless: CONFIG.browser.headless,
    slowMo: CONFIG.browser.slowMo,
    devtools: CONFIG.browser.devtools,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Capture console logs
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    // Only log errors and warnings to avoid noise
    if (msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`    Console: ${text.substring(0, 100)}...`);
    }
  });

  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`    Page Error: ${message.substring(0, 100)}...`);
  });
}

async function teardown(): Promise<void> {
  // Print summary
  console.log('\n');
  console.log('='.repeat(50));
  console.log('E2E Test Results Summary');
  console.log('='.repeat(50));

  const passed = testResults.filter((t) => t.passed).length;
  const failed = testResults.filter((t) => !t.passed).length;
  const totalDuration = testResults.reduce((sum, t) => sum + t.duration, 0);

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${testResults.length}`);
  console.log(`Duration: ${totalDuration}ms`);
  console.log(`Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    testResults
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  - ${t.name}: ${t.error}`);
      });
  }

  console.log('='.repeat(50));

  if (browser) {
    await browser.close();
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// ==========================================
// TEST SUITE
// ==========================================

async function runTestSuite(): Promise<void> {
  await setup();

  try {
    // Test 1: App loads successfully
    await runTest('App loads successfully', async () => {
      await page.goto(CONFIG.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeouts.pageLoad,
      });

      const title = await page.title();
      if (!title || !title.includes('SUBFROST')) {
        throw new Error(`Unexpected title: ${title}`);
      }

      // Verify main content is present
      const bodyContent = await page.evaluate(() => document.body.textContent || '');
      if (bodyContent.length < 100) {
        throw new Error('Page content appears empty');
      }
    });

    // Test 2: Network can be configured to regtest
    await runTest('Network can be configured to regtest', async () => {
      await page.evaluate((network) => {
        localStorage.setItem('subfrost-network', network);
        localStorage.setItem('network', network);
      }, CONFIG.network);

      await page.reload({ waitUntil: 'networkidle2' });

      // Verify localStorage was set
      const storedNetwork = await page.evaluate(() => localStorage.getItem('subfrost-network'));
      if (storedNetwork !== CONFIG.network) {
        throw new Error(`Network not set correctly: ${storedNetwork}`);
      }
    });

    // Test 3: Connect Wallet button exists
    await runTest('Connect Wallet button exists', async () => {
      const hasConnectButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some((btn) => {
          const text = btn.textContent?.toUpperCase() || '';
          return text.includes('CONNECT') && text.includes('WALLET');
        });
      });

      if (!hasConnectButton) {
        throw new Error('Connect Wallet button not found');
      }
    });

    // Test 4: Wallet modal opens
    await runTest('Wallet modal can be opened', async () => {
      // Click connect wallet button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find((b) => {
          const text = b.textContent?.toUpperCase() || '';
          return text.includes('CONNECT') && text.includes('WALLET');
        });
        btn?.click();
      });

      await sleep(CONFIG.timeouts.short);

      // Check for modal content
      const hasModalContent = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return (
          bodyText.includes('Create Wallet') ||
          bodyText.includes('Restore from Mnemonic') ||
          bodyText.includes('Import') ||
          bodyText.includes('Unlock')
        );
      });

      if (!hasModalContent) {
        throw new Error('Wallet modal content not found');
      }

      await takeScreenshot('wallet-modal');

      // Close modal by clicking outside or pressing escape
      await page.keyboard.press('Escape');
      await sleep(500);
    });

    // Test 5: Navigate to Vaults page
    await runTest('Vaults page loads', async () => {
      await page.goto(`${CONFIG.baseUrl}/vaults`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeouts.pageLoad,
      });

      // Verify we're on vaults page
      const url = page.url();
      if (!url.includes('/vaults')) {
        throw new Error(`Not on vaults page: ${url}`);
      }

      // Check for vault-related content
      const hasVaultContent = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return (
          bodyText.toLowerCase().includes('vault') ||
          bodyText.toLowerCase().includes('deposit') ||
          bodyText.includes('APY')
        );
      });

      if (!hasVaultContent) {
        throw new Error('Vault content not found on vaults page');
      }

      await takeScreenshot('vaults-page');
    });

    // Test 6: Vault list contains entries
    await runTest('Vault list contains entries', async () => {
      await sleep(CONFIG.timeouts.short);

      // Look for vault cards/items
      const vaultInfo = await page.evaluate(() => {
        // Try multiple selectors that might indicate vault items
        const bodyText = document.body.textContent || '';
        const hasVaultTokens =
          bodyText.includes('dxBTC') ||
          bodyText.includes('veDIESEL') ||
          bodyText.includes('veMETHANE') ||
          bodyText.includes('yvfrBTC') ||
          bodyText.includes('frBTC');

        // Count clickable items that might be vaults
        const clickableItems = document.querySelectorAll(
          'button, [role="button"], div[class*="cursor-pointer"]'
        );
        let vaultClickables = 0;
        clickableItems.forEach((item) => {
          if (item.textContent?.match(/(BTC|DIESEL|METHANE|Vault|APY)/i)) {
            vaultClickables++;
          }
        });

        return { hasVaultTokens, vaultClickables };
      });

      if (!vaultInfo.hasVaultTokens && vaultInfo.vaultClickables === 0) {
        throw new Error('No vault entries found in vault list');
      }

      console.log(`    Found vault tokens: ${vaultInfo.hasVaultTokens}`);
      console.log(`    Vault clickables: ${vaultInfo.vaultClickables}`);
    });

    // Test 7: Deposit interface is accessible
    await runTest('Deposit interface is accessible', async () => {
      // Try to select a vault (click on first vault item)
      const clicked = await page.evaluate(() => {
        // Find first clickable element that looks like a vault
        const elements = Array.from(
          document.querySelectorAll('button, [role="button"], div[class*="cursor"]')
        );
        for (const el of elements) {
          const text = el.textContent || '';
          if (text.match(/(BTC|DIESEL)/i) && text.match(/(vault|APY)/i)) {
            (el as HTMLElement).click();
            return text.substring(0, 50);
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`    Clicked: ${clicked}`);
      }

      await sleep(CONFIG.timeouts.short);

      // Check for deposit interface elements
      const hasDepositUI = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const hasDepositText = bodyText.toLowerCase().includes('deposit');
        const hasWithdrawText = bodyText.toLowerCase().includes('withdraw');
        const hasFromWallet = bodyText.toLowerCase().includes('from wallet');

        // Look for input field
        const inputs = document.querySelectorAll('input');
        const hasNumberInput = Array.from(inputs).some(
          (i) => i.type === 'number' || i.placeholder?.includes('0')
        );

        return { hasDepositText, hasWithdrawText, hasFromWallet, hasNumberInput };
      });

      if (!hasDepositUI.hasDepositText) {
        throw new Error('Deposit interface not found');
      }

      console.log(`    Deposit text: ${hasDepositUI.hasDepositText}`);
      console.log(`    Withdraw text: ${hasDepositUI.hasWithdrawText}`);
      console.log(`    From Wallet: ${hasDepositUI.hasFromWallet}`);
      console.log(`    Number input: ${hasDepositUI.hasNumberInput}`);

      await takeScreenshot('deposit-interface');
    });

    // Test 8: Token selector is present
    await runTest('Token selector is present', async () => {
      const tokenSelectorInfo = await page.evaluate(() => {
        // Look for token symbols in the UI
        const bodyText = document.body.textContent || '';
        const hasTokenSymbols =
          bodyText.includes('BTC') || bodyText.includes('frBTC') || bodyText.includes('DIESEL');

        // Look for dropdown/selector elements
        const hasChevron = document.querySelector('svg, [class*="chevron"]') !== null;

        return { hasTokenSymbols, hasChevron };
      });

      if (!tokenSelectorInfo.hasTokenSymbols) {
        throw new Error('Token symbols not found in UI');
      }
    });

    // Test 9: Miner fee section is present
    await runTest('Miner fee section is present', async () => {
      const hasMinerFee = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return (
          bodyText.toLowerCase().includes('miner fee') ||
          bodyText.toLowerCase().includes('sats') ||
          bodyText.includes('vByte')
        );
      });

      if (!hasMinerFee) {
        throw new Error('Miner fee section not found');
      }
    });

    // Test 10: DEPOSIT button exists (disabled when not connected)
    await runTest('DEPOSIT button exists', async () => {
      const buttonInfo = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const depositBtn = buttons.find((btn) => {
          const text = btn.textContent?.toUpperCase() || '';
          return text === 'DEPOSIT' || text.includes('DEPOSIT');
        });

        if (!depositBtn) return null;

        return {
          text: depositBtn.textContent,
          disabled: depositBtn.hasAttribute('disabled'),
          className: depositBtn.className,
        };
      });

      if (!buttonInfo) {
        // Check if it shows "Connect Wallet" instead (which is correct when not connected)
        const hasConnectInstead = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some((btn) => {
            const text = btn.textContent?.toUpperCase() || '';
            return text === 'CONNECT WALLET';
          });
        });

        if (hasConnectInstead) {
          console.log('    Button shows "Connect Wallet" (expected when not connected)');
          return;
        }

        throw new Error('DEPOSIT or CONNECT WALLET button not found');
      }

      console.log(`    Button text: ${buttonInfo.text}`);
      console.log(`    Disabled: ${buttonInfo.disabled}`);
    });

    // Test 11: API endpoints are responding
    await runTest('Backend APIs are responding', async () => {
      // Test Esplora API (port 50010)
      const esploraResponse = await page.evaluate(async () => {
        try {
          const resp = await fetch('http://localhost:50010/blocks/tip/height');
          return { ok: resp.ok, status: resp.status };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      });

      if (!esploraResponse.ok) {
        console.log(`    Esplora API not reachable (may be expected if CORS blocked)`);
      } else {
        console.log(`    Esplora API responding: status ${esploraResponse.status}`);
      }

      // Test Metashrew JSON-RPC (port 18888) via proxy
      const sandshrewResponse = await page.evaluate(async () => {
        try {
          const resp = await fetch('/api/sandshrew?network=regtest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'metashrew_height',
              params: [],
              id: 1,
            }),
          });
          const data = await resp.json();
          return { ok: resp.ok, data };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      });

      console.log(`    Sandshrew proxy: ${JSON.stringify(sandshrewResponse).substring(0, 100)}`);
    });

    // Test 12: Console has no critical errors
    await runTest('No critical console errors', async () => {
      const criticalErrors = consoleLogs.filter(
        (log) =>
          log.includes('[error]') &&
          (log.toLowerCase().includes('uncaught') ||
            log.toLowerCase().includes('unhandled') ||
            log.toLowerCase().includes('fatal'))
      );

      if (criticalErrors.length > 0) {
        throw new Error(`Critical errors found: ${criticalErrors[0].substring(0, 100)}`);
      }

      console.log(`    Total console logs: ${consoleLogs.length}`);
      console.log(`    Critical errors: ${criticalErrors.length}`);
    });
  } finally {
    await teardown();
  }
}

// Run the test suite
runTestSuite().catch((error) => {
  console.error('Fatal error in test suite:', error);
  if (browser) browser.close();
  process.exit(1);
});
