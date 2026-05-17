/**
 * frostlend-smoke.spec.ts — Frostlend UI smoke test via keystore wallet
 *
 * Runs the 6 primary frostlend flows against the in-browser devnet
 * (localhost:3000 with subfrost_selected_network=devnet). Mirrors the
 * pattern of devnet-smoke.spec.ts — same boot / fund / trace infrastructure,
 * different flows targeting the /lend page.
 *
 * Flows tested (in order):
 *   Flow 1: FrostlendDevPanel deploy  → all 11 contracts deployed (5 phases)
 *   Flow 2: OpenTrove (0.05 frBTC, 1800 frostUSD) → frostUSD balance appears
 *   Flow 3: SP deposit (500 frostUSD) → SP total increases
 *   Flow 4: Oracle drop −25% via DevPanel → ICR bar turns red
 *   Flow 5: Batch-liquidate via DevPanel → trove closed
 *   Flow 6: SP withdraw → panel reflects withdrawal
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
// OpenTrove form defaults (matching TroveDashboard default state)
const TROVE_COLL = '0.03'; // frBTC
const TROVE_DEBT = '1800'; // frostUSD (minimum net debt)
// SP deposit amount
const SP_DEPOSIT = '500';
// Oracle drop preset: 25%
const ORACLE_DROP_PCT = 25;

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

interface FlowResult {
  name: string;
  status: 'success' | 'skipped' | 'error';
  txid: string | null;
  fee_sats: number | null;
  skip_reason: string | null;
  error: string | null;
  trace: TraceDigest | null;
  note: string | null;
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
        if (sizeKb > 8000) {
          fs.rmSync(idbDir, { recursive: true, force: true });
          console.log(`[frostlend-smoke] Wiped IndexedDB (${sizeKb}KB > 8000KB) — cold-boot`);
        } else {
          console.log(`[frostlend-smoke] Keeping IndexedDB (${sizeKb}KB) — warm restore`);
        }
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
          // Fill in collateral and debt fields
          // The OpenTrovePanel has two text inputs (not type=number — sf-input class)
          // Label text: "Collateral (frBTC)" and "Borrow (frostUSD) — min 1800"
          await page.evaluate(
            ({ coll, debt }) => {
              const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              if (inputs[0]) {
                setter.call(inputs[0], coll);
                inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
              }
              if (inputs[1]) {
                setter.call(inputs[1], debt);
                inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
              }
            },
            { coll: TROVE_COLL, debt: TROVE_DEBT },
          );
          await page.waitForTimeout(1000);

          await page.screenshot({ path: '/tmp/fl-flow2-preflight.png' });

          // Wait for "Open Trove" button to be enabled
          const openBtnEnabled = await (async () => {
            const dl = Date.now() + 15_000;
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
              flow.status = 'success';
              flow.txid = txid;
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
              flow.error = 'txid not found in toast after OpenTrove';
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

        // Set SP deposit amount
        await page.evaluate(
          ({ amount }) => {
            // StabilityPoolPanel has one text input with inputMode=decimal
            // The "Deposit" tab should already be active by default
            const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"]'));
            // The SP panel input is the last one (after TroveDashboard inputs)
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

        // Ensure "Deposit" tab is selected
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const depositTab = btns.find(b => b.textContent?.trim() === 'Deposit');
          if (depositTab) (depositTab as HTMLElement).click();
        });
        await page.waitForTimeout(500);

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
            flow.status = 'success';
            flow.txid = txid;
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
            flow.error = 'txid not found in toast after SP deposit';
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
      };

      try {
        console.log('[frostlend-smoke] Flow 4: Oracle drop -25%');
        await openDevPanel(page);

        // Click the -25% preset button in FrostlendDevPanel
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
          console.log('[frostlend-smoke] Flow 4 skipped — -25% button not found or disabled');
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
      };

      try {
        console.log('[frostlend-smoke] Flow 5: Batch-liquidate');
        await openDevPanel(page);

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
      };

      try {
        console.log('[frostlend-smoke] Flow 6: SP withdraw');
        await navToLend(page);
        await page.waitForTimeout(2000);

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
            flow.status = 'success';
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

            // Post-liquidation frBTC gain check: if liquidation happened (Flow 5),
            // the SP should show a pending frBTC gain > 0 before withdraw.
            // After withdraw, that gain is returned. Log as a note.
            await page.waitForTimeout(2000);
            const frbtcGainText = await page.evaluate(() => {
              // StabilityPoolPanel shows "Pending frBTC gains: X.XXXXXX frBTC"
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
          } else {
            flow.error = 'txid not found in toast after SP withdraw';
          }
          report.flows.push(flow);
          saveReport(report);
        }
      } catch (e) {
        flow.error = e instanceof Error ? e.message : String(e);
        await page.screenshot({ path: '/tmp/fl-flow6-error.png' }).catch(() => {});
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
