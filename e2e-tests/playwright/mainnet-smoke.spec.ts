/**
 * mainnet-smoke.spec.ts — Mainnet regression smoke test via OYL wallet extension
 *
 * Launches a real Chromium instance with the OYL wallet Chrome extension loaded,
 * imports a funded seed phrase, connects to app.subfrost.io, and runs the primary
 * subfrost flows against mainnet:
 *
 *   Flow 1: BTC → DIESEL  (atomic wrap+swap — uses useAtomicWrapSwapMutation)
 *   Flow 2: DIESEL → BTC  (token→BTC — uses useTokenToBtcSwap)
 *   Flow 3: BTC → frBTC   (wrap — uses useWrapMutation)          [if UTXOs free]
 *   Flow 4: frBTC → BTC   (unwrap — uses useUnwrapMutation)      [if UTXOs free]
 *   Flow 5: Add liquidity  (BTC+DIESEL — useAtomicWrapAddLiquidityMutation) [if UTXOs free]
 *   Flow 6: Remove liquidity (useRemoveLiquidityMutation)        [if LP tokens present]
 *
 * After each broadcast: txid is captured, fee is fetched from mempool.space,
 * and results are written to e2e-tests/camoufox/smoke_report.json for
 * later trace evaluation via /alkanes-trace-digest.
 *
 * ## Run
 *   npx playwright test mainnet-smoke --project=chromium-mainnet-oyl --headed
 *
 * ## Prerequisites
 *   - OYL extension installed at OYL_EXT_PATH (see below)
 *   - SMOKE_SEED env var set to the funded 12-word seed phrase
 *   - SMOKE_PASSWORD env var set (used to unlock OYL, default: "Testtest1!")
 *   - Network connectivity to app.subfrost.io and mempool.space
 *
 * ## OYL extension path
 *   Resolved from the installed Chrome profile at:
 *   ~/Library/Application Support/Google/Chrome/Default/Extensions/
 *   ilolmnhjbbggkmopnemiphomhaojndmb/1.17.1_0
 *
 * ## UTXO lock handling
 *   If a flow detects "Insufficient funds" or the confirm button stays disabled
 *   after quote loads, it marks the flow SKIPPED with reason "utxo_locked" and
 *   continues. Do NOT retry — mempool-pending UTXOs self-heal after confirmation.
 *
 * ## Source references
 *   hooks/useAtomicWrapSwapMutation.ts   — Flow 1
 *   hooks/useTokenToBtcSwap.ts           — Flow 2
 *   hooks/useWrapMutation.ts             — Flow 3
 *   hooks/useUnwrapMutation.ts           — Flow 4
 *   hooks/useAtomicWrapAddLiquidityMutation.ts — Flow 5
 *   hooks/useRemoveLiquidityMutation.ts  — Flow 6
 *   i18n/en.ts                           — all button label strings
 *   context/WalletContext.tsx:1451       — OYL connect flow
 */

import { test, expect, type BrowserContext, type Page, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Config
// ============================================================================

const OYL_EXT_PATH = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default/Extensions/ilolmnhjbbggkmopnemiphomhaojndmb/1.17.1_0',
);

const APP_URL = process.env.SMOKE_APP_URL || 'http://localhost:3000';

// Seed phrase injected via SMOKE_SEED env var — never hardcode in source.
// Set before running: export SMOKE_SEED="word1 word2 ... word12"
const SEED = process.env.SMOKE_SEED || '';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Testtest1!';

// Smallest swap amounts — ~$0.80 worth at ~$78k BTC.
// 0.00001 BTC ≈ $0.78 — enough to cover fees on mainnet at normal fee rates.
const SWAP_BTC_AMOUNT = '0.00001';
const SWAP_DIESEL_AMOUNT = '50';
const WRAP_BTC_AMOUNT = '0.00001';
const LIQUIDITY_BTC_AMOUNT = '0.00001';

const REPORT_PATH = path.join(__dirname, '../camoufox/smoke_report.json');

// ============================================================================
// Report helpers
// ============================================================================

interface FlowResult {
  name: string;
  status: 'success' | 'skipped' | 'error';
  txid: string | null;
  fee_sats: number | null;
  fee_usd: number | null;
  skip_reason: string | null;
  error: string | null;
}

interface SmokeReport {
  run_at: string;
  wallet: string;
  network: string;
  seed_hint: string;
  flows: FlowResult[];
  total_fee_sats: number;
  total_fee_usd: number;
  btc_price_usd: number;
  aberrations: string[];
}

function initReport(): SmokeReport {
  return {
    run_at: new Date().toISOString(),
    wallet: 'OYL',
    network: 'mainnet',
    seed_hint: SEED ? `${SEED.split(' ')[0]} ... ${SEED.split(' ').slice(-1)[0]}` : 'NOT_SET',
    flows: [],
    total_fee_sats: 0,
    total_fee_usd: 0,
    btc_price_usd: 0,
    aberrations: [],
  };
}

function saveReport(report: SmokeReport) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

async function fetchFeeSats(txid: string): Promise<number | null> {
  // mempool.space API — returns fee in sats
  try {
    const res = await fetch(`https://mempool.space/api/tx/${txid}`);
    if (!res.ok) return null;
    const tx = await res.json() as { fee?: number };
    return tx.fee ?? null;
  } catch {
    return null;
  }
}

