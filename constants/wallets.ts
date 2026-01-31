/**
 * Browser wallet configuration with custom ordering.
 * Uses SDK wallet data (including base64 icons) with our preferred display order.
 * Wallets not in the SDK (tokeo, keplr) use local definitions.
 */

import {
  BROWSER_WALLETS as SDK_WALLETS,
  type BrowserWalletInfo,
} from '@alkanes/ts-sdk';

export type { BrowserWalletInfo };

// Wallets not included in the SDK — local definitions with placeholder icons
const LOCAL_WALLETS: BrowserWalletInfo[] = [
  {
    id: 'tokeo',
    name: 'Tokeo Wallet',
    icon: '/assets/wallets/tokeo.png',
    website: 'https://tokeo.io/',
    injectionKey: 'tokeo',
    supportsPsbt: false,
    supportsTaproot: false,
    supportsOrdinals: false,
    mobileSupport: false,
  },
  {
    id: 'keplr',
    name: 'Keplr Wallet',
    icon: '/assets/wallets/keplr.svg',
    website: 'https://keplr.app/download',
    injectionKey: 'keplr',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: false,
    mobileSupport: true,
    deepLinkScheme: 'keplr://',
  },
];

// Desired display order (by wallet id)
const WALLET_ORDER = [
  'okx',
  'unisat',
  'xverse',
  'phantom',
  'leather',
  'tokeo',
  'magic-eden',
  'orange',
  'wizz',
  'keplr',
];

// Build lookup from SDK + local wallets
const allWallets = [...SDK_WALLETS, ...LOCAL_WALLETS];
const walletMap = new Map(allWallets.map(w => [w.id, w]));

/**
 * Ordered list of supported browser extension wallets.
 * SDK wallets retain their embedded base64 icons.
 */
export const BROWSER_WALLETS: BrowserWalletInfo[] = WALLET_ORDER
  .map(id => walletMap.get(id))
  .filter((w): w is BrowserWalletInfo => w !== undefined);

/**
 * Detect if a wallet is installed in the browser
 */
export function isWalletInstalled(wallet: BrowserWalletInfo): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const walletObj = (window as any)[wallet.injectionKey];
    return walletObj !== undefined && walletObj !== null;
  } catch {
    return false;
  }
}

/**
 * Get all installed wallets
 */
export function getInstalledWallets(): BrowserWalletInfo[] {
  return BROWSER_WALLETS.filter(isWalletInstalled);
}
