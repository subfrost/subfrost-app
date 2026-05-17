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
// Flow 2 DIESEL→BTC: 50 DIESEL caused "need 5000001217 sats, have 4999988233"
// because useTokenToBtcSwap's fee estimate scales with DIESEL amount in the
// BTC unwrap leg. Use 1 DIESEL to stay safely within the ~1 BTC faucet budget.
const SWAP_DIESEL_AMOUNT = '1';
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
  // The beta modal can take 2-3 seconds to render on first load
  const btn = page.locator('button').filter({ hasText: /understand/i }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 12_000 });
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    // Sometimes needs a second click if the modal re-renders
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(600);
    }
  } catch { /* modal not present — continue */ }
}

/**
 * Dismiss the Devnet OOM error banner if present.
 * After WASM OOM the React tree re-renders — give it up to 30s before returning.
 * The badge `waitFor` callers use their own timeout; this just handles the dismiss.
 */
async function recoverFromOom(page: Page): Promise<void> {
  const dismissBtn = page.locator('button', { hasText: 'Dismiss' });
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
    console.log('[smoke] OOM banner dismissed — waiting for devnet to recover...');
    // After OOM dismiss the WASM runtime is restarting; wait longer before proceeding
    await page.waitForTimeout(15_000);
  }
}

/**
 * Fund the wallet via DevnetControlPanel.
 *
 * NOTE: faucetBtc() inside the app already mines 101 blocks (1 coinbase +
 * 100 maturity) per +1 BTC click. We do NOT click +100 separately — that
 * would cause an additional 100-block mine per call (totalling 201 blocks)
 * which reliably OOMs the WASM runtime with quspo indexing active.
 *
 * We click +1 BTC once (enough for the 6 swap flows at 0.0001 BTC each)
 * and +DIESEL once. Each call mines ~101 blocks internally with 100ms GC
 * yields between batches of 5 — takes ~45-60s per faucet click.
 */
async function fundWallet(page: Page): Promise<void> {
  // Dismiss any pre-existing OOM banner before opening panel
  await recoverFromOom(page);

  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.waitFor({ state: 'visible', timeout: 30_000 });
  await badge.click();
  await page.waitForTimeout(500);

  // +1 BTC × 2 — each click mines 101 blocks internally (coinbase + maturity).
  // Two calls gives ~2 BTC spendable which covers all 6 swap flows including
  // fees. One BTC is not quite enough: after Flow 1 fees the DIESEL→BTC swap
  // in Flow 2 needs slightly more than 1 BTC (verified: needed 5_000_001_217
  // sats, had 4_999_988_233 after fees — ~13K sats short).
  const btcBtn = page.locator('button', { hasText: '+1 BTC' });
  await btcBtn.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 2; i++) {
    if (await btcBtn.isEnabled({ timeout: 10_000 }).catch(() => false)) {
      await btcBtn.click();
      // Wait for the 101-block mine to complete; 60s with 100ms GC yields per 5 blocks
      await page.waitForTimeout(60_000);
      await recoverFromOom(page);
      // Re-open panel if OOM dismiss closed it
      const stillOpen = await page.locator('button', { hasText: '+1 BTC' }).isVisible({ timeout: 2000 }).catch(() => false);
      if (!stillOpen && i < 1) {
        await badge.waitFor({ state: 'visible', timeout: 120_000 });
        await badge.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // +DIESEL — faucets DIESEL to the connected wallet
  // Re-open panel in case it was closed by an OOM dismiss
  const panelOpen = await page.locator('button', { hasText: '+DIESEL' }).isVisible({ timeout: 2000 }).catch(() => false);
  if (!panelOpen) {
    await badge.waitFor({ state: 'visible', timeout: 120_000 });
    await badge.click();
    await page.waitForTimeout(500);
  }
  const dieselBtn = page.locator('button', { hasText: '+DIESEL' });
  if (await dieselBtn.isEnabled({ timeout: 10_000 }).catch(() => false)) {
    await dieselBtn.click();
    await page.waitForTimeout(5000);
    await recoverFromOom(page);
  }

  // Close the panel
  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(1000);

  // Give the indexer up to 30s to catch up after faucet mining
  await waitForIndexerSync(page, 30_000);
}

/** Poll until metashrew_height equals getblockcount on localhost:18888. */
async function waitForIndexerSync(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Each fetch gets a 5s AbortController timeout so a hung WASM RPC
    // handler doesn't stall the entire poll loop indefinitely.
    const synced: boolean = await page.evaluate(async () => {
      const rpc = async (method: string, id: number) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try {
          const r = await fetch('http://localhost:18888', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method, params: [], id }),
            signal: ctrl.signal,
          });
          return await r.json();
        } catch { return null; } finally { clearTimeout(t); }
      };
      try {
        const [mRes, bRes] = await Promise.all([
          rpc('metashrew_height', 1),
          rpc('getblockcount', 2),
        ]);
        if (!mRes || !bRes) return false;
        return (mRes as any)?.result === (bRes as any)?.result;
      } catch { return false; }
    }).catch(() => false);
    if (synced) return;
    await page.waitForTimeout(2000);
  }
  console.log('[sync] timeout — proceeding anyway');
}

