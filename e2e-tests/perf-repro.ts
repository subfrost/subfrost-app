#!/usr/bin/env npx tsx
/**
 * Performance Reproduction Script
 *
 * Measures end-to-end timing for two slow workflows:
 * 1. Admin login (/admin) — time from navigation to successful auth
 * 2. Invite code validation — time from navigation to code verified
 *
 * Uses a fresh browser profile (no cache) to simulate first-visit experience.
 * Each step is individually timed and failure-tolerant (screenshots on error).
 *
 * Usage:
 *   npx tsx e2e-tests/perf-repro.ts
 *   E2E_BASE_URL=http://localhost:3000 npx tsx e2e-tests/perf-repro.ts
 */

import puppeteer, { type Page, type Browser, type ConsoleMessage } from 'puppeteer';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.E2E_BASE_URL || 'https://staging-app.subfrost.io';
const ADMIN_SECRET = process.env.ADMIN_SECRET || (() => { throw new Error('ADMIN_SECRET env var is required'); })();
const INVITE_CODE = process.env.INVITE_CODE || 'ALKANESCHINA';
const SCREENSHOT_DIR = 'screenshots';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

interface TimingResult {
  label: string;
  ms: number;
  error?: string;
}

function fmt(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function printTimings(title: string, timings: TimingResult[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
  const maxLabel = Math.max(...timings.map((t) => t.label.length));
  for (const t of timings) {
    const bar = '#'.repeat(Math.min(40, Math.round(t.ms / 500)));
    const suffix = t.error ? ` [ERR]` : '';
    console.log(`  ${t.label.padEnd(maxLabel + 2)} ${fmt(t.ms).padStart(8)}  ${bar}${suffix}`);
    if (t.error) console.log(`  ${''.padEnd(maxLabel + 12)}↳ ${t.error}`);
  }
  const total = timings.reduce((s, t) => s + t.ms, 0);
  console.log('-'.repeat(70));
  console.log(`  ${'TOTAL'.padEnd(maxLabel + 2)} ${fmt(total).padStart(8)}`);
  console.log('');
}

/** Timed step — captures timing and errors without aborting the test */
async function step(
  label: string,
  fn: () => Promise<void>,
  timings: TimingResult[]
): Promise<boolean> {
  const t0 = Date.now();
  try {
    await fn();
    timings.push({ label, ms: Date.now() - t0 });
    return true;
  } catch (err: any) {
    const msg = err?.message?.split('\n')[0] || 'unknown error';
    timings.push({ label, ms: Date.now() - t0, error: msg.slice(0, 80) });
    return false;
  }
}

async function screenshot(page: Page, name: string) {
  try {
    const path = `${SCREENSHOT_DIR}/${name}-${Date.now()}.png` as `${string}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log(`  Screenshot: ${path}`);
  } catch {}
}

/** Get visible page text (innerText, not textContent which includes RSC data) */
async function getPageText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim());
}

/** Pre-set sessionStorage to skip the demo banner */
async function skipDemoBanner(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('sf-demo-banner-dismissed', '1');
  });
}

/** Wait for React to hydrate — checks that innerText has meaningful content */
async function waitForHydration(page: Page, timeout = 120_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText || '';
      // After hydration, we should see real UI text like "SUBFROST" or "Admin" etc.
      return text.length > 50 && !text.includes('$Sreact');
    },
    { timeout, polling: 500 }
  );
}

// ---------- Workflow 1: Admin Login ----------

async function testAdminLogin(browser: Browser, cold: boolean): Promise<TimingResult[]> {
  const timings: TimingResult[] = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[Admin]')) console.log(`  [console] ${text}`);
  });

  let totalTransferred = 0;
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (params: any) => {
    totalTransferred += params.encodedDataLength || 0;
  });

  await skipDemoBanner(page);

  try {
    // Navigate — use domcontentloaded (networkidle0 hangs due to WASM)
    await step('Navigate to /admin', async () => {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }, timings);

    // Wait for React hydration
    await step('React hydration complete', async () => {
      await waitForHydration(page);
    }, timings);

    // Wait for password input
    await step('Password input interactive', async () => {
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 30_000 });
    }, timings);

    // Type password
    await step('Type admin secret', async () => {
      await page.type('input[type="password"]', ADMIN_SECRET, { delay: 0 });
    }, timings);

    // Submit and wait for result
    await step('Click Login → auth complete', async () => {
      await page.click('button[type="submit"]');
      // Use innerText to check for real rendered content
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || '';
          return text.includes('Logout') || text.includes('Dashboard') || text.includes('Invalid admin');
        },
        { timeout: 30_000 }
      );
    }, timings);

    // Check result
    const pageText = await getPageText(page);
    const loggedIn = pageText.includes('Logout') || pageText.includes('Dashboard');
    console.log(`  Login result: ${loggedIn ? 'SUCCESS' : 'FAILED'}`);
    await screenshot(page, `admin-${cold ? 'cold' : 'warm'}`);

    // Extract API timing
    const apiLog = consoleLogs.find((l) => l.includes('[Admin] Login fetch took'));
    if (apiLog) {
      const m = apiLog.match(/took (\d+)ms/);
      if (m) timings.push({ label: '  └ API latency (browser console)', ms: parseInt(m[1]) });
    }

    console.log(`  Network: ${(totalTransferred / 1024 / 1024).toFixed(1)}MB transferred`);
  } catch (err: any) {
    console.error(`  Unexpected error: ${err.message}`);
    await screenshot(page, 'admin-error');
  } finally {
    await cdp.detach();
    await page.close();
  }

  return timings;
}

// ---------- Workflow 2: Invite Code Validation ----------
// Flow: Connect Wallet → Create New Wallet → Enter Invite Code → type code → Verify

async function testInviteCode(browser: Browser, cold: boolean): Promise<TimingResult[]> {
  const timings: TimingResult[] = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleLogs: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[InviteCode]')) console.log(`  [console] ${text}`);
  });

  let totalTransferred = 0;
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (params: any) => {
    totalTransferred += params.encodedDataLength || 0;
  });

  await skipDemoBanner(page);

  try {
    // Navigate
    await step('Navigate to /', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }, timings);

    // Wait for hydration
    await step('React hydration complete', async () => {
      await waitForHydration(page);
    }, timings);

    // Click Connect Wallet
    await step('Click "Connect Wallet"', async () => {
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || '';
          return text.includes('Connect Wallet');
        },
        { timeout: 30_000 }
      );
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find((b) => b.innerText?.includes('Connect Wallet'));
        btn?.click();
      });
      // Wait for modal to appear (has "CONNECT WALLET" heading)
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || '';
          return text.includes('Create New Wallet') || text.includes('Keystore Wallet');
        },
        { timeout: 10_000 }
      );
    }, timings);

    // Click "Create New Wallet" to get to the wallet creation view
    await step('Click "Create New Wallet"', async () => {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"], [class*="cursor-pointer"]'));
        const btn = btns.find((b) => b.textContent?.includes('Create New Wallet'));
        if (btn instanceof HTMLElement) btn.click();
      });
      // Wait for the create view (shows invite code button or validated state)
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || '';
          return text.includes('Invite Code') || text.includes('invite') || text.includes('CREATE NEW WALLET');
        },
        { timeout: 10_000 }
      );
    }, timings);

    await screenshot(page, `invite-create-view-${cold ? 'cold' : 'warm'}`);

    // Click "Enter Invite Code" button to navigate to invite-code view
    await step('Click "Enter Invite Code"', async () => {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        // Look for the invite code button — might say "Enter Invite Code" or similar
        const btn = btns.find(
          (b) =>
            b.textContent?.includes('Invite Code') ||
            b.textContent?.includes('Enter Code') ||
            b.textContent?.includes('Invited')
        );
        if (btn) btn.click();
        else throw new Error('No invite code button found. Buttons: ' + btns.map(b => b.textContent?.trim().slice(0, 30)).join(', '));
      });
      // Wait for invite code input
      await page.waitForFunction(
        () => {
          const inputs = Array.from(document.querySelectorAll('input'));
          return inputs.some((i) => i.offsetParent !== null && i.type !== 'hidden');
        },
        { timeout: 10_000 }
      );
    }, timings);

    // Type invite code
    await step('Type invite code', async () => {
      const handle = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.find((i) => i.offsetParent !== null && i.type !== 'hidden');
      });
      const el = handle.asElement();
      if (!el) throw new Error('No visible input found');
      await el.type(INVITE_CODE, { delay: 0 });
    }, timings);

    // Click verify
    await step('Click Verify → validation result', async () => {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(
          (b) =>
            b.textContent?.includes('Verify') ||
            b.textContent?.includes('Submit') ||
            b.textContent?.includes('Validate')
        );
        if (btn) btn.click();
        else throw new Error('No verify button found');
      });
      // Wait for validation result
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || '';
          return (
            text.includes('verified') ||
            text.includes('validated') ||
            text.includes('Invalid') ||
            text.includes('invalid') ||
            text.includes('Unable')
          );
        },
        { timeout: 30_000 }
      );
    }, timings);

    await screenshot(page, `invite-result-${cold ? 'cold' : 'warm'}`);

    // Check result
    const pageText = await getPageText(page);
    if (pageText.includes('verified') || pageText.includes('validated')) {
      console.log(`  Invite code result: VALID`);
    } else if (pageText.includes('Invalid')) {
      console.log(`  Invite code result: INVALID`);
    } else {
      console.log(`  Invite code result: UNKNOWN`);
    }

    // Extract API timing
    const apiLog = consoleLogs.find((l) => l.includes('[InviteCode] Validation took'));
    if (apiLog) {
      const m = apiLog.match(/took (\d+)ms/);
      if (m) timings.push({ label: '  └ API latency (browser console)', ms: parseInt(m[1]) });
    }

    console.log(`  Network: ${(totalTransferred / 1024 / 1024).toFixed(1)}MB transferred`);
  } catch (err: any) {
    console.error(`  Unexpected error: ${err.message}`);
    await screenshot(page, 'invite-error');
  } finally {
    await cdp.detach();
    await page.close();
  }

  return timings;
}

// ---------- Direct API latency ----------

async function testApiDirect(): Promise<TimingResult[]> {
  const timings: TimingResult[] = [];

  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    timings.push({ label: `GET /api/admin/stats → ${res.status} (#${i + 1})`, ms: Date.now() - t0 });
  }

  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(`${BASE_URL}/api/invite-codes/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: INVITE_CODE }),
    });
    const data = await res.json();
    timings.push({
      label: `POST /api/invite-codes/validate → ${data.valid ? 'valid' : 'invalid'} (#${i + 1})`,
      ms: Date.now() - t0,
    });
  }

  return timings;
}

// ---------- Main ----------

async function main() {
  console.log(`\nPerformance Reproduction Test`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  // Direct API test
  console.log('--- Direct API latency (server→server, no browser) ---');
  const apiTimings = await testApiDirect();
  printTimings('Direct API Latency (3 runs each)', apiTimings);

  // Browser tests
  console.log('--- Launching headless Chrome (fresh profile, no cache) ---');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--incognito',
    ],
  });

  try {
    console.log('\n--- [COLD] Admin Login (/admin) ---');
    const t1 = await testAdminLogin(browser, true);
    printTimings('Admin Login (COLD — no cache)', t1);

    console.log('\n--- [COLD] Invite Code Validation ---');
    const t2 = await testInviteCode(browser, true);
    printTimings('Invite Code Validation (COLD — first visit)', t2);

    console.log('\n--- [WARM] Admin Login (cached) ---');
    const t3 = await testAdminLogin(browser, false);
    printTimings('Admin Login (WARM — cached)', t3);

    console.log('\n--- [WARM] Invite Code (cached) ---');
    const t4 = await testInviteCode(browser, false);
    printTimings('Invite Code Validation (WARM — cached)', t4);
  } finally {
    await browser.close();
  }

  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
