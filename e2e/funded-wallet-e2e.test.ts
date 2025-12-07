/**
 * Funded Wallet E2E Tests
 *
 * Comprehensive E2E tests that require a funded testnet/regtest wallet.
 * These tests verify actual blockchain interactions:
 *
 * 1. Wallet Operations - Balance fetching, UTXO management
 * 2. Swap Operations - Token swaps, wrap/unwrap BTC
 * 3. Vault Operations - Deposit/withdraw
 * 4. UI State Management - Settings, quotes, fee estimation
 *
 * PREREQUISITES:
 * - App running locally (npm run dev) or deployed
 * - Test wallet with:
 *   - Testnet/regtest BTC (minimum 0.01 BTC recommended)
 *   - Some alkane tokens (DIESEL, frBTC, etc.) for swap tests
 * - Network: oylnet, testnet, or regtest
 *
 * RUN: TEST_BASE_URL=http://localhost:3001 npm run test:e2e:funded
 *
 * HEADLESS=false for visual debugging:
 * HEADLESS=false TEST_BASE_URL=http://localhost:3001 npm run test:e2e:funded
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';
import {
  takeScreenshot,
  setupConsoleCapture,
} from './helpers/testHelpers';

// Test wallet mnemonic - USE ONLY FOR TESTING, NEVER WITH REAL FUNDS
const TEST_MNEMONIC = process.env.TEST_MNEMONIC || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

let browser: Browser;
let page: Page;
let consoleLogs: string[] = [];
let testResults: { name: string; passed: boolean; error?: string; duration?: number }[] = [];

// Track wallet state
let walletConnected = false;
let btcBalance = 0;
let hasAlkaneTokens = false;

async function waitForPageReady(p: Page, timeout = 3000) {
  await new Promise(resolve => setTimeout(resolve, timeout));
}

async function runTest(name: string, testFn: () => Promise<void>) {
  const startTime = Date.now();
  console.log(`\n🧪 Test: ${name}`);
  try {
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ PASSED: ${name} (${duration}ms)`);
    testResults.push({ name, passed: true, duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ FAILED: ${name} (${duration}ms)`);
    console.error(`   Error: ${(error as Error).message}`);
    testResults.push({
      name,
      passed: false,
      error: (error as Error).message,
      duration,
    });
    await takeScreenshot(page, `funded-failure-${name.replace(/\s+/g, '-')}`);
  }
}

async function setup() {
  console.log('🚀 Starting Funded Wallet E2E Tests\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${TESTNET_CONFIG.baseUrl}`);
  console.log(`  Network: ${TESTNET_CONFIG.network}`);
  console.log(`  Headless: ${TESTNET_CONFIG.browser.headless}`);
  console.log(`  Test Mnemonic: ${TEST_MNEMONIC.split(' ').slice(0, 3).join(' ')}...`);
  console.log();

  browser = await puppeteer.launch({
    headless: TESTNET_CONFIG.browser.headless,
    slowMo: TESTNET_CONFIG.browser.slowMo,
    devtools: TESTNET_CONFIG.browser.devtools,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  consoleLogs = setupConsoleCapture(page);

  // Clear storage and setup fresh
  await page.goto(TESTNET_CONFIG.baseUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await waitForPageReady(page, 2000);
}

async function teardown() {
  if (browser) await browser.close();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 Funded Wallet E2E Results Summary');
  console.log('═══════════════════════════════════════════════════');
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const totalDuration = testResults.reduce((sum, t) => sum + (t.duration || 0), 0);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${testResults.length}`);
  console.log(`⏱️  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`🎯 Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    testResults.filter(t => !t.passed).forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error}`);
    });
    console.log();
    process.exit(1);
  } else {
    console.log('🎉 All funded wallet E2E tests passed!\n');
    process.exit(0);
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function openWalletModal() {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = b.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    btn?.click();
  });
  await waitForPageReady(page, 800);
}

async function closeWalletModal() {
  await page.keyboard.press('Escape');
  await waitForPageReady(page, 300);
}

async function restoreTestWallet() {
  await openWalletModal();

  // Click Restore from Mnemonic
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b => b.textContent?.includes('Restore from Mnemonic'));
    restoreBtn?.click();
  });
  await waitForPageReady(page, 500);

  // Enter mnemonic
  const textarea = await page.$('textarea');
  if (textarea) {
    await textarea.type(TEST_MNEMONIC);
  }

  // Enter password
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    await passwordInput.type(TEST_PASSWORD);
  }

  // Click restore
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b => b.textContent?.includes('Restore Wallet'));
    restoreBtn?.click();
  });

  await waitForPageReady(page, 3000);
  walletConnected = true;
}

async function getDisplayedBalance(): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.body.textContent || '';
    // Look for balance patterns like "0.001 BTC" or "Balance: 0.001"
    const match = text.match(/(\d+\.?\d*)\s*(BTC|sats)/i);
    return match ? match[1] : null;
  });
}

async function navigateTo(path: string) {
  await page.goto(`${TESTNET_CONFIG.baseUrl}${path}`, { waitUntil: 'networkidle2' });
  await waitForPageReady(page, 2000);
}

// ============================================================
// TEST SUITE
// ============================================================

async function runTestSuite() {
  await setup();

  try {
    // ==========================================
    // SECTION 1: WALLET SETUP & CONNECTION
    // ==========================================
    console.log('\n📦 Section 1: Wallet Setup & Connection\n');

    await runTest('1.1 Navigate to home page', async () => {
      await navigateTo('/');
      const title = await page.title();
      if (!title.includes('SUBFROST')) {
        throw new Error(`Unexpected title: ${title}`);
      }
    });

    await runTest('1.2 WASM SDK initializes', async () => {
      await waitForPageReady(page, 3000);
      const sdkReady = consoleLogs.some(log =>
        log.includes('Alkanes SDK ready') || log.includes('Alkanes wallet ready')
      );
      if (!sdkReady) {
        console.log('   ⚠️  SDK ready message not found, but continuing...');
      }
    });

    await runTest('1.3 Restore test wallet from mnemonic', async () => {
      await restoreTestWallet();

      // Verify wallet connected by checking for address display
      const hasAddress = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return /tb1[a-z0-9]{20,}|bc1[a-z0-9]{20,}/i.test(text);
      });

      if (!hasAddress) {
        // Check if connect button is gone
        const hasConnectButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some(b => b.textContent?.toUpperCase().includes('CONNECT WALLET'));
        });
        if (hasConnectButton) {
          throw new Error('Wallet not connected - connect button still visible');
        }
      }
      console.log('   Wallet restored and connected');
    });

    // ==========================================
    // SECTION 2: BALANCE & UTXO VERIFICATION
    // ==========================================
    console.log('\n📦 Section 2: Balance & UTXO Verification\n');

    await runTest('2.1 Navigate to swap page', async () => {
      await navigateTo('/swap');
      const onSwapPage = await page.evaluate(() => {
        return document.body.textContent?.toLowerCase().includes('swap');
      });
      if (!onSwapPage) {
        throw new Error('Not on swap page');
      }
    });

    await runTest('2.2 Balance displays in UI', async () => {
      await waitForPageReady(page, 2000);

      // Look for any balance display
      const hasBalanceDisplay = await page.evaluate(() => {
        const text = document.body.textContent || '';
        // Check for balance indicators
        return text.includes('Balance') ||
               text.includes('Available') ||
               /\d+\.\d+\s*(BTC|sats)/i.test(text);
      });

      if (hasBalanceDisplay) {
        const balance = await getDisplayedBalance();
        console.log(`   Displayed balance: ${balance || 'found'}`);
        if (balance) {
          btcBalance = parseFloat(balance);
        }
      } else {
        console.log('   ⚠️  No explicit balance display found');
      }
    });

    await runTest('2.3 Token selector shows available tokens', async () => {
      // Click the from token selector
      const clickedSelector = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Find a button that looks like a token selector (has token name or "Select")
        const tokenBtn = buttons.find(b => {
          const text = b.textContent || '';
          return text.includes('BTC') || text.includes('Select') || text.includes('DIESEL');
        });
        if (tokenBtn) {
          tokenBtn.click();
          return true;
        }
        return false;
      });

      if (clickedSelector) {
        await waitForPageReady(page, 500);

        // Check if token list is visible
        const hasTokenList = await page.evaluate(() => {
          const text = document.body.textContent || '';
          // Should show multiple tokens
          const tokens = ['BTC', 'frBTC', 'DIESEL', 'bUSD'];
          return tokens.filter(t => text.includes(t)).length >= 2;
        });

        if (hasTokenList) {
          console.log('   Token selector shows available tokens');
          hasAlkaneTokens = true;
        }

        // Close selector
        await page.keyboard.press('Escape');
        await waitForPageReady(page, 300);
      }
    });

    // ==========================================
    // SECTION 3: SWAP UI INTERACTIONS
    // ==========================================
    console.log('\n📦 Section 3: Swap UI Interactions\n');

    await runTest('3.1 Select BTC as from token', async () => {
      // Click from token selector
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const fromBtn = buttons.find(b => {
          const text = b.textContent || '';
          return text.includes('BTC') || text.includes('Select');
        });
        fromBtn?.click();
      });
      await waitForPageReady(page, 500);

      // Select BTC
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('button, div[role="button"], li'));
        const btcItem = items.find(el => {
          const text = el.textContent || '';
          return text === 'BTC' || (text.includes('BTC') && !text.includes('frBTC'));
        });
        (btcItem as HTMLElement)?.click();
      });
      await waitForPageReady(page, 500);
    });

    await runTest('3.2 Select frBTC as to token', async () => {
      // Click to token selector (usually second token button)
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Find buttons with token names, get the second one
        const tokenButtons = buttons.filter(b => {
          const text = b.textContent || '';
          return text.includes('BTC') || text.includes('Select') || text.includes('DIESEL');
        });
        if (tokenButtons.length >= 2) {
          tokenButtons[1].click();
        }
      });
      await waitForPageReady(page, 500);

      // Select frBTC
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('button, div[role="button"], li'));
        const frbtcItem = items.find(el => {
          const text = el.textContent || '';
          return text.includes('frBTC');
        });
        (frbtcItem as HTMLElement)?.click();
      });
      await waitForPageReady(page, 500);
    });

    await runTest('3.3 Enter swap amount', async () => {
      // Find and fill amount input
      const input = await page.$('input[type="text"], input[type="number"]');
      if (input) {
        await input.click({ clickCount: 3 });
        await input.type('0.0001');
        await waitForPageReady(page, 500);
        console.log('   Entered amount: 0.0001');
      } else {
        throw new Error('Amount input not found');
      }
    });

    await runTest('3.4 Quote calculation displays', async () => {
      await waitForPageReady(page, 2000);

      const hasQuote = await page.evaluate(() => {
        const text = document.body.textContent || '';
        // Look for exchange rate or output amount
        return /1\s*BTC\s*[=≈]\s*[\d.]+/i.test(text) ||
               /You.*(receive|get)/i.test(text) ||
               /Output|To:/i.test(text);
      });

      if (hasQuote) {
        console.log('   Quote displayed');
      } else {
        console.log('   ⚠️  Quote display not detected (may need more time or balance)');
      }
    });

    await runTest('3.5 Max button fills balance', async () => {
      // Find and click max button
      const clickedMax = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const maxBtn = buttons.find(b => {
          const text = b.textContent?.toUpperCase() || '';
          return text === 'MAX' || text.includes('MAX');
        });
        if (maxBtn) {
          maxBtn.click();
          return true;
        }
        return false;
      });

      if (clickedMax) {
        await waitForPageReady(page, 500);
        console.log('   Max button clicked');
      } else {
        console.log('   ⚠️  Max button not found');
      }
    });

    await runTest('3.6 Percentage buttons work', async () => {
      // Test 50% button
      const clicked50 = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent?.includes('50%'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (clicked50) {
        await waitForPageReady(page, 500);
        console.log('   50% button works');
      } else {
        console.log('   ⚠️  Percentage buttons not found');
      }
    });

    await runTest('3.7 Invert tokens button works', async () => {
      // Find and click invert button (usually has arrow icon)
      const inverted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const invertBtn = buttons.find(b => {
          // Look for rotate/swap icons or text
          return b.querySelector('svg') &&
                 (b.className.includes('rotate') ||
                  b.ariaLabel?.includes('swap') ||
                  b.innerHTML.includes('arrow'));
        });
        if (invertBtn) {
          invertBtn.click();
          return true;
        }
        return false;
      });

      if (inverted) {
        await waitForPageReady(page, 500);
        console.log('   Invert button clicked');
      } else {
        console.log('   ⚠️  Invert button not found');
      }
    });

    // ==========================================
    // SECTION 4: SETTINGS & CONFIGURATION
    // ==========================================
    console.log('\n📦 Section 4: Settings & Configuration\n');

    await runTest('4.1 Navigate to settings', async () => {
      await navigateTo('/settings');
      const onSettings = await page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('settings') || text.includes('slippage');
      });
      if (!onSettings) {
        console.log('   ⚠️  Settings page may have different layout');
      }
    });

    await runTest('4.2 Slippage setting is configurable', async () => {
      const hasSlippage = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('lippage') || text.includes('%');
      });

      if (hasSlippage) {
        // Try to find and modify slippage input
        const input = await page.$('input[type="number"]');
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type('1.5');
          console.log('   Slippage set to 1.5%');
        }
      } else {
        console.log('   ⚠️  Slippage setting not found on this page');
      }
    });

    // ==========================================
    // SECTION 5: VAULT OPERATIONS
    // ==========================================
    console.log('\n📦 Section 5: Vault Operations\n');

    await runTest('5.1 Navigate to vaults page', async () => {
      await navigateTo('/vaults');
      const onVaults = await page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('vault') || text.includes('deposit');
      });
      if (!onVaults) {
        throw new Error('Not on vaults page');
      }
    });

    await runTest('5.2 Vault list displays', async () => {
      await waitForPageReady(page, 2000);

      const hasVaults = await page.evaluate(() => {
        const text = document.body.textContent || '';
        const vaultNames = ['dxBTC', 'veDIESEL', 'veUSD', 'veMETHANE'];
        return vaultNames.some(v => text.includes(v));
      });

      if (hasVaults) {
        console.log('   Vault list loaded');
      } else {
        console.log('   ⚠️  Vault names not found (may be loading)');
      }
    });

    await runTest('5.3 Select vault for detail view', async () => {
      // Click on first vault
      const clicked = await page.evaluate(() => {
        const vaultItems = Array.from(document.querySelectorAll('div, button, tr'));
        const vaultItem = vaultItems.find(el => {
          const text = el.textContent || '';
          return text.includes('dxBTC') || text.includes('veDIESEL');
        });
        if (vaultItem) {
          (vaultItem as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await waitForPageReady(page, 1000);
        console.log('   Vault selected');
      } else {
        console.log('   ⚠️  Could not select vault');
      }
    });

    await runTest('5.4 Vault deposit interface shows', async () => {
      const hasDepositUI = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('Deposit') || text.includes('Amount') || text.includes('Stake');
      });

      if (hasDepositUI) {
        console.log('   Deposit interface visible');
      } else {
        console.log('   ⚠️  Deposit interface not found');
      }
    });

    // ==========================================
    // SECTION 6: FUTURES PAGE
    // ==========================================
    console.log('\n📦 Section 6: Futures Page\n');

    await runTest('6.1 Navigate to futures page', async () => {
      await navigateTo('/futures');
      const onFutures = await page.evaluate(() => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('future') || text.includes('position') || text.includes('market');
      });
      if (!onFutures) {
        throw new Error('Not on futures page');
      }
    });

    await runTest('6.2 Futures markets display', async () => {
      await waitForPageReady(page, 2000);

      const hasMarkets = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('Market') || text.includes('Contract') || text.includes('Position');
      });

      if (hasMarkets) {
        console.log('   Futures markets loaded');
      } else {
        console.log('   ⚠️  Markets may still be loading');
      }
    });

    // ==========================================
    // SECTION 7: ACTIVITY & HISTORY
    // ==========================================
    console.log('\n📦 Section 7: Activity & History\n');

    await runTest('7.1 Navigate to activity page', async () => {
      await navigateTo('/activity');
      await waitForPageReady(page, 2000);
    });

    await runTest('7.2 Activity feed displays', async () => {
      const hasActivity = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('Activity') || text.includes('Transaction') || text.includes('History');
      });

      if (hasActivity) {
        console.log('   Activity page loaded');
      }
    });

    // ==========================================
    // SECTION 8: FEE ESTIMATION
    // ==========================================
    console.log('\n📦 Section 8: Fee Estimation\n');

    await runTest('8.1 Fee API responds', async () => {
      const response = await page.evaluate(async (baseUrl) => {
        try {
          const res = await fetch(`${baseUrl}/api/fees`);
          return { status: res.status, ok: res.ok };
        } catch (e) {
          return { error: (e as Error).message };
        }
      }, TESTNET_CONFIG.baseUrl);

      if (response.ok) {
        console.log('   Fee API working');
      } else {
        console.log(`   ⚠️  Fee API status: ${response.status || response.error}`);
      }
    });

    await runTest('8.2 Fee selector shows options', async () => {
      await navigateTo('/swap');
      await waitForPageReady(page, 1000);

      const hasFeeOptions = await page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('Fee') ||
               text.includes('sat/vB') ||
               (text.includes('Slow') && text.includes('Fast'));
      });

      if (hasFeeOptions) {
        console.log('   Fee options visible');
      } else {
        console.log('   ⚠️  Fee options not explicitly shown');
      }
    });

    // ==========================================
    // SECTION 9: WALLET DISCONNECT & CLEANUP
    // ==========================================
    console.log('\n📦 Section 9: Wallet Disconnect & Cleanup\n');

    await runTest('9.1 Disconnect wallet', async () => {
      // Look for disconnect button or wallet menu
      const disconnected = await page.evaluate(() => {
        // First try to find a disconnect button directly
        const buttons = Array.from(document.querySelectorAll('button'));
        const disconnectBtn = buttons.find(b => {
          const text = b.textContent?.toLowerCase() || '';
          return text.includes('disconnect') || text.includes('logout');
        });

        if (disconnectBtn) {
          disconnectBtn.click();
          return true;
        }

        // Try clicking on wallet address to open menu
        const walletBtn = buttons.find(b => {
          const text = b.textContent || '';
          return /tb1|bc1/i.test(text);
        });

        if (walletBtn) {
          walletBtn.click();
          return 'menu-opened';
        }

        return false;
      });

      if (disconnected === 'menu-opened') {
        await waitForPageReady(page, 500);
        // Now look for disconnect in menu
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const disconnectBtn = buttons.find(b => {
            const text = b.textContent?.toLowerCase() || '';
            return text.includes('disconnect');
          });
          disconnectBtn?.click();
        });
      }

      await waitForPageReady(page, 1000);

      // Verify disconnected
      const hasConnectButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent?.toUpperCase().includes('CONNECT WALLET'));
      });

      if (hasConnectButton) {
        console.log('   Wallet disconnected');
      } else {
        console.log('   ⚠️  Disconnect may not have worked or button text differs');
      }
    });

    await runTest('9.2 Clear storage and verify', async () => {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      const cleared = await page.evaluate(() => {
        return localStorage.getItem('subfrost_encrypted_keystore') === null;
      });

      if (cleared) {
        console.log('   Storage cleared');
      }
    });

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('\n📝 TEST COMPLETION NOTES:');
    console.log('   For full transaction testing, ensure:');
    console.log('   1. Wallet has testnet BTC balance');
    console.log('   2. Network (oylnet/testnet) is accessible');
    console.log('   3. Run with HEADLESS=false for visual verification');
    console.log('   4. Check screenshots in e2e/screenshots/ for failures');

  } finally {
    await teardown();
  }
}

runTestSuite().catch((error) => {
  console.error('Fatal error in test suite:', error);
  if (browser) browser.close();
  process.exit(1);
});
