/**
 * Debug Balance Test
 *
 * This test helps debug wallet balance issues by:
 * 1. Restoring wallet from test mnemonic
 * 2. Extracting the actual wallet address
 * 3. Checking if the address has UTXOs on the local regtest
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// Direct config for regtest
const TESTNET_CONFIG = {
  baseUrl: 'http://localhost:3000',
  browser: {
    headless: process.env.HEADLESS !== 'false',
  },
};

let browser: Browser;
let page: Page;

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

// Local regtest endpoints
const LOCAL_RPC = 'http://localhost:18888';
const LOCAL_ESPLORA = 'http://localhost:50010';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
  console.log('🔍 Debug Balance Test\n');

  browser = await puppeteer.launch({
    headless: TESTNET_CONFIG.browser.headless,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.createBrowserContext();
  page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Capture console logs - show errors and network-related messages
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error' || type === 'warn') {
      console.log(`  [Browser ${type}]: ${text}`);
    } else if (text.includes('address') || text.includes('utxo') || text.includes('balance') ||
               text.includes('CORS') || text.includes('fetch') || text.includes('Error')) {
      console.log(`  [Browser]: ${text}`);
    }
  });

  // Capture network request failures
  page.on('requestfailed', (request) => {
    console.log(`  [Network FAILED]: ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Log all network requests
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('localhost:50010') || url.includes('localhost:18888')) {
      console.log(`  [Network]: ${response.status()} ${url}`);
    }
  });
}

async function restoreWallet(): Promise<void> {
  console.log('📱 Step 1: Restoring wallet from test mnemonic...');

  await page.goto(`${TESTNET_CONFIG.baseUrl}`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  // Clear any existing keystore and session to ensure fresh wallet
  await page.evaluate(() => {
    const existingKeystore = localStorage.getItem('subfrost_encrypted_keystore');
    if (existingKeystore) {
      console.log('Clearing existing keystore...');
      localStorage.removeItem('subfrost_encrypted_keystore');
    }
    // Also clear session storage
    sessionStorage.removeItem('subfrost_session_mnemonic');
  });

  // Reload to apply cleared state
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);

  // Click "Connect Wallet" to open modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const connect = buttons.find(b =>
      b.textContent?.toUpperCase().includes('CONNECT') &&
      b.textContent?.toUpperCase().includes('WALLET')
    );
    if (connect) (connect as HTMLElement).click();
  });
  await sleep(1000);

  // Click "Restore from Mnemonic"
  console.log('   Clicking Restore from Mnemonic...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restore = buttons.find(b =>
      b.textContent?.includes('Restore from Mnemonic')
    );
    if (restore) {
      (restore as HTMLElement).click();
    }
  });
  await sleep(500);

  // Enter mnemonic in textarea
  const textarea = await page.$('textarea');
  if (textarea) {
    console.log('   Found textarea, entering mnemonic...');
    await textarea.type(TEST_MNEMONIC);
    await sleep(300);
  } else {
    console.log('   WARNING: No textarea found for mnemonic!');
  }

  // Enter password
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    console.log('   Found password input, entering password...');
    await passwordInput.type(TEST_PASSWORD);
    await sleep(300);
  } else {
    console.log('   WARNING: No password input found!');
  }

  // Click "Restore Wallet" button
  console.log('   Clicking Restore Wallet button...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const restoreBtn = buttons.find(b =>
      b.textContent?.includes('Restore Wallet')
    );
    if (restoreBtn) (restoreBtn as HTMLElement).click();
  });

  // Wait for wallet to restore
  await sleep(3000);
  console.log('   Wallet restored.');
}

async function getWalletAddress(): Promise<string | null> {
  console.log('\n🔑 Step 2: Extracting wallet address...');

  // Check localStorage for keystore
  const keystore = await page.evaluate(() => {
    const raw = localStorage.getItem('subfrost_encrypted_keystore');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          accountXpub: parsed.account_xpub,
          masterFingerprint: parsed.master_fingerprint,
          hdPaths: parsed.hd_paths,
        };
      } catch {
        return null;
      }
    }
    return null;
  });

  if (keystore) {
    console.log('   Keystore found:', JSON.stringify(keystore, null, 2));
  }

  // Look for address on page - check multiple patterns
  const addressInfo = await page.evaluate(() => {
    const pageText = document.body.textContent || '';

    // Find bcrt1 addresses (regtest native segwit)
    const bcrt1Match = pageText.match(/bcrt1[a-z0-9]{38,62}/gi);
    // Find tb1 addresses (testnet native segwit)
    const tb1Match = pageText.match(/tb1[a-z0-9]{38,62}/gi);
    // Find truncated addresses like "tb1p8k…3hl5"
    const truncatedMatch = pageText.match(/[tb](?:b1|crt1)?[a-z0-9]{2,6}…[a-z0-9]{2,6}/gi);

    return {
      bcrt1: bcrt1Match,
      tb1: tb1Match,
      truncated: truncatedMatch,
      // Also look for any hex-like strings that could be addresses
      pageSnippet: pageText.substring(0, 500),
    };
  });

  console.log('   Address patterns found:', JSON.stringify(addressInfo, null, 2));

  const address = addressInfo.bcrt1?.[0] || addressInfo.tb1?.[0] || null;

  if (address) {
    console.log(`   Using address: ${address}`);
  } else {
    console.log('   No full address found on page');
  }

  return address;
}

async function deriveAddressFromMnemonic(): Promise<void> {
  console.log('\n🔐 Step 2b: Extracting wallet addresses from app state...');

  // Get addresses from wallet context in browser
  const walletInfo = await page.evaluate(() => {
    // Look for any bcrt1 address patterns in the HTML (including hidden/data attributes)
    const pageHtml = document.body.innerHTML;
    const bcrt1qAddresses = pageHtml.match(/bcrt1q[a-z0-9]{38,42}/gi) || [];
    const bcrt1pAddresses = pageHtml.match(/bcrt1p[a-z0-9]{58,62}/gi) || [];

    // Check sessionStorage for session mnemonic
    const sessionMnemonic = sessionStorage.getItem('subfrost_session_mnemonic');

    // Check localStorage for keystore
    const keystore = localStorage.getItem('subfrost_encrypted_keystore');
    let keystoreData = null;
    if (keystore) {
      try {
        keystoreData = JSON.parse(keystore);
      } catch {}
    }

    return {
      bcrt1qAddresses: [...new Set(bcrt1qAddresses)],
      bcrt1pAddresses: [...new Set(bcrt1pAddresses)],
      hasSessionMnemonic: !!sessionMnemonic,
      masterFingerprint: keystoreData?.master_fingerprint,
      accountXpub: keystoreData?.account_xpub,
    };
  });

  console.log('   Wallet state:', JSON.stringify(walletInfo, null, 2));
  console.log('   Expected P2WPKH (bcrt1q): bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx');

  if (walletInfo.bcrt1qAddresses.length > 0) {
    console.log(`   ✅ App has P2WPKH addresses: ${walletInfo.bcrt1qAddresses.join(', ')}`);
    // Check if our funded address is in the list
    if (walletInfo.bcrt1qAddresses.includes('bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx')) {
      console.log('   ✅ Funded address matches app address!');
    } else {
      console.log('   ⚠️ App derives a DIFFERENT P2WPKH address than what we funded!');
      console.log('   Need to fund:', walletInfo.bcrt1qAddresses[0]);
    }
  } else {
    console.log('   ⚠️ No P2WPKH addresses found in HTML');
  }
}

async function checkBalanceViaEsplora(address: string): Promise<void> {
  console.log('\n💰 Step 3: Checking balance via Esplora API...');

  try {
    // Check address info
    const response = await fetch(`${LOCAL_ESPLORA}/address/${address}`);
    const data = await response.json();
    console.log('   Address info:', JSON.stringify(data, null, 2));

    // Check UTXOs
    const utxoResponse = await fetch(`${LOCAL_ESPLORA}/address/${address}/utxo`);
    const utxos = await utxoResponse.json();
    console.log(`   UTXOs found: ${utxos.length}`);

    if (utxos.length > 0) {
      const totalSats = utxos.reduce((sum: number, u: any) => sum + u.value, 0);
      console.log(`   Total balance: ${totalSats / 100000000} BTC`);
    }
  } catch (error) {
    console.error('   Error checking esplora:', error);
  }
}

async function checkKnownAddress(): Promise<void> {
  console.log('\n📍 Step 4: Checking known test address (bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx)...');

  const knownAddress = 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx';

  try {
    const utxoResponse = await fetch(`${LOCAL_ESPLORA}/address/${knownAddress}/utxo`);
    const utxos = await utxoResponse.json();
    console.log(`   UTXOs for known address: ${utxos.length}`);

    if (utxos.length > 0) {
      const totalSats = utxos.reduce((sum: number, u: any) => sum + u.value, 0);
      console.log(`   Total balance: ${totalSats / 100000000} BTC`);
    }
  } catch (error) {
    console.error('   Error:', error);
  }
}

async function checkAppBalance(): Promise<void> {
  console.log('\n📊 Step 5: Checking balance displayed in app...');

  // Check if wallet is connected on current page
  const beforeNavCheck = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasConnectButton = buttons.some(b =>
      b.textContent?.toLowerCase().includes('connect wallet')
    );
    const hasSession = !!sessionStorage.getItem('subfrost_session_mnemonic');

    // Try to extract the full wallet addresses from the page
    const pageHtml = document.body.innerHTML;
    const bcrt1qMatch = pageHtml.match(/bcrt1q[a-z0-9]{38,62}/gi);
    const bcrt1pMatch = pageHtml.match(/bcrt1p[a-z0-9]{58}/gi);

    return { isConnected: !hasConnectButton, hasSession, bcrt1qAddresses: bcrt1qMatch, bcrt1pAddresses: bcrt1pMatch };
  });

  console.log(`   Before navigation - Wallet connected: ${beforeNavCheck.isConnected}, Has session: ${beforeNavCheck.hasSession}`);
  console.log(`   P2WPKH addresses (bcrt1q): ${beforeNavCheck.bcrt1qAddresses}`);
  console.log(`   Taproot addresses (bcrt1p): ${beforeNavCheck.bcrt1pAddresses}`);

  // Navigate to /swap using page.goto (simulates full page refresh/navigation)
  console.log('   Navigating to /swap (full page navigation)...');
  await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Check if wallet is still connected after navigation
  const afterNavCheck = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasConnectButton = buttons.some(b =>
      b.textContent?.toLowerCase().includes('connect wallet')
    );
    const hasSession = !!sessionStorage.getItem('subfrost_session_mnemonic');
    return { isConnected: !hasConnectButton, hasSession };
  });

  console.log(`   After navigation - Wallet connected: ${afterNavCheck.isConnected}, Has session: ${afterNavCheck.hasSession}`);

  if (afterNavCheck.isConnected) {
    console.log('   ✅ Session persistence is working!');
  } else {
    console.log('   ❌ Session persistence NOT working - wallet disconnected after navigation');
  }

  // Test the balance fetching directly from Esplora (outside browser)
  console.log('\n   🔍 Testing balance fetch from Esplora...');

  // The SDK derives this address from the test mnemonic for BIP84 (P2WPKH)
  const expectedP2WPKHAddress = 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx';

  try {
    const esploraResponse = await fetch(`${LOCAL_ESPLORA}/address/${expectedP2WPKHAddress}/utxo`);
    const utxos = await esploraResponse.json();

    console.log(`   Expected P2WPKH address: ${expectedP2WPKHAddress}`);
    console.log(`   UTXOs from Esplora: ${utxos.length}`);

    if (utxos.length > 0) {
      const totalSats = utxos.reduce((sum: number, u: any) => sum + u.value, 0);
      console.log(`   Total balance: ${totalSats / 100000000} BTC (${totalSats} sats)`);
      console.log('   ✅ Funds ARE available at the expected address!');
      console.log('   Issue: App is not fetching from the correct address or provider is misconfigured');
    } else {
      console.log('   ❌ No UTXOs found - funds may not have been sent to this address');
    }
  } catch (error) {
    console.error('   Error checking Esplora:', error);
  }

  const balanceInfo = await page.evaluate(() => {
    const balanceEls = document.querySelectorAll('[class*="balance"], [data-balance], span, div');
    const results: string[] = [];

    for (const el of balanceEls) {
      const text = el.textContent || '';
      if (text.match(/\d+\.?\d*\s*(BTC|SAT|frBTC)/i)) {
        results.push(text.trim());
      }
    }

    return {
      found: results,
      pageText: document.body.textContent?.substring(0, 1000),
    };
  });

  console.log('   Balance elements found:', balanceInfo.found);

  // Take a screenshot
  await page.screenshot({ path: './e2e/screenshots/debug-balance.png', fullPage: true });
  console.log('   Screenshot saved to ./e2e/screenshots/debug-balance.png');
}

async function main() {
  try {
    await setup();
    await restoreWallet();
    const address = await getWalletAddress();

    // Check what address the SDK derives from the mnemonic
    await deriveAddressFromMnemonic();

    if (address) {
      await checkBalanceViaEsplora(address);
    }

    await checkKnownAddress();
    await checkAppBalance();

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main();
