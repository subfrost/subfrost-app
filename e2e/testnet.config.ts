/**
 * Testnet E2E Configuration
 * 
 * Configuration for running E2E tests against testnet environment.
 * These tests validate that our code works with real blockchain interactions.
 */

export const REGTEST_CONFIG = {
  // Application URL (local dev server)
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  
  // Network configuration
  network: 'regtest' as const,
  
  // Test wallet configuration (use dedicated test wallet)
  testWallet: {
    address: process.env.TEST_WALLET_ADDRESS,
  },
  
  // Test amounts (can be larger for regtest since we control everything)
  testAmounts: {
    btc: 0.01, // 1,000,000 sats
    alkane: 100, // 100 tokens
    vaultDeposit: 10, // 10 tokens
  },
  
  // Known regtest contracts (from local deployment)
  contracts: {
    yveDieselVault: process.env.YVE_DIESEL_VAULT_ID || '2:1',
    dxBtcVault: process.env.DXBTC_VAULT_ID || '2:2',
    dieselToken: '2:0',
    frbtcToken: '32:0',
    busdToken: '2:0',
  },
  
  // Timeouts (much faster for regtest)
  timeouts: {
    pageLoad: 10000, // 10s for page load
    walletConnect: 30000, // 30s for wallet connection
    transactionConfirm: 30000, // 30s for transaction confirmation
    blockTime: 10000, // 10s for block confirmation (instant mining)
  },
  
  // Retry configuration
  retries: {
    transactionCheck: 10, // Check transaction status 10 times
    checkInterval: 3000, // Every 3 seconds
  },
  
  // Screenshots on failure
  screenshotsOnFailure: true,
  screenshotsDir: './e2e/screenshots/regtest',
  
  // Browser configuration
  browser: {
    headless: process.env.HEADLESS !== 'false',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    devtools: process.env.DEVTOOLS === 'true',
  },
};

export const TESTNET_CONFIG = {
  // Application URL (local dev server or deployed testnet instance)
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  
  // Network configuration
  network: 'testnet' as const,
  
  // Test wallet configuration (use dedicated test wallet)
  testWallet: {
    // NEVER commit real wallet credentials
    // Set via environment variables
    address: process.env.TEST_WALLET_ADDRESS,
    // For automated testing, you may need to import via seed phrase
    // But this requires careful security consideration
  },
  
  // Test amounts (very small for safety)
  testAmounts: {
    btc: 0.0001, // 10,000 sats
    alkane: 0.1, // 0.1 tokens
    vaultDeposit: 0.01, // Very small vault deposit
  },
  
  // Known testnet contracts (from deployment)
  contracts: {
    yveDieselVault: process.env.YVE_DIESEL_VAULT_ID || '2:123', // Update with actual
    dieselToken: '2:0',
    frbtcToken: '32:0',
    busdToken: '1:0',
  },
  
  // Timeouts
  timeouts: {
    pageLoad: 30000, // 30s for page load
    walletConnect: 60000, // 60s for wallet connection
    transactionConfirm: 300000, // 5min for transaction confirmation
    blockTime: 600000, // 10min for block confirmation
  },
  
  // Retry configuration
  retries: {
    transactionCheck: 30, // Check transaction status 30 times
    checkInterval: 10000, // Every 10 seconds
  },
  
  // Screenshots on failure
  screenshotsOnFailure: true,
  screenshotsDir: './e2e/screenshots',
  
  // Browser configuration
  browser: {
    headless: process.env.HEADLESS !== 'false', // Default headless, set HEADLESS=false to debug
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    devtools: process.env.DEVTOOLS === 'true',
  },
};

export type TestnetConfig = typeof TESTNET_CONFIG;
