/**
 * devnet-smoke.spec.ts — Devnet regression smoke test via keystore wallet
 *
 * Runs the primary subfrost AMM flows against the in-browser devnet
 * (localhost:3000 with subfrost_selected_network=devnet). No browser extension
 * required — the devnet keystore wallet is auto-created on boot.
 *
 * Flows tested (in order, mirroring mainnet-smoke.spec.ts):
 *   Flow 1: BTC → DIESEL  (atomic wrap+swap — useAtomicWrapSwapMutation)
 *   Flow 2: DIESEL → BTC  (token→BTC — useTokenToBtcSwap)
 *   Flow 3: BTC → frBTC   (wrap — useWrapMutation)
 *   Flow 4: frBTC → BTC   (unwrap — useUnwrapMutation)
 *   Flow 5: Add liquidity  (BTC+DIESEL — useAtomicWrapAddLiquidityMutation)
 *   Flow 6: Remove liquidity (useRemoveLiquidityMutation)
 *
 * After each broadcast:
 *   - txid is captured from the SwapSuccessNotification toast
 *   - trace is fetched from localhost:18888 via metashrew_view "trace"
 *   - result is written to e2e-tests/camoufox/devnet-smoke-report.json
 *
 * ## Run
 *   npx playwright test devnet-smoke --project=chromium-devnet-smoke --headed
 *
 * ## Prerequisites
 *   - `npm run dev` running on http://localhost:3000
 *   - Devnet boots automatically in-browser on first load (~5-10 min cold boot)
 *   - No seed phrase or external wallet required
 *
 * ## Architecture differences from mainnet-smoke.spec.ts
 *   - No OYL extension, no seed import, no signing popups
 *   - Network switched via localStorage + reload (addInitScript)
 *   - Wallet funded via DevnetControlPanel faucet (+1 BTC × 3, +DIESEL, +100 blocks)
 *   - Trace probed at localhost:18888 (intercepted by DevnetProvider)
 *   - No mempool.space fee fetch (regtest has no fee market) — fee logged as null
 *
 * ## Trace notes
 *   The devnet in-browser indexer (metashrew WASM) runs at localhost:18888.
 *   Traces are written via save_trace() after each confirmed block.
 *   We must mine +1 block after each tx and waitForIndexerSync before probing.
 *   Shadow vout = protostone_index + tx.output.len() + 1 (same rule as mainnet).
 *
 * ## Source references
 *   hooks/useAtomicWrapSwapMutation.ts    — Flow 1
 *   hooks/useTokenToBtcSwap.ts            — Flow 2
 *   hooks/useWrapMutation.ts              — Flow 3
 *   hooks/useUnwrapMutation.ts            — Flow 4
 *   hooks/useAtomicWrapAddLiquidityMutation.ts — Flow 5
 *   hooks/useRemoveLiquidityMutation.ts   — Flow 6
 *   lib/devnet/boot.ts                    — devnet seeding (liquidity already seeded)
 *   e2e-tests/playwright/orderbook.spec.ts — devnet boot/fund/sync patterns
 */

