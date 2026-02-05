/**
 * Phantom Wallet E2E Tests
 *
 * Tests for Phantom wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/phantom.test.ts
 *
 * Requirements:
 *   - Phantom extension extracted to ~/.autochrome/extensions/phantom/
 *   - Wallet must be set up with a funded mainnet Bitcoin account
 *
 * Notes:
 *   - Phantom is a multi-chain wallet (Solana, Ethereum, Bitcoin, Polygon)
 *   - Bitcoin support was added later
 *   - Uses unified wallet interface across chains
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class PhantomWalletTest extends BaseWalletTest {
  constructor() {
    super('phantom');
  }

  /**
   * Phantom connection approval flow
   *
   * When connecting Bitcoin dApps, Phantom shows:
   * - Site information
   * - Requested chain (Bitcoin)
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[phantom] Handling connection approval...');

    // Wait for Phantom popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/phantom-connect-popup-${Date.now()}.png` });

    // Phantom has a clean UI with clear Connect button
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
      console.log('[phantom] Clicked connect button');
    } else {
      // Phantom typically has a prominent primary button
      const primaryButton = await popup.$('button[data-testid="primary-button"], button.primary');
      if (primaryButton) {
        await primaryButton.click();
        console.log('[phantom] Clicked primary button');
      } else {
        await popup.click('button');
        console.log('[phantom] Clicked first button');
      }
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Phantom transaction signing flow
   *
   * When signing Bitcoin transactions, Phantom shows:
   * - Transaction summary
   * - Recipient and amount
   * - Network fee
   * - "Approve" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[phantom] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/phantom-sign-popup-${Date.now()}.png` });

    // Phantom may show transaction details in a scrollable area
    await popup.evaluate(() => {
      const scrollable = document.querySelector('[data-testid="transaction-scroll"]') ||
                        document.querySelector('.transaction-details') ||
                        document.body;
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Find approve/sign button
    const signButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('approve') ||
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('sign')
      );
    });

    if (signButton) {
      await (signButton as any).click();
      console.log('[phantom] Clicked approve button');
    } else {
      // Try the primary action button
      const primaryButton = await popup.$('button[data-testid="primary-button"], button.primary');
      if (primaryButton) {
        await primaryButton.click();
        console.log('[phantom] Clicked primary button');
      } else {
        throw new Error('Could not find sign button');
      }
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if Phantom is connected
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
  console.log('Phantom Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new PhantomWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { PhantomWalletTest };
