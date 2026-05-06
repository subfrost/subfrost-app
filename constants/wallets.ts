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

// OYL brand icon inlined as a base64 data URI to match the rest of the wallet
// list (every SDK-shipped wallet uses an inline data URI). Inline avoids
// an extra HTTP request, never hits cache miss, and keeps the icon set
// consistent across wallets.
//
// Source: public/assets/wallets/oyl.png (3.8 KB, 360x360 RGBA, OYL brand mark).
// Regenerate with `base64 -i public/assets/wallets/oyl.png`.
const OYL_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoCAYAAAB65WHVAAAACXBIWXMAACE4AAAhOAFFljFgAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAA5tSURBVHgB7d3tdVPHGoZhnazzH1KBkwoIFRAqCB0YKoipwFABpgJIBYQKCBU4VECowKECHT/mjCMcY4wt26/mva61tPwB+RG0dWs0e++Z/ywPLQAo57sFACUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBR/13ANfv7778/e/z1119Hv//48ePRzzF+t/r3V63++Xn88MMP//rd7du3jx6nfX/r1q3Pfpf/fvVnuA7/WR5awCUlmCO2+frhw4fjiObr+P3J0G6iRHo12Ks/b21tHf982psCfAuB5lxGYP/888/j+K4+ON0IdaL9008/HX29c+fO8c9wFoHm2BgBr0Y43484s34j4Il1voo3qwS6qUT3jz/+WLx79+6zEFPDiPSId8I9RuD0IdANrMY4Ic7DiHgzjWDnce/ePdGenEBPZswTJ8aJch5iPLcx0n7w4MHxSJs5CPSGG0F++/btUYyNjsmI+ueffz56jFE2m0mgN9AI8u+//y7IfNUIdkbYCbbL/zaHQG+AMUp+/fr14uXLl4LMpWREnWD/8ssvR1+pS6CLSoQzQv7tt9+MkrkyGU2PWGeETS0CXchqlDOfDNcpUyGJtFjXIdAFJMaJcuJspEwFY2T966+/Osl4gwT6hiTEz58/X+zt7YkypSXQOzs7TjDeAIG+ZhktP3361BQGG+nhw4eL3d1dob4mAn0NMkLOFEauwMgJP9h0mf5IqF0FcrUE+gqZxmB2GUk/efJksb29vWD9BPoKCDPdCPXVEOg1Ema6S6ifPXvmMr01Eeg1yfzy48ePhRkWTiaui0Bfkqsy1u/kNlKrj7FX4PC1AKxus5WvY9/D1b0QZ9qOq5pMeyTUXIxAX1BezAlzpjP4NiO+p20BdZMbs67uqZiv2VVmbGRgV5mLy3P94sULV3xcgEBfQEbLjx49sgPJOYw70hLh1a2dNtEI9VhNcHzP+eRml4ymbTBwfgL9DYyazzaWtRxrEHfY7WOsNLi6JreR9pflzfnNmzfmps9JoM8po6X79+8bNa8Y0xJj2UprNnySWCfUWR7WuYnTZZCTdT44m0CfQ+4CzMczI6NPUc4Z+kTZfnjnk0WwRqy9wf8jr6lckscZlpzp8Cx03sBaPw4jvDyM8vLwo+mSy8m/Yf4t82+6ScfAVT0O3+SXBwcHS05nBH2GnAjM9c1djYXcM2I2Ul6vsfZ3bmzqfqLRvPQZlvxL3tEP47Qxo5B1P/L/brR8ffb3949G1Zt0jKz7cRjn5fv375d8TqBPSJzzsWuTDu51PRIJL5Kbk3/7zqEW6X8zxXHC3bt3233kzFRGbiTwEbOGnEjM5Zwdp9dy4jnTHabUPvluwbHMOXeK85j7M/9Xy7jzruPzktdfXof835Ij3a7W2N3ddfZ8Q+S52qRjax2PvB4xxXEkHyW7vGtbF2EzdbxRKp8guh+n7QOdAz7zzh1uQsnB/urVK/N7GyrHapa0zeV5HWQwsb+/3/p4bT8HnVFJhzjntlonXzZbgpU32C7Ld46Tpa0tG9vb29uI+bjLPjKHyVw6zUt3via/baBzvWWH223FeV5dIp0bp7pqOwfd4Tbu7AuXj8TMK7fhZzGv2XU9Ydgy0Jnb+vHHHxczc4Klh5w/yUnu2a/uSJwT6W5aniTscOLBCcEe8hx3+JSUpVo7rq3dLtAZacw+tZErNtwZ2Eduj87mrLPLjjXdtJvimP2mFEs39pSpjkzbzXzJaD4tHBwcLDppN4Ke/YTK9va2ODeUeGWHkpnlzafbNEerQGd6Y/YnOGf16SlTW7Ofd3j37t2ik1aBnv3JzWV1Rs99jU18Z2YEPbHZ1zDI9lT0limumXVbq73dFMfMrFBHPkXNLK/hDmvnDK0CPfPHo0xtmN4g0xyzHwcCPaHZR8/izDD7PHSnNbEFehICzTD7lRxG0GwcgWaY/Vj4+PHjoos2ge70pAJzaBPobreIwqy2trYWXbQJ9Pfff7+YWacTJ5zNsTCPNoG+devWYmadTpxwNifE59Em0LM/qd3usOLLZn+zFugJzX7pUbc7rDhdjoGZ36xnv8b7pFaBnv2dt+OOE3xu9kXtu11O2uo66NnffV+/fr2gNwuCzaVVoGdfTCgvTtMcvc0e6G4LgrUK9J07dxYzS5xn3zGGL8t2bjO/QecTcLcpjnZ7EuZ66JkP4hzA+/v7dvRuKHsSznyJ3d7e3tGuMZ20W4tj9i2h8gJ9/vz5gl7ynM9+/XPHDSnaBbrDk5yRhrvJ+shz/eTJk8XMMrDquCBYuymOuH///vSXpOVkyps3bxbM7+7du9PfqPT+/fuWgW653GiHeay8AT1+/HjB3J4+fTp9nLuOnqPlCDpmP6Ey5KPv7u7ugvkkzrNPbUTX0XO0XbD/xYsXiw7yAs4LmbnkpGCHOGdw0XozimVjh/O0+fTQ4nH4Yl4yhzyXm3TsXfRxGOblwcHBsrO2UxyRKY6cYOly953pjs2X8wq5SqeDzlMbQ+s9CfPkdwpWAp03JJfgbZ48Z7n6qEuc209tDEuWOzs75T/urfORj44vX75cshlevXq1vH379kYdY5d5PHz4cMknrac4hkxxZHTSbdH7XL5kpFJXRs2PHj1qtYxs1tvI9fuWKvhEoP9vfITs+PE/Ux/b29tCXUQGDLlKI9MZnVYnzPGXODsOVyw5dnhS4ujj/2LDPhKu42Ha4+blioVcodFpOmP1+Mvrj88ZQZ/QeSQdGb1k6sOI+vp0HTEPRs5fJtCn6B7pYYS62yLp1yVzy1m/u/NGC5lzPjwJKs5fINBfINL/yItnZ2fnaCVAL6TLGaPlRLn7Tux588+nBicEv0ygz9DxLPrXZDT94MEDsf4GOY6yX2Si7Fj6JFcPdbhV/bIE+hysZ3G6BDrBTqzz1Ujok4ySMzoeUfYp7B85RjKlYdrsfAT6nLLfWyLtxfZledFlTvHevXut9o9LkDMyfvv27VGYjZJPl+Mji5T55HV+Av0NTHl8m7wQE+o8smHv+HmT5RhIhD98+HB0HOR7b9pny6g5Uxo5j8G3EegLyImNjKa7nnm/jLxYE+nxNeHO94l3lZFVgjumKRLiEeXxe87PqPlyBPqC8mJNpDP1wfqshnr1+62trePfrf7d80hUR1jHaDfhHT/nz1a/cnl503327Nn0mzRfNYG+JHPT8I+EOVvKZTrDSePLE+g1EWq6s/jW+gn0GiXOCXXuDhNqusg8c8Ls0rn1E+grINR0YCmAqyfQV8zUBzMZc8yJs6mMqyfQ12SMqF1DzSZKjDNadvLvegn0NRuX5yXURtVUZ375Zgn0DTKqpqKxvkqmMYyWb5ZAF5CR9FgbWKy5CWMKI3E2Wq5DoItJrLMCWlZCE2uukijXJ9CFjZH1WLYSLmtMX2RNb1dh1CfQG2TEeqyiBl+TOeTEOEvA5qs55c0i0BtqrLCWYOerYBMjyFkl0Ch58wn0JEawLRrfy9jVRpDnJNATG1MhifYIOJsro+PEOBHOlIVtxuYn0I2MRejHQvTje4vQ17M6Mh470Rgd9yPQnBrujLjd6Xi1Mvodo+J8TYxHiI2MCYHmTKuxHts/jYeR99eN2I5tvsYWX0bEnIdAc2Ent4pKwFd/t/r9bE5uy5XoZluu1f0VBZjLEmiuxWqw47S9AVf/3nBymuUy0y5jSmHViOjqn43vb926dfz9CO/qfwNXTaABivpuAUBJAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFCXQAEUJNEBRAg1QlEADFPU/PQZUtcqLg4YAAAAASUVORK5CYII=';