import { test, type Page, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Config
// ============================================================================

const APP_URL = 'http://localhost:3000';
// All RPC calls to localhost:18888 go through page.evaluate() — the devnet
// fetch interceptor only exists inside the browser context, not in Node.

// Swap amounts — small enough to avoid UTXO exhaustion across 6 flows.
// Devnet faucet gives 3 BTC + DIESEL; each flow uses <0.0002 BTC.
const SWAP_BTC_AMOUNT = '0.0001';
const SWAP_DIESEL_AMOUNT = '50';
const WRAP_BTC_AMOUNT = '0.0001';
const LIQUIDITY_BTC_AMOUNT = '0.0001';

const REPORT_PATH = path.join(__dirname, '../camoufox/devnet-smoke-report.json');

// ============================================================================
// Report types
// ============================================================================

interface TraceDigest {
  vout: number;
  bytes: number;
  events: string[];
  status: 'success' | 'failure' | 'empty' | 'error';
  revert_reason: string | null;
  raw_hex_path: string | null;
}

interface FlowResult {
  name: string;
  status: 'success' | 'skipped' | 'error';
  txid: string | null;
  fee_sats: number | null;
  skip_reason: string | null;
  error: string | null;
  trace: TraceDigest | null;
}

interface DevnetSmokeReport {
  run_at: string;
  wallet: 'keystore';
  network: 'devnet';
  flows: FlowResult[];
  aberrations: string[];
}

function initReport(): DevnetSmokeReport {
  return {
    run_at: new Date().toISOString(),
    wallet: 'keystore',
    network: 'devnet',
    flows: [],
    aberrations: [],
  };
}

function saveReport(report: DevnetSmokeReport) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

// ============================================================================
// Trace helpers — mirror of alkanes-trace-digest skill, adapted for devnet
// ============================================================================

/**
 * Fetch trace from the in-browser devnet indexer.
 *
 * IMPORTANT: All RPC calls go through page.evaluate() because localhost:18888
 * is the DevnetProvider's in-browser fetch interceptor — it only exists inside
 * the browser context, not in the Node test process. Direct Node-side fetch to
 * localhost:18888 would fail or get no response.
 *
 * Shadow vout = protostone_index + output_count + 1 (same rule as mainnet).
 * Probes vouts around expected shadow vout and returns first non-empty hit.
 */
async function fetchDevnetTrace(page: Page, txid: string, outputCount: number): Promise<TraceDigest> {
  const SKILL_DIR = path.join(os.homedir(), '.claude/skills/alkanes-trace-digest');

  // Build LE txid and probe vouts via page.evaluate — runs inside the browser
  // where localhost:18888 is intercepted by the DevnetProvider service worker.
  const probe = await page.evaluate(
    async ({ txid, outputCount }) => {
      // Reverse bytes of hex txid to get little-endian (browser-native, no Buffer)
      const txidLe = (txid.match(/.{2}/g) ?? []).reverse().join('');
      const expectedVout = outputCount + 1;
      const start = Math.max(3, expectedVout - 1);
      const end = expectedVout + 4;

      for (let v = start; v <= end; v++) {
        const vHex = v.toString(16).padStart(2, '0');
        const hexInput = `0a20${txidLe}10${vHex}`;
        try {
          const res = await fetch('http://localhost:18888', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'metashrew_view',
              params: ['trace', `0x${hexInput}`, 'latest'],
              id: 1,
            }),
          });
          const data = await res.json() as { result?: string; error?: unknown };
          if (data.error) continue;
          const result = data.result ?? '';
          if (result && result !== '0x' && result.length > 4) {
            return { vout: v, hex: result };
          }
        } catch { continue; }
      }
      return null;
    },
    { txid, outputCount },
  );

  if (!probe) {
    return { vout: -1, bytes: 0, events: [], status: 'empty', revert_reason: null, raw_hex_path: null };
  }

  // Save hex file for decode.sh (Node-side file write is fine)
  const hexPath = `/tmp/dvn_trace_${txid.slice(0, 8)}_v${probe.vout}.hex`;
  fs.writeFileSync(hexPath, probe.hex);

  // Decode via the skill's decode.sh
  let events: string[] = [];
  let status: TraceDigest['status'] = 'success';
  let revertReason: string | null = null;

  try {
    const decoded = execSync(
      `bash "${SKILL_DIR}/decode.sh" "${hexPath}"`,
      { encoding: 'utf8', timeout: 30_000 },
    );
    const lines = decoded.split('\n').filter(l => l.trim());
    events = lines;

    const failLine = lines.find(l => /FAILURE|revert|REVERT/i.test(l));
    if (failLine) {
      status = 'failure';
      const reasonMatch = failLine.match(/Error\("([^"]+)"\)|revert reason: (.+)/i);
      revertReason = reasonMatch ? (reasonMatch[1] || reasonMatch[2]).trim() : failLine.trim();
    }
  } catch (e) {
    status = 'error';
    events = [`decode error: ${e instanceof Error ? e.message : String(e)}`];
  }

  return {
    vout: probe.vout,
    bytes: Math.floor((probe.hex.length - 2) / 2),
    events,
    status,
    revert_reason: revertReason,
    raw_hex_path: hexPath,
  };
}

