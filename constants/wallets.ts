/**
 * Browser wallet configuration based on alkanes-web-sys BrowserWalletProvider
 * Supports 10+ Bitcoin wallets for browser extension connection
 */

export interface BrowserWalletInfo {
  id: string;
  name: string;
  icon: string;
  website: string;
  injectionKey: string;
  supportsPsbt: boolean;
  supportsTaproot: boolean;
  supportsOrdinals: boolean;
  mobileSupport: boolean;
  deepLinkScheme?: string;
}

/**
 * List of supported browser extension wallets
 * Icons are located in /public/assets/wallets/
 */
export const BROWSER_WALLETS: BrowserWalletInfo[] = [
  {
    id: 'unisat',
    name: 'Unisat Wallet',
    icon: '/assets/wallets/unisat.svg',
    website: 'https://unisat.io/download',
    injectionKey: 'unisat',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: false,
  },
  {
    id: 'xverse',
    name: 'Xverse Wallet',
    icon: '/assets/wallets/xverse.svg',
    website: 'https://www.xverse.app/download',
    injectionKey: 'XverseProviders',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: true,
    deepLinkScheme: 'xverse://',
  },
  {
    id: 'phantom',
    name: 'Phantom Wallet',
    icon: '/assets/wallets/phantom.svg',
    website: 'https://phantom.app/download',
    injectionKey: 'phantom',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: false,
    mobileSupport: true,
    deepLinkScheme: 'phantom://',
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    icon: '/assets/wallets/okx.svg',
    website: 'https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
    injectionKey: 'okxwallet',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: true,
    deepLinkScheme: 'okx://',
  },
  {
    id: 'leather',
    name: 'Leather Wallet',
    icon: '/assets/wallets/leather.svg',
    website: 'https://leather.io/install-extension',
    injectionKey: 'LeatherProvider',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: false,
  },
  {
    id: 'magic-eden',
    name: 'Magic Eden Wallet',
    icon: '/assets/wallets/magiceden.svg',
    website: 'https://wallet.magiceden.io/',
    injectionKey: 'magicEden',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: true,
    deepLinkScheme: 'magiceden://',
  },
  {
    id: 'wizz',
    name: 'Wizz Wallet',
    icon: '/assets/wallets/wizz.svg',
    website: 'https://wizzwallet.io/#extension',
    injectionKey: 'wizz',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: false,
  },
  {
    id: 'orange',
    name: 'Orange Wallet',
    icon: '/assets/wallets/orange.svg',
    website: 'https://www.orangewallet.com/',
    injectionKey: 'orange',
    supportsPsbt: false,
    supportsTaproot: false,
    supportsOrdinals: false,
    mobileSupport: false,
  },
  {
    id: 'tokeo',
    name: 'Tokeo Wallet',
    icon: '/assets/wallets/tokeo.svg',
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
    supportsPsbt: false,
    supportsTaproot: false,
    supportsOrdinals: false,
    mobileSupport: true,
    deepLinkScheme: 'keplr://',
  },
];

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
