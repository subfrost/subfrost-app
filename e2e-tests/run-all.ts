#!/usr/bin/env npx tsx
/**
 * E2E Test Runner for All Wallet Types
 *
 * Runs wallet integration tests against staging-app.subfrost.io
 *
 * Usage:
 *   npx tsx e2e-tests/run-all.ts [--wallet <type>] [--headless]
 *
 * Options:
 *   --wallet <type>  Run tests for specific wallet only (xverse, oyl, leather, etc.)
 *   --headless       Run in headless mode
 *   --dry-run        Show what would be tested without running
 */

import * as fs from 'fs';
import { CONFIG, WalletType } from './config.js';

// Import wallet test classes
import { XverseWalletTest } from './wallets/xverse.test.js';
import { OYLWalletTest } from './wallets/oyl.test.js';

// Registry of available wallet tests
const WALLET_TESTS: Record<string, new () => any> = {
  xverse: XverseWalletTest,
  oyl: OYLWalletTest,
  // Add more as implemented:
  // leather: LeatherWalletTest,
  // unisat: UnisatWalletTest,
  // magiceden: MagicEdenWalletTest,
};

interface TestResult {
  wallet: string;
  passed: number;
  failed: number;
  results: Record<string, boolean>;
  error?: string;
}

async function runWalletTest(walletType: string): Promise<TestResult> {
  const TestClass = WALLET_TESTS[walletType];

  if (!TestClass) {
    return {
      wallet: walletType,
      passed: 0,
      failed: 1,
      results: {},
      error: `No test implementation for wallet: ${walletType}`,
    };
  }

  try {
    const test = new TestClass();
    const { passed, failed, results } = await test.runAllTests();
    return { wallet: walletType, passed, failed, results };
  } catch (error: any) {
    return {
      wallet: walletType,
      passed: 0,
      failed: 1,
      results: {},
      error: error.message,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const walletArg = args.includes('--wallet')
    ? args[args.indexOf('--wallet') + 1]
    : null;
  const headless = args.includes('--headless');
  const dryRun = args.includes('--dry-run');

  if (headless) {
    process.env.E2E_HEADLESS = 'true';
  }

  // Create screenshots directory
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Subfrost E2E Wallet Integration Tests            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Target: ${CONFIG.baseUrl}`);
  console.log(`Headless: ${headless}`);
  console.log();

  // Determine which wallets to test
  const walletsToTest = walletArg
    ? [walletArg]
    : Object.keys(WALLET_TESTS);

  console.log('Wallets to test:', walletsToTest.join(', '));
  console.log();

  if (dryRun) {
    console.log('(Dry run - not executing tests)');
    process.exit(0);
  }

  // Run tests
  const allResults: TestResult[] = [];

  for (const wallet of walletsToTest) {
    console.log('─'.repeat(60));
    console.log(`Testing: ${wallet.toUpperCase()}`);
    console.log('─'.repeat(60));

    const result = await runWalletTest(wallet);
    allResults.push(result);

    console.log();
  }

  // Print summary
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of allResults) {
    const status = result.failed === 0 ? '✓' : '✗';
    console.log(`${status} ${result.wallet}: ${result.passed} passed, ${result.failed} failed`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    for (const [test, passed] of Object.entries(result.results)) {
      console.log(`    ${passed ? '✓' : '✗'} ${test}`);
    }

    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log('─'.repeat(60));
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log();

  // Exit with appropriate code
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