// ============================================================================
// Devnet helpers (reused from orderbook.spec.ts)
// ============================================================================

/** Wait for the in-browser devnet badge "Devnet H:NNN" to appear. */
async function waitForDevnet(page: Page, timeoutMs = 900_000): Promise<void> {
  const btn = page.locator('button', { hasText: /Devnet H:\d+/ });
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
}

/** Dismiss the subfrost "Understand" beta modal if present. */
async function dismissDisclaimer(page: Page): Promise<void> {
  const btn = page.locator('button').filter({ hasText: /understand/i }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 6000 });
    await btn.click({ force: true });
    await page.waitForTimeout(600);
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(400);
    }
  } catch { /* not shown */ }
}

/**
 * Fund the wallet via DevnetControlPanel.
 * +1 BTC × 3 and +DIESEL, then +100 blocks for coinbase maturity.
 * Waits for indexer sync after mining.
 */
async function fundWallet(page: Page): Promise<void> {
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.click();
  await page.waitForTimeout(500);

  const btcBtn = page.locator('button', { hasText: '+1 BTC' });
  for (let i = 0; i < 3; i++) {
    await btcBtn.waitFor({ state: 'visible', timeout: 30_000 });
    const enabled = await btcBtn.isEnabled({ timeout: 15_000 }).catch(() => false);
    if (enabled) {
      await btcBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  const dieselBtn = page.locator('button', { hasText: '+DIESEL' });
  if (await dieselBtn.isEnabled({ timeout: 15_000 }).catch(() => false)) {
    await dieselBtn.click();
    await page.waitForTimeout(2000);
  }

  // Mine 100 blocks for coinbase maturity
  const mine100 = page.locator('button').filter({ hasText: /^\+100$/ }).first();
  await mine100.waitFor({ state: 'visible', timeout: 30_000 });
  await mine100.click();
  await page.waitForTimeout(30_000);

  // Close panel
  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(1000);

  await waitForIndexerSync(page, 120_000);
  await mineOneBlock(page);
  await waitForIndexerSync(page, 30_000);
}

/** Poll until metashrew_height equals getblockcount on localhost:18888. */
async function waitForIndexerSync(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const synced: boolean = await page.evaluate(async () => {
      try {
        const [mRes, bRes] = await Promise.all([
          fetch('http://localhost:18888', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_height', params: [], id: 1 }),
          }).then(r => r.json()),
          fetch('http://localhost:18888', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'getblockcount', params: [], id: 2 }),
          }).then(r => r.json()),
        ]);
        return (mRes as any)?.result === (bRes as any)?.result;
      } catch { return false; }
    });
    if (synced) return;
    await page.waitForTimeout(2000);
  }
  console.log('[sync] timeout — proceeding anyway');
}

/** Mine one block via the DevnetControlPanel. */
async function mineOneBlock(page: Page): Promise<void> {
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.click();
  await page.waitForTimeout(300);
  const mine1 = page.locator('button').filter({ hasText: /^\+1$/ }).first();
  await mine1.waitFor({ state: 'visible', timeout: 15_000 });
  await mine1.click();
  await page.waitForTimeout(5000);
  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(1000);
}

// ============================================================================
// Swap form helpers — identical to mainnet-smoke.spec.ts
// ============================================================================

/** Set React-controlled number input via native setter trick. */
async function setNumberInput(page: Page, inputIndex: number, value: string): Promise<void> {
  await page.evaluate(
    ({ idx, val }) => {
      const el = document.querySelectorAll('input[type=number]')[idx] as HTMLInputElement;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { idx: inputIndex, val: value },
  );
}

/** Dismiss the persisted SwapSuccessNotification toast before each flow. */
async function dismissExistingToast(page: Page): Promise<void> {
  await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="espo.sh/tx/"]'));
    for (const a of links) {
      let node: HTMLElement | null = a as HTMLElement;
      while (node && node !== document.body) {
        const closeBtn = node.querySelector('button[aria-label*="close"], button[aria-label*="Close"]') as HTMLElement | null;
        if (closeBtn) { closeBtn.click(); return; }
        const btns = Array.from(node.querySelectorAll('button')) as HTMLElement[];
        const x = btns.find(b => b.querySelector('svg') && !b.textContent?.trim());
        if (x) { x.click(); return; }
        node = node.parentElement;
      }
    }
  }).catch(() => {});
  await page.waitForTimeout(400);
}