async function fetchBtcPrice(): Promise<number> {
  try {
    const res = await fetch(`${APP_URL}/api/btc-price`);
    if (!res.ok) return 0;
    const data = await res.json() as { USD?: number; usd?: number };
    return data.USD ?? data.usd ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// OYL extension helpers
// ============================================================================

/**
 * Wait for the OYL extension tab to open and return it.
 * OYL auto-opens its onboarding page as a new tab on first install/unlock.
 * If no tab opens within timeout, navigate directly to the tabs/index.html page.
 */
async function getOylTab(context: BrowserContext, timeoutMs = 10_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pages = context.pages();
    const oylPage = pages.find(p => p.url().startsWith('chrome-extension://ilolmnhjbbggkmopnemiphomhaojndmb'));
    if (oylPage) return oylPage;
    await new Promise(r => setTimeout(r, 500));
  }
  // Fallback: open the OYL tab page directly
  const oylPage = await context.newPage();
  await oylPage.goto('chrome-extension://ilolmnhjbbggkmopnemiphomhaojndmb/tabs/index.html');
  return oylPage;
}

/**
 * Import seed phrase into OYL wallet.
 * OYL onboarding: Welcome screen has card divs (not buttons) for
 * "Create new wallet" / "Import wallet" / "Connect hardware wallet".
 * We click by text content using page.getByText which matches any element.
 */
async function importOylWallet(oylPage: Page, seed: string, password: string): Promise<void> {
  await oylPage.waitForLoadState('domcontentloaded');
  await oylPage.waitForTimeout(2000);
  await oylPage.screenshot({ path: '/tmp/oyl-01-loaded.png' });

  // Step 1: Click "Import wallet" card — OYL uses div cards, not buttons
  // getByText matches any element with that text content
  const importCard = oylPage.getByText('Import wallet', { exact: true });
  await expect(importCard).toBeVisible({ timeout: 10_000 });
  await importCard.click();
  await oylPage.waitForTimeout(1500);
  await oylPage.screenshot({ path: '/tmp/oyl-02-import-clicked.png' });

  // Step 2: Enter seed words — OYL shows 12 masked inputs labeled 01..12.
  // Fill each input individually via JS to bypass React synthetic events and
  // avoid clipboard permission prompts.
  const words = seed.trim().split(/\s+/);
  await oylPage.screenshot({ path: '/tmp/oyl-02b-seed-screen.png' });

  // Wait for the seed input grid to appear
  await oylPage.waitForSelector('input', { timeout: 10_000 });

  // Fill via evaluate — locating by input order, bypassing browser security prompts
  await oylPage.evaluate((wordList) => {
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    for (let i = 0; i < Math.min(wordList.length, inputs.length); i++) {
      if (setter) {
        setter.call(inputs[i], wordList[i]);
      } else {
        inputs[i].value = wordList[i];
      }
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, words);
  await oylPage.waitForTimeout(800);

  await oylPage.screenshot({ path: '/tmp/oyl-03-seed-entered.png' });

  await oylPage.screenshot({ path: '/tmp/oyl-03b-after-js-fill.png' });

  // Step 3: Click the "Import" button to advance past seed entry.
  // Use force:true since OYL may keep the button disabled briefly after JS fill.
  const continueBtn = oylPage.locator('button').filter({ hasText: /^import$/i }).first();
  const continueBtnAlt = oylPage.locator('button').filter({ hasText: /continue|next|restore/i }).first();
  const seedBtn = await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)
    ? continueBtn
    : continueBtnAlt;
  await seedBtn.click({ force: true });
  await oylPage.waitForTimeout(2000);
  await oylPage.screenshot({ path: '/tmp/oyl-04-after-seed-continue.png' });

  // Step 4: Password screen — fill password + confirm password
  const pwInputs = oylPage.locator('input[type=password]');
  const pwCount = await pwInputs.count().catch(() => 0);
  if (pwCount >= 1) {
    await pwInputs.nth(0).fill(password);
    if (pwCount >= 2) await pwInputs.nth(1).fill(password);
  }

  await oylPage.screenshot({ path: '/tmp/oyl-04b-password-filled.png' });

  // Step 4b: Check "I agree to Terms & Privacy Policy".
  // OYL uses a Radix UI / shadcn Checkbox: the clickable element is
  // button[role=checkbox] or a span acting as checkbox — NOT input[type=checkbox].
  // Strategy: try multiple selectors in priority order.
  const termsClicked = await oylPage.evaluate(() => {
    // 1. Radix checkbox button
    const radixCb = document.querySelector('button[role=checkbox]') as HTMLElement | null;
    if (radixCb) { radixCb.click(); return 'radix-button'; }
    // 2. Any element with data-state=unchecked (Radix)
    const unchecked = document.querySelector('[data-state=unchecked]') as HTMLElement | null;
    if (unchecked) { unchecked.click(); return 'data-state-unchecked'; }
    // 3. The row containing the text — click the first child (the visual checkbox)
    const rows = Array.from(document.querySelectorAll('*'));
    const row = rows.find(el =>
      el.children.length > 0 &&
      el.textContent?.includes('I agree to the') &&
      el.textContent?.includes('Terms')
    ) as HTMLElement | undefined;
    if (row) {
      const firstChild = row.firstElementChild as HTMLElement | null;
      if (firstChild) { firstChild.click(); return 'first-child'; }
      (row as HTMLElement).click();
      return 'row';
    }
    return 'not-found';
  });
  console.log(`[OYL] Terms checkbox click strategy: ${termsClicked}`);
  await oylPage.waitForTimeout(600);
  await oylPage.screenshot({ path: '/tmp/oyl-04c-terms-checked.png' });

  // Step 5: Submit password — wait for button to become enabled after checkbox
  const submitBtn = oylPage.locator('button').filter({ hasText: /create|confirm|submit|next|continue|finish|import/i }).first();
  await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  await submitBtn.click();

  await oylPage.waitForTimeout(2000);
  await oylPage.screenshot({ path: '/tmp/oyl-05-after-password.png' });

  // Step 6: OYL may show a "Set up your account" profile screen (step 05/05).
  // Click "Skip" to bypass it.
  const skipBtn = oylPage.locator('button').filter({ hasText: /^skip$/i }).first();
  if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipBtn.click();
    await oylPage.waitForTimeout(1500);
  }

  await oylPage.screenshot({ path: '/tmp/oyl-06-wallet-ready.png' });
}

/**
 * Unlock an already-set-up OYL wallet with password.
 * Used if OYL shows a login screen instead of onboarding.
 */
async function unlockOylWallet(oylPage: Page, password: string): Promise<void> {
  const pwInput = oylPage.locator('input[type=password]').first();
  if (await pwInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pwInput.fill(password);
    const unlockBtn = oylPage.locator('button').filter({ hasText: /unlock|login|continue/i }).first();
    await unlockBtn.click();
    await oylPage.waitForTimeout(1500);
  }
}

// ============================================================================
// App helpers
// ============================================================================

/**
 * Set the app network to mainnet via localStorage + reload.
 * Required when pointing at localhost:3000 which may default to devnet.
 */
async function setNetworkMainnet(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('subfrost_selected_network', 'mainnet');
    window.dispatchEvent(new CustomEvent('network-changed', { detail: 'mainnet' }));
  });
  // Reload to make network stick across all providers
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);
  // Verify
  const network = await page.evaluate(() => localStorage.getItem('subfrost_selected_network'));
  console.log(`[network] Set to: ${network}`);
}

