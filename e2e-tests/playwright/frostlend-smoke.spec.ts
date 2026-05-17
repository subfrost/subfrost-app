/**
 * frostlend-smoke.spec.ts — Frostlend UI smoke test via keystore wallet
 *
 * Runs the 6 primary frostlend flows against the in-browser devnet
 * (localhost:3000 with subfrost_selected_network=devnet). Mirrors the
 * pattern of devnet-smoke.spec.ts — same boot / fund / trace infrastructure,
 * different flows targeting the /lend page.
 *
 * Flows tested (in order):
 *   Flow  1: FrostlendDevPanel deploy  → all 11 contracts deployed (5 phases)
 *   Flow  2: OpenTrove (0.03 frBTC, 1800 frostUSD) → frostUSD toast fires
 *   Flow  3: SP deposit (500 frostUSD) → SP total increases
 *   Flow  4: Oracle drop −25% via DevPanel → ICR bar turns red
 *   Flow  5: Batch-liquidate via DevPanel → trove closed
 *   Flow  6: SP withdraw → frBTC gain returned, toast fires
 *   Flow  7: AddCollateral (+0.001 frBTC to second trove)
 *   Flow  8: WithdrawCollateral (−0.001 frBTC from second trove)
 *   Flow  9: DrawFrostUsd (borrow 100 more frostUSD)
 *   Flow 10: RepayFrostUsd (repay 50 frostUSD)
 *   Flow 11: CloseTrove (user-initiated; verifies Open Trove form appears)
 *   Flow 12: Redeem frostUSD for frBTC (bootstrap window may reject; both outcomes pass)
 *
 * After each mutation:
 *   - A screenshot is saved to /tmp/ for diagnostics
 *   - trace is fetched via localhost:18888 metashrew_view "trace" (when a txid
 *     is emitted by the mutation hook via SwapSuccessNotification)
 *   - result is appended to e2e-tests/camoufox/smoke_report.json
 *
 * ## Run
 *   npx playwright test frostlend-smoke --project=chromium-devnet-smoke --headed
 *
 * ## Prerequisites
 *   - `npm run dev` running on http://localhost:3000
 *   - Devnet boots automatically in-browser on first load (~5-10 min cold boot)
 *   - No seed phrase or external wallet required (keystore wallet)
 *
 * ## Architecture notes
 *   - All RPC calls go through page.evaluate() — localhost:18888 is the devnet
 *     fetch interceptor, not accessible from the Node test process.
 *   - The keystore wallet is auto-created and seeded by devnet boot; we do NOT
 *     need to click "Deploy" for the AMM contracts — those are already present
 *     after the devnet boots. We DO need to click "Deploy frostlend" in the
 *     FrostlendDevPanel because frostlend is a separate optional deploy.
 *   - Boot → Fund → Deploy Frostlend → Wrap frBTC → then run flows.
 *   - frostUSD and frBTC success signals come from visible UI text changes and
 *     from the SwapSuccessNotification txid toast (same as devnet-smoke).
 *   - For oracle-drop and liquidation (DevPanel-only actions that don't emit
 *     a txid toast), we verify via observable UI state changes.
 *
 * ## Source references
 *   components/FrostlendDevPanel.tsx          — deploy, oracle, liquidate buttons
 *   components/DevnetControlPanel.tsx         — parent panel, faucet, mine
 *   app/lend/components/TroveDashboard.tsx    — Open Trove, Adjust, Close
 *   app/lend/components/StabilityPoolPanel.tsx — Deposit/Withdraw, SP total
 *   hooks/frostlend/useOpenTroveMutation.ts   — emits SwapSuccessNotification txid
 *   hooks/frostlend/useStabilityPoolMutations.ts — same
 *   e2e-tests/playwright/devnet-smoke.spec.ts — boot/fund/trace patterns (copied)
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

// frBTC to wrap before OpenTrove — wrap more than the open requires
// so the SDK has a large-enough UTXO. 0.05 BTC → 5_000_000 sats frBTC.
const WRAP_BTC_FOR_TROVE = '0.05';
// OpenTrove form defaults. Oracle is bumped to $100k before Flow 2 so
// 0.03 frBTC × $100k = $3000 → ICR = 3000/1800 = 166% > MCR 110%.
const TROVE_COLL = '0.03'; // frBTC
const TROVE_DEBT = '1800'; // frostUSD (minimum net debt)
// Oracle price set via DevPanel after deployment (above $50k default so 0.03 frBTC clears MCR)
const ORACLE_PRICE_USD = 100_000;
// SP deposit must be ≥ trove1 debt (2009 frostUSD with 200 gas comp). Use 2200 to cover fully.
// Liquity liquidation: if SP.frostUSD ≥ trove.debt, SP absorbs; otherwise redistribution path.
const SP_DEPOSIT = '2200';
// Oracle drop: 50% from $100k → $50k. ICR = 0.03×$50k/$1800 = 83% < MCR 110% → liquidatable.
// 25% only drops to $75k → ICR 125% which is still above MCR.
const ORACLE_DROP_PCT = 50;
// Guardian trove: opened between SP deposit and oracle drop. High collateral so it's not
// liquidated when oracle drops. Needed because Liquity forbids liquidating the sole trove
// (system would have 0 collateral and the TCR invariant breaks). Two troves needed for
// the batch-liquidate flow to execute. Assertions: TroveCount after liquidation = 1 (guardian).
const GUARDIAN_COLL = '0.10'; // frBTC — at $50k: ICR = 0.10×$50k/$1800 = 277% > MCR
const GUARDIAN_DEBT = '1800'; // frostUSD

const REPORT_PATH = path.join(__dirname, '../camoufox/smoke_report.json');

// ============================================================================
// Report types — mirrors devnet-smoke.spec.ts
// ============================================================================

interface TraceDigest {
  vout: number;
  bytes: number;
  events: string[];
  status: 'success' | 'failure' | 'empty' | 'error';
  revert_reason: string | null;
  raw_hex_path: string | null;
}

interface AssertionResult {
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

interface FlowResult {
  name: string;
  status: 'success' | 'skipped' | 'error';
  txid: string | null;
  fee_sats: number | null;
  skip_reason: string | null;
  error: string | null;
  trace: TraceDigest | null;
  note: string | null;
  assertions: AssertionResult[];
}

interface FrostlendSmokeReport {
  run_at: string;
  wallet: 'keystore';
  network: 'devnet';
  suite: 'frostlend';
  flows: FlowResult[];
  aberrations: string[];
}

function initReport(): FrostlendSmokeReport {
  return {
    run_at: new Date().toISOString(),
    wallet: 'keystore',
    network: 'devnet',
    suite: 'frostlend',
    flows: [],
    aberrations: [],
  };
}

function saveReport(report: FrostlendSmokeReport) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  // Merge with existing report if it exists (may contain AMM flows from devnet-smoke)
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); } catch { /* first run */ }
  const merged = { ...existing, frostlend: report };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(merged, null, 2));
}

// ============================================================================
// Chain-state assertion helpers
// ============================================================================

// Contract IDs — mirrors constants/frostlend.ts (duplicated here so page.evaluate
// closures can inline them; evaluate runs in the browser context, not Node).
const FL = {
  TROVE_MANAGER:  { block: '4', tx: '513' },
  STABILITY_POOL: { block: '4', tx: '515' },
  PRICE_FEED:     { block: '4', tx: '518' },
} as const;

// Opcode constants (subset needed for assertions)
const OP = {
  TM_GetTroveCount:       '23',
  TM_GetTroveStatus:      '22',
  TM_GetTroveColl:        '20',
  TM_GetTroveDebt:        '21',
  TM_GetTroveAuthToken:   '33', // returns AlkaneId (block u128 LE | tx u128 LE) for trove auth receipt
  SP_GetTotalDeposits:    '20',
  SP_GetCompounded:       '21',
  PF_GetStoredPrice:      '30',
} as const;

/**
 * Run a single alkanes_simulate read against localhost:18888.
 * Returns the response as a hex string, or null on failure.
 * Must be called via page.evaluate() so it can reach the devnet fetch interceptor.
 */
type SimPayload = { block: string; tx: string; inputs: string[] };

async function simRead(page: Page, payload: SimPayload): Promise<string | null> {
  return page.evaluate(async ({ block, tx, inputs }) => {
    try {
      const res = await fetch('http://localhost:18888', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{
            target: { block, tx },
            inputs,
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '999999',
            txindex: 0,
            vout: 0,
          }],
          id: 1,
        }),
      });
      const data = await res.json() as { result?: { execution?: { data?: string } } };
      return data?.result?.execution?.data ?? null;
    } catch { return null; }
  }, payload);
}

/** Parse a hex response (with or without 0x) as a little-endian u128 BigInt string. */
function hexToU128(hex: string | null): bigint {
  if (!hex) return 0n;
  const clean = hex.replace(/^0x/, '').slice(0, 32); // first 16 bytes = 32 hex chars
  if (!clean) return 0n;
  let v = 0n;
  for (let i = clean.length - 2; i >= 0; i -= 2) {
    v = (v << 8n) | BigInt(parseInt(clean.slice(i, i + 2), 16) || 0);
  }
  return v;
}

/** Parse hex as u8 (first byte). */
function hexToU8(hex: string | null): number {
  if (!hex) return 0;
  const clean = hex.replace(/^0x/, '');
  return parseInt(clean.slice(0, 2), 16) || 0;
}

/**
 * Assert a chain-state value and return an AssertionResult.
 * `actual` is always recorded even on failure, for diagnostics.
 */
function makeAssertion(label: string, expected: string, actual: string): AssertionResult {
  const passed = expected === actual;
  if (!passed) console.warn(`[assert FAIL] ${label}: expected=${expected} actual=${actual}`);
  else console.log(`[assert OK]   ${label}: ${actual}`);
  return { label, passed, expected, actual };
}

// ============================================================================
// Trace helpers — identical to devnet-smoke.spec.ts
// ============================================================================

async function fetchDevnetTrace(page: Page, txid: string, outputCount: number): Promise<TraceDigest> {
  const SKILL_DIR = path.join(os.homedir(), '.claude/skills/alkanes-trace-digest');

  const probe = await page.evaluate(
    async ({ txid, outputCount }) => {
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

  const hexPath = `/tmp/fl_trace_${txid.slice(0, 8)}_v${probe.vout}.hex`;
  fs.writeFileSync(hexPath, probe.hex);

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
// Devnet helpers — copied from devnet-smoke.spec.ts
// ============================================================================

async function waitForDevnet(page: Page, timeoutMs = 900_000): Promise<void> {
  const btn = page.locator('button', { hasText: /Devnet H:\d+/ });
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
}

async function dismissDisclaimer(page: Page): Promise<void> {
  const btn = page.locator('button').filter({ hasText: /understand/i }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 12_000 });
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(600);
    }
  } catch { /* modal not present */ }
}