/**
 * Wait for a new txid to appear in the SwapSuccessNotification bottom-right toast.
 * Reads from <a href="https://espo.sh/tx/{txid}"> — same on devnet as mainnet.
 * Excludes the previously-seen txid to avoid stale re-capture.
 */
async function captureTxid(page: Page, timeoutMs = 90_000, excludeTxid?: string): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const txid = await page.evaluate((exclude) => {
      const HEX64 = /([a-f0-9]{64})/i;
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
 * Close the sf-popup-overlay if one is blocking pointer events.
 * Identical logic to mainnet-smoke.spec.ts.
 */
async function waitForPopupOverlayClose(page: Page, timeoutMs = 5000): Promise<void> {
  const sel = '.sf-popup-overlay.sf-popup-open';
  const has = await page.evaluate((s) => !!document.querySelector(s), sel).catch(() => false);
  if (!has) return;

  await page.evaluate((s) => { (document.querySelector(s) as HTMLElement | null)?.click(); }, sel).catch(() => {});
  await page.waitForTimeout(400);
  if (await page.evaluate((s) => !document.querySelector(s), sel).catch(() => true)) return;

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (await page.evaluate((s) => !document.querySelector(s), sel).catch(() => true)) return;

  await page.evaluate((s) => {
    const o = document.querySelector(s);
    if (!o) return;
    const btn = (o.querySelector('.sf-popup-close') || o.querySelector('button[aria-label="Close"]')) as HTMLElement | null;
    if (btn) { btn.click(); return; }
    o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, sel).catch(() => {});
  await page.waitForTimeout(400);

  try {
    await page.waitForFunction((s) => !document.querySelector(s), sel, { timeout: Math.max(200, timeoutMs - 1600) });
  } catch { /* proceed with force clicks */ }
}

/** Submit CONFIRM SWAP via JS direct click (bypasses pointer-events CSS). */
async function clickConfirmSwap(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => /confirm swap/i.test(b.textContent || ''));
    if (btn) (btn as HTMLElement).click();
  });
}

/**
 * Open the token picker on the given side and select a token by symbol.
 *
 * The SwapInputs form has two token selector buttons (.sf-tile absolute):
 *   - Index 0 = "from" / sell side  (openTokenSelector("from"))
 *   - Index 1 = "to"   / buy  side  (openTokenSelector("to"))
 *
 * We click the sf-tile button for the correct side, wait for the modal to open,
 * then click the row in the picker that matches the desired symbol.
 */
