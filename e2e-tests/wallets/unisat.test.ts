/**
 * UniSat Wallet E2E Tests
 *
 * Tests for UniSat wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/unisat.test.ts
 *
 * Requirements:
 *   - UniSat extension extracted to ~/.autochrome/extensions/unisat/
 *   - Wallet must be set up with a funded mainnet account
 *
 * Notes:
 *   - UniSat is a taproot-native wallet
 *   - Has built-in inscription support
 *   - Uses P2TR addresses by default
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class UnisatWalletTest extends BaseWalletTest {
  constructor() {
    super('unisat');
  }

  /**
   * UniSat connection approval flow
   *
   * When connecting, UniSat shows:
   * - Site URL and permissions
   * - "Connect" button
   */
  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[unisat] Handling connection approval...');

    // Wait for UniSat popup to load
    await popup.waitForSelector('button', { timeout: 10000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/unisat-connect-popup-${Date.now()}.png` });

    // UniSat typically shows a simple connect dialog
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
      console.log('[unisat] Clicked connect button');
    } else {
      // UniSat may have the connect button as the only prominent button
      await popup.click('button.primary, button.ant-btn-primary, button');
      console.log('[unisat] Clicked primary button');
    }

    // Wait for popup to close
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * UniSat transaction signing flow
   *
   * When signing PSBTs, UniSat shows:
   * - Transaction summary
   * - Input/output details
   * - "Sign" button
   */
  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[unisat] Handling transaction signing...');

    // Wait for signing dialog
    await popup.waitForSelector('button', { timeout: 30000 });

    // Take screenshot
    await popup.screenshot({ path: `screenshots/unisat-sign-popup-${Date.now()}.png` });

    // UniSat may show transaction details that need scrolling
    await popup.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Find sign button
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
      console.log('[unisat] Clicked sign button');
    } else {
      throw new Error('Could not find sign button');
    }

    // UniSat may require password/PIN - handle if present
    await new Promise(resolve => setTimeout(resolve, 1000));

    const passwordInput = await popup.$('input[type="password"]');
    if (passwordInput) {
      console.log('[unisat] Password required - this needs manual intervention or env var');
      // In automated tests, password would come from environment
      const password = process.env.UNISAT_PASSWORD;
      if (password) {
        await passwordInput.type(password);
        const confirmButton = await popup.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(b =>
            b.textContent?.toLowerCase().includes('confirm') ||
            b.textContent?.toLowerCase().includes('unlock')
          );
        });
        if (confirmButton) {
          await (confirmButton as any).click();
        }
      }
    }

    // Wait for signing to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * Check if UniSat is connected
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
  console.log('UniSat Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new UnisatWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { UnisatWalletTest };
