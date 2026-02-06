/**
 * Magic Eden Wallet E2E Tests
 *
 * Tests for Magic Eden wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/magiceden.test.ts
 *
 * Requirements:
 *   - Magic Eden extension extracted to ~/.autochrome/extensions/magiceden/
 *   - Wallet must be set up with a funded mainnet account
 *
 * Notes:
 *   - Magic Eden wallet uses Sats Connect protocol
 *   - Multi-chain support (Bitcoin, Solana, etc.)
 *   - Can derive multiple address types
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class MagicEdenWalletTest extends BaseWalletTest {
  constructor() {
    super('magiceden');
  }

  /**
   * Magic Eden connection approval flow
   *
   * Uses Sats Connect protocol which shows:
   * - Site information
   * - Requested permissions/addresses
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[magiceden] Handling connection approval...');

    // Wait for popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/magiceden-connect-popup-${Date.now()}.png` });

    // Magic Eden may show address type selection
    const addressTypeCheckboxes = await popup.$$('input[type="checkbox"]');
    if (addressTypeCheckboxes.length > 0) {
      console.log('[magiceden] Found address type selection');
      // Select all address types for full compatibility
      for (const checkbox of addressTypeCheckboxes) {
        try {
          const isChecked = await checkbox.evaluate((el: HTMLInputElement) => el.checked);
          if (!isChecked) {
            await checkbox.click();
          }
        } catch {
          // Checkbox may not be interactive
        }
      }
    }

    // Find and click connect button
    const connectButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('connect') ||
        b.textContent?.toLowerCase().includes('approve') ||
        b.textContent?.toLowerCase().includes('confirm')
      );
    });

    if (connectButton) {
      await (connectButton as any).click();
      console.log('[magiceden] Clicked connect button');
    } else {
      // Try primary button
      await popup.click('button[class*="primary"], button');
      console.log('[magiceden] Clicked primary button');
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Magic Eden transaction signing flow
   *
   * Sats Connect signing shows:
   * - Transaction details
   * - Fee breakdown
   * - "Sign" or "Confirm" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[magiceden] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/magiceden-sign-popup-${Date.now()}.png` });

    // Scroll to see full transaction
    await popup.evaluate(() => {
      const container = document.querySelector('[class*="scroll"]') || document.body;
      container.scrollTop = container.scrollHeight;
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Find sign button
    const signButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('sign') ||
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('approve') ||
        b.textContent?.toLowerCase().includes('broadcast')
      );
    });

    if (signButton) {
      await (signButton as any).click();
      console.log('[magiceden] Clicked sign button');
    } else {
      throw new Error('Could not find sign button');
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if Magic Eden wallet is connected
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
  console.log('Magic Eden Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new MagicEdenWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { MagicEdenWalletTest };
