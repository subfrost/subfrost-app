/**
 * Live Swap Test on Regtest
 *
 * This test executes a REAL swap transaction on the hosted regtest
 * (regtest.subfrost.io) to verify end-to-end functionality including:
 * 1. Wallet connection
 * 2. UTXO detection
 * 3. Quote calculation
 * 4. Transaction building
 * 5. Signing
 * 6. Broadcasting
 *
 * The hosted regtest has deployed contracts and can be funded via faucet.
 *
 * RUN: HEADLESS=false TEST_BASE_URL=http://localhost:3001 npx tsx e2e/live-swap.test.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';

let browser: Browser;
let page: Page;

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

// Local regtest uses bcrt1 prefix for addresses
const REGTEST_RPC = 'http://localhost:18888';
const REGTEST_API = 'http://localhost:4000';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
  console.log('🚀 Live Swap Test on Regtest\n');
  console.log('This test will execute a REAL swap transaction.\n');

  browser = await puppeteer.launch({
    headless: TESTNET_CONFIG.browser.headless,
    slowMo: 50, // Slow down for visibility
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.createBrowserContext();
  page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Capture all console logs
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.log(`  [ERROR] ${text}`);
    } else if (text.includes('tx') || text.includes('sign') || text.includes('broadcast')) {
      console.log(`  [LOG] ${text}`);
    }
  });
}

async function teardown() {
  if (browser) await browser.close();
}

async function restoreWallet(): Promise<string | null> {
  console.log('\n📱 Step 1: Restoring test wallet...');

  await page.goto(TESTNET_CONFIG.baseUrl, { waitUntil: 'networkidle2' });

  // Clear any existing wallet
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);

  // Open wallet modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const connectBtn = buttons.find(b => {
      const text = b.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    connectBtn?.click();
  });
  await sleep(500);

  // Click restore
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
  }

  // Enter password
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    await passwordInput.type(TEST_PASSWORD);
  }

  // Click restore button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b => b.textContent?.includes('Restore Wallet'));
    restoreBtn?.click();
  });

  // Wait for wallet to restore
  await sleep(5000);

  // Get the wallet address from the UI
  const address = await page.evaluate(() => {
    const pageText = document.body.textContent || '';
    // Look for address patterns
    const bcrtMatch = pageText.match(/bcrt1[a-z0-9]{20,60}/i);
    const tb1Match = pageText.match(/tb1[a-z0-9]{20,60}/i);
    return bcrtMatch?.[0] || tb1Match?.[0] || null;
  });

  // Also try to get the full address from somewhere
  const fullAddress = await page.evaluate(() => {
    // Check if there's a copy button or address display
    const addressEl = document.querySelector('[data-address], .wallet-address, [class*="address"]');
    return addressEl?.textContent?.trim() || null;
  });

  console.log(`   Wallet restored. Address preview: ${address || 'hidden'}`);

  return address || fullAddress;
}

async function checkBalance(): Promise<{ btc: number; frbtc: number }> {
  console.log('\n💰 Step 2: Checking wallet balance...');

  await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  const balances = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Try to find balance display
    // Look for patterns like "Balance: 0.001" or "You have 0.5"
    const btcMatch = pageText.match(/(?:balance|have)[:\s]*(\d+\.?\d*)\s*BTC/i);
    const frbtcMatch = pageText.match(/(?:balance|have)[:\s]*(\d+\.?\d*)\s*frBTC/i);

    return {
      btc: btcMatch ? parseFloat(btcMatch[1]) : 0,
      frbtc: frbtcMatch ? parseFloat(frbtcMatch[1]) : 0,
      rawText: pageText.substring(0, 500)
    };
  });

  console.log(`   BTC balance: ${balances.btc}`);
  console.log(`   frBTC balance: ${balances.frbtc}`);

  return { btc: balances.btc, frbtc: balances.frbtc };
}

async function fundWalletViaFaucet(address: string): Promise<boolean> {
  console.log('\n🚰 Step 3: Attempting to fund wallet...');
  console.log(`   Target address: ${address}`);

  // Try to call a regtest faucet endpoint
  const faucetResult = await page.evaluate(async (addr) => {
    // Try the Sandshrew/Subfrost regtest faucet if available
    const endpoints = [
      'https://regtest.subfrost.io/v4/api/faucet',
      'https://ladder-chain-sieve.sandshrew.io/v4/faucet',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr, amount: 10000 }), // 10000 sats
        });

        if (response.ok) {
          const data = await response.json();
          return { success: true, endpoint, data };
        }
      } catch (e) {
        continue;
      }
    }

    // Try JSON-RPC method if faucet not available
    try {
      const response = await fetch('https://regtest.subfrost.io/v4/jsonrpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'generatetoaddress', // Bitcoin Core RPC method
          params: [1, addr] // Generate 1 block to address
        }),
      });
      const data = await response.json();
      if (data.result) {
        return { success: true, method: 'generatetoaddress', data };
      }
    } catch (e) {
      // RPC method not available
    }

    return { success: false, error: 'No faucet available' };
  }, address);

  if (faucetResult.success) {
    console.log(`   ✅ Funded via ${faucetResult.endpoint || faucetResult.method}`);
    await sleep(5000); // Wait for confirmation
    return true;
  } else {
    console.log(`   ⚠️ Faucet not available: ${faucetResult.error}`);
    console.log(`   Will check if wallet already has funds...`);
    return false;
  }
}

async function getQuote(): Promise<{ sellAmount: string; buyAmount: string; hasQuote: boolean }> {
  console.log('\n📊 Step 4: Getting swap quote...');

  await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Enter a small amount
  const result = await page.evaluate(async () => {
    // Find amount input
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[inputmode="decimal"]');
    let inputFound = false;

    for (const input of Array.from(inputs)) {
      const inp = input as HTMLInputElement;
      if (!inp.disabled && (inp.placeholder?.includes('0') || inp.value === '' || inp.value === '0')) {
        inp.focus();
        inp.value = '0.0001';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inputFound = true;
        break;
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    const pageText = document.body.textContent || '';

    // Look for quote output
    const hasRate = pageText.includes('Rate') || pageText.includes('≈');
    const hasNumbers = /\d+\.\d+/.test(pageText);

    // Try to extract amounts
    const sellMatch = pageText.match(/sell[:\s]*(\d+\.?\d*)/i);
    const buyMatch = pageText.match(/receive[:\s]*(\d+\.?\d*)/i);

    return {
      inputFound,
      hasRate,
      hasNumbers,
      sellAmount: sellMatch?.[1] || '0.0001',
      buyAmount: buyMatch?.[1] || 'unknown'
    };
  });

  console.log(`   Quote received: ${result.hasRate ? 'Yes' : 'No'}`);
  console.log(`   Sell: ${result.sellAmount} BTC`);
  console.log(`   Buy: ${result.buyAmount} frBTC (estimated)`);

  return {
    sellAmount: result.sellAmount,
    buyAmount: result.buyAmount,
    hasQuote: result.hasRate
  };
}

async function executeSwap(): Promise<{ success: boolean; txId?: string; error?: string }> {
  console.log('\n🔄 Step 5: Executing swap...');

  // Make sure we're on swap page with amount entered
  await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // Enter amount
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[inputmode="decimal"]');
    for (const input of Array.from(inputs)) {
      const inp = input as HTMLInputElement;
      if (!inp.disabled) {
        inp.focus();
        inp.value = '0.00001'; // Very small amount
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });

  await sleep(3000);

  // Check if swap button is enabled
  const buttonState = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const swapButton = buttons.find(b => {
      const text = b.textContent?.toLowerCase() || '';
      return text.includes('swap') || text.includes('exchange');
    });

    return {
      found: !!swapButton,
      text: swapButton?.textContent || '',
      disabled: swapButton?.disabled || false
    };
  });

  console.log(`   Swap button: "${buttonState.text}", disabled: ${buttonState.disabled}`);

  if (!buttonState.found) {
    return { success: false, error: 'Swap button not found' };
  }

  if (buttonState.disabled) {
    // Check why it's disabled
    const reason = await page.evaluate(() => {
      const pageText = document.body.textContent?.toLowerCase() || '';
      if (pageText.includes('insufficient')) return 'Insufficient balance';
      if (pageText.includes('enter amount')) return 'No amount entered';
      if (pageText.includes('connect')) return 'Wallet not connected';
      if (pageText.includes('loading')) return 'Still loading';
      return 'Unknown reason';
    });
    return { success: false, error: `Swap disabled: ${reason}` };
  }

  // Click the swap button
  console.log('   Clicking swap button...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const swapButton = buttons.find(b => {
      const text = b.textContent?.toLowerCase() || '';
      return text.includes('swap') || text.includes('exchange');
    });
    swapButton?.click();
  });

  // Wait for confirmation modal or transaction
  await sleep(3000);

  // Check for password prompt (unlock wallet)
  const needsPassword = await page.evaluate(() => {
    const pageText = document.body.textContent || '';
    return pageText.includes('password') || pageText.includes('Password') ||
           document.querySelector('input[type="password"]') !== null;
  });

  if (needsPassword) {
    console.log('   Entering wallet password...');
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.type(TEST_PASSWORD);

      // Click confirm/unlock button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => {
          const text = b.textContent?.toLowerCase() || '';
          return text.includes('confirm') || text.includes('unlock') || text.includes('sign');
        });
        confirmBtn?.click();
      });

      await sleep(5000);
    }
  }

  // Check for transaction result
  const txResult = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Look for success indicators
    const hasSuccess = pageText.toLowerCase().includes('success') ||
                      pageText.toLowerCase().includes('confirmed') ||
                      pageText.toLowerCase().includes('submitted');

    // Look for transaction ID
    const txIdMatch = pageText.match(/[a-f0-9]{64}/i);

    // Look for error
    const hasError = pageText.toLowerCase().includes('failed') ||
                    pageText.toLowerCase().includes('error') ||
                    pageText.toLowerCase().includes('rejected');

    return {
      hasSuccess,
      txId: txIdMatch?.[0] || null,
      hasError,
      snippet: pageText.substring(0, 300)
    };
  });

  if (txResult.hasSuccess || txResult.txId) {
    console.log(`   ✅ Transaction submitted!`);
    if (txResult.txId) {
      console.log(`   Transaction ID: ${txResult.txId}`);
    }
    return { success: true, txId: txResult.txId || undefined };
  }

  if (txResult.hasError) {
    console.log(`   ❌ Transaction failed`);
    return { success: false, error: 'Transaction failed' };
  }

  // May still be processing
  console.log(`   ⏳ Transaction status unclear`);
  console.log(`   Page snippet: ${txResult.snippet.substring(0, 100)}...`);

  return { success: false, error: 'Transaction status unknown' };
}

async function verifyTransaction(txId: string): Promise<boolean> {
  console.log(`\n🔍 Step 6: Verifying transaction ${txId.substring(0, 16)}...`);

  // Query the transaction from the indexer
  const verification = await page.evaluate(async (txid) => {
    try {
      const response = await fetch('https://regtest.subfrost.io/v4/jsonrpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'esplora_tx',
          params: [txid]
        }),
      });
      const data = await response.json();
      return {
        found: !!data.result,
        confirmed: data.result?.status?.confirmed || false,
        data: data.result
      };
    } catch (e) {
      return { found: false, error: (e as Error).message };
    }
  }, txId);

  if (verification.found) {
    console.log(`   ✅ Transaction found on chain`);
    console.log(`   Confirmed: ${verification.confirmed}`);
    return true;
  } else {
    console.log(`   ⏳ Transaction not yet indexed (may be in mempool)`);
    return false;
  }
}

async function runLiveSwapTest() {
  await setup();

  try {
    // Step 1: Restore wallet
    const address = await restoreWallet();
    if (!address) {
      console.log('\n⚠️ Could not get wallet address from UI');
      console.log('   The wallet may be connected but address is not displayed prominently.');
    }

    // Step 2: Check balance
    const balance = await checkBalance();

    // Step 3: Fund wallet if needed
    if (balance.btc === 0 && address) {
      await fundWalletViaFaucet(address);
      // Recheck balance
      await sleep(2000);
      await checkBalance();
    }

    // Step 4: Get quote
    const quote = await getQuote();

    // Step 5: Execute swap
    const swapResult = await executeSwap();

    // Step 6: Verify if we got a txId
    if (swapResult.txId) {
      await verifyTransaction(swapResult.txId);
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 Live Swap Test Summary');
    console.log('═'.repeat(50));
    console.log(`Wallet address: ${address || 'not extracted'}`);
    console.log(`Initial BTC balance: ${balance.btc}`);
    console.log(`Quote obtained: ${quote.hasQuote ? 'Yes' : 'No'}`);
    console.log(`Swap executed: ${swapResult.success ? '✅ Success' : `❌ ${swapResult.error}`}`);
    if (swapResult.txId) {
      console.log(`Transaction ID: ${swapResult.txId}`);
    }
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  } finally {
    await teardown();
  }
}

runLiveSwapTest().catch(console.error);
