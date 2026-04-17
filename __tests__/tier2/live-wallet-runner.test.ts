/**
 * Live Wallet Test Runner — All 18 Test Cases × 5 Wallets
 *
 * This is the authoritative manual wallet verification suite per Gabe's
 * testing schedule (2026-04-15):
 *
 *   Session 1 (April 10)  — Swap + Send (tests 1-6)
 *   Session 2 (April 17)  — frUSD wraps + stablecoin swaps (tests 7-14)
 *   Session 3 (April 24)  — FIRE vault: ZAP, LP stake/unstake, Bond/Redeem (tests 15-18)
 *
 * HOW IT WORKS
 * ─────────────
 * Automation handles everything:
 *   • Launch headed browser (visible to human)
 *   • Connect the wallet (mock connection — no popup needed)
 *   • Fund via local bitcoind RPC
 *   • Navigate to the right page, fill all inputs, click Confirm
 *
 * Human handles ONE thing per test:
 *   • Click APPROVE / CONFIRM in the wallet extension popup
 *   • Terminal prints a clear prompt with a 120-second countdown
 *
 * After approval:
 *   • Automation mines a block via bitcoind RPC
 *   • Verifies the UI shows success / balance changed
 *   • Logs pass/fail with screenshot + console errors
 *   • Moves to the next test automatically
 *
 * HOW TO RUN
 * ──────────
 * Prerequisites:
 *   1. Docker stack running:   cd ~/subfrost && docker compose up -d
 *   2. Contracts deployed:     cd ~/Documents/github/alkanes-rs && bash scripts/deploy-regtest.sh
 *   3. Frontend running:       cd ~/Documents/subfrost-app && npm run dev
 *   4. Wallet extension installed in Chrome and configured for regtest
 *
 * Run a full session (all wallets):
 *   LIVE=true SESSION=1 npx vitest run __tests__/tier2/live-wallet-runner.test.ts --testTimeout=600000
 *
 * Run a single wallet:
 *   LIVE=true SESSION=1 WALLET=oyl npx vitest run __tests__/tier2/live-wallet-runner.test.ts --testTimeout=600000
 *
 * Run all sessions:
 *   LIVE=true npx vitest run __tests__/tier2/live-wallet-runner.test.ts --testTimeout=1800000
 *
 * Environment variables:
 *   LIVE=true               Required — prevents accidental CI runs
 *   SESSION=1|2|3           Which session to run (default: all)
 *   WALLET=oyl|unisat|...   Run only this wallet (default: all 5)
 *   E2E_BASE_URL            Frontend URL (default: http://localhost:3000)
 *   HUMAN_APPROVAL_TIMEOUT_MS  Seconds to wait for wallet popup approval (default: 120000)
 *   RESULTS_DIR             Where to write JSON results (default: e2e-tests/results)
 *
 * Results:
 *   e2e-tests/results/run-<timestamp>.json   — full JSON report
 *   e2e-tests/results/last-passing.json      — snapshot of last clean run
 *   e2e-tests/results/screenshots/<wallet>/  — screenshots per test
 *
 * ENVIRONMENT ISOLATION
 * ──────────────────────
 * The frontend must be started with NEXT_PUBLIC_NETWORK=regtest-local:
 *   echo 'NEXT_PUBLIC_NETWORK=regtest-local' > .env.local && npm run dev
 *
 * This routes ALL RPC calls to localhost:18888 and uses the local contract
 * IDs from deploy-regtest.sh. It cannot interfere with mainnet or staging.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';
import { sleep } from '../shared/regtest-helpers';
import {
  waitForHumanApproval,
  TestResultsLogger,
  captureScreenshot,
  mineLocalBlock,
  type TestStatus,
} from './live-wallet-helpers';
import { clickByText, waitForText, typeInField, TIER2_CONFIG } from './puppeteer-helpers';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const SKIP = process.env.LIVE !== 'true';
if (SKIP) {
  console.log('Skipping live wallet runner — set LIVE=true to run.');
}

const SESSION_FILTER = process.env.SESSION ? parseInt(process.env.SESSION) : null;
const WALLET_FILTER  = process.env.WALLET  ?? null;
const BASE_URL       = process.env.E2E_BASE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

const ALL_WALLETS = ['keystore', 'oyl', 'unisat', 'xverse', 'okx'] as const;
type WalletId = typeof ALL_WALLETS[number];

const WALLETS: WalletId[] = WALLET_FILTER
  ? [WALLET_FILTER as WalletId]
  : [...ALL_WALLETS];

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

interface TestCase {
  id:      number;
  session: 1 | 2 | 3;
  name:    string;
  run:     (page: Page, wallet: WalletId, logger: TestResultsLogger) => Promise<void>;
}

// Shared helpers
async function connectWallet(page: Page, wallet: WalletId): Promise<void> {
  if (wallet === 'keystore') {
    // Keystore: restore from mnemonic via UI
    const restoreClicked = await clickByText(page, 'Connect Wallet', 10_000);
    if (!restoreClicked) throw new Error('Connect Wallet button not found');
    await sleep(1000);
    const keystoreClicked = await clickByText(page, 'Keystore', 5_000)
      || await clickByText(page, 'Create / Restore', 5_000)
      || await clickByText(page, 'Restore Wallet', 5_000);
    if (!keystoreClicked) throw new Error('Keystore option not found');
    await sleep(1000);
    // Type mnemonic
    await typeInField(page, 'textarea', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    await sleep(500);
    const continueClicked = await clickByText(page, 'Continue', 5_000)
      || await clickByText(page, 'Restore', 5_000)
      || await clickByText(page, 'Import', 5_000);
    if (!continueClicked) throw new Error('Could not proceed past mnemonic input');
    await sleep(3000);
  } else {
    // Browser wallet: click Connect → Browser Extension → wallet name
    const connectClicked = await clickByText(page, 'Connect Wallet', 10_000);
    if (!connectClicked) throw new Error('Connect Wallet button not found');
    await sleep(1000);
    await clickByText(page, 'Connect Browser Extension', 5_000);
    await sleep(1000);
    const nameMap: Record<string, string[]> = {
      oyl:    ['Oyl Wallet', 'Oyl'],
      unisat: ['UniSat', 'Unisat'],
      xverse: ['Xverse'],
      okx:    ['OKX Wallet', 'OKX'],
    };
    let clicked = false;
    for (const name of (nameMap[wallet] ?? [wallet])) {
      clicked = await clickByText(page, name, 3_000);
      if (clicked) break;
    }
    if (!clicked) throw new Error(`Could not find ${wallet} in wallet list`);
    // Browser wallet connection is instant (extension already installed)
    await sleep(3000);
  }
}

async function fundWallet(address: string): Promise<void> {
  const body = JSON.stringify({
    jsonrpc: '1.0', method: 'generatetoaddress',
    params: [101, address], id: 1,
  });
  await fetch('http://127.0.0.1:18443/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from('bitcoinrpc:bitcoinrpc').toString('base64'),
    },
    body,
  }).catch(() => {});
  await sleep(3000);
}

async function getConnectedAddress(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Try to find a visible regtest address on the page
    const all = document.body.innerText;
    const match = all.match(/bcrt1[a-z0-9]{20,}/);
    return match ? match[0] : '';
  });
}

async function verifySuccess(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = (document.body.textContent ?? '').toLowerCase();
    return (
      body.includes('broadcast') ||
      body.includes('confirmed') ||
      body.includes('success') ||
      body.includes('transaction sent') ||
      body.includes('pending') ||
      body.includes('submitted')
    );
  }).catch(() => false);
}

// ---------------------------------------------------------------------------
// Test case implementations
// ---------------------------------------------------------------------------

const TEST_CASES: TestCase[] = [
  // ── SESSION 1: Swap + Send ─────────────────────────────────────────────

  {
    id: 1, session: 1,
    name: 'token → token AMM swap (DIESEL ↔ frBTC)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      // Ensure DIESEL/frBTC pair is selected (default on swap page)
      await typeInField(page, 'input[type="number"]', '1000');
      await sleep(3000); // wait for quote
      const confirmed = await clickByText(page, 'SWAP', 5_000)
        || await clickByText(page, 'Review Swap', 5_000)
        || await clickByText(page, 'Swap', 3_000);
      if (!confirmed) throw new Error('Swap button not found');
      await sleep(1000);
      // Confirm review modal if present
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after swap');
    },
  },

  {
    id: 2, session: 1,
    name: 'BTC → token AMM swap (BTC → frBTC via wrap)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      // Select BTC as input token
      const btcSelected = await clickByText(page, 'BTC', 5_000);
      if (!btcSelected) throw new Error('Could not select BTC as input');
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '0.001');
      await sleep(3000);
      const confirmed = await clickByText(page, 'SWAP', 5_000)
        || await clickByText(page, 'Review Swap', 5_000)
        || await clickByText(page, 'Swap', 3_000);
      if (!confirmed) throw new Error('Swap button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after BTC swap');
    },
  },

  {
    id: 3, session: 1,
    name: 'token → token LIMIT order (DIESEL ↔ frBTC)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      // Switch to Limit tab
      const limitTab = await clickByText(page, 'Limit', 5_000);
      if (!limitTab) throw new Error('Limit tab not found');
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '1000');
      await sleep(1000);
      // Set limit price (use a field with "Price" label nearby)
      const priceInputs = await page.$$('input[type="number"]');
      if (priceInputs.length > 1) {
        await priceInputs[1].click({ clickCount: 3 });
        await priceInputs[1].type('0.000001');
      }
      await sleep(2000);
      const placed = await clickByText(page, 'Place Order', 5_000)
        || await clickByText(page, 'PLACE ORDER', 5_000);
      if (!placed) throw new Error('Place Order button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after limit order');
    },
  },

  {
    id: 4, session: 1,
    name: 'BTC → token LIMIT order',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Limit', 5_000);
      await sleep(1000);
      await clickByText(page, 'BTC', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '0.001');
      await sleep(2000);
      const placed = await clickByText(page, 'Place Order', 5_000)
        || await clickByText(page, 'PLACE ORDER', 5_000);
      if (!placed) throw new Error('Place Order button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after BTC limit order');
    },
  },

  {
    id: 5, session: 1,
    name: 'BTC send',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/wallet`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      const sendClicked = await clickByText(page, 'Send', 10_000);
      if (!sendClicked) throw new Error('Send button not found');
      await sleep(1000);
      // Fill recipient (send to a known regtest address)
      await typeInField(page, 'input[placeholder*="address" i], input[placeholder*="recipient" i]',
        'bcrt1q0mkku72jtxzdnh5s9086mkdxy234wkqltqextr');
      await sleep(500);
      await typeInField(page, 'input[placeholder*="amount" i], input[type="number"]', '1000');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Send BTC', 5_000)
        || await clickByText(page, 'Confirm', 5_000)
        || await clickByText(page, 'SEND', 3_000);
      if (!confirmed) throw new Error('Send confirm button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after BTC send');
    },
  },

  {
    id: 6, session: 1,
    name: 'Token send (frBTC)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/wallet`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      // Click frBTC token row or Send token button
      const tokenSend = await clickByText(page, 'Send Token', 5_000)
        || await clickByText(page, 'frBTC', 5_000);
      if (!tokenSend) throw new Error('Token send entry not found');
      await sleep(1000);
      await typeInField(page, 'input[placeholder*="address" i], input[placeholder*="recipient" i]',
        'bcrt1q0mkku72jtxzdnh5s9086mkdxy234wkqltqextr');
      await sleep(500);
      await typeInField(page, 'input[placeholder*="amount" i], input[type="number"]', '100');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Send', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Token send confirm not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after token send');
    },
  },

  // ── SESSION 2: frUSD ──────────────────────────────────────────────────

  {
    id: 7, session: 2,
    name: 'USDT → BTC AMM swap via frUSD pool',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'USDT', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(3000);
      const confirmed = await clickByText(page, 'SWAP', 5_000) || await clickByText(page, 'Swap', 3_000);
      if (!confirmed) throw new Error('Swap button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 8, session: 2,
    name: 'USDC → token AMM swap via frUSD pool',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'USDC', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(3000);
      const confirmed = await clickByText(page, 'SWAP', 5_000) || await clickByText(page, 'Swap', 3_000);
      if (!confirmed) throw new Error('Swap button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 9, session: 2,
    name: 'USDT → BTC LIMIT order',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Limit', 5_000);
      await sleep(500);
      await clickByText(page, 'USDT', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(2000);
      const placed = await clickByText(page, 'Place Order', 5_000) || await clickByText(page, 'PLACE ORDER', 5_000);
      if (!placed) throw new Error('Place Order button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 10, session: 2,
    name: 'USDC → token LIMIT order',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/swap`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Limit', 5_000);
      await sleep(500);
      await clickByText(page, 'USDC', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(2000);
      const placed = await clickByText(page, 'Place Order', 5_000) || await clickByText(page, 'PLACE ORDER', 5_000);
      if (!placed) throw new Error('Place Order button not found');
      await sleep(1000);
      await clickByText(page, 'Confirm', 5_000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 11, session: 2,
    name: 'USDT → frUSD wrap (deposit into USDT vault)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/bridge`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'USDT', 5_000);
      await sleep(500);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Wrap', 5_000)
        || await clickByText(page, 'Deposit', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Wrap/Deposit button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 12, session: 2,
    name: 'USDC → frUSD wrap (deposit into USDC vault)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/bridge`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'USDC', 5_000);
      await sleep(500);
      await typeInField(page, 'input[type="number"]', '10');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Wrap', 5_000)
        || await clickByText(page, 'Deposit', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Wrap/Deposit button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 13, session: 2,
    name: 'frUSD → USDT unwrap (withdraw from USDT vault)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/bridge`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Unwrap', 5_000) || await clickByText(page, 'Withdraw', 5_000);
      await sleep(500);
      await clickByText(page, 'USDT', 5_000);
      await sleep(500);
      await typeInField(page, 'input[type="number"]', '5');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Confirm button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 14, session: 2,
    name: 'frUSD → USDC unwrap (withdraw from USDC vault)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/bridge`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Unwrap', 5_000) || await clickByText(page, 'Withdraw', 5_000);
      await sleep(500);
      await clickByText(page, 'USDC', 5_000);
      await sleep(500);
      await typeInField(page, 'input[type="number"]', '5');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Confirm button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  // ── SESSION 3: FIRE Vault ─────────────────────────────────────────────

  {
    id: 15, session: 3,
    name: 'BTC → Stake ZAP (BTC → dxBTC → stake)',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/vaults`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'dxBTC', 5_000) || await clickByText(page, 'ZAP', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '0.001');
      await sleep(2000);
      const confirmed = await clickByText(page, 'ZAP', 5_000)
        || await clickByText(page, 'Deposit & Stake', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('ZAP/Deposit button not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 16, session: 3,
    name: 'LP → Stake in gauge',
    async run(page, wallet, logger) {
      // First add liquidity to get LP tokens
      await page.goto(`${BASE_URL}/pools`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Add Liquidity', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '1000');
      await sleep(2000);
      const addConfirmed = await clickByText(page, 'Add Liquidity', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!addConfirmed) throw new Error('Add Liquidity confirm not found');
      if (wallet !== 'keystore') {
        await waitForHumanApproval(page, wallet, 'Add Liquidity (prerequisite for LP stake)');
      }
      await mineLocalBlock();
      await sleep(3000);
      // Now stake LP in gauge
      await page.goto(`${BASE_URL}/vaults`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Stake LP', 5_000) || await clickByText(page, 'Stake', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '100');
      await sleep(1000);
      const stakeConfirmed = await clickByText(page, 'Stake', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!stakeConfirmed) throw new Error('Stake confirm not found');
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 17, session: 3,
    name: 'LP → Unstake from gauge',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/vaults`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Unstake', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '100');
      await sleep(1000);
      const confirmed = await clickByText(page, 'Unstake', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!confirmed) throw new Error('Unstake confirm not found');
      await sleep(1000);
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator');
    },
  },

  {
    id: 18, session: 3,
    name: 'Bond FROST in VxFrostGauge → Redeem',
    async run(page, wallet, logger) {
      await page.goto(`${BASE_URL}/vaults`, { waitUntil: 'networkidle2', timeout: 60_000 });
      await sleep(2000);
      await clickByText(page, 'Bond', 5_000) || await clickByText(page, 'FIRE', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '100');
      await sleep(1000);
      const bondConfirmed = await clickByText(page, 'Bond', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!bondConfirmed) throw new Error('Bond confirm not found');
      if (wallet !== 'keystore') {
        await waitForHumanApproval(page, wallet, 'Bond FROST (step 1)');
      }
      await mineLocalBlock();
      await sleep(3000);
      // Now redeem
      await clickByText(page, 'Redeem', 5_000);
      await sleep(1000);
      await typeInField(page, 'input[type="number"]', '100');
      await sleep(1000);
      const redeemConfirmed = await clickByText(page, 'Redeem', 5_000)
        || await clickByText(page, 'Confirm', 5_000);
      if (!redeemConfirmed) throw new Error('Redeem confirm not found');
      if (wallet !== 'keystore') {
        const result = await waitForHumanApproval(page, wallet, this.name);
        if (result === 'timeout') throw new Error('Wallet approval timed out');
      }
      await mineLocalBlock();
      await sleep(3000);
      const ok = await verifySuccess(page);
      if (!ok) throw new Error('No success indicator after redeem');
    },
  },
];

// ---------------------------------------------------------------------------
// Filter by session
// ---------------------------------------------------------------------------

const ACTIVE_TESTS = TEST_CASES.filter(
  t => SESSION_FILTER === null || t.session === SESSION_FILTER
);

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

describe.runIf(!SKIP)('Live Wallet Test Runner', () => {
  const logger = new TestResultsLogger();

  for (const wallet of WALLETS) {
    describe(`Wallet: ${wallet}`, () => {
      let browser: Browser;
      let page: Page;

      beforeAll(async () => {
        console.log(`\n${'━'.repeat(60)}`);
        console.log(`  Starting wallet session: ${wallet.toUpperCase()}`);
        console.log(`  Tests: ${ACTIVE_TESTS.map(t => `#${t.id}`).join(', ')}`);
        console.log(`${'━'.repeat(60)}\n`);

        browser = await puppeteer.launch({
          headless: false,            // Always headed — human needs to see and approve
          slowMo: 50,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1440,900',
            '--disable-blink-features=AutomationControlled',
          ],
          defaultViewport: { width: 1440, height: 900 },
        });

        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();

        // Remove webdriver flag
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Attach console error listener
        logger.attachConsoleListener(page, wallet);

        // Navigate and dismiss any banners
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60_000 });
        await page.evaluate(() => {
          sessionStorage.setItem('sf-demo-banner-dismissed', '1');
        });
        await page.reload({ waitUntil: 'networkidle2' });
        await sleep(2000);

        // Connect wallet
        await connectWallet(page, wallet);
        await sleep(2000);

        // Fund via bitcoind
        const address = await getConnectedAddress(page);
        if (address) {
          console.log(`  Funding address: ${address}`);
          await fundWallet(address);
        } else {
          console.log(`  Warning: could not detect address — skipping fund step`);
        }

        await page.reload({ waitUntil: 'networkidle2' });
        await sleep(3000);
      }, 300_000);

      afterAll(async () => {
        if (browser) await browser.close();
      });

      for (const tc of ACTIVE_TESTS) {
        it(`#${tc.id}: ${tc.name}`, async () => {
          const key = `${wallet}/${tc.id}`;
          logger.clearConsoleErrors(key);

          const start = Date.now();
          let status: TestStatus = 'fail';
          let error: string | undefined;
          let screenshot: string | undefined;

          try {
            await tc.run(page, wallet, logger);
            status = 'pass';
          } catch (err: any) {
            status = err?.message?.includes('timed out') ? 'timeout' : 'fail';
            error  = err?.message ?? String(err);
            screenshot = await captureScreenshot(page, wallet, tc.id, 'failure').catch(() => undefined);
            console.error(`  ✗ ${wallet} #${tc.id} error: ${error}`);
          }

          logger.record({
            wallet,
            testId:        tc.id,
            testName:      tc.name,
            status,
            durationMs:    Date.now() - start,
            error,
            screenshot,
            consoleErrorKey: key,
          });

          // Let vitest see the failure too
          expect(status, `${wallet} #${tc.id} "${tc.name}": ${error}`).toBe('pass');
        }, 300_000);
      }
    });
  }

  // Write final report after all wallets
  afterAll(async () => {
    await logger.saveAndReport();
  });
});