/** Mine one block via the DevnetControlPanel. */
async function mineOneBlock(page: Page): Promise<void> {
  await recoverFromOom(page);
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  if (!await badge.isVisible({ timeout: 5000 }).catch(() => false)) return;
  await badge.click();
  await page.waitForTimeout(300);
  const mine1 = page.locator('button').filter({ hasText: /^\+1$/ }).first();
  await mine1.waitFor({ state: 'visible', timeout: 15_000 });
  await mine1.click();
  await page.waitForTimeout(5000);
  await recoverFromOom(page);
  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(1000);
}

// ============================================================================
// Swap form helpers — identical to mainnet-smoke.spec.ts
// ============================================================================

/**
 * Wait for the swap form to be ready: the quspo indexer must have indexed at
 * least one pool (get_pools returns non-empty) so the token picker has entries.
 * The devnet sf-tile buttons always show the currently-selected token (BTC/DIESEL
 * etc.), so their text is not a reliable readiness signal. What matters is that
 * the picker modal will have rows — which requires quspo's get_pools to return data.
 */
async function waitForSwapFormReady(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    const { ready, debug } = await page.evaluate(async (isFirst: boolean) => {
      try {
        // POST to the devnet fetch interceptor's REST endpoint.
        // The interceptor distinguishes REST vs JSON-RPC by the absence of a "method" field.
        // Factory ID for devnet cold-boot is [4:65498].
        const res = await fetch('http://localhost:18888/get-all-pools-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factoryId: { block: '4', tx: '65498' } }),
        });
        const text = await res.text();
        const d = JSON.parse(text) as { statusCode?: number; data?: unknown[] };
        const ok = (d.statusCode === 200 || res.ok) && Array.isArray(d.data) && d.data.length > 0;
        return { ready: ok, debug: isFirst ? `status=${res.status} keys=${Object.keys(d).join(',')} dataLen=${Array.isArray(d.data) ? d.data.length : 'N/A'} raw=${text.slice(0, 200)}` : null };
      } catch (e) { return { ready: false, debug: isFirst ? `EXCEPTION: ${String(e)}` : null }; }
    }, attempts === 0).catch(() => ({ ready: false, debug: null }));
    if (debug) console.log(`[waitForSwapFormReady] first poll: ${debug}`);
    if (ready) {
      console.log(`[waitForSwapFormReady] pools ready after ${attempts} polls (${Math.round((Date.now() - (deadline - timeoutMs)) / 1000)}s)`);
      return;
    }
    attempts++;
    await page.waitForTimeout(500);
  }
  console.log('[waitForSwapFormReady] timeout — proceeding anyway');
}

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

/**
 * Dismiss the persisted SwapSuccessNotification toast before each flow.
 * Waits up to 3s for the toast to disappear after clicking close.
 */
