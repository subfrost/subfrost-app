/**
 * Diagnostic Test: Wrap Functionality & Balance Display
 *
 * This test diagnoses:
 * 1. Why balance doesn't show on swap page
 * 2. Why wrap functionality fails
 * 3. Whether mining works after swap page interactions
 *
 * RUN: HEADLESS=false npx tsx e2e/diagnose-wrap.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';
const HEADLESS = process.env.HEADLESS !== 'false';

let browser: Browser;
let page: Page;
const consoleLogs: string[] = [];
const consoleErrors: string[] = [];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 DIAGNOSTIC TEST: Wrap Functionality & Balance Display');
  console.log('='.repeat(60));
  console.log(`\n📍 Base URL: ${BASE_URL}`);
  console.log(`📍 Headless: ${HEADLESS}\n`);

  browser = await puppeteer.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    devtools: !HEADLESS,
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Capture ALL console logs
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const logLine = `[${type.toUpperCase()}] ${text}`;
    consoleLogs.push(logLine);

    // Print relevant logs immediately
    if (text.includes('[WalletContext]') ||
        text.includes('[AlkanesSDK]') ||
        text.includes('[SwapShell]') ||
        text.includes('[useWrapMutation]') ||
        text.includes('[useBtcBalance]') ||
        text.includes('getEnrichedBalances') ||
        text.includes('getSpendable') ||
        type === 'error') {
      console.log(`  📋 ${logLine}`);
    }

    if (type === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', (error) => {
    const errorText = `PAGE ERROR: ${error.message}`;
    consoleErrors.push(errorText);
    console.log(`  ❌ ${errorText}`);
  });

  page.on('requestfailed', (request) => {
    const failedText = `REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`;
    consoleErrors.push(failedText);
    console.log(`  ⚠️ ${failedText}`);
  });
}

async function teardown() {
  if (browser) await browser.close();
}

async function restoreWallet(): Promise<boolean> {
  console.log('\n📱 STEP 1: Restoring test wallet...');

  await page.goto(`${BASE_URL}/wallet`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // Clear existing wallet data
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);

  // Check if there's a connect wallet button
  const hasConnectButton = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(b => {
      const text = (b.textContent || '').toUpperCase();
      return text.includes('CONNECT') || text.includes('WALLET');
    });
  });

  if (hasConnectButton) {
    console.log('  Found Connect Wallet button, clicking...');

    // Click Connect Wallet
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => {
        const text = (b.textContent || '').toUpperCase();
        return text.includes('CONNECT') || text.includes('CREATE') || text.includes('WALLET');
      });
      btn?.click();
    });
    await sleep(1000);

    // Look for Restore option
    const hasRestore = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => (b.textContent || '').includes('Restore'));
    });

    if (hasRestore) {
      console.log('  Found Restore button, clicking...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => (b.textContent || '').includes('Restore'));
        btn?.click();
      });
      await sleep(500);
    }

    // Enter mnemonic
    const textarea = await page.$('textarea');
    if (textarea) {
      console.log('  Entering mnemonic...');
      await textarea.type(TEST_MNEMONIC);
      await sleep(500);
    }

    // Enter password
    const passwordInputs = await page.$$('input[type="password"]');
    if (passwordInputs.length > 0) {
      console.log('  Entering password...');
      for (const input of passwordInputs) {
        await input.type(TEST_PASSWORD);
      }
      await sleep(500);
    }

    // Click Restore/Create/Confirm button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => {
        const text = (b.textContent || '').toLowerCase();
        return text.includes('restore') || text.includes('create') || text.includes('confirm') || text.includes('unlock');
      });
      btn?.click();
    });

    await sleep(5000);
  }

  // Check if wallet is now connected
  const isConnected = await page.evaluate(() => {
    const pageText = document.body.textContent || '';
    return pageText.includes('bcrt1') || pageText.includes('tb1') || pageText.includes('bc1') ||
           pageText.includes('Balance') || pageText.includes('balance');
  });

  console.log(`  Wallet connected: ${isConnected ? '✅ Yes' : '❌ No'}`);
  return isConnected;
}

async function checkWalletDashboard(): Promise<{ btcBalance: string; hasRegtestControls: boolean }> {
  console.log('\n💰 STEP 2: Checking wallet dashboard...');

  await page.goto(`${BASE_URL}/wallet`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  const result = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Look for BTC balance
    const btcMatch = pageText.match(/(\d+\.?\d*)\s*BTC/i);

    // Check for regtest controls (Mine buttons)
    const hasMine = pageText.includes('Mine') ||
                   Array.from(document.querySelectorAll('button')).some(b =>
                     (b.textContent || '').includes('Mine'));

    return {
      btcBalance: btcMatch ? btcMatch[1] : '0',
      hasRegtestControls: hasMine,
      rawBalanceText: pageText.substring(0, 500)
    };
  });

  console.log(`  BTC Balance: ${result.btcBalance}`);
  console.log(`  Regtest Controls: ${result.hasRegtestControls ? '✅ Available' : '❌ Not found'}`);

  return result;
}

async function mineBlocks(count: number): Promise<boolean> {
  console.log(`\n⛏️ STEP 3: Mining ${count} blocks...`);

  // Look for Mine button
  const mineButton = await page.evaluate((blockCount) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const text = (b.textContent || '');
      return text.includes(`Mine ${blockCount}`) || text.includes('Mine 200') || text.includes('Mine Blocks');
    });
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, count);

  if (!mineButton) {
    // Try to find any mine button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => (b.textContent || '').toLowerCase().includes('mine'));
      btn?.click();
    });
  }

  console.log('  Waiting for mining to complete...');
  await sleep(10000);

  // Check if balance updated
  const newBalance = await page.evaluate(() => {
    const pageText = document.body.textContent || '';
    const match = pageText.match(/(\d+\.?\d*)\s*BTC/i);
    return match ? match[1] : '0';
  });

  console.log(`  New balance after mining: ${newBalance} BTC`);
  return parseFloat(newBalance) > 0;
}

async function checkSwapPageBalance(): Promise<{ btcBalance: string; frbtcBalance: string; consoleOutput: string[] }> {
  console.log('\n🔄 STEP 4: Navigating to swap page...');

  // Clear console logs for this section
  const swapPageLogs: string[] = [];

  // Capture logs during navigation
  const logHandler = (msg: any) => {
    swapPageLogs.push(`[${msg.type()}] ${msg.text()}`);
  };

  await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2' });

  console.log('  Waiting for balances to load...');
  await sleep(5000);

  const result = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Look for balance text near the FROM field
    const balanceMatches = pageText.match(/Balance:\s*(\d+\.?\d*)/gi) || [];

    // Try to find BTC balance specifically
    const btcBalanceMatch = pageText.match(/Balance:\s*(\d+\.?\d*)/i);

    // Try to find frBTC
    const frbtcMatch = pageText.match(/frBTC[:\s]*(\d+\.?\d*)/i);

    // Get all visible balances
    const allBalances = Array.from(document.querySelectorAll('*'))
      .filter(el => el.textContent?.includes('Balance:'))
      .map(el => el.textContent?.trim())
      .filter(Boolean);

    return {
      btcBalance: btcBalanceMatch ? btcBalanceMatch[1] : '0',
      frbtcBalance: frbtcMatch ? frbtcMatch[1] : '0',
      allBalances,
      pageSnippet: pageText.substring(0, 1000)
    };
  });

  console.log(`  BTC Balance on swap page: ${result.btcBalance}`);
  console.log(`  frBTC Balance: ${result.frbtcBalance}`);
  console.log(`  All visible balances: ${result.allBalances.join(' | ')}`);

  // Print relevant console logs from this page
  const relevantLogs = consoleLogs.filter(log =>
    log.includes('getEnrichedBalances') ||
    log.includes('getSpendable') ||
    log.includes('btc-balance') ||
    log.includes('[WalletContext]')
  ).slice(-20);

  if (relevantLogs.length > 0) {
    console.log('\n  📋 Relevant console logs:');
    relevantLogs.forEach(log => console.log(`     ${log}`));
  }

  return {
    btcBalance: result.btcBalance,
    frbtcBalance: result.frbtcBalance,
    consoleOutput: relevantLogs
  };
}

async function attemptWrap(amount: string): Promise<{ success: boolean; txId?: string; error?: string }> {
  console.log(`\n💫 STEP 5: Attempting to wrap ${amount} BTC to frBTC...`);

  await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // First, make sure BTC is selected as FROM
  console.log('  Setting up BTC → frBTC pair...');

  // Click on TO token selector and select frBTC
  const selectedFrBTC = await page.evaluate(() => {
    // Find and click the TO token selector
    const buttons = Array.from(document.querySelectorAll('button'));

    // Look for token selector button (usually shows current token or "Select token")
    const toButton = buttons.find(b => {
      const text = b.textContent || '';
      // This is likely the TO selector if it's the second token button
      return text.includes('bUSD') || text.includes('Select') || text.includes('frBTC');
    });

    if (toButton) {
      toButton.click();
      return true;
    }
    return false;
  });

  await sleep(1000);

  // Select frBTC from the modal
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button, div[role="button"], li'));
    const frbtcItem = items.find(el => (el.textContent || '').includes('frBTC'));
    if (frbtcItem) {
      (frbtcItem as HTMLElement).click();
    }
  });

  await sleep(1000);

  // Enter amount
  console.log(`  Entering amount: ${amount}`);
  const inputs = await page.$$('input[type="text"], input[type="number"], input[inputmode="decimal"]');

  for (const input of inputs) {
    const isDisabled = await input.evaluate((el) => (el as HTMLInputElement).disabled);
    if (!isDisabled) {
      await input.click({ clickCount: 3 });
      await input.type(amount);
      break;
    }
  }

  await sleep(2000);

  // Check if swap button is available
  const buttonState = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const swapBtn = buttons.find(b => {
      const text = (b.textContent || '').toLowerCase();
      return text.includes('swap') || text.includes('wrap');
    });

    return {
      found: !!swapBtn,
      text: swapBtn?.textContent || '',
      disabled: swapBtn?.disabled || false
    };
  });

  console.log(`  Swap button: "${buttonState.text}", disabled: ${buttonState.disabled}`);

  if (!buttonState.found) {
    return { success: false, error: 'Swap button not found' };
  }

  if (buttonState.disabled) {
    // Get reason why it's disabled
    const reason = await page.evaluate(() => {
      const pageText = document.body.textContent?.toLowerCase() || '';
      if (pageText.includes('insufficient')) return 'Insufficient balance';
      if (pageText.includes('enter amount')) return 'No amount entered';
      if (pageText.includes('connect')) return 'Wallet not connected';
      if (pageText.includes('loading')) return 'Still loading';
      return 'Unknown - button disabled';
    });
    return { success: false, error: reason };
  }

  // Click the swap button
  console.log('  Clicking swap button...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const swapBtn = buttons.find(b => {
      const text = (b.textContent || '').toLowerCase();
      return text.includes('swap') || text.includes('wrap');
    });
    swapBtn?.click();
  });

  await sleep(3000);

  // Check for password prompt
  const needsPassword = await page.$('input[type="password"]');
  if (needsPassword) {
    console.log('  Entering password for signing...');
    await needsPassword.type(TEST_PASSWORD);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const confirmBtn = buttons.find(b => {
        const text = (b.textContent || '').toLowerCase();
        return text.includes('confirm') || text.includes('sign') || text.includes('unlock');
      });
      confirmBtn?.click();
    });

    await sleep(5000);
  }

  // Wait and check for result
  await sleep(5000);

  // Check console for wrap result
  const wrapLogs = consoleLogs.filter(log =>
    log.includes('[useWrapMutation]') ||
    log.includes('wrapBtc') ||
    log.includes('wrap')
  ).slice(-15);

  console.log('\n  📋 Wrap-related console logs:');
  wrapLogs.forEach(log => console.log(`     ${log}`));

  // Check for transaction result
  const txResult = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Look for success
    const hasSuccess = pageText.toLowerCase().includes('success') ||
                      pageText.toLowerCase().includes('submitted');

    // Look for transaction ID (64 hex chars)
    const txIdMatch = pageText.match(/[a-f0-9]{64}/i);

    // Look for error
    const hasError = pageText.toLowerCase().includes('failed') ||
                    pageText.toLowerCase().includes('error');

    return {
      hasSuccess,
      txId: txIdMatch?.[0],
      hasError,
      pageText: pageText.substring(0, 500)
    };
  });

  if (txResult.hasSuccess || txResult.txId) {
    console.log(`  ✅ Wrap succeeded! TxID: ${txResult.txId || 'not displayed'}`);
    return { success: true, txId: txResult.txId };
  }

  if (txResult.hasError) {
    // Extract error from console
    const errorLog = consoleErrors.slice(-5).join('\n');
    console.log(`  ❌ Wrap failed`);
    return { success: false, error: errorLog || 'Transaction failed' };
  }

  console.log('  ⏳ Result unclear, checking console...');

  // Check for specific errors in console
  const errors = consoleErrors.slice(-10);
  if (errors.length > 0) {
    console.log('  Recent errors:');
    errors.forEach(err => console.log(`     ❌ ${err}`));
    return { success: false, error: errors.join('\n') };
  }

  return { success: false, error: 'Transaction status unknown' };
}

async function runDiagnostics() {
  await setup();

  try {
    // Step 1: Restore wallet
    const walletConnected = await restoreWallet();
    if (!walletConnected) {
      console.log('\n⚠️ Could not connect wallet. Attempting to continue...');
    }

    // Step 2: Check wallet dashboard
    const dashboardState = await checkWalletDashboard();

    // Step 3: Mine blocks if needed
    if (parseFloat(dashboardState.btcBalance) === 0 && dashboardState.hasRegtestControls) {
      await mineBlocks(200);
      await sleep(3000);
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2000);
    }

    // Step 4: Check swap page balance
    const swapState = await checkSwapPageBalance();

    // Step 5: Attempt wrap
    const wrapResult = await attemptWrap('0.001');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DIAGNOSTIC SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n1. Wallet Connection: ${walletConnected ? '✅ Connected' : '❌ Failed'}`);
    console.log(`2. Dashboard BTC Balance: ${dashboardState.btcBalance} BTC`);
    console.log(`3. Regtest Controls: ${dashboardState.hasRegtestControls ? '✅ Available' : '❌ Not available'}`);
    console.log(`4. Swap Page BTC Balance: ${swapState.btcBalance}`);
    console.log(`5. Wrap Result: ${wrapResult.success ? '✅ Success' : '❌ Failed'}`);
    if (wrapResult.txId) console.log(`   Transaction ID: ${wrapResult.txId}`);
    if (wrapResult.error) console.log(`   Error: ${wrapResult.error}`);

    // Console errors summary
    if (consoleErrors.length > 0) {
      console.log(`\n⚠️ ${consoleErrors.length} console errors detected:`);
      consoleErrors.slice(-10).forEach(err => console.log(`   - ${err.substring(0, 100)}`));
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Diagnostic test failed:', error);
  } finally {
    await teardown();
  }
}

runDiagnostics().catch(console.error);
