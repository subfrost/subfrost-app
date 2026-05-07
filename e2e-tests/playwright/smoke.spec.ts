import { test, expect } from '@playwright/test';

test('staging loads', async ({ page }) => {
  await page.goto('https://staging-app.subfrost.io');
  await expect(page).toHaveTitle(/SUBFROST/);
});

test('devnet boots', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('https://staging-app.subfrost.io');

  // Wait for devnet badge
  console.log('Waiting for devnet...');
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await expect(badge).toBeVisible({ timeout: 150_000 });

  const text = await badge.innerText();
  console.log('Devnet:', text);
  expect(text).toMatch(/H:\d+/);
});

test('wallet can be created', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('https://staging-app.subfrost.io');

  // Wait for devnet
  await expect(page.locator('button', { hasText: /Devnet H:/ })).toBeVisible({ timeout: 150_000 });

  // Dismiss modal
  const modal = page.locator('button', { hasText: 'Understand' });
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await modal.click();
  }

  // Dialog handler
  page.on('dialog', d => d.accept());

  // Connect → Create
  await page.locator('button', { hasText: 'Connect Wallet' }).first().click();
  await page.locator('button', { hasText: 'Create New' }).click();
  await page.waitForTimeout(1500);

  // Password
  const pwInputs = page.locator('input[type="password"]');
  for (let i = 0; i < await pwInputs.count(); i++) {
    await pwInputs.nth(i).fill('testtest1');
  }

  await page.locator('button', { hasText: 'Create Wallet' }).click();
  await page.waitForTimeout(5000);

  // Skip backup
  const cb = page.locator('input[type="checkbox"]');
  if (await cb.isVisible({ timeout: 2000 }).catch(() => false)) await cb.click();
  const skip = page.locator('button', { hasText: 'Skip' });
  if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) await skip.click();
  await page.waitForTimeout(3000);

  // Wallet should show BTC balance
  await expect(page.locator('text=/\\d+\\.\\d+ BTC/')).toBeVisible({ timeout: 10_000 });
});