/** Dismiss the subfrost "I Understand" / beta disclaimer modal. */
async function dismissDisclaimer(page: Page): Promise<void> {
  // Wait up to 8s for the modal to appear (app loads async), then dismiss it
  const btn = page.locator('button').filter({ hasText: /understand/i }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 8000 });
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    // Double-check it's gone
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch {
    // Modal not present — already dismissed or not shown
  }
}

/** Connect OYL wallet to the app. */
async function connectOylToApp(appPage: Page, context: BrowserContext): Promise<void> {
  // Bring app tab to front — OYL onboarding leaves its tab as the active window
  await appPage.bringToFront();
  await appPage.waitForTimeout(800);

  // Dismiss the subfrost beta modal first (it may reappear after bringToFront)
  await dismissDisclaimer(appPage);

  // Click the visible "Connect Wallet" button — the app shows it in two places:
  // 1. Top-right nav button (may be hidden behind modal)
  // 2. Big blue button in the swap form (always visible when not connected)
  // Use the first VISIBLE one.
  const connectBtns = appPage.locator('button').filter({ hasText: /connect wallet/i });
  const count = await connectBtns.count();
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const btn = connectBtns.nth(i);
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // Fallback: force-click the first one
    await connectBtns.first().click({ force: true });
  }
  await appPage.waitForTimeout(1000);
  await appPage.screenshot({ path: '/tmp/smoke-picker-modal.png' });

  // CONNECT WALLET modal → "Connect Browser Extension" (OYL already loaded, 1 detected)
  const extBtn = appPage.getByText('Connect Browser Extension', { exact: true });
  await expect(extBtn).toBeVisible({ timeout: 6000 });
  await extBtn.click();
  await appPage.waitForTimeout(1000);
  await appPage.screenshot({ path: '/tmp/smoke-ext-picker.png' });

  // Sub-picker lists INSTALLED WALLETS (OYL) and OTHER WALLETS (OKX, UniSat, Xverse).
  // OYL is rendered as a <button> containing "Oyl Wallet" text in the INSTALLED section.
  //
  // The connection request opens as a NEW separate OS window (also tabs/index.html but
  // a different Page instance). Snapshot existing pages BEFORE clicking so we can
  // identify the newly-opened one after.
  const pagesBefore = new Set(context.pages().map(p => p));
  const approvalPagePromise = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);

  const oylBtn = appPage.getByRole('button', { name: /oyl wallet/i }).first();
  const oylVisible = await oylBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (oylVisible) {
    await oylBtn.click();
    console.log('[OYL] Clicked Oyl Wallet button via getByRole');
  } else {
    const oylClicked = await appPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const oyl = btns.find(b => /oyl wallet/i.test(b.textContent || ''));
      if (oyl) { oyl.click(); return true; }
      return false;
    });
    console.log(`[OYL] Oyl Wallet JS click fallback: ${oylClicked}`);
  }

  // OYL opens a "Connection request" window — same tabs/index.html URL but a NEW page.
  // Wait for any page that wasn't open before the click.
  await appPage.screenshot({ path: '/tmp/smoke-pre-approval.png' });

  // First try: waitForEvent gives us the new page directly
  let approvalPopup: Page | null = await approvalPagePromise;

  // If waitForEvent fired on the OYL onboarding tab instead of the new popup,
  // poll context.pages() for a page that wasn't in pagesBefore
  if (!approvalPopup || pagesBefore.has(approvalPopup)) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const newPage = context.pages().find(p => !pagesBefore.has(p));
      if (newPage) { approvalPopup = newPage; break; }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (approvalPopup) {
    await approvalPopup.bringToFront();
    await approvalPopup.waitForLoadState('domcontentloaded');
    await approvalPopup.screenshot({ path: '/tmp/oyl-approval-popup.png' });
    console.log(`[OYL] Approval popup URL: ${approvalPopup.url()}`);
    // Click the black "Connect" button (OYL shows Connect + Cancel)
    const approveBtn = approvalPopup.locator('button').filter({ hasText: /^connect$/i }).first();
    if (await approveBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await approveBtn.click();
      console.log('[OYL] Clicked Connect on approval popup');
      // OYL closes the popup immediately after Connect — waitForTimeout on a closed page throws.
      await approvalPopup.waitForTimeout(2000).catch(() => {});
    } else {
      const anyApprove = approvalPopup.locator('button').filter({ hasText: /connect|approve|allow|confirm/i }).first();
      if (await anyApprove.isVisible({ timeout: 5000 }).catch(() => false)) {
        await anyApprove.click();
        await approvalPopup.waitForTimeout(2000).catch(() => {});
      }
    }
    await approvalPopup.screenshot({ path: '/tmp/oyl-approval-after.png' }).catch(() => {});
  } else {
    console.log('[OYL] No new approval popup detected — OYL may have auto-approved');
  }

  // Return focus to app
  await appPage.bringToFront();
  await appPage.waitForTimeout(2000);
  await appPage.screenshot({ path: '/tmp/smoke-connected.png' });
  console.log(`[OYL] Browser extension connect flow complete`);
}

