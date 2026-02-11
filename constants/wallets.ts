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
    name: 'Oyl Wallet',
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
 * Detect if a wallet is installed in the browser.
 * Some wallets have nested providers (e.g., phantom.bitcoin, magicEden.bitcoin)
 * or use non-standard injection keys (e.g., Orange uses OrangeBitcoinProvider).
 */
export function isWalletInstalled(wallet: BrowserWalletInfo): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const win = window as any;

    // Special cases for wallets with non-standard injection patterns
    switch (wallet.id) {
      case 'phantom':
        // Phantom injects at window.phantom.bitcoin for BTC
        return win.phantom?.bitcoin !== undefined;

      case 'magic-eden':
        // Magic Eden injects at window.magicEden.bitcoin for BTC
        return win.magicEden?.bitcoin !== undefined;

      case 'orange':
        // Orange uses multiple possible injection points
        return (
          win.OrangeBitcoinProvider !== undefined ||
          win.OrangecryptoProviders?.BitcoinProvider !== undefined ||
          win.OrangeWalletProviders?.OrangeBitcoinProvider !== undefined
        );

      case 'tokeo':
        // Tokeo injects at window.tokeo.bitcoin
        return win.tokeo?.bitcoin !== undefined;

      case 'okx':
        // OKX injects at window.okxwallet; Bitcoin provider is at .bitcoin
        return win.okxwallet?.bitcoin !== undefined;

      case 'xverse':
        // Xverse injects at window.XverseProviders.BitcoinProvider
        return win.XverseProviders?.BitcoinProvider !== undefined;

      default:
        // Standard injection key check
        const walletObj = win[wallet.injectionKey];
        return walletObj !== undefined && walletObj !== null;
    }
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
