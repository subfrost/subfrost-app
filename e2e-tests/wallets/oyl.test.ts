/**
 * OYL Wallet E2E Tests
 *
 * Tests for OYL wallet integration on staging-app.subfrost.io
 *
 * Run with:
 *   npx tsx e2e-tests/wallets/oyl.test.ts
 */

import { BaseWalletTest } from './base-wallet.test.js';
import { SELECTORS } from '../config.js';

class OYLWalletTest extends BaseWalletTest {
  constructor() {
    super('oyl');
  }

  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[oyl] Handling connection approval...');

    await popup.waitForSelector('button', { timeout: 10000 });
    await popup.screenshot({ path: `screenshots/oyl-connect-popup-${Date.now()}.png` });

    // OYL typically has "Connect" button
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
      console.log('[oyl] Clicked connect button');
    } else {
      await popup.click('button');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    if (!popup) throw new Error('No wallet popup');

    console.log('[oyl] Handling transaction signing...');

    await popup.waitForSelector('button', { timeout: 30000 });
    await popup.screenshot({ path: `screenshots/oyl-sign-popup-${Date.now()}.png` });

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
      console.log('[oyl] Clicked sign button');
    } else {
      throw new Error('Could not find sign button');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

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

async function main() {
  console.log('='.repeat(60));
  console.log('OYL Wallet E2E Tests');
  console.log(`Target: staging-app.subfrost.io`);
  console.log('='.repeat(60));

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const test = new OYLWalletTest();
  const results = await test.runAllTests();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

export { OYLWalletTest };