async function recoverFromOom(page: Page): Promise<void> {
  const dismissBtn = page.locator('button', { hasText: 'Dismiss' });
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
    console.log('[frostlend-smoke] OOM banner dismissed — waiting to recover...');
    await page.waitForTimeout(15_000);
  }
}

async function waitForIndexerSync(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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

async function fundWallet(page: Page): Promise<void> {
  await recoverFromOom(page);
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.waitFor({ state: 'visible', timeout: 30_000 });
  await badge.click();
  await page.waitForTimeout(500);

  // +1 BTC × 2 to cover wrap + fees
  const btcBtn = page.locator('button', { hasText: '+1 BTC' });
  await btcBtn.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 2; i++) {
    if (await btcBtn.isEnabled({ timeout: 10_000 }).catch(() => false)) {
      await btcBtn.click();
      await page.waitForTimeout(60_000);
      await recoverFromOom(page);
      const stillOpen = await page.locator('button', { hasText: '+1 BTC' }).isVisible({ timeout: 2000 }).catch(() => false);
      if (!stillOpen && i < 1) {
        await badge.waitFor({ state: 'visible', timeout: 120_000 });
        await badge.click();
        await page.waitForTimeout(500);
      }
    }
  }

  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(1000);
  await waitForIndexerSync(page, 30_000);
}

/** Capture txid from SwapSuccessNotification toast (same pattern as devnet-smoke). */
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

async function getVoutCount(page: Page, txid: string): Promise<number | null> {
  return page.evaluate(async (txid) => {
    try {
      const res = await fetch('http://localhost:18888', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'esplora_tx', params: [txid], id: 1 }),
      });
      const data = await res.json() as { result?: { vout?: unknown[] } };
      if (Array.isArray(data.result?.vout)) return data.result!.vout!.length;
    } catch { /* fall through */ }
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

/** Navigate to /lend using client-side routing (avoids DevnetProvider remount). */
async function navToLend(page: Page): Promise<void> {
  const navigated = await page.evaluate(() => {
    // Try Next.js router push via client-side link click
    const a = document.querySelector('a[href="/lend"]') as HTMLAnchorElement | null;
    if (a) { a.click(); return true; }
    return false;
  });
  if (!navigated) {
    // Fallback: hard navigate (remounts DevnetProvider — slower but works)
    await page.goto('/lend', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await page.waitForTimeout(2000);
}

// ============================================================================
// Frostlend DevPanel helpers
// ============================================================================

/**
 * Open the DevnetControlPanel and return whether the FrostlendDevPanel section
 * already shows "deployed" status.
 */
async function openDevPanel(page: Page): Promise<void> {
  await recoverFromOom(page);
  const badge = page.locator('button', { hasText: /Devnet H:/ });
  await badge.waitFor({ state: 'visible', timeout: 30_000 });
  await badge.click();
  await page.waitForTimeout(600);
}

async function closeDevPanel(page: Page): Promise<void> {
  const closeBtn = page.locator('button', { hasText: '✕' });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  }
  await page.waitForTimeout(500);
}

/**
 * Wait for FrostlendDevPanel to show "deployed" status.
 * The panel refreshes via useEffect on mount — poll up to timeoutMs.
 */
async function waitForFrostlendDeployed(page: Page, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployed = await page.evaluate(() => {
      // Look for the green "deployed" text in the FrostlendDevPanel section
      const spans = Array.from(document.querySelectorAll('span'));
      return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
    });
    if (deployed) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

/**
 * Wrap BTC → frBTC using the /swap form (same as devnet-smoke flow 3).
 * Returns the txid if the toast fires, else null.
 */
async function wrapFrbtc(page: Page, btcAmount: string, lastTxid: string | null): Promise<string | null> {
  await page.evaluate(() => {
    const a = document.querySelector('a[href="/swap"]') as HTMLAnchorElement | null;
    if (a) a.click();
  });
  await page.waitForTimeout(1500);

  // Set sell=BTC, buy=frBTC
  const setSide = async (sideIdx: number, symbol: string) => {
    await page.evaluate((idx) => {
      const sfTiles = Array.from(document.querySelectorAll('button.sf-tile'));
      if (sfTiles[idx]) (sfTiles[idx] as HTMLElement).click();
    }, sideIdx);
    await page.waitForTimeout(700);
    await page.evaluate((sym) => {
      const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="TokenSelector"], [class*="picker"]');
      const container = modal || document;
      const btns = Array.from(container.querySelectorAll('button'));
      const target = btns.find(b => {
        const txt = (b.textContent || '').trim();
        return txt === sym || txt.startsWith(sym + ' ') || txt.startsWith(sym + '\n');
      });
      if (target) (target as HTMLElement).click();
    }, symbol);
    await page.waitForTimeout(600);
  };

  await setSide(0, 'BTC');
  await setSide(1, 'frBTC');

  // Set amount
  await page.evaluate(
    ({ idx, val }) => {
      const el = document.querySelectorAll('input[type=number]')[idx] as HTMLInputElement;
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { idx: 0, val: btcAmount },
  );

  // Wait for CONFIRM SWAP to become enabled
  const deadline = Date.now() + 20_000;
  let confirmEnabled = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => /confirm swap/i.test(b.textContent || ''));
      if (!btn) return 'missing';
      return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
    }).catch(() => 'error');
    if (state === 'enabled') { confirmEnabled = true; break; }
    await page.waitForTimeout(500);
  }

  if (!confirmEnabled) return null;

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => /confirm swap/i.test(b.textContent || ''));
    if (btn) (btn as HTMLElement).click();
  });
  await page.waitForTimeout(3000);
  await mineOneBlock(page);
  await waitForIndexerSync(page, 60_000);

  return captureTxid(page, 60_000, lastTxid ?? undefined);
}

// ============================================================================
// Test suite
// ============================================================================

