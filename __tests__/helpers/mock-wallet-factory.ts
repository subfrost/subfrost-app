/**
 * Mock Wallet Factory for Puppeteer E2E Testing
 *
 * Injects mock window.* APIs for all 11 supported browser wallets so Puppeteer
 * tests can exercise the full connect → sign → broadcast flow without real
 * wallet extensions installed.
 *
 * Architecture:
 *   1. page.exposeFunction('__mockSignPsbt', ...) bridges signing to Node.js
 *   2. page.evaluateOnNewDocument() injects mock wallet APIs into the page
 *   3. When the app calls wallet.signPsbt(), the mock calls __mockSignPsbt()
 *      which executes in Node.js with full access to bitcoinjs-lib
 *
 * Supported wallets:
 *   xverse, oyl, unisat, okx, phantom, leather, magic-eden, orange, tokeo, wizz, keplr
 */

import { Page } from 'puppeteer';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import { REGTEST } from '../shared/regtest-constants';

// Initialize ECC
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

export type MockWalletId =
  | 'xverse' | 'oyl' | 'unisat' | 'okx' | 'phantom'
  | 'leather' | 'magic-eden' | 'orange' | 'tokeo' | 'wizz' | 'keplr';

export const ALL_WALLET_IDS: MockWalletId[] = [
  'xverse', 'oyl', 'unisat', 'okx', 'phantom',
  'leather', 'magic-eden', 'orange', 'tokeo', 'wizz', 'keplr',
];

export interface MockWalletAddresses {
  taproot: { address: string; publicKey: string; xOnlyPublicKey: string };
  nativeSegwit: { address: string; publicKey: string };
}

/**
 * Derive test wallet addresses from the standard test mnemonic.
 */
export function deriveTestAddresses(
  mnemonic: string = REGTEST.TEST_MNEMONIC
): MockWalletAddresses {
  const btcNetwork = bitcoin.networks.regtest;
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, btcNetwork);

  // BIP84 (native segwit): m/84'/1'/0'/0/0
  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const segwitPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(segwitChild.publicKey),
    network: btcNetwork,
  });

  // BIP86 (taproot): m/86'/1'/0'/0/0
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1);
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network: btcNetwork,
  });

  return {
    taproot: {
      address: taprootPayment.address!,
      publicKey: Buffer.from(taprootChild.publicKey).toString('hex'),
      xOnlyPublicKey: xOnlyPubkey.toString('hex'),
    },
    nativeSegwit: {
      address: segwitPayment.address!,
      publicKey: Buffer.from(segwitChild.publicKey).toString('hex'),
    },
  };
}

/**
 * Sign a PSBT hex string in Node.js using the test mnemonic.
 * Signs with both taproot (BIP86) and segwit (BIP84) keys.
 * Returns the signed PSBT hex (NOT finalized).
 */
function signPsbtInNode(psbtHex: string): string {
  const btcNetwork = bitcoin.networks.regtest;
  const seed = bip39.mnemonicToSeedSync(REGTEST.TEST_MNEMONIC);
  const root = bip32.fromSeed(seed, btcNetwork);

  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: btcNetwork });

  // Sign taproot inputs (BIP86: m/86'/1'/0'/0/0)
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1, 33);
  const tweakedChild = taprootChild.tweak(
    bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
  );

  for (let i = 0; i < psbt.inputCount; i++) {
    try { psbt.signInput(i, tweakedChild); } catch { /* not a taproot input */ }
  }

  // Sign segwit inputs (BIP84: m/84'/1'/0'/0/0)
  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const segwitKeyPair = ECPair.fromPrivateKey(Buffer.from(segwitChild.privateKey!));

  for (let i = 0; i < psbt.inputCount; i++) {
    try { psbt.signInput(i, segwitKeyPair); } catch { /* not a segwit input */ }
  }

  return psbt.toHex();
}

/**
 * Sign a PSBT and return base64 (for wallets that expect base64 format).
 */
function signPsbtInNodeBase64(psbtInput: string, inputFormat: 'hex' | 'base64' = 'hex'): string {
  let psbtHex: string;
  if (inputFormat === 'base64') {
    psbtHex = Buffer.from(psbtInput, 'base64').toString('hex');
  } else {
    psbtHex = psbtInput;
  }
  const signedHex = signPsbtInNode(psbtHex);
  return Buffer.from(signedHex, 'hex').toString('base64');
}