async function selectTokenOnSide(page: Page, side: 'sell' | 'buy', symbol: string): Promise<void> {
  await waitForPopupOverlayClose(page, 5000);
  const sideIdx = side === 'sell' ? 0 : 1;

  // Open the picker — use the absolute-positioned sf-tile buttons inside the swap form.
  // These are the "from" and "to" token selector buttons.
  const opened = await page.evaluate((idx) => {
    // Prefer sf-tile buttons (the actual token selectors in SwapInputs)
    const sfTiles = Array.from(document.querySelectorAll('button.sf-tile')).filter(b => {
      // Must contain a token symbol (text is non-empty, not purely numeric/icon)
      const txt = (b.textContent || '').trim();
      return /^(BTC|DIESEL|frBTC|FUEL|USDT|USDC|frZEC|frETH)/i.test(txt);
    });
    if (sfTiles[idx]) {
      (sfTiles[idx] as HTMLElement).click();
      return true;
    }
    // Fallback: any button that looks like a token picker (starts with token symbol)
    const fallback = Array.from(document.querySelectorAll('button')).filter(b =>
      /^(BTC|DIESEL|frBTC|FUEL|USDT|USDC|frZEC|frETH)/i.test((b.textContent || '').trim()),
    );
    if (fallback[idx]) {
      (fallback[idx] as HTMLElement).click();
      return true;
    }
    return false;
  }, sideIdx);

  if (!opened) {
    console.log(`[selectToken] Could not find token selector button for ${side} side`);
    return;
  }

  await page.waitForTimeout(700);

  // The picker modal opens — find and click the target token row.
  // Token rows in the picker typically have the symbol as leading text.
  const picked = await page.evaluate((sym) => {
    // Look in the modal/overlay for the token list
    const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="TokenSelector"], [class*="picker"]');
    const container = modal || document;
    const btns = Array.from(container.querySelectorAll('button'));
    const target = btns.find(b => {
      const txt = (b.textContent || '').trim();
      return txt === sym || txt.startsWith(sym + ' ') || txt.startsWith(sym + '\n');
    });
    if (target) { (target as HTMLElement).click(); return true; }
    // Broader match: any button starting with the symbol
    const broader = btns.find(b => new RegExp(`^${sym}`, 'i').test((b.textContent || '').trim()));
    if (broader) { (broader as HTMLElement).click(); return true; }
    return false;
  }, symbol);

  if (!picked) {
    console.log(`[selectToken] Token "${symbol}" not found in picker — trying text search`);
    // Last resort: find any visible element matching the symbol text and click it
    await page.evaluate((sym) => {
      const all = Array.from(document.querySelectorAll('*'));
      const el = all.find(e =>
        e.children.length === 0 &&
        (e.textContent || '').trim() === sym
      ) as HTMLElement | undefined;
      if (el) el.click();
    }, symbol);
  }

  await page.waitForTimeout(600);
}

/**
 * Fetch the output count for a confirmed regtest tx via the browser's fetch interceptor.
 * Must run through page.evaluate() — localhost:18888 only exists inside the browser.
 */
async function getVoutCount(page: Page, txid: string): Promise<number | null> {
  return page.evaluate(async (txid) => {
    try {
      const res = await fetch('http://localhost:18888', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'getrawtransaction', params: [txid, true], id: 1 }),
      });
      const data = await res.json() as { result?: { vout: unknown[] } };
      return data.result?.vout?.length ?? null;
    } catch { return null; }
  }, txid).catch(() => null);
}

// ============================================================================
// Test suite — single test, all flows in sequence
// ============================================================================

