/**
 * OKX Wallet E2E Tests
 *
 * Tests for OKX wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/okx.test.ts
 *
 * Requirements:
 *   - OKX extension extracted to ~/.autochrome/extensions/okx/
 *   - Wallet must be set up with a funded mainnet Bitcoin account
 *
 * Notes:
 *   - OKX is a multi-chain wallet with deep DeFi integration
 *   - Bitcoin support includes BRC-20 and ordinals
 *   - Has both native segwit and taproot addresses
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class OKXWalletTest extends BaseWalletTest {
  constructor() {
    super('okx');
  }

  /**
   * OKX connection approval flow
   *
   * When connecting, OKX shows:
   * - Site URL and name
   * - Requested permissions
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[okx] Handling connection approval...');

    // Wait for OKX popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/okx-connect-popup-${Date.now()}.png` });

    // OKX may show network/chain selection
    const chainSelector = await popup.$('[data-testid="chain-selector"], .chain-select');
    if (chainSelector) {
      console.log('[okx] Chain selector found - ensuring Bitcoin is selected');
      // Click to ensure Bitcoin chain is selected if needed
    }

    // Find connect button
    const connectButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('connect') ||
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('approve')
      );
    });

    if (connectButton) {
      await (connectButton as any).click();
      console.log('[okx] Clicked connect button');
    } else {
      // OKX typically has a styled primary button
      const primaryButton = await popup.$('button.okx-btn-primary, button[class*="primary"]');
      if (primaryButton) {
        await primaryButton.click();
        console.log('[okx] Clicked primary button');
      } else {
        await popup.click('button');
        console.log('[okx] Clicked first button');
      }
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * OKX transaction signing flow
   *
   * When signing PSBTs, OKX shows:
   * - Transaction type and details
   * - Input/output breakdown
   * - Fee information
   * - "Confirm" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[okx] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/okx-sign-popup-${Date.now()}.png` });

    // OKX may show detailed transaction breakdown
    await popup.evaluate(() => {
      const expandButtons = document.querySelectorAll('[class*="expand"], [class*="details"]');
      expandButtons.forEach(btn => {
        try {
          (btn as HTMLElement).click();
        } catch {
          // May not be clickable
        }
      });
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Scroll to bottom
    await popup.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Find confirm/sign button
    const signButton = await popup.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b =>
        b.textContent?.toLowerCase().includes('confirm') ||
        b.textContent?.toLowerCase().includes('sign') ||
        b.textContent?.toLowerCase().includes('approve')
      );
    });

    if (signButton) {
      await (signButton as any).click();
      console.log('[okx] Clicked confirm button');
    } else {
      throw new Error('Could not find sign button');
    }

    // OKX may require password verification
    await new Promise(resolve => setTimeout(resolve, 1000));

    const passwordInput = await popup.$('input[type="password"]');
    if (passwordInput) {
      console.log('[okx] Password required - checking for env var');
      const password = process.env.OKX_PASSWORD;
      if (password) {
        await passwordInput.type(password);
        const confirmButton = await popup.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(b =>
            b.textContent?.toLowerCase().includes('confirm') ||
            b.textContent?.toLowerCase().includes('verify')
          );
        });
        if (confirmButton) {
          await (confirmButton as any).click();
        }
      } else {
        console.warn('[okx] No password provided - signing may fail');
      }
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if OKX wallet is connected
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
  console.log('OKX Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new OKXWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { OKXWalletTest };