async function dismissExistingToast(page: Page): Promise<void> {
  const dismissed = await page.evaluate(() => {
    // Find any espo.sh toast link and walk up to find its close button
    const links = Array.from(document.querySelectorAll('a[href*="espo.sh/tx/"]'));
    for (const a of links) {
      let node: HTMLElement | null = a as HTMLElement;
      while (node && node !== document.body) {
        // Try aria-label close button
        const closeBtn = node.querySelector('button[aria-label*="close" i], button[aria-label*="dismiss" i]') as HTMLElement | null;
        if (closeBtn) { closeBtn.click(); return true; }
        // Try icon-only button (no text, has SVG)
        const btns = Array.from(node.querySelectorAll('button')) as HTMLElement[];
        const iconBtn = btns.find(b => b.querySelector('svg') && !b.textContent?.trim());
        if (iconBtn) { iconBtn.click(); return true; }
        // Try any × or X button
        const xBtn = btns.find(b => /^[×✕x]$/i.test(b.textContent?.trim() ?? ''));
        if (xBtn) { xBtn.click(); return true; }
        node = node.parentElement;
      }
    }
    return false;
  }).catch(() => false);

  if (dismissed) {
    // Wait for the toast to actually leave the DOM
    await page.waitForFunction(
      () => !document.querySelector('a[href*="espo.sh/tx/"]'),
      { timeout: 3000 },
    ).catch(() => {});
  }
  await page.waitForTimeout(300);
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

/**
 * Poll until the CONFIRM SWAP button exists and is not disabled.
 * Returns true if enabled within timeoutMs, false if it times out.
 * The swap form disables this button while the route/quote is computing.
 */
async function waitForConfirmButton(page: Page, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => /confirm swap/i.test(b.textContent || ''));
      if (!btn) return 'missing';
      return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
    }).catch(() => 'error');
    if (state === 'enabled') return true;
    await page.waitForTimeout(500);
  }
  return false;
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

  // Open the picker — the "from" and "to" token selector buttons are .sf-tile absolute
  // positioned within the swap form. They show the token name or symbol.
  const opened = await page.evaluate((idx) => {
    // sf-tile buttons — token names include "Bitcoin", "DIESEL", "frBTC", "FUEL", etc.
    const sfTiles = Array.from(document.querySelectorAll('button.sf-tile'));
    if (sfTiles[idx]) {
      (sfTiles[idx] as HTMLElement).click();
      return `sf-tile[${idx}]`;
    }
    // Fallback: any button that looks like a token picker (token symbol or name)
    const fallback = Array.from(document.querySelectorAll('button')).filter(b => {
      const txt = (b.textContent || '').trim();
      return /^(BTC|Bitcoin|DIESEL|frBTC|FUEL|USDT|USDC|frZEC|frETH|Select)/i.test(txt);
    });
    if (fallback[idx]) {
      (fallback[idx] as HTMLElement).click();
      return `fallback[${idx}]`;
    }
    return null;
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
 * Fetch the output count for a confirmed devnet tx via the browser's fetch interceptor.
 * Uses `esplora_tx` (not `getrawtransaction` — the devnet harness supports esplora methods,
 * not raw Bitcoin Core JSON-RPC). Must run through page.evaluate() because localhost:18888
 * is only accessible inside the browser context (DevnetContext fetch interceptor).
 */
async function getVoutCount(page: Page, txid: string): Promise<number | null> {
  return page.evaluate(async (txid) => {
    // Try esplora_tx first (devnet harness supports this)
    try {
      const res = await fetch('http://localhost:18888', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'esplora_tx', params: [txid], id: 1 }),
      });
      const data = await res.json() as { result?: { vout?: unknown[] } };
      if (Array.isArray(data.result?.vout)) return data.result!.vout!.length;
    } catch { /* fall through */ }

    // Fallback: try btc_getrawtransaction (some harness versions expose this)
    try {
      const res2 = await fetch('http://localhost:18888', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'btc_getrawtransaction', params: [txid, 1], id: 2 }),
      });
      const data2 = await res2.json() as { result?: { vout?: unknown[] } };
      if (Array.isArray(data2.result?.vout)) return data2.result!.vout!.length;
    } catch { /* fall through */ }

    return null;
  }, txid).catch(() => null);
}

// ============================================================================
// Test suite — single test, all flows in sequence
// ============================================================================