test.describe.serial('Devnet AMM Smoke — keystore wallet', () => {
  let page: Page;
  const report = initReport();
  let lastTxid: string | null = null;

  test.beforeAll(async () => {
    const context = await chromium.launchPersistentContext(
      '/tmp/playwright-devnet-smoke',
      { headless: false, baseURL: APP_URL },
    );
    page = context.pages()[0] ?? await context.newPage();
    page.on('dialog', d => d.accept());

    // Set devnet before any page loads so DevnetProvider initialises correctly
    await page.addInitScript(() => {
      localStorage.setItem('subfrost_selected_network', 'devnet');
    });

    // Surface devnet + error console logs
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        console.error('[browser error]', text.substring(0, 200));
      } else if (
        text.includes('DevnetContext') || text.includes('IndexedDB') ||
        text.includes('boot') || text.includes('phase') || text.includes('[smoke]')
      ) {
        console.log('[devnet]', text.substring(0, 300));
      }
    });
  });

  test.afterAll(async () => {
    saveReport(report);
    console.log(`[smoke] Report saved to: ${REPORT_PATH}`);
    await page.context().close();
  });

  test('Devnet smoke: boot → fund → 6 AMM flows → trace each txid', async () => {
    test.setTimeout(1_800_000); // 30 min — cold devnet boot can take 10 min

    // ── Step 0: Boot devnet ──────────────────────────────────────────────────
    console.log('[smoke] Step 0: booting devnet...');
    await page.goto('/');
    await dismissDisclaimer(page);
    await waitForDevnet(page, 900_000);
    await dismissDisclaimer(page);
    console.log('[smoke] Devnet ready. Funding wallet...');

    // ── Step 1: Fund ─────────────────────────────────────────────────────────
    await fundWallet(page);
    console.log('[smoke] Wallet funded.');

    // Navigate to swap page
    await page.locator('a[href="/swap"]').first().click();
    await page.waitForTimeout(2000);
    await dismissDisclaimer(page);

    // ── Flow 1: BTC → DIESEL ─────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'btc_to_diesel',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 1: BTC → DIESEL');
        await dismissExistingToast(page);

        // Ensure sell=BTC, buy=DIESEL
        await selectTokenOnSide(page, 'sell', 'BTC');
        await selectTokenOnSide(page, 'buy', 'DIESEL');
        await page.waitForTimeout(1000);

        // Enter amount
        await setNumberInput(page, 0, SWAP_BTC_AMOUNT);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: '/tmp/dvn-flow1-preflight.png' });

        // Confirm button enabled?
        const confirmEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /confirm swap/i.test(b.textContent || ''));
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });
        if (!confirmEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'confirm_button_disabled';
          console.log('[smoke] Flow 1 skipped — confirm disabled');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await clickConfirmSwap(page);
          await page.waitForTimeout(3000);

          // Mine + sync so trace is indexable
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow1-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 1 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 1 trace: vout=${flow.trace.vout}, status=${flow.trace.status}, bytes=${flow.trace.bytes}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 1 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow1-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 2: DIESEL → BTC ─────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'diesel_to_btc',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 2: DIESEL → BTC');
        await page.locator('a[href="/swap"]').first().click();
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'DIESEL');
        await selectTokenOnSide(page, 'buy', 'BTC');
        await page.waitForTimeout(1000);

        await setNumberInput(page, 0, SWAP_DIESEL_AMOUNT);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: '/tmp/dvn-flow2-preflight.png' });

        const confirmEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /confirm swap/i.test(b.textContent || ''));
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });
        if (!confirmEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'confirm_button_disabled_or_insufficient_diesel';
          console.log('[smoke] Flow 2 skipped');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await clickConfirmSwap(page);
          await page.waitForTimeout(3000);

          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow2-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 2 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 2 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 2 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow2-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 3: BTC → frBTC (wrap) ────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'btc_to_frbtc_wrap',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 3: BTC → frBTC wrap');
        await page.locator('a[href="/swap"]').first().click();
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'BTC');
        await selectTokenOnSide(page, 'buy', 'frBTC');
        await page.waitForTimeout(1000);

        await setNumberInput(page, 0, WRAP_BTC_AMOUNT);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: '/tmp/dvn-flow3-preflight.png' });

        const confirmEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /confirm swap/i.test(b.textContent || ''));
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });
        if (!confirmEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'confirm_button_disabled';
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await clickConfirmSwap(page);
          await page.waitForTimeout(3000);

          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow3-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 3 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 3 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 3 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow3-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 4: frBTC → BTC (unwrap) ──────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'frbtc_to_btc_unwrap',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 4: frBTC → BTC unwrap');
        await page.locator('a[href="/swap"]').first().click();
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'frBTC');
        await selectTokenOnSide(page, 'buy', 'BTC');
        await page.waitForTimeout(1000);

        // Use a fraction of what flow 3 should have produced
        await setNumberInput(page, 0, '0.00005');
        await page.waitForTimeout(3000);

        await page.screenshot({ path: '/tmp/dvn-flow4-preflight.png' });

        const confirmEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /confirm swap/i.test(b.textContent || ''));
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });
        if (!confirmEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'confirm_button_disabled_or_insufficient_frbtc';
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await clickConfirmSwap(page);
          await page.waitForTimeout(3000);

          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow4-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 4 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 4 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 4 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow4-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 5: Add liquidity (BTC+DIESEL) ────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'add_liquidity_btc_diesel',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 5: Add liquidity (BTC+DIESEL)');
        // Navigate to the liquidity page
        const liquidityLink = page.locator('a[href="/liquidity"], a[href*="liquidity"]').first();
        const hasLiqPage = await liquidityLink.isVisible({ timeout: 5000 }).catch(() => false);
        if (hasLiqPage) {
          await liquidityLink.click();
        } else {
          await page.goto(`${APP_URL}/liquidity`);
        }
        await page.waitForTimeout(2000);
        await dismissExistingToast(page);

        // Find the "Add Liquidity" button or the BTC/DIESEL pool card
        const addLiqBtn = page.locator('button').filter({ hasText: /add liquidity/i }).first();
        if (await addLiqBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await addLiqBtn.click();
          await page.waitForTimeout(1000);
        }

        // Select BTC+DIESEL pool if presented with a picker
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const dieselPool = btns.find(b =>
            /(BTC.*DIESEL|DIESEL.*BTC)/i.test(b.textContent || '')
          );
          if (dieselPool) (dieselPool as HTMLElement).click();
        });
        await page.waitForTimeout(1000);

        // Set BTC amount in the add-liquidity form
        await setNumberInput(page, 0, LIQUIDITY_BTC_AMOUNT);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: '/tmp/dvn-flow5-preflight.png' });

        // Look for Add/Confirm/Supply button
        const confirmEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b =>
            /add liquidity|confirm|supply/i.test(b.textContent || '')
            && !/remove/i.test(b.textContent || '')
          );
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });
        if (!confirmEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'add_liquidity_button_disabled';
          console.log('[smoke] Flow 5 skipped — button disabled');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b =>
              /add liquidity|confirm|supply/i.test(b.textContent || '')
              && !/remove/i.test(b.textContent || '')
            );
            if (btn) (btn as HTMLElement).click();
          });
          await page.waitForTimeout(3000);

          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow5-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 5 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 5 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 5 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow5-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 6: Remove liquidity ───────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'remove_liquidity',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
      };

      try {
        console.log('[smoke] Flow 6: Remove liquidity');
        await page.waitForTimeout(2000);
        await dismissExistingToast(page);

        // Find LP position row or Remove Liquidity button
        const removeLiqBtn = page.locator('button').filter({ hasText: /remove liquidity|remove/i }).first();
        if (!(await removeLiqBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
          // Navigate to the position — might be on the position detail page
          const lpRow = page.locator('[class*="pool"], [class*="position"]').first();
          if (await lpRow.isVisible({ timeout: 3000 }).catch(() => false)) {
            await lpRow.click();
            await page.waitForTimeout(1000);
          }
        }

        const removeEnabled = await removeLiqBtn.isEnabled({ timeout: 10_000 }).catch(() => false);
        if (!removeEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'remove_button_not_found_or_disabled';
          console.log('[smoke] Flow 6 skipped — no LP tokens or button disabled');
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Set removal amount (50% or slider input)
          const removeInput = page.locator('input[type=number], input[type=range]').first();
          if (await removeInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await setNumberInput(page, 0, '50');
          }
          await page.waitForTimeout(1000);

          await waitForPopupOverlayClose(page, 5000);
          await page.screenshot({ path: '/tmp/dvn-flow6-preflight.png' });

          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => /remove liquidity|confirm remove|confirm/i.test(b.textContent || ''));
            if (btn) (btn as HTMLElement).click();
          });
          await page.waitForTimeout(3000);

          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/dvn-flow6-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[smoke] Flow 6 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[smoke] Flow 6 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 6 REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            flow.error = 'txid not found in toast after submit';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/dvn-flow6-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Final report ──────────────────────────────────────────────────────────
    saveReport(report);
    console.log('[smoke] ── DEVNET SMOKE COMPLETE ──');
    for (const f of report.flows) {
      const traceStatus = f.trace ? `trace=${f.trace.status}` : 'no-trace';
      console.log(`  ${f.name}: ${f.status} | txid=${f.txid?.slice(0, 12) ?? 'null'} | ${traceStatus}`);
    }
    if (report.aberrations.length) {
      console.warn('[smoke] Aberrations detected:', report.aberrations);
    }
  });
});
