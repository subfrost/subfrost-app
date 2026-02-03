/**
 * Browser wallet configuration with custom ordering.
 * Uses SDK wallet data (including base64 icons) with our preferred display order.
 * Wallets not in the SDK (oyl, tokeo, keplr) use local definitions.
 */

import {
  BROWSER_WALLETS as SDK_WALLETS,
  type BrowserWalletInfo,
} from '@alkanes/ts-sdk';

export type { BrowserWalletInfo };

// Wallets not included in the SDK — local definitions with icons
const LOCAL_WALLETS: BrowserWalletInfo[] = [
  {
    id: 'oyl',
    name: 'Oyl',
    icon: '/assets/wallets/oyl.png',
    website: 'https://chromewebstore.google.com/detail/oyl-wallet-bitcoin-ordina/ilolmnhjbbggkmopnemiphomhaojndmb',
    injectionKey: 'oyl',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: false,
  },
  {
    id: 'tokeo',
    name: 'Tokeo Wallet',
    icon: '/assets/wallets/tokeo.png',
    website: 'https://chromewebstore.google.com/detail/tokeo-wallet/gcfodaebdmongllonjmfmbmefocjmhol',
    injectionKey: 'tokeo',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: true,
    deepLinkScheme: 'tokeo://',
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
  'oyl',
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