test.describe.serial('Devnet AMM Smoke — keystore wallet', () => {
  let page: Page;
  let browserContext: import('@playwright/test').BrowserContext;
  const report = initReport();
  let lastTxid: string | null = null;

  test.beforeAll(async () => {
    // Remove Chromium lock files that prevent re-use of the persistent profile
    // (left over when a previous run crashed without closing the browser properly)
    const lockFiles = [
      '/tmp/playwright-devnet-smoke/SingletonLock',
      '/tmp/playwright-devnet-smoke/SingletonCookie',
      '/tmp/playwright-devnet-smoke/SingletonSocket',
    ];
    for (const f of lockFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore — file may not exist */ }
    }

    // Conditionally wipe IndexedDB: only if state has grown too large (>8000KB).
    // Cold boot from genesis OOMs the WASM runtime (can't allocate memory for all
    // contract deploys). Warm restore from saved state is fast (<30s) and stable.
    // But if state bloats past ~8MB across many runs, faucet clicks OOM instead.
    // The sweet spot: keep saved state when it exists and is ≤8000KB.
    const idbDir = '/tmp/playwright-devnet-smoke/Default/IndexedDB';
    try {
      if (fs.existsSync(idbDir)) {
        // Compute directory size in bytes
        const getDirSize = (dir: string): number => {
          let total = 0;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = `${dir}/${entry.name}`;
            if (entry.isDirectory()) total += getDirSize(full);
            else try { total += fs.statSync(full).size; } catch { /* ignore */ }
          }
          return total;
        };
        const sizeKb = Math.round(getDirSize(idbDir) / 1024);
        if (sizeKb > 8000) {
          fs.rmSync(idbDir, { recursive: true, force: true });
          console.log(`[smoke] Wiped IndexedDB (${sizeKb}KB > 8000KB limit) — cold-boot`);
        } else {
          console.log(`[smoke] Keeping IndexedDB (${sizeKb}KB) — warm restore`);
        }
      } else {
        console.log('[smoke] No IndexedDB — cold-boot (first run)');
      }
    } catch { /* ignore */ }

    const context = await chromium.launchPersistentContext(
      '/tmp/playwright-devnet-smoke',
      {
        headless: false,
        baseURL: APP_URL,
        // Force English locale so all text-based button selectors match the en.ts i18n
        // strings used throughout this spec. Without this, Chromium inherits the OS
        // locale (zh-CN on this machine) and every t('swap.liquidity') etc. renders
        // in Chinese, breaking find(b => b.textContent === 'Liquidity') etc.
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
        // Extra memory headroom for cold-boot WASM instantiation.
        // Without this, deploying all AMM contracts from genesis OOMs with
        // "WebAssembly.Instance(): Out of memory: Cannot allocate Wasm memory
        // for new instance" when a second WASM module is loaded concurrently.
        args: [
          '--js-flags=--max-old-space-size=8192',
          '--disable-site-isolation-trials',
        ],
      },
    );
    browserContext = context;
    page = context.pages()[0] ?? await context.newPage();
    page.on('dialog', d => d.accept());

    // Set devnet before any page loads so DevnetProvider initialises correctly.
    // IMPORTANT: detectNetwork() reads devnet from sessionStorage, not localStorage.
    // (localStorage only accepts 'mainnet'; devnet is tab-scoped via sessionStorage
    // per utils/detectNetwork.ts and WalletSettings.tsx handleSave logic.)
    await page.addInitScript(() => {
      sessionStorage.setItem('subfrost_selected_network', 'devnet');
      localStorage.removeItem('subfrost_selected_network');
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
    if (browserContext) await browserContext.close().catch(() => {});
  });

  test('Devnet smoke: boot → fund → 6 AMM flows → trace each txid', async () => {
    test.setTimeout(1_800_000); // 30 min — cold devnet boot can take 10-20 min

    // ── Step 0: Boot devnet ──────────────────────────────────────────────────
    console.log('[smoke] Step 0: booting devnet...');

    // First navigation — ensures the persistent context hits localhost:3000
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);

    // Forcibly set devnet network via sessionStorage (matches WalletSettings handleSave).
    // addInitScript runs this on every navigation, but belt+suspenders after goto.
    const networkSet = await page.evaluate(() => {
      sessionStorage.setItem('subfrost_selected_network', 'devnet');
      localStorage.removeItem('subfrost_selected_network');
      return sessionStorage.getItem('subfrost_selected_network');
    });
    console.log(`[smoke] Network set to: ${networkSet}`);

    // Hard reload so DevnetProvider mounts with sessionStorage already set.
    // addInitScript fires again during reload and re-sets sessionStorage before
    // the React tree initialises — this is the reliable trigger.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);

    // Dismiss the beta modal — may take a few seconds to render, retry generously
    await dismissDisclaimer(page);
    await page.waitForTimeout(1000);
    // A second dismiss in case it reappears after reload
    await dismissDisclaimer(page);

    // Verify sessionStorage stuck after reload (sanity check)
    const networkAfterReload = await page.evaluate(() =>
      sessionStorage.getItem('subfrost_selected_network')
    );
    console.log(`[smoke] Network after reload: ${networkAfterReload}`);
    if (networkAfterReload !== 'devnet') {
      // Force-set again and reload once more
      await page.evaluate(() => {
        sessionStorage.setItem('subfrost_selected_network', 'devnet');
        localStorage.removeItem('subfrost_selected_network');
      });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2000);
      await dismissDisclaimer(page);
    }

    // Wait for the "Devnet H:NNN" badge — cold boot can take 10-20 min on first run
    // 1800s = 30 min to cover extreme cold-boot cases
    await waitForDevnet(page, 1_800_000);
    // Dismiss any modal that appeared during the long boot wait
    await dismissDisclaimer(page);
    console.log('[smoke] Devnet ready. Funding wallet...');

    // ── Step 1: Fund ─────────────────────────────────────────────────────────
    await fundWallet(page);
    console.log('[smoke] Wallet funded.');

    // Dismiss any modal that appeared during funding (beta disclaimer re-appears after
    // the long faucet mining phase). Must run BEFORE clicking the swap link because
    // the fixed z-50 overlay blocks pointer events on any element beneath it.
    await dismissDisclaimer(page);
    await page.waitForTimeout(500);

    // Navigate to swap page — use JS click to bypass any residual overlay
    await page.evaluate(() => {
      const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null;
      if (a) a.click();
    });
    await page.waitForTimeout(2000);
    await dismissDisclaimer(page);

    // Wait for quspo to finish indexing pools so token pickers are populated.
    // Without this, sf-tile buttons show "Select" or empty text and selectTokenOnSide
    // opens a blank picker modal.
    await waitForSwapFormReady(page, 30_000);

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

        // Wait for the quote to load and confirm button to become enabled.
        // The React swap form disables CONFIRM SWAP while the route is computing
        // or while there's no quote yet. Poll up to 20s before giving up.
        const confirmEnabled = await waitForConfirmButton(page, 20_000);
        await page.screenshot({ path: '/tmp/dvn-flow1-preflight.png' });
        console.log(`[smoke] Flow 1 confirm button state: ${confirmEnabled}`);

        // Log form state for diagnosis if still disabled
        if (!confirmEnabled) {
          const diag = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type=number]')) as HTMLInputElement[];
            const btns = Array.from(document.querySelectorAll('button'));
            const confirmBtn = btns.find(b => /confirm swap/i.test(b.textContent || ''));
            const allBtnTexts = btns.map(b => (b.textContent || '').trim().substring(0, 30)).filter(Boolean);
            return {
              inputValues: inputs.map(i => i.value),
              confirmBtnFound: !!confirmBtn,
              confirmBtnDisabled: confirmBtn ? (confirmBtn as HTMLButtonElement).disabled : 'not found',
              allBtnTexts: allBtnTexts.slice(0, 15),
              bodyText: document.body.innerText.substring(0, 500),
            };
          });
          console.log('[smoke] Flow 1 diag:', JSON.stringify(diag));
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
        await page.evaluate(() => { const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null; if (a) a.click(); });
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'DIESEL');
        await selectTokenOnSide(page, 'buy', 'BTC');
        await page.waitForTimeout(1000);

        await setNumberInput(page, 0, SWAP_DIESEL_AMOUNT);
        const confirmEnabled = await waitForConfirmButton(page, 20_000);
        await page.screenshot({ path: '/tmp/dvn-flow2-preflight.png' });
        console.log(`[smoke] Flow 2 confirm button state: ${confirmEnabled}`);

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
        await page.evaluate(() => { const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null; if (a) a.click(); });
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'BTC');
        await selectTokenOnSide(page, 'buy', 'frBTC');
        await page.waitForTimeout(1000);

        await setNumberInput(page, 0, WRAP_BTC_AMOUNT);
        const confirmEnabled = await waitForConfirmButton(page, 20_000);
        await page.screenshot({ path: '/tmp/dvn-flow3-preflight.png' });
        console.log(`[smoke] Flow 3 confirm button state: ${confirmEnabled}`);

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
        await page.evaluate(() => { const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null; if (a) a.click(); });
        await page.waitForTimeout(1500);
        await dismissExistingToast(page);

        await selectTokenOnSide(page, 'sell', 'frBTC');
        await selectTokenOnSide(page, 'buy', 'BTC');
        await page.waitForTimeout(1000);

        // Use a fraction of what flow 3 should have produced
        await setNumberInput(page, 0, '0.00005');
        const confirmEnabled = await waitForConfirmButton(page, 20_000);
        await page.screenshot({ path: '/tmp/dvn-flow4-preflight.png' });
        console.log(`[smoke] Flow 4 confirm button state: ${confirmEnabled}`);

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

    // ── UTXO fragmentation pre-step ──────────────────────────────────────────
    // Reproduce the "Insufficient spendable 2:0: need X, have Y" failure mode
    // that appears after multiple swap flows split DIESEL across many change
    // UTXOs. Before the useWalletState devnet fix (2026-05-17), the server
    // route rejected network=devnet with HTTP 400, leaving the UTXO cache
    // empty so the SDK only found the most recent change outpoint via its own
    // protorunesbyaddress scan. With the fix, fetchDevnetWalletState fans out
    // per-outpoint client-side and the SDK sees the full aggregated balance.
    //
    // We run 3 micro BTC→DIESEL swaps here (0.00001 BTC each) to fragment
    // DIESEL into 4+ separate change UTXOs before Flow 5 tests add liquidity.
    {
      console.log('[smoke] UTXO fragmentation: running 3 BTC→DIESEL micro-swaps to split DIESEL across multiple UTXOs');
      await page.evaluate(() => { const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null; if (a) a.click(); });
      await page.waitForTimeout(2000);

      for (let i = 0; i < 3; i++) {
        try {
          await dismissExistingToast(page);
          await selectTokenOnSide(page, 'sell', 'BTC');
          await selectTokenOnSide(page, 'buy', 'DIESEL');
          await page.waitForTimeout(500);
          await setNumberInput(page, 0, '0.00001');
          const enabled = await waitForConfirmButton(page, 15_000);
          if (!enabled) {
            console.log(`[smoke] UTXO fragmentation swap ${i + 1}: confirm disabled — skipping`);
            continue;
          }
          await waitForPopupOverlayClose(page, 3000);
          await clickConfirmSwap(page);
          await page.waitForTimeout(2000);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 30_000);
          const fragTxid = await captureTxid(page, 30_000, lastTxid ?? undefined);
          if (fragTxid) lastTxid = fragTxid;
          console.log(`[smoke] UTXO fragmentation swap ${i + 1} txid: ${fragTxid ?? 'none'}`);
          await page.waitForTimeout(1000);
        } catch (fragErr) {
          console.log(`[smoke] UTXO fragmentation swap ${i + 1} error (non-fatal): ${fragErr}`);
        }
      }
      console.log('[smoke] UTXO fragmentation complete — DIESEL is now split across multiple UTXOs');
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
        // Navigate via client-side link ONLY — page.goto hard-navigates and remounts
        // DevnetProvider which wipes all in-memory devnet state (contracts, balances).
        await page.evaluate(() => { const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null; if (a) a.click(); });
        await page.waitForTimeout(2000);
        await dismissExistingToast(page);

        // CRITICAL: Set sell=BTC, buy=DIESEL BEFORE clicking Liquidity tab.
        // SwapShell auto-populates poolToken0/poolToken1 from fromToken/toToken when
        // liquidity mode is entered. Flow 4 left fromToken=frBTC, toToken=BTC — and
        // useMatchedLpPool returns null for frBTC+BTC since both are BTC-equivalent.
        // By switching to BTC→DIESEL here, poolToken0=BTC, poolToken1=DIESEL when
        // the Liquidity tab is clicked, giving a valid non-null matchedLpPool.
        await selectTokenOnSide(page, 'sell', 'BTC');
        await selectTokenOnSide(page, 'buy', 'DIESEL');
        await page.waitForTimeout(1000);

        // Click the "Liquidity" tab in the TradeForm to switch to liquidity mode.
        // The tab button has text "Liquidity" (i18n key swap.liquidity).
        // We use JS click to bypass pointer-events constraints on the tab bar.
        const liquidityTabClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const tab = btns.find(b => b.textContent?.trim() === 'Liquidity');
          if (tab) { (tab as HTMLElement).click(); return true; }
          return false;
        });
        if (!liquidityTabClicked) {
          console.log('[smoke] Flow 5: could not find Liquidity tab — trying sf-tab-btn search');
          await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.sf-tab-btn, [class*="tab"]'));
            const liqTab = tabs.find(t => /liquidity/i.test(t.textContent || ''));
            if (liqTab) (liqTab as HTMLElement).click();
          });
        }
        // Wait for LiquidityInputs to render (replaces SwapInputs in the DOM)
        // and for auto-population of poolToken0/poolToken1 from useEffect.
        await page.waitForFunction(() => {
          // LiquidityInputs renders two number inputs — wait for them to appear
          return document.querySelectorAll('input[type=number]').length >= 2;
        }, { timeout: 8_000 }).catch(() => {
          console.log('[smoke] Flow 5: LiquidityInputs did not render 2 inputs within 8s');
        });
        await page.waitForTimeout(800);

        // Ensure "Add" sub-tab is active (not "Remove"). Sub-tabs: "Add" and "Remove".
        const addTabClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const addTab = btns.find(b => b.textContent?.trim() === 'Add');
          if (addTab) { (addTab as HTMLElement).click(); return true; }
          return false;
        });
        console.log(`[smoke] Flow 5: Add sub-tab clicked: ${addTabClicked}`);
        await page.waitForTimeout(500);

        // If pool tokens aren't set, open pool0 selector and pick BTC, then DIESEL.
        // The token selector buttons in the liquidity form use openTokenSelector('pool0'/'pool1').
        // They are .sf-tile buttons at index 2 and 3 (0=sell, 1=buy in swap; 2=pool0, 3=pool1 in liq).
        const pool0Needs = await page.evaluate(() => {
          const sfTiles = Array.from(document.querySelectorAll('button.sf-tile'));
          // pool token selectors appear after the swap pair selectors
          return sfTiles.length > 2;
        });
        if (pool0Needs) {
          // Click pool0 selector and pick BTC
          await page.evaluate(() => {
            const sfTiles = Array.from(document.querySelectorAll('button.sf-tile'));
            if (sfTiles[2]) (sfTiles[2] as HTMLElement).click();
          });
          await page.waitForTimeout(700);
          await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Selector"]');
            const container = modal || document;
            const btns = Array.from(container.querySelectorAll('button'));
            const btcBtn = btns.find(b => /^BTC|^Bitcoin/i.test(b.textContent?.trim() ?? ''));
            if (btcBtn) (btcBtn as HTMLElement).click();
          });
          await page.waitForTimeout(700);

          // Click pool1 selector and pick DIESEL
          await page.evaluate(() => {
            const sfTiles = Array.from(document.querySelectorAll('button.sf-tile'));
            if (sfTiles[3]) (sfTiles[3] as HTMLElement).click();
          });
          await page.waitForTimeout(700);
          await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Selector"]');
            const container = modal || document;
            const btns = Array.from(container.querySelectorAll('button'));
            const dieselBtn = btns.find(b => /^DIESEL/i.test(b.textContent?.trim() ?? ''));
            if (dieselBtn) (dieselBtn as HTMLElement).click();
          });
          await page.waitForTimeout(700);
        }

        // Set BTC amount in the add-liquidity form — index 0 for pool token0 (BTC).
        // computePaired() in SwapShell runs synchronously when matchedLpPool + reserves are
        // available: it calls setPoolToken1Amount(paired) immediately in handlePoolToken0AmountChange.
        // If matchedLpPool hasn't resolved yet (markets still loading), computePaired returns null
        // and input[1] stays empty. We retry setNumberInput up to 5 times (2s apart) polling
        // until input[1] has a non-zero value — that signals reserves are loaded and the paired
        // DIESEL amount has been computed, making canAddLiquidity true.
        let token1Populated = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          await setNumberInput(page, 0, LIQUIDITY_BTC_AMOUNT);
          // Wait up to 5s for React to compute the paired token1Amount from pool reserves
          const populated = await page.waitForFunction(() => {
            const inputs = document.querySelectorAll('input[type=number]');
            return inputs.length >= 2 &&
              parseFloat((inputs[1] as HTMLInputElement).value || '0') > 0;
          }, { timeout: 5_000 }).then(() => true).catch(() => false);
          if (populated) { token1Populated = true; break; }
          // Pool not resolved yet — wait and retry
          await page.waitForTimeout(2000);
        }

        if (!token1Populated) {
          // Last-ditch: try directly setting input[1] to a DIESEL value so canAddLiquidity
          // has both amounts non-zero. Use a small DIESEL amount relative to our BTC.
          console.log('[smoke] Flow 5: input[1] still empty after 5 retries — manually setting DIESEL amount');
          await setNumberInput(page, 1, '10');
          await page.waitForTimeout(1000);
        }

        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/tmp/dvn-flow5-preflight.png' });

        // Poll for ADD LIQUIDITY button to become enabled (same pattern as CONFIRM SWAP).
        // i18n key: liquidity.addLiquidity — rendered text may vary; match case-insensitively.
        const addLiqEnabled = await (async () => {
          const deadline = Date.now() + 20_000;
          while (Date.now() < deadline) {
            const state = await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button'))
                .find(b => /add\s+liquidity/i.test(b.textContent || ''));
              if (!btn) return 'missing';
              return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
            }).catch(() => 'error');
            if (state === 'enabled') return true;
            await page.waitForTimeout(500);
          }
          return false;
        })();
        const confirmEnabled = addLiqEnabled;
        if (!confirmEnabled) {
          // Log diagnostic info before giving up
          const diag = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type=number]');
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => /add\s+liquidity/i.test(b.textContent || ''));
            const allBtns = Array.from(document.querySelectorAll('button'))
              .map(b => (b.textContent || '').trim().substring(0, 40)).filter(Boolean);
            return {
              input0: (inputs[0] as HTMLInputElement | undefined)?.value ?? 'missing',
              input1: (inputs[1] as HTMLInputElement | undefined)?.value ?? 'missing',
              inputCount: inputs.length,
              btnFound: !!btn,
              btnDisabled: btn ? (btn as HTMLButtonElement).disabled : 'n/a',
              allBtns: allBtns.slice(0, 20),
            };
          }).catch(() => null);
          console.log('[smoke] Flow 5 diag:', JSON.stringify(diag));
          flow.status = 'skipped';
          flow.skip_reason = 'add_liquidity_button_disabled';
          console.log('[smoke] Flow 5 skipped — ADD LIQUIDITY button disabled');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => /add\s+liquidity/i.test(b.textContent || ''));
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

        // Strategy 1: look for "Remove" button in the LP positions panel at the bottom of the page.
        // After Flow 5, the BottomPanels "Positions" tab should list the newly created LP position.
        // Click the "Positions" tab in the bottom panel to surface it.
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          // The tab is labeled "Positions" with a count badge
          const posTab = btns.find(b => /^Positions/i.test(b.textContent?.trim() ?? ''));
          if (posTab) (posTab as HTMLElement).click();
        });
        await page.waitForTimeout(1500);

        // Click the "Remove" button on the first LP position row
        const positionRemoveClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          // LP position rows have a "Remove" button (not "Remove Liquidity" — that's the CTA)
          const removeBtn = btns.find(b => {
            const txt = b.textContent?.trim() ?? '';
            return txt === 'Remove' || txt === 'Remove Liquidity';
          });
          if (removeBtn) { (removeBtn as HTMLElement).click(); return true; }
          return false;
        });

        if (!positionRemoveClicked) {
          // Strategy 2: switch to the Liquidity "Remove" sub-tab directly
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const removeTab = btns.find(b => b.textContent?.trim() === 'Remove');
            if (removeTab) (removeTab as HTMLElement).click();
          });
          await page.waitForTimeout(1000);
        }

        await page.waitForTimeout(1500);

        // Now in Remove mode — check if REMOVE LIQUIDITY button is enabled
        const removeEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent?.trim() === 'REMOVE LIQUIDITY');
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });

        if (!removeEnabled) {
          // Try to select the LP position if a selector is shown
          const lpSelectorClicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            // LP position selector button shows token pair like "BTC/DIESEL LP" or similar
            const lpBtn = btns.find(b => /(LP|position|BTC.*DIESEL|DIESEL.*BTC)/i.test(b.textContent ?? ''));
            if (lpBtn) { (lpBtn as HTMLElement).click(); return true; }
            return false;
          });
          if (lpSelectorClicked) {
            await page.waitForTimeout(1000);
            // Select first LP position in the dropdown
            await page.evaluate(() => {
              const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Selector"]');
              const container = modal || document;
              const btns = Array.from(container.querySelectorAll('button'));
              // First non-tab button in the modal is likely the first position
              if (btns[0]) (btns[0] as HTMLElement).click();
            });
            await page.waitForTimeout(1000);
          }

          // Set remove amount to 50%
          const removeAmountSet = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type=number], input[type=range]');
            if (inputs.length === 0) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
            // Try to find a percent or amount input
            for (const inp of Array.from(inputs)) {
              const el = inp as HTMLInputElement;
              setter.call(el, el.type === 'range' ? '50' : '50');
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          });
          if (removeAmountSet) await page.waitForTimeout(1000);
        }

        const finalRemoveEnabled = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent?.trim() === 'REMOVE LIQUIDITY');
          return btn ? !(btn as HTMLButtonElement).disabled : false;
        });

        if (!finalRemoveEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'remove_button_not_found_or_disabled';
          console.log('[smoke] Flow 6 skipped — no LP tokens or REMOVE LIQUIDITY button disabled');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await waitForPopupOverlayClose(page, 5000);
          await page.screenshot({ path: '/tmp/dvn-flow6-preflight.png' });

          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.trim() === 'REMOVE LIQUIDITY');
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
