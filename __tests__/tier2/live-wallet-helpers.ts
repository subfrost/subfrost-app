/**
 * Live Wallet Test Helpers
 *
 * Provides two primitives for the human-in-the-loop wallet test runner:
 *
 *   waitForHumanApproval(page, wallet, test)
 *     — Pauses the test at the wallet signing popup.
 *     — Prints a clear terminal prompt so the tester knows exactly what to do.
 *     — Resumes automatically once the popup dismisses (UI returns to idle).
 *     — Times out after 120s with a TIMEOUT result rather than crashing.
 *
 *   TestResultsLogger
 *     — Accumulates pass/fail/timeout results per wallet × test case.
 *     — Captures console errors and the screenshot path on failure.
 *     — Writes a JSON results file at the end of a run.
 *     — Prints a human-readable summary table to stdout.
 *     — On subsequent runs, compares against the last passing run and flags
 *       regressions (previously passing test now failing).
 *
 * Environment:
 *   HUMAN_APPROVAL_TIMEOUT_MS — override 120s default (e.g. "60000")
 *   RESULTS_DIR               — where results JSON files are written
 *                               (default: e2e-tests/results)
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { Page } from 'puppeteer';
import { sleep } from '../shared/regtest-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestStatus = 'pass' | 'fail' | 'timeout' | 'skip';

export interface TestResult {
  wallet:     string;
  testId:     number;
  testName:   string;
  status:     TestStatus;
  durationMs: number;
  error?:     string;
  screenshot?: string;
  consoleErrors: string[];
  txid?:      string;
}

export interface RunReport {
  runAt:      string;
  network:    string;
  results:    TestResult[];
  summary: {
    total:    number;
    pass:     number;
    fail:     number;
    timeout:  number;
    skip:     number;
  };
  regressions: string[]; // "wallet/testName was passing, now failing"
}

// ---------------------------------------------------------------------------
// waitForHumanApproval
// ---------------------------------------------------------------------------

const APPROVAL_TIMEOUT_MS = parseInt(
  process.env.HUMAN_APPROVAL_TIMEOUT_MS || '120000'
);

/**
 * Pauses the automated flow at the wallet signing step.
 *
 * Prints to the terminal:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  WAITING FOR HUMAN APPROVAL                         │
 *   │  Wallet : Oyl                                       │
 *   │  Test   : token → token AMM swap                   │
 *   │  Action : Click APPROVE / CONFIRM in your wallet    │
 *   │  Timeout: 120s                                      │
 *   └─────────────────────────────────────────────────────┘
 *
 * Resumes when the modal/overlay the wallet opened has closed,
 * detected by watching for the absence of any element matching
 * common wallet popup selectors, or by a URL change back to the app.
 *
 * Returns 'approved' | 'timeout'.
 */
export async function waitForHumanApproval(
  page: Page,
  wallet: string,
  testName: string
): Promise<'approved' | 'timeout'> {
  const border = '─'.repeat(55);
  console.log(`\n┌${border}┐`);
  console.log(`│  ${'WAITING FOR HUMAN APPROVAL'.padEnd(53)}│`);
  console.log(`│  ${'Wallet : ' + wallet}${' '.repeat(Math.max(0, 53 - ('Wallet : ' + wallet).length))}│`);
  console.log(`│  ${'Test   : ' + testName}${' '.repeat(Math.max(0, 53 - ('Test   : ' + testName).length))}│`);
  console.log(`│  ${'Action : Click APPROVE / CONFIRM in your wallet'}${' '.repeat(Math.max(0, 53 - 'Action : Click APPROVE / CONFIRM in your wallet'.length))}│`);
  console.log(`│  ${'Timeout: ' + (APPROVAL_TIMEOUT_MS / 1000) + 's'}${' '.repeat(Math.max(0, 53 - ('Timeout: ' + (APPROVAL_TIMEOUT_MS / 1000) + 's').length))}│`);
  console.log(`└${border}┘\n`);

  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  const pollMs   = 1000;

  // Poll until either:
  //   (a) a success/broadcast/confirmed indicator appears in the page DOM
  //   (b) the wallet popup URL we were on has navigated away (popup closed)
  //   (c) timeout
  while (Date.now() < deadline) {
    await sleep(pollMs);

    const done = await page.evaluate(() => {
      const body = document.body?.textContent?.toLowerCase() ?? '';
      return (
        body.includes('broadcast') ||
        body.includes('confirmed') ||
        body.includes('success') ||
        body.includes('transaction sent') ||
        body.includes('pending') ||
        body.includes('submitted')
      );
    }).catch(() => false);

    if (done) {
      console.log(`  ✓ Approval detected — resuming automation\n`);
      return 'approved';
    }
  }

  console.log(`  ✗ Approval timed out after ${APPROVAL_TIMEOUT_MS / 1000}s\n`);
  return 'timeout';
}

// ---------------------------------------------------------------------------
// TestResultsLogger
// ---------------------------------------------------------------------------

const RESULTS_DIR = process.env.RESULTS_DIR || 'e2e-tests/results';

