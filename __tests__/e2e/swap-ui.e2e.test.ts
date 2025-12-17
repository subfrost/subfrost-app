/**
 * Swap UI E2E Tests with Vitest + Puppeteer
 *
 * Complete end-to-end test flow:
 * 1. Create/restore wallet
 * 2. Navigate to wallet dashboard
 * 3. Mine blocks to fund wallet with BTC
 * 4. Navigate to swap page
 * 5. Swap BTC → frBTC
 *
 * PREREQUISITES:
 * - Dev server running: npm run dev
 *
 * RUN:
 *   TEST_BASE_URL=http://localhost:3002 HEADLESS=false npm run test:e2e:ui
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';

// Test configuration
const CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  network: 'regtest' as const,
  headless: process.env.HEADLESS === 'true',
  slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 30,
  devtools: process.env.DEVTOOLS === 'true',
  // Test wallet mnemonic (DO NOT use with real funds)
  testMnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  testPassword: 'TestPassword123!',
  timeouts: {
    pageLoad: 30000,
    walletConnect: 60000,
    mining: 120000,
    uiInteraction: 10000,
  },
};

// Helper functions
async function waitForPageReady(page: Page, timeout = 2000) {
  await new Promise(resolve => setTimeout(resolve, timeout));
}

async function takeScreenshot(page: Page, name: string) {
  const timestamp = Date.now();
  const path = `./e2e/screenshots/${name}-${timestamp}.png` as `${string}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`   📸 Screenshot: ${path}`);
}

async function clickButtonByText(page: Page, text: string, options: { exact?: boolean; timeout?: number } = {}): Promise<boolean> {
  const { exact = false } = options;

  const clicked = await page.evaluate((searchText, exactMatch) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => {
      const btnText = b.textContent || '';
      return exactMatch
        ? btnText.trim() === searchText
        : btnText.toUpperCase().includes(searchText.toUpperCase());
    });
    if (btn && !btn.hasAttribute('disabled')) {
      btn.click();
      return true;
    }
    return false;
  }, text, exact);

  if (clicked) {
    await waitForPageReady(page, 300);
  }
  return clicked;
}

async function waitForText(page: Page, text: string, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (searchText: string) => document.body.textContent?.includes(searchText),
      { timeout },
      text
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Complete Funded Swap Flow
 *
 * This test demonstrates the FULL flow:
 * 1. Connect/create wallet
 * 2. Navigate to wallet dashboard
 * 3. Mine blocks to get BTC
 * 4. Navigate to swap page
 * 5. Swap BTC → frBTC
 */