// Wallets not included in the SDK — local definitions with icons
const LOCAL_WALLETS: BrowserWalletInfo[] = [
  {
    id: 'oyl',
    name: 'Oyl Wallet',
    icon: OYL_ICON,
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
  'keplr',
];

/**
 * Wallets allowed to connect from the picker. Wallets in `WALLET_ORDER` but
 * not in this set render as "COMING SOON".
 *
 * Safety tiers (each tier inherits SDK `ordinals_strategy: 'preserve'` —
 * per-UTXO ord_outputs scan + alkane-aware split-tx — and the cachedUtxos
 * alkane filter in `lib/alkanes/execute.ts`):
 *
 * - **Dual-address** (`oyl`, `xverse`): segwit + taproot. BTC fees source
 *   from segwit, alkanes reserved at taproot via `protect_taproot=true`.
 *   Strongest safety guarantee — taproot UTXOs are never picked for fees.
 * - **Single-address taproot-only** (`unisat`, `okx`): one address. UniSat
 *   adds a `getBitcoinUtxos` capability (perf shortcut, see
 *   `lib/wallet/walletCapabilities.ts`). OKX has no such API and relies
 *   purely on the SDK preserve-mode scan — same protection level as Phantom
 *   and other wallets without `getBitcoinUtxos`.
 *
 * To enable a new wallet, add its id here. To disable an enabled wallet,
 * remove it. The picker (`ConnectWalletModal.tsx`) consumes this set
 * directly — no second flip needed.
 */
export const ENABLED_WALLET_IDS = new Set<string>([
  'oyl',
  'xverse',
  'unisat',
  'okx',
]);

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