/**
 * Set React-controlled number input value using the native setter.
 * Direct .fill() bypasses React's synthetic event system and leaves
 * the component state stale. The native setter + input event fires correctly.
 */
async function setNumberInput(page: Page, inputIndex: number, value: string): Promise<void> {
  await page.evaluate(
    ({ idx, val }) => {
      const inputs = document.querySelectorAll('input[type=number]');
      const el = inputs[idx] as HTMLInputElement;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { idx: inputIndex, val: value },
  );
}

/** Find and click a button by exact text match (case-insensitive). */
async function clickButton(page: Page, text: string): Promise<boolean> {
  const btn = page.locator('button').filter({ hasText: new RegExp(text, 'i') }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    return true;
  }
  return false;
}

/**
 * Dismiss any currently-visible SwapSuccessNotification toast.
 * The toast persists across flows and would cause stale txid re-capture.
 * Clicks the X (close) button on the expanded notification card.
 */
async function dismissExistingToast(page: Page): Promise<void> {
  await page.evaluate(() => {
    // SwapSuccessNotification close button: button inside the fixed bottom-20 right-6 card
    const links = Array.from(document.querySelectorAll('a[href*="espo.sh/tx/"]'));
    for (const a of links) {
      // Walk up to find the notification card, then find its close button
      let node: HTMLElement | null = a as HTMLElement;
      while (node && node !== document.body) {
        // Look for a close/X button sibling or within the card
        const closeBtn = node.querySelector('button[aria-label*="close"], button[aria-label*="Close"], button svg') as HTMLElement | null;
        if (closeBtn) { closeBtn.click(); return; }
        // Try clicking any button in the card that might be close
        const btns = Array.from(node.querySelectorAll('button')) as HTMLElement[];
        const x = btns.find(b => b.querySelector('svg') && !b.textContent?.trim());
        if (x) { x.click(); return; }
        node = node.parentElement;
      }
    }
  }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Wait for a NEW txid to appear after a swap broadcast, excluding any already-known txid.
 * SwapSuccessNotification renders in bottom-right (fixed bottom-20 right-6) and
 * contains an anchor: <a href="https://espo.sh/tx/{txid}">{txid}</a>
 */
async function captureTxid(page: Page, timeoutMs = 60_000, excludeTxid?: string): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const txid = await page.evaluate((exclude) => {
      const HEX64 = /([a-f0-9]{64})/i;
      // 1. Primary: espo.sh link in the SwapSuccessNotification bottom-right card
      const espLinks = Array.from(document.querySelectorAll('a[href*="espo.sh/tx/"]'));
      for (const a of espLinks) {
        const href = (a as HTMLAnchorElement).href || '';
        const m = href.match(HEX64);
        if (m && m[1] !== exclude) return m[1];
      }
      return null;
    }, excludeTxid ?? null);
    if (txid) return txid;
    await page.waitForTimeout(2000);
  }
  return null;
}

/**
 * Detect UTXO lock error in page text.
 * Returns true if the page shows an insufficient-funds or locked UTXO message.
 */
async function detectUtxoLock(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body.innerText.toLowerCase());
  return (
    text.includes('insufficient funds') ||
    text.includes('insufficient balance') ||
    text.includes('utxo') && text.includes('lock') ||
    text.includes('not enough') ||
    text.includes('cannot afford')
  );
}