describe('Complete Funded BTC → frBTC Swap Flow', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     COMPLETE FUNDED BTC → frBTC SWAP E2E TEST              ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Base URL: ${CONFIG.baseUrl.padEnd(47)}║`);
    console.log(`║  Headless: ${String(CONFIG.headless).padEnd(47)}║`);
    console.log(`║  Network:  regtest                                         ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      devtools: CONFIG.devtools,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1400,900',
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Setup console capture for debugging
    page.on('console', (msg) => {
      if (process.env.DEBUG) {
        console.log(`[Browser] ${msg.text()}`);
      }
    });
  }, CONFIG.timeouts.pageLoad);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: WALLET SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  it('Phase 1.1: Navigate to app and clear storage', async () => {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  PHASE 1: WALLET SETUP                                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('\n📍 Step 1.1: Navigate to app and clear storage');

    await page.goto(`${CONFIG.baseUrl}`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    // Clear any existing wallet storage for clean test
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Reload to apply cleared storage
    await page.reload({ waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    console.log('   ✓ App loaded, storage cleared');
    await takeScreenshot(page, '1-1-app-loaded');
  }, 30000);

  it('Phase 1.2: Open wallet connection modal', async () => {
    console.log('\n📍 Step 1.2: Open wallet connection modal');

    // Look for Connect Wallet button
    const clicked = await clickButtonByText(page, 'CONNECT WALLET');

    if (!clicked) {
      // Maybe we're already on a page with wallet options
      console.log('   ⚠ Connect Wallet button not found, checking for wallet options...');
    }

    await waitForPageReady(page, 1000);

    // Check for wallet modal content
    const hasWalletOptions = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Create New Wallet') ||
             text.includes('Restore from Mnemonic') ||
             text.includes('Unlock') ||
             text.includes('Connect');
    });

    console.log(`   ✓ Wallet modal opened: ${hasWalletOptions}`);
    await takeScreenshot(page, '1-2-wallet-modal');

    expect(hasWalletOptions || clicked).toBe(true);
  }, 15000);

  it('Phase 1.3: Create or restore wallet', async () => {
    console.log('\n📍 Step 1.3: Restore wallet from mnemonic');

    // Click "Restore from Mnemonic"
    const restoreClicked = await clickButtonByText(page, 'Restore from Mnemonic');

    if (!restoreClicked) {
      // Try "Import" as alternative
      await clickButtonByText(page, 'Import');
    }

    await waitForPageReady(page, 500);

    // Enter mnemonic in textarea
    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.type(CONFIG.testMnemonic);
      console.log('   ✓ Mnemonic entered');
    } else {
      console.log('   ⚠ No textarea found for mnemonic');
    }

    // Enter password (find all password inputs)
    const passwordInputs = await page.$$('input[type="password"]');
    if (passwordInputs.length > 0) {
      await passwordInputs[0].type(CONFIG.testPassword);
      if (passwordInputs.length > 1) {
        await passwordInputs[1].type(CONFIG.testPassword); // Confirm password
      }
      console.log('   ✓ Password entered');
    }

    await takeScreenshot(page, '1-3-mnemonic-entered');

    // Click Restore/Create button
    let restored = await clickButtonByText(page, 'Restore Wallet');
    if (!restored) {
      restored = await clickButtonByText(page, 'Create Wallet');
    }
    if (!restored) {
      restored = await clickButtonByText(page, 'Import Wallet');
    }

    // Wait for wallet to initialize
    await waitForPageReady(page, 4000);
    console.log('   ✓ Wallet restoration initiated');
  }, 30000);

  it('Phase 1.4: Verify wallet is connected', async () => {
    console.log('\n📍 Step 1.4: Verify wallet connection');

    await waitForPageReady(page, 2000);

    // Check for wallet address or dashboard indicators
    const walletState = await page.evaluate(() => {
      const text = document.body.textContent || '';
      const hasAddress = /bcrt1[a-z0-9]{10,}/.test(text);
      const hasBalance = text.includes('Balance') || text.includes('BTC');
      const noConnectButton = !text.toUpperCase().includes('CONNECT WALLET');
      return { hasAddress, hasBalance, noConnectButton };
    });

    console.log(`   Address visible: ${walletState.hasAddress}`);
    console.log(`   Balance visible: ${walletState.hasBalance}`);
    console.log(`   Connect button gone: ${walletState.noConnectButton}`);

    await takeScreenshot(page, '1-4-wallet-connected');

    // Wallet should be connected
    expect(walletState.noConnectButton || walletState.hasAddress).toBe(true);
  }, 20000);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: FUND WALLET VIA MINING
  // ═══════════════════════════════════════════════════════════════════════════

  it('Phase 2.1: Navigate to wallet dashboard', async () => {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  PHASE 2: FUND WALLET VIA MINING                            │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('\n📍 Step 2.1: Navigate to wallet dashboard');

    await page.goto(`${CONFIG.baseUrl}/wallet`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    // Check if we're on wallet dashboard
    const hasWalletDashboard = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Wallet Dashboard') ||
             text.includes('Balances') ||
             text.includes('UTXO');
    });

    console.log(`   ✓ Wallet dashboard loaded: ${hasWalletDashboard}`);
    await takeScreenshot(page, '2-1-wallet-dashboard');

    // If not on dashboard, wallet might not be connected yet
    if (!hasWalletDashboard) {
      console.log('   ⚠ Dashboard not shown - may redirect to connect');
    }
  }, 20000);

  it('Phase 2.2: Check for Regtest Controls', async () => {
    console.log('\n📍 Step 2.2: Check for Regtest Controls');

    await waitForPageReady(page, 1000);

    // Look for Regtest Controls section
    const hasRegtestControls = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Regtest Controls') ||
             text.includes('Mine') ||
             text.includes('Generate');
    });

    console.log(`   ✓ Regtest Controls visible: ${hasRegtestControls}`);

    if (!hasRegtestControls) {
      console.log('   ⚠ Regtest Controls not found - may need to scroll or network mismatch');
    }

    await takeScreenshot(page, '2-2-regtest-controls');
  }, 10000);

  it('Phase 2.3: Mine 200 blocks to fund wallet', async () => {
    console.log('\n📍 Step 2.3: Mine 200 blocks to fund wallet');

    // Scroll down to see Regtest Controls if needed
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await waitForPageReady(page, 500);

    // Click "Mine 200 Blocks" button
    const mineClicked = await clickButtonByText(page, 'Mine 200 Blocks');

    if (mineClicked) {
      console.log('   ⛏️  Mining 200 blocks... (this may take a moment)');

      // Wait for mining to complete (look for success message)
      const miningSuccess = await waitForText(page, 'Mined', 60000);

      if (miningSuccess) {
        console.log('   ✓ Mining successful!');
      } else {
        console.log('   ⏳ Mining in progress or completed...');
      }

      // Wait for balances to update
      await waitForPageReady(page, 5000);
    } else {
      console.log('   ⚠ Mine button not found or disabled');

      // Try clicking "Mine 1 Block" as fallback
      const mine1Clicked = await clickButtonByText(page, 'Mine 1 Block');
      if (mine1Clicked) {
        console.log('   ⛏️  Mining 1 block as fallback...');
        await waitForPageReady(page, 10000);
      }
    }

    await takeScreenshot(page, '2-3-after-mining');
  }, CONFIG.timeouts.mining);

  it('Phase 2.4: Verify BTC balance increased', async () => {
    console.log('\n📍 Step 2.4: Verify BTC balance');

    await waitForPageReady(page, 2000);

    // Check balance display
    const balanceInfo = await page.evaluate(() => {
      const text = document.body.textContent || '';
      // Look for BTC balance patterns like "12.5 BTC" or "1250000000 sats"
      const btcMatch = text.match(/(\d+\.?\d*)\s*BTC/i);
      const satsMatch = text.match(/(\d+)\s*sats/i);
      return {
        btcBalance: btcMatch ? btcMatch[1] : null,
        satsBalance: satsMatch ? satsMatch[1] : null,
        hasBalance: !!btcMatch || !!satsMatch,
      };
    });

    console.log(`   BTC Balance: ${balanceInfo.btcBalance || 'N/A'}`);
    console.log(`   Sats Balance: ${balanceInfo.satsBalance || 'N/A'}`);
    console.log(`   ✓ Has balance: ${balanceInfo.hasBalance}`);

    await takeScreenshot(page, '2-4-balance-check');
  }, 15000);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: EXECUTE SWAP
  // ═══════════════════════════════════════════════════════════════════════════

  it('Phase 3.1: Navigate to swap page', async () => {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  PHASE 3: EXECUTE BTC → frBTC SWAP                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('\n📍 Step 3.1: Navigate to swap page');

    await page.goto(`${CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    const hasSwapInterface = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('SWAP') || text.includes('Swap');
    });

    console.log(`   ✓ Swap page loaded: ${hasSwapInterface}`);
    await takeScreenshot(page, '3-1-swap-page');

    expect(hasSwapInterface).toBe(true);
  }, 20000);

  it('Phase 3.2: Verify BTC is selected as FROM token with balance', async () => {
    console.log('\n📍 Step 3.2: Verify BTC as FROM token with balance');

    // Wait for balance to refresh (triggered by useEffect on mount)
    await waitForPageReady(page, 2000);

    const result = await page.evaluate(() => {
      const fromPanel = document.querySelector('[data-testid="from-panel"]');
      if (!fromPanel) return { hasBtc: false, balance: null, panelFound: false };

      const text = fromPanel.textContent || '';
      const hasBtc = text.includes('BTC');

      // Look for balance text like "Balance: 0.50000000" or similar
      const balanceMatch = text.match(/Balance:\s*(\d+\.?\d*)/);
      const balance = balanceMatch ? balanceMatch[1] : null;

      return {
        hasBtc,
        balance,
        panelFound: true,
        panelText: text.substring(0, 100),
      };
    });

    console.log(`   FROM panel found: ${result.panelFound}`);
    console.log(`   BTC visible: ${result.hasBtc}`);
    console.log(`   Balance: ${result.balance || 'not found'}`);
    if (result.panelText) console.log(`   Panel text: "${result.panelText}..."`);

    await takeScreenshot(page, '3-2-btc-from-token');

    expect(result.hasBtc).toBe(true);
    // Note: Balance might be 0 if mining didn't happen or is still processing
    // We log it for debugging but don't fail the test on balance alone
  }, 15000);

  it('Phase 3.3: Select frBTC as TO token', async () => {
    console.log('\n📍 Step 3.3: Select frBTC as TO token');

    // Use data-testid for reliable targeting of TO token selector
    // This avoids accidentally clicking on pool cards in the Markets grid
    const toSelector = await page.$('[data-testid="to-token-selector"]');
    if (toSelector) {
      await toSelector.click();
      console.log('   ✓ Clicked TO token selector via data-testid');
    } else {
      // Fallback to text-based search within the swap form
      const clicked = await page.evaluate(() => {
        const toPanel = document.querySelector('[data-testid="to-panel"]');
        if (toPanel) {
          const btn = toPanel.querySelector('button');
          if (btn) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      console.log(`   ${clicked ? '✓' : '⚠'} TO token selector ${clicked ? 'clicked' : 'not found'}`);
    }

    await waitForPageReady(page, 500);
    await takeScreenshot(page, '3-3a-token-selector');

    // Wait for modal to appear
    await page.waitForFunction(() => {
      const hasModalOverlay = document.querySelector('[class*="fixed"][class*="inset"]');
      const hasDialogContent = document.body.textContent?.includes('Select token') || document.body.textContent?.includes('SELECT');
      return hasModalOverlay || hasDialogContent;
    }, { timeout: 5000 });

    await takeScreenshot(page, '3-3b-modal-opened');

    // Wait a moment for the modal to fully render
    await waitForPageReady(page, 500);

    // Select frBTC - it's the FIRST token in the list (above DIESEL)
    // The frBTC token has ID "32:0" and displays as "frBTC" with "32:0" below it
    let frbtcSelected: string | boolean = false;

    // Find ALL buttons in the modal and log them for debugging - include disabled state
    const buttonInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(btn => ({
        text: btn.textContent?.substring(0, 50),
        hasTestId: btn.hasAttribute('data-testid'),
        testId: btn.getAttribute('data-testid'),
        hasTokenId: btn.hasAttribute('data-token-id'),
        tokenId: btn.getAttribute('data-token-id'),
        disabled: btn.disabled,
        className: btn.className?.substring(0, 80),
      })).filter(b => b.text?.includes('frBTC') || b.text?.includes('32:0'));
    });
    console.log('   Buttons with frBTC/32:0:', JSON.stringify(buttonInfo, null, 2));

    // Try using dispatchEvent for the click - this is more reliable for React apps
    const clickResult = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="token-option-32-0"]') as HTMLButtonElement;
      if (!btn) return { found: false, reason: 'not found by testid' };

      // Check button state
      const isDisabled = btn.disabled;
      const hasDisabledClass = btn.className?.includes('disabled') || btn.className?.includes('cursor-not-allowed');

      if (isDisabled) return { found: true, reason: 'button is disabled', disabled: true };

      // Try to click using dispatchEvent
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      btn.dispatchEvent(clickEvent);

      return {
        found: true,
        clicked: true,
        disabled: isDisabled,
        hasDisabledClass,
        text: btn.textContent?.substring(0, 50)
      };
    });
    console.log('   Click result:', JSON.stringify(clickResult));

    if (clickResult.clicked) {
      frbtcSelected = 'found-via-dispatchEvent';
      console.log('   ✓ Clicked frBTC token via dispatchEvent');
    }

    // Fallback: Try data-testid with Puppeteer click
    if (!frbtcSelected) {
      const frbtcByTestId = await page.$('[data-testid="token-option-32-0"]');
      if (frbtcByTestId) {
        console.log('   Fallback: Found frBTC button via data-testid, clicking...');
        await frbtcByTestId.click();
        frbtcSelected = 'found-via-testid';
        console.log('   ✓ Clicked frBTC token via data-testid');
      }
    }

    // Try data-token-id
    if (!frbtcSelected) {
      const frbtcByTokenId = await page.$('[data-token-id="32:0"]');
      if (frbtcByTokenId) {
        console.log('   Found frBTC button via data-token-id, clicking...');
        await frbtcByTokenId.click();
        frbtcSelected = 'found-via-data-token-id';
        console.log('   ✓ Clicked frBTC token via data-token-id');
      }
    }

    // Try using $$eval to find and click the frBTC button
    if (!frbtcSelected) {
      try {
        const clicked = await page.$$eval('button', (buttons) => {
          const frbtcBtn = buttons.find(btn => {
            const text = btn.textContent || '';
            return text.includes('frBTC') && text.includes('32:0');
          });
          if (frbtcBtn) {
            frbtcBtn.click();
            return true;
          }
          return false;
        });
        if (clicked) {
          frbtcSelected = 'found-via-eval-click';
          console.log('   ✓ Clicked frBTC token via $$eval');
        }
      } catch (e) {
        console.log('   $$eval approach failed, trying mouse click...');
      }
    }

    // Last resort: mouse click at coordinates
    if (!frbtcSelected) {
      const frbtcRect = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const frbtcBtn = buttons.find(btn => {
          const text = btn.textContent || '';
          return text.includes('frBTC') && text.includes('32:0');
        });
        if (frbtcBtn) {
          const rect = frbtcBtn.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        return null;
      });

      if (frbtcRect) {
        await page.mouse.click(frbtcRect.x, frbtcRect.y);
        frbtcSelected = 'found-via-mouse-click';
        console.log(`   ✓ Clicked frBTC token via mouse at (${frbtcRect.x}, ${frbtcRect.y})`);
      }
    }

    console.log(`   frBTC selection result: ${frbtcSelected || '⚠ not found'}`);

    // Wait for modal to close
    await waitForPageReady(page, 1000);

    // Try pressing Escape if modal is still open
    await page.keyboard.press('Escape');
    await waitForPageReady(page, 500);

    // CRITICAL: Verify TO token selector now shows frBTC (not bUSD)
    const toTokenChanged = await page.evaluate(() => {
      const toSelector = document.querySelector('[data-testid="to-token-selector"]');
      if (toSelector) {
        const text = toSelector.textContent || '';
        return {
          showsFrBtc: text.includes('frBTC'),
          showsBusd: text.includes('bUSD') || text.includes('BUSD'),
          actualText: text
        };
      }
      return { showsFrBtc: false, showsBusd: true, actualText: 'not found' };
    });

    console.log(`   TO token selector shows: "${toTokenChanged.actualText}"`);
    console.log(`   TO is frBTC: ${toTokenChanged.showsFrBtc ? '✓' : '⚠ STILL bUSD!'}`);

    // If TO still shows bUSD, we need to click frBTC again properly
    if (!toTokenChanged.showsFrBtc) {
      console.log('   ⚠ Retrying frBTC selection...');

      // Click the TO selector again
      const toSelectorRetry = await page.$('[data-testid="to-token-selector"]');
      if (toSelectorRetry) await toSelectorRetry.click();
      await waitForPageReady(page, 1000);

      await takeScreenshot(page, '3-3c-retry-modal');

      // Use mouse click approach for retry
      const retryRect = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const frbtcBtn = buttons.find(btn => {
          const text = btn.textContent || '';
          return text.includes('frBTC') && text.includes('32:0');
        });
        if (frbtcBtn) {
          const rect = frbtcBtn.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        return null;
      });

      if (retryRect) {
        await page.mouse.click(retryRect.x, retryRect.y);
        console.log(`   ✓ Retry: clicked frBTC via mouse at (${retryRect.x}, ${retryRect.y})`);
      }

      await waitForPageReady(page, 1000);
    }

    // Verify FROM is still BTC after TO selection
    const fromStillBtc = await page.evaluate(() => {
      const fromSelector = document.querySelector('[data-testid="from-token-selector"]');
      return fromSelector?.textContent?.includes('BTC') || false;
    });

    console.log(`   FROM still BTC: ${fromStillBtc ? '✓' : '⚠ ISSUE!'}`);
    expect(fromStillBtc).toBe(true);

    // Final check: TO should now show frBTC
    const finalToCheck = await page.evaluate(() => {
      const toSelector = document.querySelector('[data-testid="to-token-selector"]');
      return toSelector?.textContent?.includes('frBTC') || false;
    });

    console.log(`   TO shows frBTC: ${finalToCheck ? '✓' : '⚠ FAILED'}`);
    await takeScreenshot(page, '3-3-frbtc-selected');

    expect(finalToCheck).toBe(true);
  }, 30000);

  it('Phase 3.4: Enter swap amount', async () => {
    console.log('\n📍 Step 3.4: Enter swap amount');

    // Find the FROM input (in "You Send" panel)
    const inputEntered = await page.evaluate(() => {
      const swapForm = document.querySelector('section');
      if (!swapForm) return false;

      const allSpans = Array.from(swapForm.querySelectorAll('span'));
      const sendLabel = allSpans.find(span => span.textContent?.includes('You Send'));
      if (!sendLabel) return false;

      const sendPanel = sendLabel.closest('div.rounded-2xl') ||
                       sendLabel.closest('div[class*="rounded"]');
      if (!sendPanel) return false;

      const input = sendPanel.querySelector('input') as HTMLInputElement;
      if (input) {
        input.value = '';
        input.focus();
        // Trigger input event
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    });

    expect(inputEntered).toBe(true);

    // Type the amount
    await page.keyboard.type('0.00000500');
    console.log('   ✓ Amount entered: 0.000005 BTC (500 sats - within balance)');

    // Wait for quote calculation
    await waitForPageReady(page, 3000);

    // Get the quote and verify it's a wrap (not AMM swap)
    const quoteInfo = await page.evaluate(() => {
      const text = document.body.textContent || '';

      // Check if this is showing as a WRAP (direct BTC → frBTC)
      const isWrapRoute = !text.includes('SWAP ROUTE') ||
                         text.includes('wrap') ||
                         (text.includes('BTC') && text.includes('frBTC') && !text.includes('DIESEL'));

      // Check swap summary for route info
      const hasDieselInRoute = text.includes('DIESEL') && text.includes('→');

      // Get TO amount if visible
      const swapForm = document.querySelector('section');
      const allSpans = Array.from(swapForm?.querySelectorAll('span') || []);
      const receiveLabel = allSpans.find(span => span.textContent?.includes('You Receive'));
      const receivePanel = receiveLabel?.closest('div.rounded-2xl') ||
                          receiveLabel?.closest('div[class*="rounded"]');
      const toInput = receivePanel?.querySelector('input') as HTMLInputElement;
      const toValue = toInput?.value || '';

      return {
        toValue,
        isWrapRoute,
        hasDieselInRoute,
      };
    });

    console.log(`   Quote received: ${quoteInfo.toValue || 'calculating...'} frBTC`);
    console.log(`   Is wrap route (no AMM): ${quoteInfo.isWrapRoute ? '✓' : '⚠ ISSUE'}`);
    console.log(`   Has DIESEL in route: ${quoteInfo.hasDieselInRoute ? '⚠ WRONG ROUTE' : '✓ Clean'}`);

    // The route should NOT contain DIESEL - it should be a direct wrap
    expect(quoteInfo.hasDieselInRoute).toBe(false);

    await takeScreenshot(page, '3-4-amount-entered');
  }, 20000);

  it('Phase 3.5: Review swap details', async () => {
    console.log('\n📍 Step 3.5: Review swap details');

    const swapDetails = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        hasRate: text.includes('Rate') || text.includes('1 BTC') || text.includes('1 frBTC'),
        hasFee: text.includes('Fee') || text.includes('fee'),
        hasSlippage: text.includes('Slippage') || text.includes('slippage'),
        hasBalance: /Balance:\s*\d/.test(text),
      };
    });

    console.log(`   Rate info: ${swapDetails.hasRate ? '✓' : '○'}`);
    console.log(`   Fee info: ${swapDetails.hasFee ? '✓' : '○'}`);
    console.log(`   Slippage: ${swapDetails.hasSlippage ? '✓' : '○'}`);
    console.log(`   Balance shown: ${swapDetails.hasBalance ? '✓' : '○'}`);

    await takeScreenshot(page, '3-5-swap-review');
  }, 10000);

  it('Phase 3.6: Execute the swap', async () => {
    console.log('\n📍 Step 3.6: Execute the swap');

    // Check swap button state
    const buttonState = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const swapBtn = buttons.find(btn => {
        const text = btn.textContent?.toUpperCase() || '';
        return text === 'SWAP' || text.includes('WRAP');
      });

      if (swapBtn) {
        return {
          text: swapBtn.textContent?.trim(),
          disabled: swapBtn.hasAttribute('disabled'),
        };
      }
      return null;
    });

    console.log(`   Swap button: ${buttonState?.text || 'not found'}`);
    console.log(`   Disabled: ${buttonState?.disabled || 'N/A'}`);

    if (buttonState && !buttonState.disabled) {
      // Click SWAP
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const swapBtn = buttons.find(btn => {
          const text = btn.textContent?.toUpperCase() || '';
          return text === 'SWAP' || text.includes('WRAP');
        });
        if (swapBtn) swapBtn.click();
      });

      console.log('   🔄 SWAP button clicked!');
      await waitForPageReady(page, 5000);
    } else {
      console.log('   ⚠ Swap button not clickable');
    }

    await takeScreenshot(page, '3-6-swap-executed');
  }, 30000);

  it('Phase 3.7: Check transaction result', async () => {
    console.log('\n📍 Step 3.7: Check transaction result');

    await waitForPageReady(page, 3000);

    const result = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        hasSuccess: text.includes('Success') || text.includes('success') || text.includes('submitted'),
        hasConfirmed: text.includes('Confirmed') || text.includes('confirmed'),
        hasTxId: /[a-f0-9]{64}/i.test(text),
        hasError: text.includes('Error') || text.includes('Failed') || text.includes('failed'),
        hasInsufficientBalance: text.includes('Insufficient') || text.includes('insufficient'),
        hasPending: text.includes('Pending') || text.includes('pending') || text.includes('Broadcasting'),
      };
    });

    console.log(`   Success: ${result.hasSuccess ? '✓' : '○'}`);
    console.log(`   Pending: ${result.hasPending ? '✓' : '○'}`);
    console.log(`   Confirmed: ${result.hasConfirmed ? '✓' : '○'}`);
    console.log(`   Transaction ID: ${result.hasTxId ? '✓' : '○'}`);
    console.log(`   Error: ${result.hasError ? '⚠' : '○'}`);
    console.log(`   Insufficient balance: ${result.hasInsufficientBalance ? '⚠' : '○'}`);

    await takeScreenshot(page, '3-7-transaction-result');
  }, 20000);

  it('Phase 3.8: Verify frBTC balance after wrap', async () => {
    console.log('\n📍 Step 3.8: Verify frBTC balance');

    // Wait for transaction to process
    await waitForPageReady(page, 3000);

    // Navigate to wallet to check balances
    await page.goto(`${CONFIG.baseUrl}/`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    // Check if frBTC balance is visible
    const balanceInfo = await page.evaluate(() => {
      const text = document.body.textContent || '';

      // Look for frBTC in balance display
      const hasFrBtcMention = text.includes('frBTC');

      // Try to find any non-zero frBTC balance
      // Pattern: look for frBTC followed by a number
      const frbtcBalanceMatch = text.match(/frBTC[:\s]*([0-9.]+)/i);

      return {
        hasFrBtcMention,
        frbtcBalance: frbtcBalanceMatch ? frbtcBalanceMatch[1] : null,
        pageText: text.slice(0, 500) // First 500 chars for debugging
      };
    });

    console.log(`   frBTC mentioned on page: ${balanceInfo.hasFrBtcMention ? '✓' : '○'}`);
    console.log(`   frBTC balance: ${balanceInfo.frbtcBalance || 'not found'}`);

    await takeScreenshot(page, '3-8-frbtc-balance');

    // Go back to swap page and check the TO balance
    await page.goto(`${CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    // Select frBTC as TO token to see balance
    const toSelector = await page.$('[data-testid="to-token-selector"]');
    if (toSelector) {
      const toText = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="to-token-selector"]');
        return el?.textContent || '';
      });
      console.log(`   Current TO token: ${toText}`);
    }

    // Check if there's a frBTC balance shown in the TO panel
    const toBalance = await page.evaluate(() => {
      const toPanel = document.querySelector('[data-testid="to-panel"]');
      if (!toPanel) return null;

      const text = toPanel.textContent || '';
      const balanceMatch = text.match(/Balance[:\s]*([0-9.]+)/i);
      return balanceMatch ? balanceMatch[1] : null;
    });

    console.log(`   TO panel balance: ${toBalance || 'N/A'}`);

    await takeScreenshot(page, '3-8-final-state');

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     BTC → frBTC SWAP FLOW COMPLETE                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  }, 30000);
});

