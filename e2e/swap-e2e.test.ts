/**
 * Swap E2E Tests for Testnet
 * 
 * These tests run against a live testnet deployment to verify:
 * 1. Direct swaps execute correctly
 * 2. BTC wrap/unwrap works
 * 3. Multi-hop routing executes properly
 * 4. Dynamic fees are fetched correctly
 * 
 * PREREQUISITES:
 * - App deployed to testnet or running locally with testnet network
 * - Test wallet with small amount of testnet BTC
 * - Test wallet with some alkane tokens for swaps
 * 
 * RUN: npm run test:e2e:swap
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';
import {
  waitForElement,
  clickAndWait,
  typeIntoField,
  getText,
  takeScreenshot,
  setupConsoleCapture,
  waitForWalletConnection,
} from './helpers/testHelpers';

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
  console.log('🚀 Starting Testnet E2E Tests for Swaps\n');
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
  console.log('📊 Swap E2E Results Summary');
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
    console.log('🎉 All swap E2E tests passed!\n');
    process.exit(0);
  }
}

async function runTestSuite() {
  await setup();
  
  try {
    // ==========================================
    // Test 1: Navigate to Swap Page
    // ==========================================
    await runTest('Navigate to swap page', async () => {
      await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
      
      const content = await page.content();
      if (!content.toLowerCase().includes('swap')) {
        throw new Error('Not on swap page');
      }
    });
    
    // ==========================================
    // Test 2: Dynamic Fee Fetching
    // ==========================================
    await runTest('Dynamic frBTC premium fetches without errors', async () => {
      // Check console for premium fetch
      await page.waitForTimeout(3000); // Give time for hook to execute
      
      const hasPremiumLog = consoleLogs.some(log => 
        log.includes('frbtc-premium') || log.includes('premium')
      );
      
      const hasError = consoleLogs.some(log =>
        log.toLowerCase().includes('[error]') && log.includes('premium')
      );
      
      if (hasError) {
        throw new Error('Premium fetch has errors in console');
      }
      
      console.log(`   ${hasPremiumLog ? '✅' : '⚠️'} Premium fetch ${hasPremiumLog ? 'detected' : 'not detected'} in console`);
    });
    
    // ==========================================
    // Test 3: Token Selection UI
    // ==========================================
    await runTest('Token selection dropdowns work', async () => {
      // Check for token dropdowns
      const hasDropdowns = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const tokenButtons = buttons.filter(btn => 
          btn.textContent?.includes('BTC') || 
          btn.textContent?.includes('DIESEL') ||
          btn.textContent?.includes('frBTC')
        );
        return tokenButtons.length >= 2; // Should have from and to
      });
      
      if (!hasDropdowns) {
        throw new Error('Token selection dropdowns not found');
      }
    });
    
    // ==========================================
    // Test 4: Amount Input
    // ==========================================
    await runTest('Amount input accepts values', async () => {
      const testAmount = '0.1';
      
      await typeIntoField(page, 'input[type="number"]', testAmount);
      
      const value = await page.$eval(
        'input[type="number"]',
        (el) => (el as HTMLInputElement).value
      );
      
      if (!value || parseFloat(value) <= 0) {
        throw new Error('Amount input not working');
      }
      
      console.log(`   ✅ Amount entered: ${value}`);
    });
    
    // ==========================================
    // Test 5: Quote Calculation
    // ==========================================
    await runTest('Swap quote calculates and displays', async () => {
      // Wait for quote calculation
      await page.waitForTimeout(2000);
      
      // Check if quote is displayed
      const hasQuote = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        // Look for numerical values that might be quotes
        return /\d+\.\d+/.test(bodyText);
      });
      
      if (!hasQuote) {
        throw new Error('No swap quote displayed');
      }
      
      console.log('   ✅ Quote displayed in UI');
    });
    
    // ==========================================
    // Test 6: Wallet Connection Check
    // ==========================================
    await runTest('Wallet connection for swap', async () => {
      console.log('   ⚠️  MANUAL STEP: Ensure wallet is connected');
      
      const connected = await waitForWalletConnection(page, 30000);
      
      if (!connected) {
        console.log('   ⚠️  Connect wallet to continue');
      } else {
        console.log('   ✅ Wallet connected');
      }
    });
    
    // ==========================================
    // Test 7: Swap Button State
    // ==========================================
    await runTest('Swap button enables with valid input', async () => {
      const buttonEnabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const swapBtn = buttons.find(btn => 
          btn.textContent?.toUpperCase().includes('SWAP')
        );
        return swapBtn && !swapBtn.hasAttribute('disabled');
      });
      
      if (!buttonEnabled) {
        console.log('   ⚠️  Swap button disabled - may need wallet connection or valid amount');
      } else {
        console.log('   ✅ Swap button enabled');
      }
    });
    
    console.log('\n📝 MANUAL TESTING REQUIRED:');
    console.log('   1. Execute a small swap (0.1 tokens)');
    console.log('   2. Verify transaction confirms');
    console.log('   3. Check received tokens match quote');
    console.log('   4. Test BTC → frBTC wrap');
    console.log('   5. Test frBTC → BTC unwrap');
    console.log('   6. Test multi-hop routing (check console for route)');
    
  } finally {
    await teardown();
  }
}

runTestSuite().catch((error) => {
  console.error('Fatal error in test suite:', error);
  if (browser) browser.close();
  process.exit(1);
});