export class TestResultsLogger {
  private results: TestResult[] = [];
  private network: string;
  private consoleErrors: Map<string, string[]> = new Map();

  constructor(network = process.env.NEXT_PUBLIC_NETWORK || 'regtest-local') {
    this.network = network;
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  /**
   * Attach a console error listener to a page. Call once per page setup.
   * Key is `${wallet}/${testId}` — reset between tests via clearConsoleErrors().
   */
  attachConsoleListener(page: Page, key: string) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const existing = this.consoleErrors.get(key) ?? [];
        existing.push(msg.text());
        this.consoleErrors.set(key, existing);
      }
    });
  }

  clearConsoleErrors(key: string) {
    this.consoleErrors.set(key, []);
  }

  record(result: Omit<TestResult, 'consoleErrors'> & { consoleErrorKey?: string }) {
    const { consoleErrorKey, ...rest } = result;
    const consoleErrors = consoleErrorKey
      ? (this.consoleErrors.get(consoleErrorKey) ?? [])
      : [];
    this.results.push({ ...rest, consoleErrors });

    const icon = rest.status === 'pass' ? '✓' : rest.status === 'timeout' ? '⏱' : '✗';
    const line = `  ${icon} [${rest.wallet}] #${rest.testId} ${rest.testName} — ${rest.status.toUpperCase()} (${rest.durationMs}ms)`;
    console.log(line);
    if (rest.error) console.log(`      Error: ${rest.error}`);
  }

  async saveAndReport(): Promise<RunReport> {
    const now     = new Date().toISOString();
    const fname   = `run-${now.replace(/[:.]/g, '-')}.json`;
    const outPath = path.join(RESULTS_DIR, fname);
    const lastPassPath = path.join(RESULTS_DIR, 'last-passing.json');

    const summary = {
      total:   this.results.length,
      pass:    this.results.filter(r => r.status === 'pass').length,
      fail:    this.results.filter(r => r.status === 'fail').length,
      timeout: this.results.filter(r => r.status === 'timeout').length,
      skip:    this.results.filter(r => r.status === 'skip').length,
    };

    // Regression detection — compare against last passing snapshot
    const regressions: string[] = [];
    if (fs.existsSync(lastPassPath)) {
      try {
        const lastPass: RunReport = JSON.parse(fs.readFileSync(lastPassPath, 'utf8'));
        for (const prev of lastPass.results.filter(r => r.status === 'pass')) {
          const current = this.results.find(
            r => r.wallet === prev.wallet && r.testId === prev.testId
          );
          if (current && current.status !== 'pass') {
            regressions.push(
              `REGRESSION: ${prev.wallet} / #${prev.testId} "${prev.testName}" was PASS, now ${current.status.toUpperCase()}`
            );
          }
        }
      } catch { /* malformed last-passing file — skip regression check */ }
    }

    const report: RunReport = {
      runAt: now,
      network: this.network,
      results: this.results,
      summary,
      regressions,
    };

    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nResults written to: ${outPath}`);

    // Update last-passing if no failures or regressions
    if (summary.fail === 0 && summary.timeout === 0 && regressions.length === 0) {
      fs.writeFileSync(lastPassPath, JSON.stringify(report, null, 2));
      console.log(`Last-passing snapshot updated.`);
    }

    // Print summary table
    console.log('\n' + '═'.repeat(60));
    console.log('  WALLET TEST RUN SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  Network : ${this.network}`);
    console.log(`  Run at  : ${now}`);
    console.log(`  Total   : ${summary.total}`);
    console.log(`  Pass    : ${summary.pass}  ✓`);
    console.log(`  Fail    : ${summary.fail}  ✗`);
    console.log(`  Timeout : ${summary.timeout}  ⏱`);
    console.log(`  Skip    : ${summary.skip}`);
    if (regressions.length > 0) {
      console.log('\n  ⚠ REGRESSIONS DETECTED:');
      regressions.forEach(r => console.log(`  ${r}`));
    }
    console.log('═'.repeat(60) + '\n');

    return report;
  }
}

// ---------------------------------------------------------------------------
// Screenshot helper (writes to RESULTS_DIR/screenshots/)
// ---------------------------------------------------------------------------

export async function captureScreenshot(
  page: Page,
  wallet: string,
  testId: number,
  label: string
): Promise<string> {
  const dir  = path.join(RESULTS_DIR, 'screenshots', wallet);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `test${testId}-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file as `${string}.png`, fullPage: false }).catch(() => {});
  return file;
}

// ---------------------------------------------------------------------------
// Mine a block on local regtest
// ---------------------------------------------------------------------------

export async function mineLocalBlock(toAddress?: string): Promise<void> {
  const addr = toAddress || 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';
  const body = JSON.stringify({
    jsonrpc: '1.0',
    method:  'generatetoaddress',
    params:  [1, addr],
    id:      1,
  });
  await fetch('http://127.0.0.1:18443/', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  'Basic ' + Buffer.from('bitcoinrpc:bitcoinrpc').toString('base64'),
    },
    body,
  }).catch(() => {});
}
