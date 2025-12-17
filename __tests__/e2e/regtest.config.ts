/**
 * Regtest E2E Configuration
 *
 * Configuration for running E2E tests against regtest environment.
 * Regtest allows testing with real blockchain interactions in a controlled environment.
 */

export const REGTEST_CONFIG = {
  // Application URL (local dev server)
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',

  // Network configuration
  network: 'regtest' as const,

  // API endpoints
  api: {
    rpcUrl: 'https://regtest.subfrost.io/v4/subfrost',
    dataApiUrl: 'https://regtest.subfrost.io/v4/subfrost',
  },

  // Test wallet configuration
  testWallet: {
    // Standard BIP39 test mnemonic (DO NOT use with real funds)
    mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    password: 'TestPassword123!',
    // Expected addresses for this mnemonic on regtest
    expectedTaprootAddress: 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg',
    expectedSegwitAddress: 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk',
  },

  // Test amounts (sats for BTC, raw for alkanes)
  testAmounts: {
    btcSats: 10000, // 0.0001 BTC
    alkaneSats: 10000, // 0.0001 tokens (8 decimals)
    wrapAmount: '0.0001', // BTC to wrap
    swapAmount: '0.001', // Amount for swap tests
  },

  // Known regtest contracts
  contracts: {
    frbtc: '32:0',
    diesel: '2:0',
    pool: '2:3', // DIESEL/frBTC pool
    factory: '4:65522',
    busd: '1:0',
  },

  // Factory opcodes
  factoryOpcodes: {
    SwapExactTokensForTokens: 3,
    SwapTokensForExactTokens: 4,
  },

  // Timeouts
  timeouts: {
    pageLoad: 30000, // 30s for page load
    walletConnect: 60000, // 60s for wallet connection
    transactionConfirm: 120000, // 2min for transaction confirmation
    blockGeneration: 180000, // 3min for block generation
    uiInteraction: 10000, // 10s for UI interactions
    quoteCalculation: 5000, // 5s for quote calculation
  },

  // Retry configuration
  retries: {
    transactionCheck: 12, // Check transaction status 12 times
    checkInterval: 5000, // Every 5 seconds
  },

  // Browser configuration
  browser: {
    headless: process.env.HEADLESS === 'true', // Default visible, set HEADLESS=true for CI
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 50, // Slow down for visibility
    devtools: process.env.DEVTOOLS === 'true',
    defaultViewport: {
      width: 1400,
      height: 900,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900',
    ],
  },

  // Screenshots
  screenshots: {
    enabled: true,
    dir: './e2e/screenshots',
    onFailure: true,
    onSuccess: false,
  },

  // Logging
  logging: {
    console: process.env.DEBUG === 'true',
    level: process.env.LOG_LEVEL || 'info',
  },
};

export type RegtestConfig = typeof REGTEST_CONFIG;

// Helper to get timeout for specific operation
export function getTimeout(operation: keyof typeof REGTEST_CONFIG.timeouts): number {
  return REGTEST_CONFIG.timeouts[operation];
}

// Helper to check if running in CI
export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

// Helper to get browser launch options
export function getBrowserOptions() {
  return {
    headless: isCI() ? true : REGTEST_CONFIG.browser.headless,
    slowMo: isCI() ? 0 : REGTEST_CONFIG.browser.slowMo,
    devtools: REGTEST_CONFIG.browser.devtools,
    args: REGTEST_CONFIG.browser.args,
  };
}
