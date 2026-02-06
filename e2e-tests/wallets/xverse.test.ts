/**
 * Xverse Wallet E2E Tests
 *
 * Tests for Xverse wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/xverse.test.ts
 *
 * Requirements:
 *   - Xverse extension extracted to ~/.autochrome/extensions/xverse/
 *   - Wallet must be set up with a funded mainnet account
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class XverseWalletTest extends BaseWalletTest {
  constructor() {
    super('xverse');
  }

  /**
   * Xverse connection approval flow
   *
   * When connecting, Xverse shows a popup with:
   * - Site information
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[xverse] Handling connection approval...');

    // Wait for Xverse popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot of approval dialog
    await popup.screenshot({ path: `screenshots/xverse-connect-popup-${Date.now()}.png` });

    // Find and click the connect/approve button
    // Xverse typically has a "Connect" or "Approve" button
    const connectButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('connect') ||
        b.textContent?.toLowerCase().includes('approve')
      );
    });

    if (connectButton) {
      await (connectButton as any).click();
      console.log('[xverse] Clicked connect button');
    } else {
      // Try clicking the first visible button
      await popup.click('button');
      console.log('[xverse] Clicked first button');
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Xverse transaction signing flow
   *
   * When signing, Xverse shows:
   * - Transaction details
   * - Fee information
   * - "Sign" or "Confirm" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[xverse] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/xverse-sign-popup-${Date.now()}.png` });

    // Find the sign/confirm button
    const signButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('sign') ||
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('approve')
      );
    });

    if (signButton) {
      await (signButton as any).click();
      console.log('[xverse] Clicked sign button');
    } else {
      throw new Error('Could not find sign button');
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if Xverse is connected
   */
  async isConnected(): Promise<boolean> {
    if (!this.context?.page) return false;

    try {
      await this.context.page.waitForSelector(SELECTORS.walletAddress, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Run tests if executed directly
async function main() {
  console.log('='.repeat(60));
  console.log('Xverse Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  // Create screenshots directory
  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new XverseWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { XverseWalletTest };