/**
 * Close any open sf-popup-overlay (OYL signing popup rendered inside the app).
 * Tries: 1) click the overlay backdrop, 2) press Escape, 3) passive wait.
 * The overlay uses pointer-events:all and blocks all clicks beneath it.
 */
async function waitForPopupOverlayClose(page: Page, timeoutMs = 5000): Promise<void> {
  const overlaySelector = '.sf-popup-overlay.sf-popup-open';

  // Check if overlay exists at all — skip early if not present
  const hasOverlay = await page.evaluate((sel) => !!document.querySelector(sel), overlaySelector).catch(() => false);
  if (!hasOverlay) return;

  console.log('[overlay] sf-popup-overlay detected — attempting active dismissal');

  // Strategy 1: click the overlay backdrop itself (clicking the dark bg typically closes the popup)
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel) as HTMLElement | null;
    if (overlay) overlay.click();
  }, overlaySelector).catch(() => {});
  await page.waitForTimeout(400);

  // Check if it closed
  let gone = await page.evaluate((sel) => !document.querySelector(sel), overlaySelector).catch(() => true);
  if (gone) { console.log('[overlay] closed via backdrop click'); return; }

  // Strategy 2: Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  gone = await page.evaluate((sel) => !document.querySelector(sel), overlaySelector).catch(() => true);
  if (gone) { console.log('[overlay] closed via Escape'); return; }

  // Strategy 3: click .sf-popup-close button (aria-label="Close") or any X button inside overlay
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel);
    if (!overlay) return;
    // subfrost ConnectWalletModal always has a button.sf-popup-close[aria-label="Close"]
    const sfClose = (overlay.querySelector('.sf-popup-close') ||
      overlay.querySelector('button[aria-label="Close"]') ||
      overlay.querySelector('button[aria-label*="close"]') ||
      overlay.querySelector('button[aria-label*="cancel"]')) as HTMLElement | null;
    if (sfClose) { sfClose.click(); return; }
    // Try the X / dismiss button — common pattern
    const allBtns = Array.from(overlay.querySelectorAll('button')) as HTMLElement[];
    const xBtn = allBtns.find(b => /^(×|✕|✗|X|close|cancel|dismiss)$/i.test((b.textContent || '').trim()));
    if (xBtn) xBtn.click();
    // Also try dispatching pointerdown + click on the overlay itself.
    // handleOverlayPointerDown sets backdropPointerStartedRef=true when target===currentTarget.
    // Since we dispatch on the overlay element, target===currentTarget is satisfied natively.
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, overlaySelector).catch(() => {});
  await page.waitForTimeout(400);

  // Strategy 4: passive wait for remaining timeout
  const remaining = Math.max(200, timeoutMs - 1600);
  try {
    await page.waitForFunction(
      (sel) => !document.querySelector(sel),
      overlaySelector,
      { timeout: remaining }
    );
    console.log('[overlay] closed (passive wait)');
  } catch {
    console.log('[overlay] still open after all strategies — proceeding with force:true clicks');
  }
}

/**
 * Confirm an OYL signing popup.
 * OYL opens a new Chrome extension window (tabs/index.html?mode=signPsbt or similar)
 * for every transaction that needs signing. This window is NOT the existing OYL tab —
 * it's a brand-new Page. We snapshot existing pages before triggering the action,
 * then wait for a new one to appear and click its Confirm/Sign button.
 *
 * Call this AFTER the action that triggers signing (e.g. clicking "CONFIRM SWAP").
 * The pagesBefore snapshot must be taken BEFORE that action.
 */
async function confirmOylSigningPopup(
  context: BrowserContext,
  pagesBefore: Set<Page>,
  screenshotPath: string,
  timeoutMs = 20_000,
): Promise<void> {
  // Find the new page that wasn't open before the triggering action
  let signingPage: Page | null = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signingPage = context.pages().find(p => !pagesBefore.has(p)) ?? null;
    if (signingPage) break;
    await new Promise(r => setTimeout(r, 300));
  }

  if (!signingPage) {
    console.log('[OYL signing] No new popup detected within timeout');
    return;
  }

  await signingPage.bringToFront();
  await signingPage.waitForLoadState('domcontentloaded').catch(() => {});
  await signingPage.screenshot({ path: screenshotPath }).catch(() => {});
  console.log(`[OYL signing] Popup URL: ${signingPage.url()}`);

  // OYL signing popup has a "Confirm" button (sometimes "Sign" or "Send")
  const confirmBtn = signingPage.locator('button').filter({ hasText: /^confirm$/i }).first();
  if (await confirmBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await confirmBtn.click();
    console.log('[OYL signing] Clicked Confirm');
  } else {
    const anyBtn = signingPage.locator('button').filter({ hasText: /confirm|sign|approve|send/i }).first();
    if (await anyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await anyBtn.click();
      console.log('[OYL signing] Clicked fallback approve button');
    }
  }
  // Popup closes itself after confirm — swallow the closed-page error
  await signingPage.waitForTimeout(2000).catch(() => {});
}

/**
 * Select a token in the sell or buy picker.
 * Clicks the current token button (sell=first, buy=second) to open the picker,
 * then clicks the target token by symbol.
 */