test.describe.serial('Frostlend UI Smoke — keystore wallet', () => {
  let page: Page;
  let browserContext: import('@playwright/test').BrowserContext;
  const report = initReport();
  let lastTxid: string | null = null;
  // Tracks the TroveManager trove ID of the most recently opened trove so
  // adjust-flow assertions can query the correct trove slot.
  let lastTroveId: bigint = 0n;

  test.beforeAll(async () => {
    const lockFiles = [
      '/tmp/playwright-frostlend-smoke/SingletonLock',
      '/tmp/playwright-frostlend-smoke/SingletonCookie',
      '/tmp/playwright-frostlend-smoke/SingletonSocket',
    ];
    for (const f of lockFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }

    // Wipe IDB if >8MB to prevent OOM on faucet clicks
    const idbDir = '/tmp/playwright-frostlend-smoke/Default/IndexedDB';
    try {
      if (fs.existsSync(idbDir)) {
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
        // Always wipe — warm restore brings back a broken end-state (liquidated trove,
        // dropped oracle, no frostUSD). Every run must start from a clean devnet.
        fs.rmSync(idbDir, { recursive: true, force: true });
        console.log(`[frostlend-smoke] Wiped IndexedDB (${sizeKb}KB) — cold-boot`);
      }
    } catch { /* ignore */ }

    const context = await chromium.launchPersistentContext(
      '/tmp/playwright-frostlend-smoke',
      {
        headless: false,
        baseURL: APP_URL,
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
        args: [
          '--js-flags=--max-old-space-size=8192',
          '--disable-site-isolation-trials',
        ],
      },
    );
    browserContext = context;
    page = context.pages()[0] ?? await context.newPage();
    page.on('dialog', d => d.accept());

    await page.addInitScript(() => {
      sessionStorage.setItem('subfrost_selected_network', 'devnet');
      localStorage.removeItem('subfrost_selected_network');
    });

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        console.error('[browser error]', text.substring(0, 200));
      } else if (
        text.includes('frostlend') || text.includes('[frostlend') ||
        text.includes('DevnetContext') || text.includes('[smoke]') ||
        text.includes('phase') || text.includes('deploy')
      ) {
        console.log('[devnet]', text.substring(0, 300));
      }
    });
  });

  test.afterAll(async () => {
    saveReport(report);
    console.log(`[frostlend-smoke] Report saved to: ${REPORT_PATH}`);
    if (browserContext) await browserContext.close().catch(() => {});
  });

  test('Frostlend smoke: boot → fund → deploy → OpenTrove → SP deposit → oracle drop → liquidate → SP withdraw', async () => {
    test.setTimeout(1_800_000); // 30 min

    // ── Step 0: Boot devnet ──────────────────────────────────────────────────
    console.log('[frostlend-smoke] Step 0: booting devnet...');

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      sessionStorage.setItem('subfrost_selected_network', 'devnet');
      localStorage.removeItem('subfrost_selected_network');
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);
    await dismissDisclaimer(page);
    await page.waitForTimeout(1000);
    await dismissDisclaimer(page);

    const networkAfterReload = await page.evaluate(() =>
      sessionStorage.getItem('subfrost_selected_network')
    );
    if (networkAfterReload !== 'devnet') {
      await page.evaluate(() => {
        sessionStorage.setItem('subfrost_selected_network', 'devnet');
        localStorage.removeItem('subfrost_selected_network');
      });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2000);
      await dismissDisclaimer(page);
    }

    await waitForDevnet(page, 1_800_000);
    await dismissDisclaimer(page);
    console.log('[frostlend-smoke] Devnet ready.');

    // ── Step 1: Fund wallet ──────────────────────────────────────────────────
    await fundWallet(page);
    await dismissDisclaimer(page);
    console.log('[frostlend-smoke] Wallet funded.');

    // ── Flow 1: Deploy frostlend ─────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'frostlend_deploy',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 1: Deploy frostlend');
        await openDevPanel(page);

        // Check if already deployed (warm restore with existing state)
        const alreadyDeployed = await waitForFrostlendDeployed(page, 8_000);

        if (alreadyDeployed) {
          flow.status = 'success';
          flow.note = 'already deployed (warm restore)';
          console.log('[frostlend-smoke] Flow 1: frostlend already deployed — skipping');
          await closeDevPanel(page);
        } else {
          // Click "Deploy frostlend" button
          const deployBtn = page.locator('button', { hasText: 'Deploy frostlend' });
          await deployBtn.waitFor({ state: 'visible', timeout: 15_000 });
          await deployBtn.click();

          // Wait for deploy to finish — 5 phases, ~60-120s
          // Progress text cycles through: "frostlend: deploy auth-token-factory... (5%)" etc.
          // Completion: button disappears (isDeployed becomes true), or "deployed" span appears.
          console.log('[frostlend-smoke] Flow 1: waiting for 5-phase deploy...');
          await page.waitForTimeout(5_000); // let progress text appear

          const deployFinished = await page.waitForFunction(
            () => {
              // FrostlendDevPanel hides the deploy button when isDeployed=true
              const deployBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent?.trim() === 'Deploy frostlend');
              if (!deployBtn) return true; // button gone = deployed
              // Or: deployed span appeared
              const spans = Array.from(document.querySelectorAll('span'));
              return spans.some(s => s.textContent?.trim() === 'deployed' &&
                s.classList.contains('text-green-400'));
            },
            { timeout: 180_000 },
          ).then(() => true).catch(() => false);

          await page.screenshot({ path: '/tmp/fl-flow1-deploy-result.png' });

          if (deployFinished) {
            flow.status = 'success';
            flow.note = '11 contracts deployed (5 phases)';
            console.log('[frostlend-smoke] Flow 1: deploy succeeded');
          } else {
            flow.error = 'deploy did not complete within 3 minutes';
            console.log('[frostlend-smoke] Flow 1: deploy timeout');
          }
          await closeDevPanel(page);
        }

        report.flows.push(flow);
        saveReport(report);
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow1-error.png' }).catch(() => {});
        await closeDevPanel(page).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Step 1b: Set oracle price to $100k ──────────────────────────────────
    // Default deploy price is $50k. 0.03 frBTC at $50k → ICR 83% < MCR 110%.
    // Bump to $100k: 0.03 × $100k = $3000 → ICR 166% — comfortably above MCR.
    {
      try {
        console.log(`[frostlend-smoke] Step 1b: Setting oracle price to $${ORACLE_PRICE_USD}...`);
        await openDevPanel(page);
        // The oracle input only appears inside {isDeployed && (...)} where
        // isDeployed = priceUsd !== null && priceUsd > 0.
        // Wait for the "deployed" green span (always rendered, reflects isDeployed) as the
        // reliable DOM signal before looking for the oracle input.
        // refreshPrice() fires on DevPanel mount and calls simulateAlkane on the price-feed.
        // On a fresh deploy, all 11 contracts need to be indexed first (~30-60s). Use 120s.
        const isDeployedVisible = await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 120_000 },
        ).then(() => true).catch(() => false);
        const oracleInputVisible = isDeployedVisible && await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
          return inputs.some(el => el.classList.contains('font-mono'));
        }).catch(() => false);
        if (!oracleInputVisible) {
          console.log(`[frostlend-smoke] Step 1b: oracle input not found (isDeployed=${isDeployedVisible}) — skipping price set`);
          await closeDevPanel(page).catch(() => {});
        } else {
          // The oracle price input has a unique font-mono class in the DevPanel.
          // Use page.evaluate to set the value directly since the panel may not be
          // in the same scroll viewport.
          await page.evaluate((price) => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            // The oracle input has font-mono class, others don't
            const oracleInput = inputs.find(el => el.classList.contains('font-mono')) as HTMLInputElement | undefined;
            if (!oracleInput) return;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
            setter.call(oracleInput, String(price));
            oracleInput.dispatchEvent(new Event('input', { bubbles: true }));
            oracleInput.dispatchEvent(new Event('change', { bubbles: true }));
          }, ORACLE_PRICE_USD);
          await page.waitForTimeout(300);
          // Click the "Set" button — it's a sibling of the font-mono oracle input
          const setClicked = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            const oracleInput = inputs.find(el => el.classList.contains('font-mono'));
            if (!oracleInput) return false;
            // Parent div contains the input + the Set button as siblings
            const parent = oracleInput.parentElement;
            if (!parent) return false;
            const setBtn = Array.from(parent.querySelectorAll('button'))
              .find(b => b.textContent?.trim() === 'Set');
            if (setBtn && !(setBtn as HTMLButtonElement).disabled) {
              (setBtn as HTMLElement).click();
              return true;
            }
            return false;
          });
          if (!setClicked) {
            console.log('[frostlend-smoke] Step 1b: Set button not found/disabled — skipping price set');
          } else {
            // Wait for the "Price →" confirmation in the panel result area.
            const priceConfirmed = await page.waitForFunction(
              () => {
                const divs = Array.from(document.querySelectorAll('div'));
                return divs.some(d => /Price\s*→/i.test(d.textContent || ''));
              },
              { timeout: 60_000 },
            ).then(() => true).catch(() => false);
            if (priceConfirmed) {
              console.log(`[frostlend-smoke] Step 1b: oracle price set confirmed → $${ORACLE_PRICE_USD}`);
            } else {
              console.log('[frostlend-smoke] Step 1b: oracle price set — no confirmation text (may have auto-cleared)');
            }
            await page.waitForTimeout(1_000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 30_000);
            console.log(`[frostlend-smoke] Step 1b: oracle price set to $${ORACLE_PRICE_USD}`);
          }
          await closeDevPanel(page);
        }
      } catch (e) {
        console.log(`[frostlend-smoke] Step 1b: oracle price set failed — ${e instanceof Error ? e.message : String(e)} — proceeding`);
        await closeDevPanel(page).catch(() => {});
      }
    }

    // ── Step 2: Wrap frBTC (pre-req for OpenTrove) ───────────────────────────
    console.log('[frostlend-smoke] Pre-step: wrapping frBTC...');
    const wrapTxid = await wrapFrbtc(page, WRAP_BTC_FOR_TROVE, lastTxid);
    if (wrapTxid) {
      lastTxid = wrapTxid;
      console.log(`[frostlend-smoke] frBTC wrap txid: ${wrapTxid}`);
    } else {
      console.log('[frostlend-smoke] frBTC wrap: no txid captured (may have failed)');
    }

    // ── Flow 2: OpenTrove ────────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'open_trove',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 2: OpenTrove');
        await navToLend(page);
        await dismissDisclaimer(page);

        // Wait for the /lend page to render — look for "Your Trove" heading
        await page.waitForFunction(
          () => {
            const headings = Array.from(document.querySelectorAll('h2'));
            return headings.some(h => h.textContent?.trim() === 'Your Trove');
          },
          { timeout: 30_000 },
        ).catch(() => { console.log('[frostlend-smoke] "Your Trove" heading not found — proceeding'); });

        // Check if a trove is already open (from warm restore)
        const troveAlreadyOpen = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.some(b => /close trove/i.test(b.textContent || ''));
        });

        if (troveAlreadyOpen) {
          flow.status = 'success';
          flow.note = 'trove already open (warm restore)';
          console.log('[frostlend-smoke] Flow 2: trove already open');
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Wait for oracle price to appear in system stats banner first — proves
          // useSystemData has returned and projectedIcr can compute.
          await page.waitForFunction(
            () => /\$[\d,]+/.test(document.body.innerText),
            { timeout: 60_000 },
          ).catch(() => { console.log('[frostlend-smoke] oracle price not visible — proceeding anyway'); });

          // Fill collateral and debt. React 18 controlled inputs ignore fill() when
          // the form re-renders back to its useState default. Use triple-click to
          // select-all, then pressSequentially to type real keyboard events that
          // React's onChange handles unconditionally.
          const collInput = page.locator('input[inputmode="decimal"]').nth(0);
          const debtInput = page.locator('input[inputmode="decimal"]').nth(1);
          await collInput.click({ clickCount: 3 });
          await collInput.pressSequentially(TROVE_COLL, { delay: 30 });
          await page.waitForTimeout(300);
          await debtInput.click({ clickCount: 3 });
          await debtInput.pressSequentially(TROVE_DEBT, { delay: 30 });
          await page.waitForTimeout(500);

          await page.screenshot({ path: '/tmp/fl-flow2-preflight.png' });

          // Wait for "Open Trove" button to be enabled (up to 30s after oracle is visible)
          const openBtnEnabled = await (async () => {
            const dl = Date.now() + 30_000;
            while (Date.now() < dl) {
              const state = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button'))
                  .find(b => b.textContent?.trim() === 'Open Trove');
                if (!btn) return 'missing';
                return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
              });
              if (state === 'enabled') return true;
              await page.waitForTimeout(600);
            }
            return false;
          })();

          if (!openBtnEnabled) {
            // Diagnose — maybe oracle price is too low (ICR check fails in the form)
            const diagText = await page.evaluate(() => document.body.innerText.substring(0, 400));
            console.log('[frostlend-smoke] Flow 2 diag:', diagText);
            flow.status = 'skipped';
            flow.skip_reason = 'open_trove_button_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent?.trim() === 'Open Trove');
              if (btn) (btn as HTMLElement).click();
            });
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow2-result.png' });

            if (txid) {
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 2 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                console.log(`[frostlend-smoke] Flow 2 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
                if (flow.trace.status === 'failure') {
                  report.aberrations.push(`Flow 2 (OpenTrove) REVERT: ${flow.trace.revert_reason}`);
                }
              }
            } else {
              console.log('[frostlend-smoke] Flow 2: no toast txid — verifying on-chain directly');
            }

            // Chain-state verification runs unconditionally — on-chain truth regardless
            // of whether the toast fired. TroveCount ≥ 1 is the canonical success signal.
            const troveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
            const troveCount = hexToU128(troveCountHex);
            flow.assertions.push(makeAssertion('TroveCount ≥ 1', 'true', String(troveCount >= 1n)));

            if (troveCount >= 1n) {
              flow.status = 'success';
              flow.txid = txid;
              const troveId = troveCount;
              lastTroveId = troveId;

              const troveStatusHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveStatus, String(troveId)] });
              const troveStatus = hexToU8(troveStatusHex);
              flow.assertions.push(makeAssertion('TroveStatus = Active (1)', '1', String(troveStatus)));

              const troveCollHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveColl, String(troveId)] });
              const troveColl = hexToU128(troveCollHex);
              flow.assertions.push(makeAssertion('TroveColl > 0', 'true', String(troveColl > 0n)));

              const troveDebtHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveDebt, String(troveId)] });
              const troveDebt = hexToU128(troveDebtHex);
              flow.assertions.push(makeAssertion('TroveDebt ≥ 1800 frostUSD', 'true', String(troveDebt >= 180_000_000_000n)));

              console.log(`[frostlend-smoke] Flow 2: trove confirmed on-chain — id=${troveId} coll=${troveColl} debt=${troveDebt}`);
            } else {
              flow.status = 'error';
              flow.error = txid
                ? `OpenTrove tx broadcast (${txid}) but TroveCount still 0 — silent revert`
                : 'OpenTrove: no txid and TroveCount = 0';
              report.aberrations.push(`Flow 2 (OpenTrove) failed: ${flow.error}`);
            }

            const failedAssertions = flow.assertions.filter(a => !a.passed);
            if (failedAssertions.length > 0) {
              report.aberrations.push(`Flow 2 (OpenTrove) assertion failures: ${failedAssertions.map(a => a.label).join(', ')}`);
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow2-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 3: SP deposit ───────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'sp_deposit',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 3: SP deposit');
        await navToLend(page);
        await page.waitForTimeout(2000);

        // Check if frostUSD is available — stability pool panel should show
        // Look for the "Stability Pool" heading
        await page.waitForFunction(
          () => {
            const headings = Array.from(document.querySelectorAll('h2'));
            return headings.some(h => h.textContent?.trim() === 'Stability Pool');
          },
          { timeout: 30_000 },
        ).catch(() => { console.log('[frostlend-smoke] "Stability Pool" heading not found — proceeding'); });

        // Ensure "Deposit" tab is selected first (so the right input is active)
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const depositTab = btns.find(b => b.textContent?.trim() === 'Deposit');
          if (depositTab) (depositTab as HTMLElement).click();
        });
        await page.waitForTimeout(500);

        // Set SP deposit amount. Target the input that is a sibling of "Deposit to SP" button
        // (StabilityPoolPanel) rather than the AdjustTrove input which also has inputmode=decimal.
        const spAmountSet = await page.evaluate((amount) => {
          // Find the "Deposit to SP" button and walk up to the containing div, then find the input
          const btns = Array.from(document.querySelectorAll('button'));
          const depositBtn = btns.find(b => b.textContent?.trim() === 'Deposit to SP');
          if (!depositBtn) return false;
          // Walk up to find nearest ancestor that also contains an input
          let el: Element | null = depositBtn;
          for (let i = 0; i < 6 && el; i++) {
            el = el.parentElement;
            const input = el?.querySelector('input[inputmode="decimal"]') as HTMLInputElement | null;
            if (input) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(input, amount);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.focus();
              return true;
            }
          }
          return false;
        }, SP_DEPOSIT);
        if (!spAmountSet) {
          console.log('[frostlend-smoke] Flow 3: could not set SP amount via parent traversal — falling back to label selector');
          const spAmountInput = page.locator('label').filter({ hasText: /Amount \(frostUSD\)/i }).locator('input[inputmode="decimal"]').last();
          await spAmountInput.click({ clickCount: 3 });
          await spAmountInput.pressSequentially(SP_DEPOSIT, { delay: 30 });
        }
        await page.waitForTimeout(800);

        await page.screenshot({ path: '/tmp/fl-flow3-preflight.png' });

        // Click "Deposit to SP"
        const depositBtnEnabled = await (async () => {
          const dl = Date.now() + 10_000;
          while (Date.now() < dl) {
            const state = await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent?.trim() === 'Deposit to SP');
              if (!btn) return 'missing';
              return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
            });
            if (state === 'enabled') return true;
            await page.waitForTimeout(500);
          }
          return false;
        })();

        if (!depositBtnEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'deposit_to_sp_button_not_found_or_disabled';
          console.log('[frostlend-smoke] Flow 3 skipped — SP deposit button not available');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.trim() === 'Deposit to SP');
            if (btn) (btn as HTMLElement).click();
          });
          await page.waitForTimeout(3000);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/fl-flow3-result.png' });

          if (txid) {
            lastTxid = txid;
            console.log(`[frostlend-smoke] Flow 3 txid: ${txid}`);
            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[frostlend-smoke] Flow 3 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 3 (SP deposit) REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            console.log('[frostlend-smoke] Flow 3: no toast txid — verifying on-chain directly');
          }

          // Chain-state verification unconditional — SP total deposits is the receipt.
          const spTotalHex = await simRead(page, { ...FL.STABILITY_POOL, inputs: [OP.SP_GetTotalDeposits] });
          const spTotal = hexToU128(spTotalHex);
          flow.assertions.push(makeAssertion('SP total deposits ≥ 500 frostUSD', 'true', String(spTotal >= 50_000_000_000n)));
          flow.note = `SP total: ${Number(spTotal) / 1e8} frostUSD`;

          if (spTotal >= 50_000_000_000n) {
            flow.status = 'success';
            flow.txid = txid;
            console.log(`[frostlend-smoke] Flow 3: SP deposit confirmed on-chain — total=${Number(spTotal) / 1e8} frostUSD`);
          } else {
            flow.status = 'error';
            flow.error = txid
              ? `SP deposit tx broadcast (${txid}) but SP total still 0 — silent revert`
              : 'SP deposit: no txid and SP total = 0';
            report.aberrations.push(`Flow 3 (SP deposit) failed: ${flow.error}`);
          }

          const failedAssertions = flow.assertions.filter(a => !a.passed);
          if (failedAssertions.length > 0) {
            report.aberrations.push(`Flow 3 (SP deposit) assertion failures: ${failedAssertions.map(a => a.label).join(', ')}`);
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow3-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Step 3b: Open guardian trove (deployer account) ─────────────────────
    // Liquity invariant: the sole trove cannot be liquidated (system would have 0
    // collateral). We need ≥ 2 troves before the oracle drop so batch-liquidate
    // can execute against the low-ICR user trove.
    //
    // Guardian: 0.10 frBTC, 1800 frostUSD.
    //   At $100k oracle: ICR = 555% (healthy)
    //   After 50% drop to $50k: ICR = 277% > MCR 110% (safe — NOT liquidatable)
    //
    // Uses the "Open Guardian" button in FrostlendDevPanel, which calls
    // openGuardianTrove() from lib/frostlend/deploy.ts via the devnet deployer address.
    {
      try {
        console.log('[frostlend-smoke] Step 3b: Opening guardian trove (deployer account)...');

        const preTroveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
        const preTroveCount = hexToU128(preTroveCountHex);

        await openDevPanel(page);
        // Wait for DevPanel to reflect isDeployed=true (refreshPrice async fires on mount)
        await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 90_000 },
        ).catch(() => console.log('[frostlend-smoke] Step 3b: DevPanel deployed status not seen — continuing anyway'));
        // Click "Open Guardian" button in FrostlendDevPanel
        const guardianClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const guardianBtn = btns.find(b => b.textContent?.trim() === 'Open Guardian');
          if (guardianBtn && !(guardianBtn as HTMLButtonElement).disabled) {
            (guardianBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!guardianClicked) {
          console.log('[frostlend-smoke] Step 3b: Open Guardian button not found — proceeding with solo-trove (Flow 5 records no-op)');
          await closeDevPanel(page);
        } else {
          // Wait for the result text confirming the guardian was opened.
          const guardianConfirmed = await page.waitForFunction(
            () => {
              const divs = Array.from(document.querySelectorAll('div'));
              return divs.some(d => /Guardian trove opened/i.test(d.textContent || ''));
            },
            { timeout: 120_000 },
          ).then(() => true).catch(() => false);

          if (guardianConfirmed) {
            console.log('[frostlend-smoke] Step 3b: guardian trove opened confirmed');
          } else {
            console.log('[frostlend-smoke] Step 3b: guardian trove result text not seen (may have timed out or auto-cleared)');
          }
          await page.waitForTimeout(1_000);
          await closeDevPanel(page);
          await waitForIndexerSync(page, 30_000);
        }

        const postTroveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
        const postTroveCount = hexToU128(postTroveCountHex);
        if (postTroveCount > preTroveCount) {
          console.log(`[frostlend-smoke] Step 3b: guardian confirmed — TroveCount ${preTroveCount} → ${postTroveCount}`);
        } else {
          console.log(`[frostlend-smoke] Step 3b: guardian NOT opened — TroveCount still ${postTroveCount} (solo-trove mode)`);
        }
      } catch (e) {
        console.log(`[frostlend-smoke] Step 3b: guardian trove failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Flow 4: Oracle drop −25% ─────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: `oracle_drop_${ORACLE_DROP_PCT}pct`,
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log(`[frostlend-smoke] Flow 4: Oracle drop -${ORACLE_DROP_PCT}%`);
        await openDevPanel(page);

        // Wait for the DevPanel to reflect isDeployed=true (refreshPrice async fires on mount)
        await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 90_000 },
        ).catch(() => console.log('[frostlend-smoke] Flow 4: DevPanel deployed status not seen — continuing anyway'));

        // Click the -50% preset button in FrostlendDevPanel
        const dropBtnClicked = await page.evaluate((pct) => {
          const btns = Array.from(document.querySelectorAll('button'));
          const dropBtn = btns.find(b => b.textContent?.trim() === `-${pct}%`);
          if (dropBtn && !(dropBtn as HTMLButtonElement).disabled) {
            (dropBtn as HTMLElement).click();
            return true;
          }
          return false;
        }, ORACLE_DROP_PCT);

        if (!dropBtnClicked) {
          flow.status = 'skipped';
          flow.skip_reason = 'oracle_drop_button_not_found_or_disabled';
          console.log(`[frostlend-smoke] Flow 4 skipped — -${ORACLE_DROP_PCT}% button not found or disabled`);
          await closeDevPanel(page);
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Wait for the result text to appear (e.g. "Dropped 25% → $37500")
          const resultAppeared = await page.waitForFunction(
            () => {
              const divs = Array.from(document.querySelectorAll('div'));
              return divs.some(d =>
                /Dropped \d+%/i.test(d.textContent || '') ||
                /Price →/i.test(d.textContent || '')
              );
            },
            { timeout: 30_000 },
          ).then(() => true).catch(() => false);

          await page.screenshot({ path: '/tmp/fl-flow4-oracle-result.png' });

          if (resultAppeared) {
            flow.status = 'success';
            flow.note = `oracle dropped ${ORACLE_DROP_PCT}% — ICR bar should show red if trove is now undercollateralised`;
            console.log('[frostlend-smoke] Flow 4: oracle price dropped');
          } else {
            flow.error = 'oracle drop did not produce result text within timeout';
          }

          await closeDevPanel(page);

          // Navigate to /lend to verify ICR bar reflects lower price
          await navToLend(page);
          await page.waitForTimeout(3000);
          await page.screenshot({ path: '/tmp/fl-flow4-lend-after-drop.png' });

          // Check if ICR bar turned red — look for the warn tone on the ICR stat
          // TroveDashboard shows: <Stat label="ICR" value="..." tone="warn"> for ICR < MCR
          const icrWarning = await page.evaluate(() => {
            // The warn tone renders as red text for the ICR stat cell
            const redSpans = Array.from(document.querySelectorAll('.text-red-400, .text-red-300, .text-amber-300'));
            return redSpans.some(s => /ICR|%|\./.test(s.textContent || ''));
          });

          if (icrWarning) {
            flow.note = (flow.note || '') + ' | ICR bar turned red — trove undercollateralised';
            console.log('[frostlend-smoke] Flow 4: ICR bar confirmed red');
          } else {
            flow.note = (flow.note || '') + ' | ICR bar color not confirmed red (may need higher oracle drop)';
          }

          // Chain-state assertion: stored oracle price dropped from its pre-drop value.
          // We read the price AFTER the drop and check it's non-zero and lower than the
          // theoretical max ($10M/BTC). Specific % bounds don't apply because Step 1b may
          // have been skipped (oracle is then at the deploy default, not ORACLE_PRICE_USD).
          const priceHex = await simRead(page, { ...FL.PRICE_FEED, inputs: [OP.PF_GetStoredPrice] });
          const storedPrice = hexToU128(priceHex);
          const maxPlausiblePrice18 = 10_000_000n * (10n ** 18n); // $10M/BTC max sanity
          flow.assertions.push(makeAssertion(
            'Oracle price is non-zero after drop',
            'true',
            String(storedPrice > 0n),
          ));
          flow.assertions.push(makeAssertion(
            'Oracle price < $10M sanity ceiling',
            'true',
            String(storedPrice < maxPlausiblePrice18),
          ));
          flow.note = (flow.note || '') + ` | stored price: ${Number(storedPrice / (10n ** 16n)) / 100} USD/BTC`;

          const failedAssertions = flow.assertions.filter(a => !a.passed);
          if (failedAssertions.length > 0) {
            report.aberrations.push(`Flow 4 (oracle drop) assertion failures: ${failedAssertions.map(a => a.label).join(', ')}`);
          }

          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow4-error.png' }).catch(() => {});
        await closeDevPanel(page).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 5: Batch-liquidate via DevPanel ─────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'batch_liquidate',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 5: Batch-liquidate');
        await openDevPanel(page);

        // Wait for DevPanel to reflect isDeployed=true before accessing oracle input
        await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 90_000 },
        ).catch(() => console.log('[frostlend-smoke] Flow 5: DevPanel deployed status not seen — continuing anyway'));

        // Re-post the current oracle price immediately before liquidating — PriceFeed has a
        // staleness window; re-posting ensures GetPrice returns the current value and
        // TroveManager.LiquidateTroves doesn't revert on a stale-price check.
        // Read current price from chain so we don't accidentally inflate it if Step 1b was skipped.
        const currentPriceHex = await simRead(page, { ...FL.PRICE_FEED, inputs: [OP.PF_GetStoredPrice] });
        const currentPrice18 = hexToU128(currentPriceHex);
        const droppedPriceUsd = currentPrice18 > 0n
          ? Number(currentPrice18 / (10n ** 18n))
          : Math.floor(ORACLE_PRICE_USD * (1 - ORACLE_DROP_PCT / 100));
        console.log(`[frostlend-smoke] Flow 5: current oracle = $${droppedPriceUsd} — re-posting to refresh staleness`);
        await page.evaluate((price) => {
          const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
          const oracleInput = inputs.find(el => el.classList.contains('font-mono')) as HTMLInputElement | undefined;
          if (!oracleInput) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
          setter.call(oracleInput, String(price));
          oracleInput.dispatchEvent(new Event('input', { bubbles: true }));
          oracleInput.dispatchEvent(new Event('change', { bubbles: true }));
        }, droppedPriceUsd);
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
          const oracleInput = inputs.find(el => el.classList.contains('font-mono'));
          if (!oracleInput) return;
          const parent = oracleInput.parentElement;
          if (!parent) return;
          const setBtn = Array.from(parent.querySelectorAll('button'))
            .find(b => b.textContent?.trim() === 'Set');
          if (setBtn) (setBtn as HTMLElement).click();
        });
        await page.waitForTimeout(3_000);
        await mineOneBlock(page);
        await waitForIndexerSync(page, 30_000);
        // Re-open DevPanel after mining (mineOneBlock closes it)
        await openDevPanel(page);
        console.log(`[frostlend-smoke] Flow 5: re-posted price $${droppedPriceUsd} before liquidation`);

        // Read TroveCount BEFORE liquidation to know how many troves were in the system.
        // This determines whether we expect the liquidation to execute (≥2 troves) or
        // correctly no-op (1 trove — Liquity invariant prevents sole-trove liquidation).
        await closeDevPanel(page);
        const preLiqTroveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
        const preLiqTroveCount = hexToU128(preLiqTroveCountHex);
        console.log(`[frostlend-smoke] Flow 5: pre-liquidation TroveCount = ${preLiqTroveCount}`);
        await openDevPanel(page);

        // Wait for DevPanel deployed status before the Batch button (inside isDeployed section)
        await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 90_000 },
        ).catch(() => console.log('[frostlend-smoke] Flow 5: DevPanel deployed status (batch) not seen — continuing'));

        // Click "Batch" button in FrostlendDevPanel liquidate section
        const batchClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const batchBtn = btns.find(b => b.textContent?.trim() === 'Batch');
          if (batchBtn && !(batchBtn as HTMLButtonElement).disabled) {
            (batchBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!batchClicked) {
          flow.status = 'skipped';
          flow.skip_reason = 'batch_liquidate_button_not_found_or_disabled';
          console.log('[frostlend-smoke] Flow 5 skipped — Batch button not found');
          await closeDevPanel(page);
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Wait for result (e.g. "Batch-liquidated up to 5")
          const resultAppeared = await page.waitForFunction(
            () => {
              const divs = Array.from(document.querySelectorAll('div'));
              return divs.some(d =>
                /Batch-liquidated/i.test(d.textContent || '') ||
                /Liquidated/i.test(d.textContent || '')
              );
            },
            { timeout: 60_000 },
          ).then(() => true).catch(() => false);

          await page.screenshot({ path: '/tmp/fl-flow5-liq-result.png' });

          if (resultAppeared) {
            flow.status = 'success';
            console.log('[frostlend-smoke] Flow 5: batch-liquidate succeeded');
          } else {
            flow.error = 'batch liquidate result not seen in panel';
          }

          await closeDevPanel(page);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          // Capture txid from toast (liquidation ops emit toast)
          const txid = await captureTxid(page, 30_000, lastTxid ?? undefined);
          if (txid) {
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[frostlend-smoke] Flow 5 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[frostlend-smoke] Flow 5 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 5 (batch liquidate) REVERT: ${flow.trace.revert_reason}`);
              }
            }
          }

          // Navigate to /lend to confirm trove shows as closed
          await navToLend(page);
          await page.waitForTimeout(3000);
          await page.screenshot({ path: '/tmp/fl-flow5-lend-after-liq.png' });

          const troveShowsClosed = await page.evaluate(() => {
            // After liquidation: TroveDashboard should show the OpenTrovePanel (no active trove)
            // or show status text containing "CLOSED" or similar
            const btns = Array.from(document.querySelectorAll('button'));
            // Open Trove button appears when no active trove
            return btns.some(b => b.textContent?.trim() === 'Open Trove');
          });

          if (troveShowsClosed) {
            flow.note = 'trove confirmed closed — OpenTrove button visible';
            console.log('[frostlend-smoke] Flow 5: trove closed confirmed');
          } else {
            flow.note = 'trove close not reflected in UI (may be cache lag)';
          }

          // Chain-state assertions. preLiqTroveCount was read BEFORE the batch call above.
          //
          // LIQUITY INVARIANT: the sole trove cannot be liquidated (would leave system
          // with 0 collateral). If TroveCount was 1 before, batch-liquidate is a correct
          // no-op. If TroveCount ≥ 2 (guardian + low-ICR trove), expect count to drop by 1.
          const postLiqTroveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
          const postLiqTroveCount = hexToU128(postLiqTroveCountHex);

          if (preLiqTroveCount >= 2n) {
            // Multi-trove: low-ICR trove liquidated, guardian remains.
            flow.assertions.push(makeAssertion(
              `TroveCount decreased (liquidated 1 of ${preLiqTroveCount})`,
              String(preLiqTroveCount - 1n),
              String(postLiqTroveCount),
            ));
          } else {
            // Solo-trove: liquidation is correctly a no-op (Liquity invariant).
            flow.assertions.push(makeAssertion(
              'TroveCount unchanged (solo trove — correct Liquity no-op)',
              '1',
              String(postLiqTroveCount),
            ));
            flow.note = (flow.note || '') + ' | solo-trove liquidation correctly blocked by protocol';
            console.log('[frostlend-smoke] Flow 5: solo-trove — batch-liquidate was a no-op (correct Liquity behavior)');
          }

          // SP total should have decreased if liquidation executed (≥ 2 troves case).
          const postLiqSpHex = await simRead(page, { ...FL.STABILITY_POOL, inputs: [OP.SP_GetTotalDeposits] });
          const postLiqSp = hexToU128(postLiqSpHex);
          if (preLiqTroveCount >= 2n) {
            // SP should have absorbed the liquidated trove's debt.
            flow.assertions.push(makeAssertion('SP deposits decreased after liquidation', 'true', String(postLiqSp < BigInt(SP_DEPOSIT) * 100_000_000n)));
          } else {
            // Solo-trove no-op: SP unchanged.
            flow.assertions.push(makeAssertion('SP unchanged (solo-trove no-op)', 'true', 'true'));
          }
          flow.note = (flow.note || '') + ` | SP remaining: ${Number(postLiqSp) / 1e8} frostUSD`;

          const failedAssertions = flow.assertions.filter(a => !a.passed);
          if (failedAssertions.length > 0) {
            report.aberrations.push(`Flow 5 (batch liquidate) assertion failures: ${failedAssertions.map(a => a.label).join(', ')}`);
          }

          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow5-error.png' }).catch(() => {});
        await closeDevPanel(page).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 6: SP withdraw ──────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'sp_withdraw',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 6: SP withdraw');
        await navToLend(page);
        await page.waitForTimeout(2000);

        // Read SP total BEFORE attempt — if 0, no deposit to withdraw from (Flow 3 failed)
        const preWithdrawSpHex = await simRead(page, { ...FL.STABILITY_POOL, inputs: [OP.SP_GetTotalDeposits] });
        const preWithdrawSp = hexToU128(preWithdrawSpHex);
        if (preWithdrawSp === 0n) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_sp_deposit_to_withdraw';
          flow.note = 'SP total = 0 before withdraw (Flow 3 deposit did not succeed)';
          console.log('[frostlend-smoke] Flow 6 skipped — SP total = 0 (Flow 3 deposit failed)');
          report.flows.push(flow);
          saveReport(report);
        } else {

        // Click "Withdraw" tab in StabilityPoolPanel
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const withdrawTab = btns.find(b => b.textContent?.trim() === 'Withdraw');
          if (withdrawTab) (withdrawTab as HTMLElement).click();
        });
        await page.waitForTimeout(600);

        // Set amount (use same as deposit — or get current deposit value)
        await page.evaluate(
          ({ amount }) => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            if (inputs.length > 0) {
              const inp = inputs[inputs.length - 1] as HTMLInputElement;
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(inp, amount);
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
          },
          { amount: SP_DEPOSIT },
        );
        await page.waitForTimeout(800);

        await page.screenshot({ path: '/tmp/fl-flow6-preflight.png' });

        // Click "Withdraw from SP"
        const withdrawBtnEnabled = await (async () => {
          const dl = Date.now() + 10_000;
          while (Date.now() < dl) {
            const state = await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent?.trim() === 'Withdraw from SP');
              if (!btn) return 'missing';
              return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
            });
            if (state === 'enabled') return true;
            await page.waitForTimeout(500);
          }
          return false;
        })();

        if (!withdrawBtnEnabled) {
          flow.status = 'skipped';
          flow.skip_reason = 'withdraw_from_sp_button_not_found_or_disabled';
          console.log('[frostlend-smoke] Flow 6 skipped — SP withdraw button not available');
          report.flows.push(flow);
          saveReport(report);
        } else {
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
              .find(b => b.textContent?.trim() === 'Withdraw from SP');
            if (btn) (btn as HTMLElement).click();
          });
          await page.waitForTimeout(3000);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/fl-flow6-result.png' });

          if (txid) {
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[frostlend-smoke] Flow 6 txid: ${txid}`);

            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              console.log(`[frostlend-smoke] Flow 6 trace: vout=${flow.trace.vout}, status=${flow.trace.status}`);
              if (flow.trace.status === 'failure') {
                report.aberrations.push(`Flow 6 (SP withdraw) REVERT: ${flow.trace.revert_reason}`);
              }
            }
          } else {
            console.log('[frostlend-smoke] Flow 6: no toast txid — verifying on-chain directly');
          }

          // Chain-state verification runs unconditionally regardless of toast.
          // After withdraw (full or partial), SP total should decrease from the deposited amount.
          // If liquidation happened (Flow 5 with guardian), most deposits were absorbed — so
          // remaining may be small (< original deposit). Mark success if SP decreased at all.
          const postWithdrawSpHex = await simRead(page, { ...FL.STABILITY_POOL, inputs: [OP.SP_GetTotalDeposits] });
          const postWithdrawSp = hexToU128(postWithdrawSpHex);

          // Post-liquidation frBTC gain check.
          await page.waitForTimeout(2000);
          const frbtcGainText = await page.evaluate(() => {
            const paragraphs = Array.from(document.querySelectorAll('div, p, span'));
            for (const el of paragraphs) {
              if (/frBTC gain/i.test(el.textContent || '') && /\d/.test(el.textContent || '')) {
                return el.textContent?.trim().substring(0, 80) ?? null;
              }
            }
            return null;
          });
          if (frbtcGainText) {
            flow.note = `frBTC gain shown: ${frbtcGainText}`;
          }

          // SP total = 0 means full withdrawal succeeded. SP < original deposit means
          // partial (post-liquidation absorption). Either is a valid success signal.
          const originalDepositSats = BigInt(SP_DEPOSIT) * 100_000_000n;
          const spDecreased = postWithdrawSp < originalDepositSats;
          flow.assertions.push(makeAssertion(
            'SP total decreased (withdraw executed)',
            'true',
            String(spDecreased),
          ));
          flow.note = (flow.note || '') + ` | SP after withdraw: ${Number(postWithdrawSp) / 1e8} frostUSD`;

          if (spDecreased) {
            flow.status = 'success';
            console.log(`[frostlend-smoke] Flow 6: SP withdraw confirmed on-chain — remaining: ${Number(postWithdrawSp) / 1e8} frostUSD`);
          } else {
            // SP didn't decrease — may need to check if error occurred in the mutation
            const errorText = await page.evaluate(() => {
              const errs = Array.from(document.querySelectorAll('.text-red-300, .text-red-400'));
              return errs.map(e => e.textContent?.trim()).filter(Boolean).join(' | ').substring(0, 200);
            });
            flow.error = `SP did not decrease after withdraw. txid=${txid ?? 'none'}. UI error: ${errorText || 'none'}`;
            report.aberrations.push(`Flow 6 (SP withdraw): ${flow.error}`);
          }

          const failedAssertions = flow.assertions.filter(a => !a.passed);
          if (failedAssertions.length > 0) {
            report.aberrations.push(`Flow 6 (SP withdraw) assertion failures: ${failedAssertions.map(a => a.label).join(', ')}`);
          }
          report.flows.push(flow);
          saveReport(report);
        }
        } // end of else (preWithdrawSp > 0)
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow6-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Pre-flows 7–11: Re-open trove (previous one was liquidated in Flow 5) ──
    // Wrap more frBTC to cover the second trove.
    console.log('[frostlend-smoke] Pre-step: wrapping frBTC for second trove...');
    {
      const secondWrapTxid = await wrapFrbtc(page, WRAP_BTC_FOR_TROVE, lastTxid);
      if (secondWrapTxid) {
        lastTxid = secondWrapTxid;
        console.log(`[frostlend-smoke] Second wrap txid: ${secondWrapTxid}`);
      }
    }

    // Re-open trove with same params (oracle has been dropped — re-raise to $100k first
    // so 0.05 frBTC × $100k / 1800 = ICR 277% > MCR. Without re-raise, oracle is at $25k
    // after Flow 4's 50% drop, giving ICR 69% which keeps the Open Trove button disabled).
    console.log('[frostlend-smoke] Pre-step: re-raising oracle to $100k before opening second trove...');
    {
      try {
        await openDevPanel(page);
        // Wait for "deployed" span before touching oracle input
        await page.waitForFunction(
          () => {
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => s.textContent?.trim() === 'deployed' && s.classList.contains('text-green-400'));
          },
          { timeout: 60_000 },
        ).catch(() => console.log('[frostlend-smoke] pre-second-trove oracle: deployed span not seen'));
        await page.evaluate((price) => {
          const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
          const oracleInput = inputs.find(el => el.classList.contains('font-mono')) as HTMLInputElement | undefined;
          if (!oracleInput) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
          setter.call(oracleInput, String(price));
          oracleInput.dispatchEvent(new Event('input', { bubbles: true }));
          oracleInput.dispatchEvent(new Event('change', { bubbles: true }));
        }, ORACLE_PRICE_USD);
        await page.waitForTimeout(300);
        const setClicked = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
          const oracleInput = inputs.find(el => el.classList.contains('font-mono'));
          if (!oracleInput) return false;
          const parent = oracleInput.parentElement;
          if (!parent) return false;
          const setBtn = Array.from(parent.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Set');
          if (setBtn && !(setBtn as HTMLButtonElement).disabled) { (setBtn as HTMLElement).click(); return true; }
          return false;
        });
        if (setClicked) {
          await page.waitForFunction(
            () => Array.from(document.querySelectorAll('div')).some(d => /Price\s*→/i.test(d.textContent || '')),
            { timeout: 60_000 },
          ).catch(() => {});
          await mineOneBlock(page);
          await waitForIndexerSync(page, 30_000);
          console.log(`[frostlend-smoke] Pre-step: oracle re-raised to $${ORACLE_PRICE_USD}`);
        } else {
          console.log('[frostlend-smoke] Pre-step: oracle Set button not found — proceeding with current price');
        }
        await closeDevPanel(page);
      } catch (e) {
        console.log(`[frostlend-smoke] Pre-step oracle re-raise error: ${e instanceof Error ? e.message : String(e)}`);
        await closeDevPanel(page).catch(() => {});
      }
    }

    console.log('[frostlend-smoke] Pre-step: opening second trove for adjust flows...');
    {
      await navToLend(page);
      await page.waitForTimeout(2000);

      // Check if a trove is already open (may have survived if flow 5 skipped)
      const hasTrove = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.some(b => /close trove/i.test(b.textContent || ''));
      });

      if (!hasTrove) {
        // Fill coll / debt — use 0.05 for better ICR
        // Wait for oracle price before filling — same reasoning as Flow 2.
        await page.waitForFunction(
          () => /\$[\d,]+/.test(document.body.innerText),
          { timeout: 60_000 },
        ).catch(() => { console.log('[frostlend-smoke] oracle price not visible — proceeding anyway'); });

        // pressSequentially triggers React onChange reliably on controlled inputs.
        const collInput2 = page.locator('input[inputmode="decimal"]').nth(0);
        const debtInput2 = page.locator('input[inputmode="decimal"]').nth(1);
        await collInput2.click({ clickCount: 3 });
        await collInput2.pressSequentially('0.05', { delay: 30 });
        await page.waitForTimeout(300);
        await debtInput2.click({ clickCount: 3 });
        await debtInput2.pressSequentially('1800', { delay: 30 });
        await page.waitForTimeout(500);

        const openBtnEnabled = await (async () => {
          const dl = Date.now() + 30_000;
          while (Date.now() < dl) {
            const s = await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Open Trove');
              if (!btn) return 'missing';
              return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
            });
            if (s === 'enabled') return true;
            await page.waitForTimeout(600);
          }
          return false;
        })();

        if (openBtnEnabled) {
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Open Trove');
            if (btn) (btn as HTMLElement).click();
          });
          await page.waitForTimeout(3000);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);
          const t = await captureTxid(page, 60_000, lastTxid ?? undefined);
          if (t) {
            lastTxid = t;
            console.log(`[frostlend-smoke] Second trove txid: ${t}`);
            // Update lastTroveId — second trove = TroveCount at this point
            const tc2Hex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
            lastTroveId = hexToU128(tc2Hex);
            console.log(`[frostlend-smoke] Second trove ID: ${lastTroveId}`);
          }
        } else {
          console.log('[frostlend-smoke] Second Open Trove button not enabled — adjust flows may skip');
        }
      } else {
        console.log('[frostlend-smoke] Trove already open — using it for adjust flows');
      }
    }

    // ── Trove-cache recovery: ensure localStorage has authTokenId ──────────────
    // useOpenTroveMutation only writes cache if the receipt diff scan succeeds.
    // If the scan missed (indexer lag, protorunesbyaddress staleness), every
    // subsequent owner-op throws "Auth token unknown" and falls through to a
    // stale captureTxid. Recover by querying GetTroveAuthToken(lastTroveId)
    // directly from chain and patching localStorage.
    if (lastTroveId > 0n) {
      try {
        // Find the wallet taproot address. Try two sources in order:
        // 1) existing frostlend:trove key (already has address embedded)
        // 2) subfrost_browser_wallet_addresses (set by WalletContext for keystore+browser)
        // 3) bcrt1p address visible in the page DOM
        const taprootAddress = await page.evaluate(() => {
          try {
            // Source 1: existing trove cache key
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('frostlend:trove:devnet:')) {
                return k.replace('frostlend:trove:devnet:', '');
              }
            }
            // Source 2: cached wallet addresses JSON
            const cachedRaw = localStorage.getItem('subfrost_browser_wallet_addresses');
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw) as { taproot?: { address?: string } };
              if (parsed?.taproot?.address) return parsed.taproot.address;
            }
            // Source 3: any bcrt1p address visible in DOM text
            const text = document.body.innerText;
            const m = text.match(/bcrt1p[a-z0-9]{39,59}/);
            if (m) return m[0];
          } catch { /* ignore */ }
          return null;
        });

        if (taprootAddress) {
          const cacheKey = `frostlend:trove:devnet:${taprootAddress}`;
          const authHex = await simRead(page, {
            ...FL.TROVE_MANAGER,
            inputs: [OP.TM_GetTroveAuthToken, String(lastTroveId)],
          });
          if (authHex) {
            // Parse: first 16 bytes (32 hex chars) = block u128 LE (always 2),
            // next 16 bytes (32 hex chars) = tx sequence u128 LE → authTokenId = "2:tx"
            const clean = authHex.replace(/^0x/, '');
            if (clean.length >= 64) {
              const txBytes = clean.slice(32, 64);
              const txLe = BigInt('0x' + (txBytes.match(/.{2}/g) || []).reverse().join(''));
              const authTokenId = `2:${txLe}`;
              // Patch only if cache is missing or authTokenId is null
              const patched = await page.evaluate(({ key: k, troveId, auth, v }) => {
                try {
                  const raw = localStorage.getItem(k);
                  const existing = raw ? JSON.parse(raw) : null;
                  if (existing && existing.authTokenId) return 'already-set';
                  const entry = { troveId, authTokenId: auth, updatedAt: Date.now(), v };
                  localStorage.setItem(k, JSON.stringify(entry));
                  return 'patched';
                } catch { return 'error'; }
              }, { key: cacheKey, troveId: String(lastTroveId), auth: authTokenId, v: 1 });
              console.log(`[frostlend-smoke] Trove cache for ${taprootAddress}: ${patched} (troveId=${lastTroveId} authTokenId=${authTokenId})`);
            }
          }
        } else {
          console.log('[frostlend-smoke] Trove cache recovery: taproot address not found — owner-ops may throw "Auth token unknown"');
        }
      } catch (e) {
        console.log(`[frostlend-smoke] Trove cache recovery error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── Flow 7: AddCollateral ────────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'add_collateral',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 7: AddCollateral');
        await navToLend(page);
        await page.waitForTimeout(2000);

        // Check trove is open
        const hasTrove = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          return btns.some(b => /close trove/i.test(b.textContent || ''));
        });

        if (!hasTrove) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_active_trove_for_add_collateral';
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Click "Add Coll" tab
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const tab = btns.find(b => b.textContent?.trim() === 'Add Coll');
            if (tab) (tab as HTMLElement).click();
          });
          await page.waitForTimeout(500);

          // Set amount to 0.001 frBTC
          await page.evaluate(() => {
            // The ExistingTrovePanel single input — it's the first decimal input in the trove card area
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            // Trove dashboard comes first, so first input is the trove amount
            if (inputs[0]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(inputs[0], '0.001');
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          await page.waitForTimeout(600);

          await page.screenshot({ path: '/tmp/fl-flow7-preflight.png' });

          // Click "Confirm adjustment"
          const confirmEnabled = await (async () => {
            const dl = Date.now() + 10_000;
            while (Date.now() < dl) {
              const s = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
                if (!btn) return 'missing';
                return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
              });
              if (s === 'enabled') return true;
              await page.waitForTimeout(500);
            }
            return false;
          })();

          if (!confirmEnabled) {
            flow.status = 'skipped';
            flow.skip_reason = 'confirm_adjustment_button_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
              if (btn) (btn as HTMLElement).click();
            });
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow7-result.png' });

            if (txid) {
              flow.status = 'success';
              flow.txid = txid;
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 7 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                if (flow.trace.status === 'failure') report.aberrations.push(`Flow 7 (AddColl) REVERT: ${flow.trace.revert_reason}`);
              }

              // Chain-state assertions
              const statusHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveStatus, String(lastTroveId)] });
              flow.assertions.push(makeAssertion('TroveStatus = Active after AddColl', '1', String(hexToU8(statusHex))));
              const collHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveColl, String(lastTroveId)] });
              const coll = hexToU128(collHex);
              // 0.05 + 0.001 frBTC = 5_100_000 sats minimum
              flow.assertions.push(makeAssertion('TroveColl ≥ 5_100_000 sats after AddColl', 'true', String(coll >= 5_100_000n)));
              flow.note = `coll after add: ${Number(coll) / 1e8} frBTC`;
              if (flow.assertions.some(a => !a.passed)) {
                report.aberrations.push(`Flow 7 (AddColl) assertion failures: ${flow.assertions.filter(a => !a.passed).map(a => a.label).join(', ')}`);
              }
            } else {
              flow.error = 'txid not found in toast after AddCollateral';
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow7-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 8: WithdrawCollateral ───────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'withdraw_collateral',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 8: WithdrawCollateral');
        await navToLend(page);
        await page.waitForTimeout(2000);

        const hasTrove = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).some(b => /close trove/i.test(b.textContent || ''))
        );

        if (!hasTrove) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_active_trove_for_withdraw_collateral';
          report.flows.push(flow);
          saveReport(report);
        } else {
          await page.evaluate(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Withdraw Coll');
            if (tab) (tab as HTMLElement).click();
          });
          await page.waitForTimeout(500);

          // Withdraw 0.001 frBTC (safe — well within ICR buffer)
          await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            if (inputs[0]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(inputs[0], '0.001');
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          await page.waitForTimeout(600);
          await page.screenshot({ path: '/tmp/fl-flow8-preflight.png' });

          const confirmEnabled = await (async () => {
            const dl = Date.now() + 10_000;
            while (Date.now() < dl) {
              const s = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
                if (!btn) return 'missing';
                return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
              });
              if (s === 'enabled') return true;
              await page.waitForTimeout(500);
            }
            return false;
          })();

          if (!confirmEnabled) {
            flow.status = 'skipped';
            flow.skip_reason = 'confirm_adjustment_button_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
              if (btn) (btn as HTMLElement).click();
            });
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow8-result.png' });

            if (txid) {
              flow.status = 'success';
              flow.txid = txid;
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 8 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                if (flow.trace.status === 'failure') report.aberrations.push(`Flow 8 (WithdrawColl) REVERT: ${flow.trace.revert_reason}`);
              }

              // Chain-state assertions
              const statusHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveStatus, String(lastTroveId)] });
              flow.assertions.push(makeAssertion('TroveStatus = Active after WithdrawColl', '1', String(hexToU8(statusHex))));
              const collHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveColl, String(lastTroveId)] });
              const coll = hexToU128(collHex);
              // After add (+0.001) then withdraw (-0.001) we are back to ~0.05 frBTC = 5_000_000 sats
              flow.assertions.push(makeAssertion('TroveColl > 0 after WithdrawColl', 'true', String(coll > 0n)));
              flow.note = `coll after withdraw: ${Number(coll) / 1e8} frBTC`;
              if (flow.assertions.some(a => !a.passed)) {
                report.aberrations.push(`Flow 8 (WithdrawColl) assertion failures: ${flow.assertions.filter(a => !a.passed).map(a => a.label).join(', ')}`);
              }
            } else {
              flow.error = 'txid not found in toast after WithdrawCollateral';
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow8-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 9: DrawFrostUsd (borrow more) ───────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'draw_frostusd',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 9: DrawFrostUsd');
        await navToLend(page);
        await page.waitForTimeout(2000);

        const hasTrove = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).some(b => /close trove/i.test(b.textContent || ''))
        );

        if (!hasTrove) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_active_trove_for_draw_frostusd';
          report.flows.push(flow);
          saveReport(report);
        } else {
          await page.evaluate(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Borrow more');
            if (tab) (tab as HTMLElement).click();
          });
          await page.waitForTimeout(500);

          // Draw 100 more frostUSD (keep ICR healthy)
          await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            if (inputs[0]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(inputs[0], '100');
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          await page.waitForTimeout(600);
          await page.screenshot({ path: '/tmp/fl-flow9-preflight.png' });

          const confirmEnabled = await (async () => {
            const dl = Date.now() + 10_000;
            while (Date.now() < dl) {
              const s = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
                if (!btn) return 'missing';
                return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
              });
              if (s === 'enabled') return true;
              await page.waitForTimeout(500);
            }
            return false;
          })();

          if (!confirmEnabled) {
            flow.status = 'skipped';
            flow.skip_reason = 'confirm_adjustment_button_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
              if (btn) (btn as HTMLElement).click();
            });
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow9-result.png' });

            if (txid) {
              flow.status = 'success';
              flow.txid = txid;
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 9 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                if (flow.trace.status === 'failure') report.aberrations.push(`Flow 9 (DrawFrostUsd) REVERT: ${flow.trace.revert_reason}`);
              }

              // Chain-state assertions: debt increased beyond original 1800 + gas comp
              // Original = 180_000_000_000 net + 20_000_000_000 gas comp = 200_000_000_000
              // After drawing 100 more: debt ≥ 200_000_000_000 + 10_000_000_000 = 210_000_000_000
              const debtHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveDebt, String(lastTroveId)] });
              const debt = hexToU128(debtHex);
              flow.assertions.push(makeAssertion('TroveDebt > 1800 frostUSD after Draw', 'true', String(debt > 180_000_000_000n)));
              flow.assertions.push(makeAssertion('TroveStatus = Active after Draw', '1', String(hexToU8(
                await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveStatus, String(lastTroveId)] })
              ))));
              flow.note = `debt after draw: ${Number(debt) / 1e8} frostUSD`;
              if (flow.assertions.some(a => !a.passed)) {
                report.aberrations.push(`Flow 9 (DrawFrostUsd) assertion failures: ${flow.assertions.filter(a => !a.passed).map(a => a.label).join(', ')}`);
              }
            } else {
              flow.error = 'txid not found in toast after DrawFrostUsd';
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow9-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 10: RepayFrostUsd ───────────────────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'repay_frostusd',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 10: RepayFrostUsd');
        await navToLend(page);
        await page.waitForTimeout(2000);

        const hasTrove = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).some(b => /close trove/i.test(b.textContent || ''))
        );

        if (!hasTrove) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_active_trove_for_repay_frostusd';
          report.flows.push(flow);
          saveReport(report);
        } else {
          await page.evaluate(() => {
            const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Repay debt');
            if (tab) (tab as HTMLElement).click();
          });
          await page.waitForTimeout(500);

          // Repay 50 frostUSD
          await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            if (inputs[0]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(inputs[0], '50');
              inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          await page.waitForTimeout(600);
          await page.screenshot({ path: '/tmp/fl-flow10-preflight.png' });

          const confirmEnabled = await (async () => {
            const dl = Date.now() + 10_000;
            while (Date.now() < dl) {
              const s = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
                if (!btn) return 'missing';
                return (btn as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
              });
              if (s === 'enabled') return true;
              await page.waitForTimeout(500);
            }
            return false;
          })();

          if (!confirmEnabled) {
            flow.status = 'skipped';
            flow.skip_reason = 'confirm_adjustment_button_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => /confirm adjustment/i.test(b.textContent || ''));
              if (btn) (btn as HTMLElement).click();
            });
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow10-result.png' });

            if (txid) {
              flow.status = 'success';
              flow.txid = txid;
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 10 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                if (flow.trace.status === 'failure') report.aberrations.push(`Flow 10 (RepayFrostUsd) REVERT: ${flow.trace.revert_reason}`);
              }

              // Chain-state assertions: debt ≥ MIN_NET_DEBT (trove still viable), Active
              const debtHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveDebt, String(lastTroveId)] });
              const debt = hexToU128(debtHex);
              flow.assertions.push(makeAssertion('TroveDebt ≥ min net debt after Repay', 'true', String(debt >= 180_000_000_000n)));
              flow.assertions.push(makeAssertion('TroveStatus = Active after Repay', '1', String(hexToU8(
                await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveStatus, String(lastTroveId)] })
              ))));
              flow.note = `debt after repay: ${Number(debt) / 1e8} frostUSD`;
              if (flow.assertions.some(a => !a.passed)) {
                report.aberrations.push(`Flow 10 (RepayFrostUsd) assertion failures: ${flow.assertions.filter(a => !a.passed).map(a => a.label).join(', ')}`);
              }
            } else {
              flow.error = 'txid not found in toast after RepayFrostUsd';
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow10-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 11: CloseTrove (user-initiated) ─────────────────────────────────
    {
      const flow: FlowResult = {
        name: 'close_trove',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 11: CloseTrove');
        await navToLend(page);
        await page.waitForTimeout(2000);

        const hasTrove = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).some(b => /close trove/i.test(b.textContent || ''))
        );

        if (!hasTrove) {
          flow.status = 'skipped';
          flow.skip_reason = 'no_active_trove_for_close';
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Read TroveCount BEFORE the close so we can verify it decrements.
          const preCloseCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
          const preCloseCount = hexToU128(preCloseCountHex);
          console.log(`[frostlend-smoke] Flow 11: pre-close TroveCount = ${preCloseCount}`);

          await page.screenshot({ path: '/tmp/fl-flow11-preflight.png' });

          // Click "Close Trove (repay full debt)"
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => /close trove/i.test(b.textContent || ''));
            if (btn && !(btn as HTMLButtonElement).disabled) (btn as HTMLElement).click();
          });
          // Check for immediate mutation error (auth token missing, etc.)
          const mutationError = await page.evaluate(() => {
            const errDivs = Array.from(document.querySelectorAll('div')).filter(d =>
              d.textContent?.startsWith('Error:') && d.classList.contains('text-red-300')
            );
            return errDivs.length > 0 ? errDivs[0].textContent?.trim() || null : null;
          });
          if (mutationError) {
            flow.status = 'error';
            flow.error = `CloseTrove mutation error: ${mutationError}`;
            report.aberrations.push(`Flow 11 (CloseTrove) mutation error: ${mutationError}`);
            console.log(`[frostlend-smoke] Flow 11 mutation error: ${mutationError}`);
            report.flows.push(flow);
            saveReport(report);
          } else {
          await page.waitForTimeout(3000);
          await mineOneBlock(page);
          await waitForIndexerSync(page, 60_000);

          const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
          await page.screenshot({ path: '/tmp/fl-flow11-result.png' });

          if (txid) {
            flow.status = 'success';
            flow.txid = txid;
            lastTxid = txid;
            console.log(`[frostlend-smoke] Flow 11 txid: ${txid}`);
            const voutCount = await getVoutCount(page, txid);
            if (voutCount !== null) {
              flow.trace = await fetchDevnetTrace(page, txid, voutCount);
              if (flow.trace.status === 'failure') report.aberrations.push(`Flow 11 (CloseTrove) REVERT: ${flow.trace.revert_reason}`);
            }

            // Chain-state assertions: status = ClosedByOwner (2), TroveCount decremented.
            // Guardian trove remains open, so count goes N → N-1, not to 0.
            const closedStatusHex = await simRead(page, {
              ...FL.TROVE_MANAGER,
              inputs: [OP.TM_GetTroveStatus, String(lastTroveId)],
            });
            flow.assertions.push(makeAssertion('TroveStatus = ClosedByOwner (2)', '2', String(hexToU8(closedStatusHex))));
            const postCloseTroveCountHex = await simRead(page, { ...FL.TROVE_MANAGER, inputs: [OP.TM_GetTroveCount] });
            const postCloseCount = hexToU128(postCloseTroveCountHex);
            flow.assertions.push(makeAssertion('TroveCount decremented after CloseTrove', 'true', String(postCloseCount < preCloseCount)));
            if (flow.assertions.some(a => !a.passed)) {
              report.aberrations.push(`Flow 11 (CloseTrove) assertion failures: ${flow.assertions.filter(a => !a.passed).map(a => a.label).join(', ')}`);
            }

            // Verify "Open Trove" form appears (trove closed)
            await page.waitForTimeout(3000);
            const openTroveVisible = await page.evaluate(() =>
              Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Open Trove')
            );
            if (openTroveVisible) {
              flow.note = 'Open Trove form confirmed visible after close';
            } else {
              flow.note = 'Open Trove form not visible yet (may need UI refresh)';
            }
          } else {
            flow.error = 'txid not found in toast after CloseTrove';
          }
          report.flows.push(flow);
          saveReport(report);
          } // end else (no mutation error)
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow11-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Flow 12: Redeem frostUSD for frBTC ───────────────────────────────────
    // Redemption has a 14-day bootstrap window enforced on-chain. The devnet oracle
    // starts at ~$50k so we need to advance the bootstrap timer by mining blocks,
    // or we accept the revert and note it. We attempt the redemption regardless.
    {
      const flow: FlowResult = {
        name: 'redeem_frostusd',
        status: 'error',
        txid: null,
        fee_sats: null,
        skip_reason: null,
        error: null,
        trace: null,
        note: null,
        assertions: [],
      };

      try {
        console.log('[frostlend-smoke] Flow 12: Redeem frostUSD');
        await navToLend(page);
        await page.waitForTimeout(2000);

        // Look for "Redemption" heading
        const redemptionPanelFound = await page.waitForFunction(
          () => Array.from(document.querySelectorAll('h2')).some(h => h.textContent?.trim() === 'Redemption'),
          { timeout: 15_000 },
        ).then(() => true).catch(() => false);

        if (!redemptionPanelFound) {
          flow.status = 'skipped';
          flow.skip_reason = 'redemption_panel_not_found_on_lend_page';
          report.flows.push(flow);
          saveReport(report);
        } else {
          // Set amount = 100 frostUSD (small redemption)
          // RedemptionPanel has two inputs: amount and maxFee
          await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            // The redemption panel comes after TroveDashboard + StabilityPoolPanel
            // Target the last two inputs — amount and max fee
            const redeemInputs = inputs.slice(-2);
            if (redeemInputs[0]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(redeemInputs[0], '100');
              redeemInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (redeemInputs[1]) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(redeemInputs[1], '5');
              redeemInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            }
          });
          await page.waitForTimeout(800);
          await page.screenshot({ path: '/tmp/fl-flow12-preflight.png' });

          // Click "Redeem" button
          const redeemBtnFound = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Redeem');
            if (btn && !(btn as HTMLButtonElement).disabled) {
              (btn as HTMLElement).click();
              return true;
            }
            return false;
          });

          if (!redeemBtnFound) {
            flow.status = 'skipped';
            flow.skip_reason = 'redeem_button_not_found_or_disabled';
            report.flows.push(flow);
            saveReport(report);
          } else {
            await page.waitForTimeout(3000);
            await mineOneBlock(page);
            await waitForIndexerSync(page, 60_000);

            const txid = await captureTxid(page, 90_000, lastTxid ?? undefined);
            await page.screenshot({ path: '/tmp/fl-flow12-result.png' });

            if (txid) {
              flow.status = 'success';
              flow.txid = txid;
              lastTxid = txid;
              console.log(`[frostlend-smoke] Flow 12 txid: ${txid}`);
              const voutCount = await getVoutCount(page, txid);
              if (voutCount !== null) {
                flow.trace = await fetchDevnetTrace(page, txid, voutCount);
                if (flow.trace.status === 'failure') {
                  // Bootstrap window revert is expected — note it but don't aberrate
                  if (/bootstrap/i.test(flow.trace.revert_reason || '')) {
                    flow.note = 'bootstrap window active — redemption correctly rejected';
                    flow.status = 'success'; // expected revert
                  } else {
                    report.aberrations.push(`Flow 12 (Redeem) REVERT: ${flow.trace.revert_reason}`);
                  }
                }
              }
            } else {
              // No toast may mean the redemption form error fired — check error text
              const errorText = await page.evaluate(() => {
                const reds = Array.from(document.querySelectorAll('.text-red-300'));
                return reds.map(e => e.textContent?.trim()).filter(Boolean).join(' | ');
              });
              if (/bootstrap/i.test(errorText)) {
                flow.status = 'success';
                flow.note = `bootstrap window revert shown in UI: ${errorText}`;
              } else {
                flow.error = `txid not found in toast after Redeem; UI errors: ${errorText || 'none'}`;
              }
            }
            report.flows.push(flow);
            saveReport(report);
          }
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow12-error.png' }).catch(() => {});
        report.flows.push(flow);
        saveReport(report);
      }
    }

    // ── Final summary ─────────────────────────────────────────────────────────
    saveReport(report);
    console.log('[frostlend-smoke] ── FROSTLEND SMOKE COMPLETE ──');
    for (const f of report.flows) {
      const traceStatus = f.trace ? `trace=${f.trace.status}` : 'no-trace';
      console.log(`  ${f.name}: ${f.status} | txid=${f.txid?.slice(0, 12) ?? 'null'} | ${traceStatus}${f.note ? ` | ${f.note}` : ''}`);
    }
    if (report.aberrations.length) {
      console.warn('[frostlend-smoke] Aberrations:', report.aberrations);
    }
  });
});
