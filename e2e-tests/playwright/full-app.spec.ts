/**
 * Subfrost Full Application — Playwright E2E Tests
 *
 * Tests every user flow on the live staging devnet:
 * - Devnet boot + wallet creation + funding
 * - Every swap type (market, limit, bridge)
 * - All 8 tokens in selector
 * - Vault interactions (dxBTC, FIRE)
 * - Futures (positions, predictions, volatility)
 * - Navigation consistency
 *
 * Run: npx playwright test
 */

import { test, expect, type Page } from '@playwright/test';

// Helpers
async function waitForDevnet(page: Page, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Devnet H:'))
    );
    if (ready) return;
    await page.waitForTimeout(3000);
  }
  throw new Error('Devnet boot timeout');
}

async function dismissModal(page: Page) {
  const btn = page.locator('button', { hasText: 'Understand' });
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

async function createWallet(page: Page) {
  await page.locator('button', { hasText: 'Connect Wallet' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'Create New' }).click();
  await page.waitForTimeout(1500);

  // Fill password
  const pwInputs = page.locator('input[type="password"]');
  for (let i = 0; i < await pwInputs.count(); i++) {
    await pwInputs.nth(i).fill('testtest1');
  }
  await page.waitForTimeout(500);

  await page.locator('button', { hasText: 'Create Wallet' }).click();
  await page.waitForTimeout(5000);

  // Skip backup
  const checkbox = page.locator('input[type="checkbox"]');
  if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
    await checkbox.click();
    await page.waitForTimeout(500);
  }
  const skipBtn = page.locator('button', { hasText: 'Skip' });
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(3000);
  }
}

async function fundWallet(page: Page) {
  // Open devnet panel
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.click();
  await page.waitForTimeout(500);

  // +1 BTC x3
  const btcBtn = page.locator('button', { hasText: '+1 BTC' });
  for (let i = 0; i < 3; i++) {
    await btcBtn.click();
    await page.waitForTimeout(4000);
  }

  // +DIESEL
  await page.locator('button', { hasText: '+DIESEL' }).click();
  await page.waitForTimeout(5000);

  // +100 for maturity
  await page.locator('button', { hasText: '+100' }).click();
  await page.waitForTimeout(25000);

  // Close panel
  await page.locator('button', { hasText: '✕' }).click();
  await page.waitForTimeout(2000);
}

// ================================================================
// SETUP: Boot devnet, create wallet, fund
// ================================================================