async function selectToken(page: Page, side: 'sell' | 'buy', symbol: string): Promise<void> {
  // Actively dismiss any OYL popup overlay before clicking token selectors
  await waitForPopupOverlayClose(page, 5000);

  // Use JS direct click on the token selector — bypasses any residual pointer-event blockers
  const sideIdx = side === 'sell' ? 0 : 1;
  const clicked = await page.evaluate((idx) => {
    // Find all token selector buttons — they show ticker text like "BTC", "DIESEL", "frBTC"
    const btns = Array.from(document.querySelectorAll('button')).filter(b =>
      /^(BTC|DIESEL|frBTC|FUEL|USDT|USDC)/i.test((b.textContent || '').trim())
    );
    if (btns[idx]) { (btns[idx] as HTMLElement).click(); return true; }
    return false;
  }, sideIdx);

  if (!clicked) {
    // Fallback: Playwright click with force
    const sideButtons = page.locator('button').filter({ hasText: /^(BTC|DIESEL|frBTC|FUEL|USDT|USDC)/i });
    const btn = sideButtons.nth(sideIdx);
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click({ force: true });
    }
  }
  await page.waitForTimeout(700);

  // Find the token in the picker — use JS click to guarantee it fires
  const pickerClicked = await page.evaluate((sym) => {
    const opts = Array.from(document.querySelectorAll('button')).filter(b =>
      new RegExp(`^${sym}`, 'i').test((b.textContent || '').trim())
    );
    if (opts[0]) { (opts[0] as HTMLElement).click(); return true; }
    return false;
  }, symbol);

  if (!pickerClicked) {
    const tokenOption = page.locator('button').filter({ hasText: new RegExp(`^${symbol}`, 'i') }).first();
    if (await tokenOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tokenOption.click({ force: true });
    }
  }
  await page.waitForTimeout(600);
}

// ============================================================================
// Main test
// ============================================================================