/**
 * Inject a mock browser wallet into a Puppeteer page.
 *
 * Must be called BEFORE page.goto() for evaluateOnNewDocument to take effect.
 */
export async function injectMockWallet(
  page: Page,
  walletId: MockWalletId,
  addresses?: MockWalletAddresses
): Promise<MockWalletAddresses> {
  const addrs = addresses || deriveTestAddresses();

  // Expose Node.js signing functions to the browser page
  // Only expose if not already exposed (avoids errors on page reloads)
  try {
    await page.exposeFunction('__mockSignPsbtHex', (psbtHex: string) => {
      return signPsbtInNode(psbtHex);
    });
  } catch { /* already exposed */ }

  try {
    await page.exposeFunction('__mockSignPsbtBase64', (psbtBase64: string) => {
      return signPsbtInNodeBase64(psbtBase64, 'base64');
    });
  } catch { /* already exposed */ }

  // Inject the mock wallet API
  const injectionScript = buildInjectionScript(walletId, addrs);
  await page.evaluateOnNewDocument(injectionScript);

  return addrs;
}

/**
 * Set localStorage to simulate an already-connected wallet.
 * Call this AFTER page.goto() since localStorage needs a page context.
 */
export async function setWalletLocalStorage(
  page: Page,
  walletId: MockWalletId,
  addresses: MockWalletAddresses
): Promise<void> {
  await page.evaluate(
    (wId: string, addrs: MockWalletAddresses) => {
      localStorage.setItem('subfrost_wallet_type', 'browser');
      localStorage.setItem('subfrost_browser_wallet_id', wId);
      localStorage.setItem(
        'subfrost_browser_wallet_addresses',
        JSON.stringify({
          nativeSegwit: {
            address: addrs.nativeSegwit.address,
            publicKey: addrs.nativeSegwit.publicKey,
          },
          taproot: {
            address: addrs.taproot.address,
            publicKey: addrs.taproot.publicKey,
          },
        })
      );
    },
    walletId,
    addresses
  );
}

/**
 * Build the JavaScript injection code for a specific wallet.
 * This runs in the browser via evaluateOnNewDocument.
 */