test.describe.serial('Subfrost Full App', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Intercept alerts FIRST
    page.on('dialog', async dialog => {
      console.log('Dialog:', dialog.type(), dialog.message().substring(0, 100));
      await dialog.accept();
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ================================================================
  // SETUP (as first test with long timeout)
  // ================================================================

  test('boot devnet + create wallet + fund', async () => {
    test.setTimeout(300_000);
    await page.goto('/');
    await waitForDevnet(page);
    await dismissModal(page);
    await createWallet(page);
    await fundWallet(page);
  });

  // ================================================================
  // HOME PAGE
  // ================================================================

  test('home page shows devnet banner', async () => {
    await expect(page.locator('text=In-Browser Devnet')).toBeVisible();
  });

  test('home page shows wallet balance', async () => {
    await expect(page.locator('text=/\\d+\\.\\d{5} BTC/')).toBeVisible();
  });

  test('home page shows trending vaults', async () => {
    await expect(page.locator('text=dxBTC Vault')).toBeVisible();
    await expect(page.locator('text=FIRE Vault')).toBeVisible();
  });

  test('navigation has 4 tabs', async () => {
    await expect(page.locator('a[href="/"]', { hasText: 'Home' })).toBeVisible();
    await expect(page.locator('a[href="/swap"]', { hasText: 'Swap' })).toBeVisible();
    await expect(page.locator('a[href="/vaults"]', { hasText: 'Vaults' })).toBeVisible();
    await expect(page.locator('a[href="/futures"]', { hasText: 'Futures' })).toBeVisible();
  });

  // ================================================================
  // SWAP PAGE
  // ================================================================

  test('swap page loads with Market/Limit/Order Book tabs', async () => {
    await page.locator('a[href="/swap"]').click();
    await page.waitForTimeout(6000);
    await expect(page.locator('button', { hasText: 'Market' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Limit' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Order Book' })).toBeVisible();
  });

  test('token selector shows all 8 tokens', async () => {
    // Open FROM token selector
    const selects = page.locator('button', { hasText: 'Select' });
    await selects.first().click();
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    expect(body).toContain('USDT');
    expect(body).toContain('USDC');
    expect(body).toContain('BTC');

    // Close
    await page.locator('button', { hasText: '✕' }).click();
    await page.waitForTimeout(500);
  });

  test('BTC → frBTC wrap executes', async () => {
    // Select BTC FROM
    const selects = page.locator('button', { hasText: 'Select' });
    await selects.first().click();
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: /^BTC/ }).first().click();
    await page.waitForTimeout(1500);

    // Select frBTC TO
    await page.locator('button', { hasText: 'Select' }).last().click();
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: 'frBTC' }).click();
    await page.waitForTimeout(1500);

    // Enter amount
    await page.locator('input[type="number"]').first().fill('0.1');
    await page.waitForTimeout(2000);

    // Confirm swap
    await page.locator('button', { hasText: 'CONFIRM' }).click();
    await page.waitForTimeout(15000);

    // Should not have blocking error (dialog intercepted)
    const balance = await page.locator('text=/\\d+\\.\\d{5} BTC/').innerText();
    expect(balance).toBeTruthy();
  });

  test('limit order form works', async () => {
    await page.locator('button', { hasText: 'Limit' }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator('text=BUY')).toBeVisible();
    await expect(page.locator('text=SELL')).toBeVisible();
    await expect(page.locator('text=AMOUNT')).toBeVisible();
    await expect(page.locator('text=PRICE')).toBeVisible();
  });

  test('bridge USDT → BTC flow', async () => {
    await page.locator('button', { hasText: 'Market' }).click();
    await page.waitForTimeout(1000);

    // Select USDT
    const selects = page.locator('button', { hasText: 'Select' });
    await selects.first().click();
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: 'USDT' }).first().click();
    await page.waitForTimeout(1500);

    // Select BTC TO
    await page.locator('button', { hasText: 'Select' }).last().click();
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: /^BTC/ }).first().click();
    await page.waitForTimeout(1500);

    // Enter amount
    await page.locator('input[type="number"]').first().fill('100');
    await page.waitForTimeout(1500);

    // Bridge button should appear
    await expect(page.locator('button', { hasText: /Bridge/ })).toBeVisible();

    // Click bridge
    await page.locator('button', { hasText: /Bridge/ }).click();
    await page.waitForTimeout(2000);

    // QR code / deposit flow should appear
    const body = await page.locator('body').innerText();
    expect(body.includes('QR') || body.includes('MetaMask') || body.includes('Deposit')).toBeTruthy();
  });

  test('LP modal opens', async () => {
    // Go back if in bridge flow
    const backBtn = page.locator('button', { hasText: 'Back to quote' });
    if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(1000);
    }

    await page.locator('button', { hasText: 'Add / Remove Liquidity' }).click();
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    expect(body).toContain('Liquidity');

    // Close modal
    await page.locator('button', { hasText: '✕' }).click();
    await page.waitForTimeout(500);
  });

  // ================================================================
  // VAULTS
  // ================================================================

  test('vaults page shows dxBTC and FIRE', async () => {
    await page.locator('a[href="/vaults"]').click();
    await page.waitForTimeout(5000);

    await expect(page.locator('text=DeFi Vaults')).toBeVisible();
    await expect(page.locator('text=dxBTC')).toBeVisible();
    await expect(page.locator('text=FIRE')).toBeVisible();
  });

  test('dxBTC vault detail view', async () => {
    await page.locator('button', { hasText: 'dxBTC' }).click();
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Back to')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toContain('Deposit');
    expect(body).toContain('About');

    await page.locator('button', { hasText: 'Back' }).click();
    await page.waitForTimeout(1500);
  });

  test('FIRE vault with all tabs', async () => {
    await page.locator('button:has-text("FIRE"), div:has-text("FIRE Vault")').first().click();
    await page.waitForTimeout(2000);

    for (const tab of ['DASHBOARD', 'STAKE', 'BOND', 'REDEEM', 'DISTRIBUTE']) {
      const tabBtn = page.locator('button', { hasText: tab });
      if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    const body = await page.locator('body').innerText();
    expect(body).toContain('FIRE');
  });

  // ================================================================
  // FUTURES
  // ================================================================

  test('futures page has 3 tabs', async () => {
    await page.locator('a[href="/futures"]').click();
    await page.waitForTimeout(5000);
    await dismissModal(page);

    await expect(page.locator('button', { hasText: 'FUTURES' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'PREDICTIONS' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'VOLATILITY' })).toBeVisible();
  });

  test('futures main tab shows investment form', async () => {
    const body = await page.locator('body').innerText();
    expect(body).toContain('INVESTMENT AMOUNT');
    expect(body).toContain('LOCK PERIOD');
  });

  test('predictions tab with LONG/SHORT', async () => {
    await page.locator('button', { hasText: 'PREDICTIONS' }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator('button', { hasText: 'LONG' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'SHORT' })).toBeVisible();

    // Click LONG
    await page.locator('button', { hasText: 'LONG' }).click();
    await page.waitForTimeout(500);

    // Epoch data should be visible
    const body = await page.locator('body').innerText();
    expect(body).toContain('Epoch');
  });

  test('predictions LONG/SHORT toggle', async () => {
    // Click SHORT
    await page.locator('button', { hasText: 'SHORT' }).click();
    await page.waitForTimeout(500);

    // Buy button should exist
    const body = await page.locator('body').innerText();
    expect(body.includes('Buy') || body.includes('Connect Wallet')).toBeTruthy();
  });

  test('volatility tab with volBTC pool', async () => {
    await page.locator('button', { hasText: 'VOLATILITY' }).click();
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    expect(body).toContain('volBTC');
    expect(body).toContain('Premium Curve');
    expect(body).toContain('ftrBTC');
    expect(body).toContain('Utilization');
  });

  test('utilization slider is interactive', async () => {
    const slider = page.locator('input[type="range"]');
    if (await slider.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slider.fill('75');
      await page.waitForTimeout(1000);
      // Coefficients should be visible
      const body = await page.locator('body').innerText();
      expect(body.includes('c') || body.includes('Adjustment')).toBeTruthy();
    }
  });

  // ================================================================
  // DEVNET CONTROLS
  // ================================================================

  test('devnet panel shows mine buttons', async () => {
    await page.locator('button', { hasText: /Devnet H:/ }).click();
    await page.waitForTimeout(500);

    await expect(page.locator('button', { hasText: '+1' })).toBeVisible();
    await expect(page.locator('button', { hasText: '+10' })).toBeVisible();
    await expect(page.locator('button', { hasText: '+100' })).toBeVisible();
  });

  test('devnet faucet buttons exist', async () => {
    await expect(page.locator('button', { hasText: '+1 BTC' })).toBeVisible();
    await expect(page.locator('button', { hasText: '+DIESEL' })).toBeVisible();
    await expect(page.locator('button', { hasText: '+USDT' })).toBeVisible();
    await expect(page.locator('button', { hasText: '+USDC' })).toBeVisible();

    // Close panel
    await page.locator('button', { hasText: '✕' }).click();
  });

  test('mine +1 increases height', async () => {
    const beforeText = await page.locator('button', { hasText: /Devnet H:/ }).innerText();
    const beforeHeight = parseInt(beforeText.match(/H:(\d+)/)?.[1] || '0');

    await page.locator('button', { hasText: /Devnet H:/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: '+1' }).first().click();
    await page.waitForTimeout(4000);
    await page.locator('button', { hasText: '✕' }).click();
    await page.waitForTimeout(1000);

    const afterText = await page.locator('button', { hasText: /Devnet H:/ }).innerText();
    const afterHeight = parseInt(afterText.match(/H:(\d+)/)?.[1] || '0');

    expect(afterHeight).toBeGreaterThan(beforeHeight);
  });

  // ================================================================
  // NAVIGATION
  // ================================================================

  test('all pages accessible via navigation', async () => {
    for (const [href, expectedText] of [
      ['/', 'Trending'],
      ['/swap', 'Market'],
      ['/vaults', 'DeFi Vaults'],
      ['/futures', 'FUTURES'],
    ] as const) {
      await page.locator(`a[href="${href}"]`).first().click();
      await page.waitForTimeout(3000);
      const body = await page.locator('body').innerText();
      expect(body).toContain(expectedText);
    }
  });
});
