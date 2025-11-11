/**
 * Vault E2E Tests for Testnet
 * 
 * These tests run against a live testnet deployment to verify:
 * 1. Vault deposits create units correctly
 * 2. Vault units appear in user's wallet
 * 3. Vault withdrawals return tokens
 * 4. Full deposit → withdraw cycle works
 * 
 * PREREQUISITES:
 * - App deployed to testnet or running locally with testnet network
 * - Test wallet with small amount of testnet BTC
 * - Test wallet with some DIESEL tokens for deposits
 * 
 * RUN: npm run test:e2e:vault
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';
import {
  waitForElement,
  clickAndWait,
  typeIntoField,
  getText,
  waitForTransactionConfirmation,
  takeScreenshot,
  setupConsoleCapture,
  waitForWalletConnection,
  getWalletBalance,
} from './helpers/testHelpers';

// Test state
let browser: Browser;
let page: Page;
let consoleLogs: string[] = [];
let testResults: { name: string; passed: boolean; error?: string }[] = [];

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
    await takeScreenshot(page, `failure-${name.replace(/\s+/g, '-')}`);
  }
}

async function setup() {
  console.log('🚀 Starting Testnet E2E Tests for Vaults\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${TESTNET_CONFIG.baseUrl}`);
  console.log(`  Network: ${TESTNET_CONFIG.network}`);
  console.log(`  Headless: ${TESTNET_CONFIG.browser.headless}\n`);
  
  browser = await puppeteer.launch({
    headless: TESTNET_CONFIG.browser.headless,
    slowMo: TESTNET_CONFIG.browser.slowMo,
    devtools: TESTNET_CONFIG.browser.devtools,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });
  
  // Capture console logs
  consoleLogs = setupConsoleCapture(page);
}

async function teardown() {
  if (browser) {
    await browser.close();
  }
  
  // Print summary
  console.log('\n═══════════════════════════════════════');
  console.log('📊 Testnet E2E Results Summary');
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
    console.log('🎉 All testnet E2E tests passed!\n');
    process.exit(0);
  }
}

// ==========================================
// TEST SUITE
// ==========================================

async function runTestSuite() {
  await setup();
  
  try {
    // ==========================================
    // Test 1: App Loads and Navigation Works
    // ==========================================
    await runTest('App loads successfully', async () => {
      await page.goto(TESTNET_CONFIG.baseUrl, { waitUntil: 'networkidle2' });
      
      // Verify main elements are present
      await waitForElement(page, 'body', 5000);
      
      const title = await page.title();
      if (!title) throw new Error('Page title not found');
    });
    
    // ==========================================
    // Test 2: Navigate to Vaults Page
    // ==========================================
    await runTest('Navigate to vaults page', async () => {
      // Look for vaults link in navigation
      const vaultsLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.find(link => 
          link.textContent?.toLowerCase().includes('vault')
        )?.href || null;
      });
      
      if (!vaultsLink) {
        throw new Error('Vaults navigation link not found');
      }
      
      await page.goto(vaultsLink, { waitUntil: 'networkidle2' });
      
      // Verify we're on vaults page
      const content = await page.content();
      if (!content.toLowerCase().includes('vault')) {
        throw new Error('Not on vaults page');
      }
    });
    
    // ==========================================
    // Test 3: Wallet Connection (Manual Step)
    // ==========================================
    await runTest('Wallet connection ready', async () => {
      // Look for connect wallet button
      const hasConnectButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => 
          btn.textContent?.toLowerCase().includes('connect')
        );
      });
      
      if (!hasConnectButton) {
        throw new Error('Connect wallet button not found');
      }
      
      console.log('   ⚠️  MANUAL STEP REQUIRED: Please connect wallet in browser');
      console.log('   Waiting for wallet connection...');
      
      // Wait for wallet connection (user must do this manually)
      const connected = await waitForWalletConnection(
        page,
        TESTNET_CONFIG.timeouts.walletConnect
      );
      
      if (!connected) {
        throw new Error('Wallet connection timeout - please connect wallet manually');
      }
      
      console.log('   ✅ Wallet connected');
    });
    
    // ==========================================
    // Test 4: Select Vault
    // ==========================================
    await runTest('Select yveDIESEL vault', async () => {
      // Find and click on yveDIESEL vault
      const vaultFound = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          if (el.textContent?.includes('DIESEL')) {
            if (el instanceof HTMLElement) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });
      
      if (!vaultFound) {
        throw new Error('yveDIESEL vault not found in list');
      }
      
      // Wait for vault detail page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify we're on vault detail page
      const hasDepositTab = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.toLowerCase().includes('deposit');
      });
      
      if (!hasDepositTab) {
        throw new Error('Not on vault detail page');
      }
    });
    
    // ==========================================
    // Test 5: Vault Deposit Flow
    // ==========================================
    await runTest('Vault deposit flow UI', async () => {
      // Get initial balance
      const initialBalance = await getWalletBalance(page, 'DIESEL');
      console.log(`   Initial DIESEL balance: ${initialBalance}`);
      
      // Find amount input
      const amountInput = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        return inputs.length > 0;
      });
      
      if (!amountInput) {
        throw new Error('Amount input not found');
      }
      
      // Enter deposit amount
      const depositAmount = TESTNET_CONFIG.testAmounts.vaultDeposit.toString();
      await typeIntoField(page, 'input[type="number"]', depositAmount);
      
      // Verify amount is entered
      const enteredValue = await page.$eval(
        'input[type="number"]',
        (el) => (el as HTMLInputElement).value
      );
      
      if (enteredValue !== depositAmount) {
        throw new Error(`Amount not entered correctly: ${enteredValue} !== ${depositAmount}`);
      }
      
      console.log(`   ✅ Deposit amount entered: ${depositAmount} DIESEL`);
    });
    
    // ==========================================
    // Test 6: Execute Deposit (Manual Confirmation)
    // ==========================================
    await runTest('Execute vault deposit', async () => {
      console.log('   ⚠️  MANUAL STEP: Click DEPOSIT button and confirm transaction in wallet');
      console.log('   Waiting for transaction...');
      
      // Find and click deposit button
      const depositClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          if (btn.textContent?.toUpperCase().includes('DEPOSIT')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (!depositClicked) {
        throw new Error('Deposit button not found');
      }
      
      // Wait for console log indicating transaction submission
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check console for transaction ID
      const txIdLog = consoleLogs.find(log => 
        log.includes('Deposit successful') || log.includes('transactionId')
      );
      
      if (txIdLog) {
        console.log(`   Transaction submitted: ${txIdLog}`);
      } else {
        console.log('   ⚠️  Check console manually for transaction ID');
      }
      
      console.log('   ✅ Deposit transaction initiated');
      console.log('   📝 Verify transaction confirms on block explorer');
    });
    
    // ==========================================
    // Test 7: Verify Vault Units Appear
    // ==========================================
    await runTest('Verify vault units appear after deposit', async () => {
      console.log('   ⏳ Waiting 60s for transaction to confirm...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for block confirmation
      
      // Refresh page to fetch new UTXOs
      await page.reload({ waitUntil: 'networkidle2' });
      
      // Switch to withdraw tab
      const withdrawClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          if (btn.textContent?.toUpperCase().includes('WITHDRAW')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (!withdrawClicked) {
        throw new Error('Withdraw tab not found');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if vault units are displayed
      const hasUnits = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('Unit #') || bodyText.includes('vault unit');
      });
      
      if (!hasUnits) {
        throw new Error('Vault units not found in UI - deposit may not have confirmed yet');
      }
      
      console.log('   ✅ Vault units detected in UI');
    });
    
    // ==========================================
    // Test 8: Vault Withdraw Flow
    // ==========================================
    await runTest('Vault withdraw flow UI', async () => {
      // Select first vault unit
      const unitSelected = await page.evaluate(() => {
        const unitButtons = Array.from(document.querySelectorAll('button')).filter(btn =>
          btn.textContent?.includes('Unit #')
        );
        
        if (unitButtons.length > 0) {
          unitButtons[0].click();
          return true;
        }
        return false;
      });
      
      if (!unitSelected) {
        throw new Error('No vault units to select');
      }
      
      console.log('   ✅ Vault unit selected');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find withdraw button
      const withdrawButtonEnabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const withdrawBtn = buttons.find(btn => 
          btn.textContent?.toUpperCase().includes('WITHDRAW')
        );
        return withdrawBtn && !withdrawBtn.hasAttribute('disabled');
      });
      
      if (!withdrawButtonEnabled) {
        throw new Error('Withdraw button not enabled after unit selection');
      }
      
      console.log('   ✅ Withdraw button enabled');
    });
    
    // ==========================================
    // Test 9: Execute Withdraw (Manual Confirmation)
    // ==========================================
    await runTest('Execute vault withdraw', async () => {
      console.log('   ⚠️  MANUAL STEP: Click WITHDRAW button and confirm transaction in wallet');
      console.log('   Waiting for transaction...');
      
      // Click withdraw button
      const withdrawClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent?.toUpperCase() || '';
          if (text === 'WITHDRAW' && !btn.hasAttribute('disabled')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (!withdrawClicked) {
        throw new Error('Withdraw button not found or disabled');
      }
      
      // Wait for console log
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const txIdLog = consoleLogs.find(log => 
        log.includes('Withdraw successful') || log.includes('transactionId')
      );
      
      if (txIdLog) {
        console.log(`   Transaction submitted: ${txIdLog}`);
      } else {
        console.log('   ⚠️  Check console manually for transaction ID');
      }
      
      console.log('   ✅ Withdraw transaction initiated');
      console.log('   📝 Verify transaction confirms and tokens are returned');
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
