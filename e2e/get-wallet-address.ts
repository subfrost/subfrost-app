/**
 * Get wallet address from test mnemonic
 *
 * This script derives the wallet addresses from the standard test mnemonic
 * using the same derivation paths as the app.
 */

import puppeteer from 'puppeteer';
import { TESTNET_CONFIG } from './testnet.config';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'TestPassword123!';

async function getWalletAddress() {
  console.log('🔑 Deriving wallet address from test mnemonic...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Capture console logs
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('address') || text.includes('Address')) {
      console.log(`[CONSOLE] ${text}`);
    }
  });

  try {
    // Navigate and clear storage
    await page.goto(TESTNET_CONFIG.baseUrl, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Open wallet modal
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const connectBtn = buttons.find(b => {
        const text = b.textContent?.toUpperCase() || '';
        return text.includes('CONNECT') && text.includes('WALLET');
      });
      connectBtn?.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Click restore
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const restoreBtn = buttons.find(b => b.textContent?.includes('Restore from Mnemonic'));
      restoreBtn?.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Enter mnemonic
    const textarea = await page.$('textarea');
    if (textarea) await textarea.type(TEST_MNEMONIC);

    // Enter password
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) await passwordInput.type(TEST_PASSWORD);

    // Click restore
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const restoreBtn = buttons.find(b => b.textContent?.includes('Restore Wallet'));
      restoreBtn?.click();
    });

    // Wait for wallet to restore
    await new Promise(r => setTimeout(r, 5000));

    // Try to extract the address from keystore
    const keystoreData = await page.evaluate(() => {
      const keystoreStr = localStorage.getItem('subfrost_encrypted_keystore');
      if (!keystoreStr) return null;

      try {
        const keystore = JSON.parse(keystoreStr);
        return {
          hdPaths: keystore.hd_paths,
          accountXpub: keystore.account_xpub,
          masterFingerprint: keystore.master_fingerprint,
        };
      } catch (e) {
        return null;
      }
    });

    console.log('Keystore data:', keystoreData);

    // Navigate to swap to see if address is displayed somewhere
    await page.goto(`${TESTNET_CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Try to find address in the page
    const pageContent = await page.evaluate(() => {
      const pageText = document.body.textContent || '';

      // Look for address patterns
      const bcrtMatch = pageText.match(/bcrt1[a-z0-9]{20,60}/gi);
      const tb1Match = pageText.match(/tb1[a-z0-9]{20,60}/gi);

      // Look for truncated addresses
      const truncatedMatch = pageText.match(/[a-z0-9]{4,8}\.\.\.[a-z0-9]{4,8}/gi);

      return {
        bcrtAddresses: bcrtMatch,
        tb1Addresses: tb1Match,
        truncatedAddresses: truncatedMatch,
      };
    });

    console.log('\nAddresses found on page:', pageContent);

    // Click on wallet button to see full address
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const walletBtn = buttons.find(b => {
        const text = b.textContent || '';
        return text.includes('...') && (text.includes('bcrt') || text.includes('tb1'));
      });
      if (walletBtn) {
        console.log('Found wallet button:', walletBtn.textContent);
        walletBtn.click();
      }
    });

    await new Promise(r => setTimeout(r, 1000));

    // Take a screenshot
    await page.screenshot({ path: './e2e/screenshots/wallet-address.png', fullPage: true });
    console.log('\nScreenshot saved to ./e2e/screenshots/wallet-address.png');

    // Keep browser open for manual inspection
    console.log('\n📸 Browser is open for inspection. Check the address in the UI.');
    console.log('Press Ctrl+C to close when done.\n');

    // Wait indefinitely (user can Ctrl+C)
    await new Promise(r => setTimeout(r, 60000));

  } finally {
    await browser.close();
  }
}

getWalletAddress().catch(console.error);