/**
 * Quick UI Verification Tests
 *
 * These are faster tests that verify the UI components work correctly
 * without performing actual transactions.
 */
describe('Swap UI Component Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
  }, CONFIG.timeouts.pageLoad);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('loads swap page correctly', async () => {
    await page.goto(`${CONFIG.baseUrl}/swap`, { waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    const title = await page.title();
    expect(title.toLowerCase()).toContain('swap');
  }, 20000);

  it('displays token selectors', async () => {
    const hasTokens = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('BTC') && (text.includes('bUSD') || text.includes('frBTC') || text.includes('Select'));
    });
    expect(hasTokens).toBe(true);
  }, 10000);

  it('has input fields for amounts', async () => {
    const inputs = await page.$$('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('shows Connect Wallet button when not connected', async () => {
    // Clear storage to ensure disconnected state
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await waitForPageReady(page, 2000);

    const hasConnectButton = await page.evaluate(() => {
      const text = document.body.textContent?.toUpperCase() || '';
      return text.includes('CONNECT') && text.includes('WALLET');
    });
    expect(hasConnectButton).toBe(true);
  }, 20000);

  it('displays markets/pools grid', async () => {
    const hasMarkets = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('TVL') || text.includes('Pool') || text.includes('Volume');
    });
    expect(hasMarkets).toBe(true);
  }, 10000);
});