function buildInjectionScript(walletId: MockWalletId, addrs: MockWalletAddresses): string {
  const { taproot, nativeSegwit } = addrs;

  // Common helper to make signing calls from the browser
  const signingHelper = `
    async function __mockSign(psbtHex) {
      return await window.__mockSignPsbtHex(psbtHex);
    }
    async function __mockSignBase64(psbtBase64) {
      return await window.__mockSignPsbtBase64(psbtBase64);
    }
  `;

  switch (walletId) {
    case 'xverse':
      return `(function() {
        ${signingHelper}
        window.XverseProviders = {
          BitcoinProvider: {
            request: async function(method, params) {
              console.log('[MockXverse] request:', method);
              if (method === 'getAccounts') {
                return {
                  result: [
                    { address: '${taproot.address}', publicKey: '${taproot.publicKey}', purpose: 'ordinals', addressType: 'p2tr' },
                    { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', purpose: 'payment', addressType: 'p2wpkh' },
                  ]
                };
              }
              if (method === 'getAddresses') {
                return {
                  addresses: [
                    { address: '${taproot.address}', publicKey: '${taproot.publicKey}', purpose: 'ordinals' },
                    { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', purpose: 'payment' },
                  ]
                };
              }
              if (method === 'signPsbt') {
                var psbtBase64 = typeof params === 'string' ? params : (params?.psbt || params);
                var signedBase64 = await __mockSignBase64(psbtBase64);
                return { result: { psbt: signedBase64 } };
              }
              if (method === 'signMessage') {
                return { result: { signature: 'mock-signature-' + Date.now() } };
              }
              throw new Error('MockXverse: unsupported method ' + method);
            }
          }
        };
      })()`;

    case 'oyl':
      return `(function() {
        ${signingHelper}
        window.oyl = {
          getAddresses: async function() {
            console.log('[MockOyl] getAddresses');
            return {
              taproot: { address: '${taproot.address}', publicKey: '${taproot.publicKey}' },
              nativeSegwit: { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}' },
            };
          },
          signPsbt: async function(arg) {
            // SDK OylAdapter passes { psbt: hex, finalize, broadcast } object
            const psbtHex = typeof arg === 'string' ? arg : arg.psbt;
            console.log('[MockOyl] signPsbt, format:', typeof arg);
            const signedHex = await __mockSign(psbtHex);
            return { psbt: signedHex };
          },
          signMessage: async function(message) {
            return 'mock-signature-' + Date.now();
          },
          getNetwork: async function() { return 'regtest'; },
          switchNetwork: async function() { return true; },
        };
      })()`;

    case 'unisat':
      return `(function() {
        ${signingHelper}
        window.unisat = {
          requestAccounts: async function() {
            console.log('[MockUnisat] requestAccounts');
            return ['${nativeSegwit.address}'];
          },
          getAccounts: async function() {
            return ['${nativeSegwit.address}'];
          },
          getPublicKey: async function() {
            return '${nativeSegwit.publicKey}';
          },
          signPsbt: async function(psbtHex, options) {
            console.log('[MockUnisat] signPsbt');
            return await __mockSign(psbtHex);
          },
          signMessage: async function(message) {
            return 'mock-signature-' + Date.now();
          },
          getNetwork: async function() { return 'regtest'; },
          switchNetwork: async function() { return true; },
          getBalance: async function() { return { confirmed: 0, unconfirmed: 0, total: 0 }; },
        };
      })()`;

    case 'okx':
      // WalletContext.tsx line 1191 calls okxProvider.connect() which must return { address, publicKey }
      return `(function() {
        ${signingHelper}
        window.okxwallet = {
          bitcoin: {
            connect: async function() {
              console.log('[MockOkx] connect');
              return { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}' };
            },
            requestAccounts: async function() {
              console.log('[MockOkx] requestAccounts');
              return ['${nativeSegwit.address}'];
            },
            getAccounts: async function() {
              return ['${nativeSegwit.address}'];
            },
            getPublicKey: async function() {
              return '${nativeSegwit.publicKey}';
            },
            signPsbt: async function(psbtHex, options) {
              console.log('[MockOkx] signPsbt');
              return await __mockSign(psbtHex);
            },
            signMessage: async function(message) {
              return 'mock-signature-' + Date.now();
            },
            getNetwork: async function() { return 'regtest'; },
            switchNetwork: async function() { return true; },
          }
        };
        // Also expose at window.okx for injection key detection
        window.okx = window.okxwallet;
      })()`;

    case 'phantom':
      return `(function() {
        ${signingHelper}
        window.phantom = {
          bitcoin: {
            requestAccounts: async function() {
              console.log('[MockPhantom] requestAccounts');
              return [
                { address: '${taproot.address}', publicKey: '${taproot.publicKey}', addressType: 'p2tr' },
              ];
            },
            getAccounts: async function() {
              return [
                { address: '${taproot.address}', publicKey: '${taproot.publicKey}', addressType: 'p2tr' },
              ];
            },
            signPsbt: async function(psbtHex, options) {
              console.log('[MockPhantom] signPsbt');
              return await __mockSign(psbtHex);
            },
            signMessage: async function(message) {
              return 'mock-signature-' + Date.now();
            },
          }
        };
      })()`;

    case 'leather':
      return `(function() {
        ${signingHelper}
        window.LeatherProvider = {
          request: async function(method, params) {
            console.log('[MockLeather] request:', method);
            if (method === 'getAddresses') {
              return {
                result: {
                  addresses: [
                    { address: '${taproot.address}', publicKey: '${taproot.publicKey}', symbol: 'BTC', type: 'p2tr' },
                    { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', symbol: 'BTC', type: 'p2wpkh' },
                  ]
                }
              };
            }
            if (method === 'signPsbt') {
              var psbtHex = typeof params === 'string' ? params : (params?.hex || params?.psbt);
              var signedHex = await __mockSign(psbtHex);
              return { result: { hex: signedHex } };
            }
            if (method === 'signMessage') {
              return { result: { signature: 'mock-signature-' + Date.now() } };
            }
            throw new Error('MockLeather: unsupported method ' + method);
          }
        };
        // Also set on window.leather for injection key detection
        window.leather = window.LeatherProvider;
      })()`;

    case 'magic-eden':
      return `(function() {
        ${signingHelper}
        window.magicEden = {
          bitcoin: {
            connect: async function(token) {
              console.log('[MockMagicEden] connect');
              return {
                addresses: [
                  { address: '${taproot.address}', publicKey: '${taproot.publicKey}', purpose: 'ordinals', addressType: 'p2tr' },
                  { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', purpose: 'payment', addressType: 'p2wpkh' },
                ]
              };
            },
            signPsbt: async function(psbtHex, options) {
              console.log('[MockMagicEden] signPsbt');
              return await __mockSign(psbtHex);
            },
            signMessage: async function(message) {
              return 'mock-signature-' + Date.now();
            },
            getNetwork: async function() { return 'regtest'; },
          }
        };
      })()`;

    case 'orange':
      return `(function() {
        ${signingHelper}
        window.OrangeBitcoinProvider = {
          connect: async function(token) {
            console.log('[MockOrange] connect');
            return {
              addresses: [
                { address: '${taproot.address}', publicKey: '${taproot.publicKey}', purpose: 'ordinals', addressType: 'p2tr' },
                { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', purpose: 'payment', addressType: 'p2wpkh' },
              ]
            };
          },
          signPsbt: async function(psbtHex, options) {
            console.log('[MockOrange] signPsbt');
            return await __mockSign(psbtHex);
          },
          signMessage: async function(message) {
            return 'mock-signature-' + Date.now();
          },
        };
        // Also set the nested variant for detection
        window.OrangeWalletProviders = { OrangeBitcoinProvider: window.OrangeBitcoinProvider };
        window.OrangecryptoProviders = { BitcoinProvider: window.OrangeBitcoinProvider };
      })()`;

    case 'tokeo':
      return `(function() {
        ${signingHelper}
        window.tokeo = {
          bitcoin: {
            requestAccounts: async function() {
              console.log('[MockTokeo] requestAccounts');
              return ['${taproot.address}'];
            },
            getAccounts: async function() {
              return {
                accounts: [
                  { address: '${taproot.address}', publicKey: '${taproot.publicKey}', type: 'p2tr' },
                  { address: '${nativeSegwit.address}', publicKey: '${nativeSegwit.publicKey}', type: 'p2wpkh' },
                ]
              };
            },
            signPsbt: async function(psbtHex, options) {
              console.log('[MockTokeo] signPsbt');
              return await __mockSign(psbtHex);
            },
            signMessage: async function(message) {
              return 'mock-signature-' + Date.now();
            },
          }
        };
      })()`;

    case 'wizz':
      return `(function() {
        ${signingHelper}
        window.wizz = {
          requestAccounts: async function() {
            console.log('[MockWizz] requestAccounts');
            return ['${nativeSegwit.address}'];
          },
          getAccounts: async function() {
            return ['${nativeSegwit.address}'];
          },
          getPublicKey: async function() {
            return '${nativeSegwit.publicKey}';
          },
          signPsbt: async function(psbtHex, options) {
            console.log('[MockWizz] signPsbt');
            return await __mockSign(psbtHex);
          },
          signMessage: async function(message) {
            return 'mock-signature-' + Date.now();
          },
          getNetwork: async function() { return 'regtest'; },
          switchNetwork: async function() { return true; },
        };
      })()`;

    case 'keplr':
      return `(function() {
        ${signingHelper}
        window.keplr = {
          bitcoin: {
            requestAccounts: async function() {
              console.log('[MockKeplr] requestAccounts');
              return ['${taproot.address}'];
            },
            getAccounts: async function() {
              return ['${taproot.address}'];
            },
            getPublicKey: async function() {
              return '${taproot.publicKey}';
            },
            signPsbt: async function(psbtHex, options) {
              console.log('[MockKeplr] signPsbt');
              return await __mockSign(psbtHex);
            },
            signMessage: async function(message) {
              return 'mock-signature-' + Date.now();
            },
          }
        };
        // Also expose at window.bitcoin_keplr
        window.bitcoin_keplr = window.keplr.bitcoin;
      })()`;

    default:
      throw new Error(`Unsupported mock wallet: ${walletId}`);
  }
}
