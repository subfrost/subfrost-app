/**
 * Leather Wallet E2E Tests
 *
 * Tests for Leather (formerly Hiro) wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/leather.test.ts
 *
 * Requirements:
 *   - Leather extension extracted to ~/.autochrome/extensions/leather/
 *   - Wallet must be set up with a funded mainnet account
 *
 * Notes:
 *   - Leather is a dual-address wallet (taproot + segwit)
 *   - Similar to Xverse in connection flow
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class LeatherWalletTest extends BaseWalletTest {
  constructor() {
    super('leather');
  }

  /**
   * Leather connection approval flow
   *
   * When connecting, Leather shows a popup with:
   * - Site information and permissions requested
   * - Account selection (if multiple accounts)
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[leather] Handling connection approval...');

    // Wait for Leather popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot of approval dialog
    await popup.screenshot({ path: `screenshots/leather-connect-popup-${Date.now()}.png` });

    // Leather may have account selection step first
    const selectAllAccounts = await popup.evaluateHandle(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      return checkboxes[0]; // Select first/all accounts
    });

    if (selectAllAccounts) {
      try {
        await (selectAllAccounts as any).click();
        console.log('[leather] Selected accounts');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        // May not have account selection
      }
    }

    // Find and click the connect/approve button
    const connectButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('connect') ||
        b.textContent?.toLowerCase().includes('approve') ||
        b.textContent?.toLowerCase().includes('allow')
      );
    });

    if (connectButton) {
      await (connectButton as any).click();
      console.log('[leather] Clicked connect button');
    } else {
      // Try clicking the primary/last button (often the approve action)
      const buttons = await popup.$$('button');
      if (buttons.length > 0) {
        await buttons[buttons.length - 1].click();
        console.log('[leather] Clicked last button');
      }
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Leather transaction signing flow
   *
   * When signing, Leather shows:
   * - Transaction details with inputs/outputs
   * - Fee information
   * - "Confirm" or "Sign" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[leather] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/leather-sign-popup-${Date.now()}.png` });

    // Leather may require scrolling to see full transaction details
    await popup.evaluate(() => {
      const scrollable = document.querySelector('[data-testid="transaction-details"]') ||
                        document.querySelector('.transaction-details') ||
                        document.body;
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Find the sign/confirm button
    const signButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('sign') ||
        b.textContent?.toLowerCase().includes('approve') ||
        b.textContent?.toLowerCase().includes('broadcast')
      );
    });

    if (signButton) {
      await (signButton as any).click();
      console.log('[leather] Clicked sign button');
    } else {
      throw new Error('Could not find sign button');
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if Leather is connected
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
  console.log('Leather Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new LeatherWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { LeatherWalletTest };
