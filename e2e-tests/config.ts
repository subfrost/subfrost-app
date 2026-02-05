/**
 * E2E Test Configuration
 */

export const CONFIG = {
  // Target URLs
  baseUrl: process.env.E2E_BASE_URL || 'https://staging-app.subfrost.io',

  // Timeouts
  navigationTimeout: 60000,
  elementTimeout: 30000,
  transactionTimeout: 120000,

  // Browser settings
  headless: process.env.E2E_HEADLESS === 'true',
  slowMo: parseInt(process.env.E2E_SLOW_MO || '50'),
  viewport: {
    width: 1440,
    height: 900,
  },

  // Wallet extension paths (set via environment or default locations)
  extensions: {
    xverse: process.env.XVERSE_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/xverse`,
    leather: process.env.LEATHER_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/leather`,
    oyl: process.env.OYL_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/oyl`,
    unisat: process.env.UNISAT_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/unisat`,
    magiceden: process.env.MAGICEDEN_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/magiceden`,
    phantom: process.env.PHANTOM_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/phantom`,
    okx: process.env.OKX_EXTENSION_PATH || `${process.env.HOME}/.autochrome/extensions/okx`,
  },

  // Test data
  testRecipient: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', // Mainnet test recipient
  testAmount: '0.0001', // Small amount for testing (10k sats)
};

export const SELECTORS = {
  // Connect wallet flow
  connectWalletButton: '[data-testid="connect-wallet-button"], button:has-text("Connect Wallet")',
  walletModal: '[data-testid="wallet-modal"], .wallet-connect-modal',

  // Wallet options in modal
  walletOption: (wallet: string) => `[data-testid="wallet-${wallet}"], button:has-text("${wallet}")`,

  // Connected state
  walletAddress: '[data-testid="wallet-address"]',
  walletBalance: '[data-testid="btc-balance"]',

  // Send flow
  sendButton: '[data-testid="header-send-button"], button:has-text("Send")',
  sendModal: '[data-testid="send-modal"]',
  recipientInput: '[data-testid="recipient-input"], input[placeholder*="address"]',
  amountInput: '[data-testid="amount-input"], input[placeholder*="amount"]',
  sendSubmitButton: '[data-testid="send-submit"], button:has-text("Send")',

  // Transaction result
  txidDisplay: '[data-testid="txid"]',
  txSuccess: '[data-testid="tx-success"]',
  txError: '.error-message, [data-testid="error"]',

  // Swap flow
  swapButton: '[data-testid="swap-button"], a[href="/swap"]',
  swapFromInput: '[data-testid="swap-from-input"]',
  swapToInput: '[data-testid="swap-to-input"]',
  swapSubmit: '[data-testid="swap-submit"]',

  // Vault flow
  vaultButton: '[data-testid="vault-button"], a[href="/vault"]',
  depositButton: '[data-testid="deposit-button"]',
  withdrawButton: '[data-testid="withdraw-button"]',
};

export type WalletType = 'xverse' | 'leather' | 'oyl' | 'unisat' | 'magiceden' | 'phantom' | 'okx';