test.describe('Mainnet OYL Smoke Test', () => {
  test.setTimeout(600_000); // 10 min — mainnet txs can be slow

  let context: BrowserContext;
  let appPage: Page;
  let lastTxid: string | null = null; // tracks most recent txid to exclude stale toasts
  const report = initReport();

  test.beforeAll(async () => {
    if (!SEED) {
      throw new Error(
        'SMOKE_SEED environment variable is not set.\n' +
        'Export the funded 12-word seed before running:\n' +
        '  export SMOKE_SEED="word1 word2 ... word12"',
      );
    }

    // Fetch BTC price upfront for fee USD conversion
    report.btc_price_usd = await fetchBtcPrice();

    // Launch Chromium with OYL extension loaded as an unpacked extension.
    // Playwright requires a persistent context (user data dir) to load extensions.
    const userDataDir = path.join(os.tmpdir(), `oyl-smoke-${Date.now()}`);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // extensions require headed mode
      args: [
        `--disable-extensions-except=${OYL_EXT_PATH}`,
        `--load-extension=${OYL_EXT_PATH}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--allow-insecure-localhost',
        // Pre-grant clipboard so no permission dialog blocks the paste flow
        '--unsafely-treat-insecure-origin-as-secure=chrome-extension://ilolmnhjbbggkmopnemiphomhaojndmb',
      ],
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    // Wait for OYL to open its onboarding tab, then set up the wallet
    const oylTab = await getOylTab(context);
    await oylTab.screenshot({ path: '/tmp/oyl-00-initial.png' });

    // OYL may show unlock screen (existing wallet) or onboarding (fresh profile)
    const hasPasswordInput = await oylTab.locator('input[type=password]').isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPasswordInput) {
      await unlockOylWallet(oylTab, PASSWORD);
    } else {
      await importOylWallet(oylTab, SEED, PASSWORD);
    }

    // Navigate to the app
    appPage = await context.newPage();
    await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dismissDisclaimer(appPage);
    await appPage.waitForTimeout(2000);

    // Ensure network is mainnet (critical when running against localhost:3000)
    await setNetworkMainnet(appPage);
    await dismissDisclaimer(appPage);
    await appPage.waitForTimeout(1500);

    // Connect OYL wallet to the app
    await connectOylToApp(appPage, context);
    await appPage.screenshot({ path: '/tmp/smoke-connected.png' });
  });

  test.afterAll(async () => {
    // Compute totals
    report.total_fee_sats = report.flows.reduce((acc, f) => acc + (f.fee_sats ?? 0), 0);
    if (report.btc_price_usd > 0) {
      report.total_fee_usd = (report.total_fee_sats / 1e8) * report.btc_price_usd;
      // Back-fill fee_usd for flows that only have fee_sats
      for (const f of report.flows) {
        if (f.fee_sats !== null && f.fee_usd === null) {
          f.fee_usd = parseFloat(((f.fee_sats / 1e8) * report.btc_price_usd).toFixed(4));
        }
      }
    }
    saveReport(report);
    console.log('\n=== SMOKE REPORT ===');
    console.log(JSON.stringify(report, null, 2));
    await context.close();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 1: BTC → DIESEL  (atomic wrap+swap)
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 1: BTC → DIESEL swap', async () => {
    const flow: FlowResult = {
      name: 'btc_to_diesel',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      // Sell side: BTC (should be default), Buy side: DIESEL
      await selectToken(appPage, 'sell', 'BTC');
      await selectToken(appPage, 'buy', 'DIESEL');
      await appPage.waitForTimeout(1000);

      // Enter sell amount
      await setNumberInput(appPage, 0, SWAP_BTC_AMOUNT);
      await appPage.waitForTimeout(3000); // wait for quote to compute

      // Check for UTXO lock before submitting
      if (await detectUtxoLock(appPage)) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked';
        report.flows.push(flow);
        return;
      }

      // Confirm button (i18n key: swap.confirmSwap → "CONFIRM SWAP")
      const confirmBtn = appPage.locator('button').filter({ hasText: /confirm swap/i }).first();
      await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
      // Dismiss any overlay that may have re-opened after wallet connection
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.screenshot({ path: '/tmp/smoke-flow1-presubmit.png' });

      // Snapshot pages before click — signing popup is a NEW page, not an existing one
      await dismissExistingToast(appPage);
      const pagesBeforeSign = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm swap/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeSign, '/tmp/oyl-sign-flow1.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow1-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 1] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow1-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
    expect(flow.status).not.toBe('error');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 2: DIESEL → BTC  (token→BTC swap+unwrap)
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 2: DIESEL → BTC swap', async () => {
    const flow: FlowResult = {
      name: 'diesel_to_btc',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      await selectToken(appPage, 'sell', 'DIESEL');
      await selectToken(appPage, 'buy', 'BTC');
      await appPage.waitForTimeout(1000);

      await setNumberInput(appPage, 0, SWAP_DIESEL_AMOUNT);
      await appPage.waitForTimeout(3000);

      if (await detectUtxoLock(appPage)) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked';
        report.flows.push(flow);
        return;
      }

      // Check if DIESEL balance is insufficient (flow 1 may not have landed yet)
      const balanceText = await appPage.evaluate(() => document.body.innerText);
      if (balanceText.toLowerCase().includes('insufficient') || balanceText.toLowerCase().includes('balance: 0')) {
        flow.status = 'skipped';
        flow.skip_reason = 'insufficient_diesel_balance_flow1_not_confirmed';
        report.flows.push(flow);
        return;
      }

      const confirmBtn = appPage.locator('button').filter({ hasText: /confirm swap/i }).first();
      await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
      await waitForPopupOverlayClose(appPage, 5000);
      await dismissExistingToast(appPage);
      await appPage.screenshot({ path: '/tmp/smoke-flow2-presubmit.png' });
      const pagesBeforeFlow2 = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm swap/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeFlow2, '/tmp/oyl-sign-flow2.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow2-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 2] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow2-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
    // Flow 2 failure is non-fatal — DIESEL may not have confirmed yet
    if (flow.status === 'error') {
      console.warn(`[Flow 2] error (non-fatal): ${flow.error}`);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 3: BTC → frBTC wrap
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 3: BTC → frBTC wrap', async () => {
    const flow: FlowResult = {
      name: 'btc_to_frbtc_wrap',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      await selectToken(appPage, 'sell', 'BTC');
      await selectToken(appPage, 'buy', 'frBTC');
      await appPage.waitForTimeout(1000);

      await setNumberInput(appPage, 0, WRAP_BTC_AMOUNT);
      await appPage.waitForTimeout(3000);

      if (await detectUtxoLock(appPage)) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked';
        report.flows.push(flow);
        return;
      }

      const confirmBtn = appPage.locator('button').filter({ hasText: /confirm swap/i }).first();
      const isEnabled = await confirmBtn.isEnabled({ timeout: 10_000 }).catch(() => false);
      if (!isEnabled) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked_or_insufficient';
        report.flows.push(flow);
        return;
      }

      await waitForPopupOverlayClose(appPage, 5000);
      await dismissExistingToast(appPage);
      await appPage.screenshot({ path: '/tmp/smoke-flow3-presubmit.png' });
      const pagesBeforeFlow3 = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm swap/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeFlow3, '/tmp/oyl-sign-flow3.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow3-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 3] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow3-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 4: frBTC → BTC unwrap
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 4: frBTC → BTC unwrap', async () => {
    const flow: FlowResult = {
      name: 'frbtc_to_btc_unwrap',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      await selectToken(appPage, 'sell', 'frBTC');
      await selectToken(appPage, 'buy', 'BTC');
      await appPage.waitForTimeout(1000);

      // Use a small frBTC amount — whatever flow 3 wrapped, use half
      await setNumberInput(appPage, 0, (parseFloat(WRAP_BTC_AMOUNT) / 2).toFixed(8));
      await appPage.waitForTimeout(3000);

      if (await detectUtxoLock(appPage)) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked';
        report.flows.push(flow);
        return;
      }

      const confirmBtn = appPage.locator('button').filter({ hasText: /confirm swap/i }).first();
      const isEnabled = await confirmBtn.isEnabled({ timeout: 10_000 }).catch(() => false);
      if (!isEnabled) {
        flow.status = 'skipped';
        flow.skip_reason = 'insufficient_frbtc_flow3_not_confirmed';
        report.flows.push(flow);
        return;
      }

      await waitForPopupOverlayClose(appPage, 5000);
      await dismissExistingToast(appPage);
      await appPage.screenshot({ path: '/tmp/smoke-flow4-presubmit.png' });
      const pagesBeforeFlow4 = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm swap/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeFlow4, '/tmp/oyl-sign-flow4.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow4-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 4] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow4-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 5: Add Liquidity (BTC + DIESEL)
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 5: Add liquidity BTC+DIESEL', async () => {
    const flow: FlowResult = {
      name: 'add_liquidity_btc_diesel',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      // Switch to Liquidity tab
      const liquidityTab = appPage.locator('button, [role=tab]').filter({ hasText: /liquidity/i }).first();
      if (await liquidityTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await liquidityTab.click();
        await appPage.waitForTimeout(800);
      }

      // Select BTC + DIESEL pair
      await selectToken(appPage, 'sell', 'BTC');
      await selectToken(appPage, 'buy', 'DIESEL');
      await appPage.waitForTimeout(1000);

      // Enter BTC amount — DIESEL amount auto-computes from pool ratio
      await setNumberInput(appPage, 0, LIQUIDITY_BTC_AMOUNT);
      await appPage.waitForTimeout(3000);

      if (await detectUtxoLock(appPage)) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked';
        report.flows.push(flow);
        return;
      }

      // Look for Add Liquidity confirm button
      const addBtn = appPage.locator('button').filter({ hasText: /add liquidity|confirm/i }).first();
      const isEnabled = await addBtn.isEnabled({ timeout: 10_000 }).catch(() => false);
      if (!isEnabled) {
        flow.status = 'skipped';
        flow.skip_reason = 'utxo_locked_or_insufficient';
        report.flows.push(flow);
        return;
      }

      await waitForPopupOverlayClose(appPage, 5000);
      await dismissExistingToast(appPage);
      await appPage.screenshot({ path: '/tmp/smoke-flow5-presubmit.png' });
      const pagesBeforeFlow5 = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /add liquidity|confirm/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeFlow5, '/tmp/oyl-sign-flow5.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow5-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 5] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow5-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow 6: Remove Liquidity
  // ────────────────────────────────────────────────────────────────────────
  test('Flow 6: Remove liquidity', async () => {
    const flow: FlowResult = {
      name: 'remove_liquidity',
      status: 'error',
      txid: null,
      fee_sats: null,
      fee_usd: null,
      skip_reason: null,
      error: null,
    };

    try {
      await appPage.bringToFront();
      await appPage.goto(`${APP_URL}/swap`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await dismissDisclaimer(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.waitForTimeout(1500);

      // Switch to Liquidity tab → Remove tab
      const liquidityTab = appPage.locator('button, [role=tab]').filter({ hasText: /liquidity/i }).first();
      if (await liquidityTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await liquidityTab.click();
        await appPage.waitForTimeout(800);
      }

      const removeTab = appPage.locator('button, [role=tab]').filter({ hasText: /remove/i }).first();
      if (await removeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await removeTab.click();
        await appPage.waitForTimeout(800);
      }

      // Check if we have LP positions
      const noPositions = appPage.locator('text=/no.*position|no.*lp|no.*liquidity/i');
      if (await noPositions.isVisible({ timeout: 3000 }).catch(() => false)) {
        flow.status = 'skipped';
        flow.skip_reason = 'no_lp_positions_flow5_not_confirmed';
        report.flows.push(flow);
        return;
      }

      // Select first LP position and remove 50%
      const lpPosition = appPage.locator('[class*=lp-position], [class*=position]').first();
      if (await lpPosition.isVisible({ timeout: 5000 }).catch(() => false)) {
        await lpPosition.click();
        await appPage.waitForTimeout(500);
      }

      // Set remove amount to 50%
      const removeAmountInput = appPage.locator('input[type=number], input[type=range]').first();
      if (await removeAmountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await setNumberInput(appPage, 0, '50');
      }

      await appPage.waitForTimeout(2000);

      const removeBtn = appPage.locator('button').filter({ hasText: /remove liquidity|confirm remove|confirm/i }).first();
      const isEnabled = await removeBtn.isEnabled({ timeout: 10_000 }).catch(() => false);
      if (!isEnabled) {
        flow.status = 'skipped';
        flow.skip_reason = 'remove_button_disabled';
        report.flows.push(flow);
        return;
      }

      await dismissExistingToast(appPage);
      await waitForPopupOverlayClose(appPage, 5000);
      await appPage.screenshot({ path: '/tmp/smoke-flow6-presubmit.png' });
      const pagesBeforeFlow6 = new Set(context.pages());
      await appPage.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /remove liquidity|confirm/i.test(b.textContent || ''));
        if (btn) (btn as HTMLElement).click();
      });
      await confirmOylSigningPopup(context, pagesBeforeFlow6, '/tmp/oyl-sign-flow6.png');

      const txid = await captureTxid(appPage, 60_000, lastTxid ?? undefined);
      await appPage.screenshot({ path: '/tmp/smoke-flow6-result.png' });

      if (txid) {
        flow.status = 'success';
        flow.txid = txid;
        lastTxid = txid;
        flow.fee_sats = await fetchFeeSats(txid);
        console.log(`[Flow 6] txid: ${txid}, fee: ${flow.fee_sats} sats`);
      } else {
        flow.error = 'txid not found in page after submit';
      }
    } catch (e: unknown) {
      flow.error = e instanceof Error ? e.message : String(e);
      await appPage.screenshot({ path: '/tmp/smoke-flow6-error.png' }).catch(() => {});
    }

    report.flows.push(flow);
  });
});
