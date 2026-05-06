/**
 * Vitest Mock Wallet Framework
 *
 * Provides mock browser wallet APIs for testing signing flows directly in
 * Node.js vitest environment — no Puppeteer required.
 *
 * Unlike mock-wallet-factory.ts which injects mocks via page.exposeFunction()
 * and page.evaluateOnNewDocument(), this module assigns mock APIs directly to
 * globalThis (which is aliased to window in __tests__/setup.ts).
 *
 * Signing uses real BIP32 key derivation and bitcoinjs-lib PSBT signing,
 * so signed PSBTs are cryptographically valid for regtest.
 *
 * Supported wallets (11):
 *   oyl, xverse, unisat, okx, phantom, leather, magic-eden, orange, tokeo, wizz, keplr
 *
 * Usage:
 *   const addrs = installMockWallet('oyl');
 *   // ... test code that calls window.oyl.signPsbt() ...
 *   uninstallMockWallet('oyl');
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';
import { REGTEST } from '../shared/regtest-constants';

// Initialize ECC
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
try {
  bitcoin.initEccLib(ecc);
} catch {
  /* already initialized */
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockWalletId =
  | 'oyl'
  | 'xverse'
  | 'unisat'
  | 'okx'
  | 'phantom'
  | 'leather'
  | 'magic-eden'
  | 'orange'
  | 'tokeo'
  | 'wizz'
  | 'keplr';

export const ALL_WALLET_IDS: MockWalletId[] = [
  'oyl',
  'xverse',
  'unisat',
  'okx',
  'phantom',
  'leather',
  'magic-eden',
  'orange',
  'tokeo',
  'wizz',
  'keplr',
];

export interface MockWalletAddresses {
  taproot: { address: string; publicKey: string; xOnlyPublicKey: string };
  nativeSegwit: { address: string; publicKey: string };
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Derive test wallet addresses from a BIP39 mnemonic.
 * BIP86 m/86'/1'/0'/0/0 for taproot, BIP84 m/84'/1'/0'/0/0 for segwit.
 */
export function deriveTestAddresses(
  mnemonic: string = REGTEST.TEST_MNEMONIC
): MockWalletAddresses {
  const network = bitcoin.networks.regtest;
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);

  // BIP84 native segwit
  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const segwitPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(segwitChild.publicKey),
    network,
  });

  // BIP86 taproot
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1);
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network,
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

// ---------------------------------------------------------------------------
// PSBT signing (Node.js, no browser bridge needed)
// ---------------------------------------------------------------------------

/**
 * Sign a PSBT hex string using the test mnemonic.
 * Attempts to sign every input with both the taproot (tweaked BIP86) key
 * and the segwit (BIP84) key, silently skipping mismatches.
 * Returns signed (NOT finalized) PSBT hex.
 */
function signPsbtInNode(
  psbtHex: string,
  mnemonic: string = REGTEST.TEST_MNEMONIC
): string {
  const network = bitcoin.networks.regtest;
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network });

  // Taproot key (BIP86 m/86'/1'/0'/0/0, tweaked)
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1, 33);
  const tweakedChild = taprootChild.tweak(
    bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
  );

  for (let i = 0; i < psbt.inputCount; i++) {
    try {
      psbt.signInput(i, tweakedChild);
    } catch {
      /* not a taproot input for this key */
    }
  }

  // Segwit key (BIP84 m/84'/1'/0'/0/0)
  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const segwitKeyPair = ECPair.fromPrivateKey(
    Buffer.from(segwitChild.privateKey!)
  );

  for (let i = 0; i < psbt.inputCount; i++) {
    try {
      psbt.signInput(i, segwitKeyPair);
    } catch {
      /* not a segwit input for this key */
    }
  }

  return psbt.toHex();
}

/**
 * Sign a PSBT provided as base64, returning base64.
 */
function signPsbtBase64(
  psbtBase64: string,
  mnemonic: string = REGTEST.TEST_MNEMONIC
): string {
  const psbtHex = Buffer.from(psbtBase64, 'base64').toString('hex');
  const signedHex = signPsbtInNode(psbtHex, mnemonic);
  return Buffer.from(signedHex, 'hex').toString('base64');
}

// ---------------------------------------------------------------------------
// Wallet API builders
// ---------------------------------------------------------------------------

/**
 * Each builder returns the object(s) to assign to globalThis and the
 * property keys to clean up on uninstall.
 */
type WalletInstaller = (
  addrs: MockWalletAddresses,
  mnemonic: string
) => { assignments: Record<string, unknown> };

const walletInstallers: Record<MockWalletId, WalletInstaller> = {
  // -----------------------------------------------------------------------
  // PRIMARY WALLETS (4)
  // -----------------------------------------------------------------------

  oyl: (addrs, mnemonic) => ({
    assignments: {
      oyl: {
        getAddresses: async () => ({
          taproot: {
            address: addrs.taproot.address,
            publicKey: addrs.taproot.publicKey,
          },
          nativeSegwit: {
            address: addrs.nativeSegwit.address,
            publicKey: addrs.nativeSegwit.publicKey,
          },
        }),
        signPsbt: async (arg: unknown) => {
          // OylAdapter passes { psbt: hex, finalize, broadcast } or bare hex
          const psbtHex =
            typeof arg === 'string'
              ? arg
              : (arg as { psbt: string }).psbt;
          const signedHex = signPsbtInNode(psbtHex, mnemonic);
          return { psbt: signedHex };
        },
        signMessage: async (_msg: string) =>
          'mock-oyl-signature-' + Date.now(),
        getNetwork: async () => 'regtest',
        isConnected: async () => true,
        disconnect: async () => {},
        getBalance: async () => ({
          confirmed: 0,
          unconfirmed: 0,
          total: 0,
        }),
        pushPsbt: async (_hex: string) => 'mock-txid-' + Date.now(),
        switchNetwork: async () => true,
      },
    },
  }),

  xverse: (addrs, mnemonic) => ({
    assignments: {
      XverseProviders: {
        BitcoinProvider: {
          request: async (method: string, params?: unknown) => {
            if (method === 'getAccounts') {
              return {
                result: [
                  {
                    address: addrs.taproot.address,
                    publicKey: addrs.taproot.publicKey,
                    purpose: 'ordinals',
                    addressType: 'p2tr',
                  },
                  {
                    address: addrs.nativeSegwit.address,
                    publicKey: addrs.nativeSegwit.publicKey,
                    purpose: 'payment',
                    addressType: 'p2wpkh',
                  },
                ],
              };
            }
            if (method === 'getAddresses') {
              return {
                result: {
                  addresses: [
                    {
                      address: addrs.taproot.address,
                      publicKey: addrs.taproot.publicKey,
                      purpose: 'ordinals',
                    },
                    {
                      address: addrs.nativeSegwit.address,
                      publicKey: addrs.nativeSegwit.publicKey,
                      purpose: 'payment',
                    },
                  ],
                },
              };
            }
            if (method === 'signPsbt') {
              const p = params as
                | string
                | { psbt?: string; signInputs?: unknown; broadcast?: boolean };
              const psbtBase64 =
                typeof p === 'string' ? p : p?.psbt || '';
              const signedBase64 = signPsbtBase64(psbtBase64, mnemonic);
              return { result: { psbt: signedBase64 } };
            }
            if (method === 'signMessage') {
              return {
                result: {
                  signature: 'mock-xverse-signature-' + Date.now(),
                },
              };
            }
            throw new Error(
              'MockXverse: unsupported method ' + method
            );
          },
        },
      },
    },
  }),

  unisat: (addrs, mnemonic) => ({
    assignments: {
      unisat: {
        requestAccounts: async () => [addrs.taproot.address],
        getAccounts: async () => [addrs.taproot.address],
        getPublicKey: async () => addrs.taproot.publicKey,
        signPsbt: async (
          psbtHex: string,
          _options?: {
            autoFinalized?: boolean;
            toSignInputs?: { index: number; address?: string }[];
          }
        ) => signPsbtInNode(psbtHex, mnemonic),
        signPsbts: async (
          psbtHexArr: string[],
          _options?: {
            autoFinalized?: boolean;
            toSignInputs?: { index: number; address?: string }[];
          }
        ) => psbtHexArr.map((hex) => signPsbtInNode(hex, mnemonic)),
        signMessage: async (_msg: string) =>
          'mock-unisat-signature-' + Date.now(),
        getNetwork: async () => 'regtest',
        switchNetwork: async (_network: string) => {},
        getBalance: async () => ({
          confirmed: 0,
          unconfirmed: 0,
          total: 0,
        }),
      },
    },
  }),

  okx: (addrs, mnemonic) => {
    const bitcoinApi = {
      connect: async () => ({
        address: addrs.taproot.address,
        publicKey: addrs.taproot.publicKey,
      }),
      requestAccounts: async () => [addrs.taproot.address],
      getAccounts: async () => [addrs.taproot.address],
      getPublicKey: async () => addrs.taproot.publicKey,
      signPsbt: async (
        psbtHex: string,
        _options?: { auto_finalized?: boolean }
      ) => signPsbtInNode(psbtHex, mnemonic),
      signMessage: async (_msg: string) =>
        'mock-okx-signature-' + Date.now(),
      getNetwork: async () => 'regtest',
      switchNetwork: async (_network: string) => {},
    };
    return {
      assignments: {
        okxwallet: { bitcoin: bitcoinApi },
        okx: { bitcoin: bitcoinApi },
      },
    };
  },

  // -----------------------------------------------------------------------
  // SECONDARY WALLETS (7)
  // -----------------------------------------------------------------------

  phantom: (addrs, mnemonic) => ({
    assignments: {
      phantom: {
        bitcoin: {
          requestAccounts: async () => [
            {
              address: addrs.taproot.address,
              publicKey: addrs.taproot.publicKey,
              addressType: 'p2tr',
            },
          ],
          getAccounts: async () => [
            {
              address: addrs.taproot.address,
              publicKey: addrs.taproot.publicKey,
              addressType: 'p2tr',
            },
          ],
          signPsbt: async (psbtHex: string, _options?: unknown) =>
            signPsbtInNode(psbtHex, mnemonic),
          signMessage: async (_msg: string) =>
            'mock-phantom-signature-' + Date.now(),
        },
      },
    },
  }),

  leather: (addrs, mnemonic) => {
    const provider = {
      request: async (method: string, params?: unknown) => {
        if (method === 'getAddresses') {
          return {
            result: {
              addresses: [
                {
                  address: addrs.taproot.address,
                  publicKey: addrs.taproot.publicKey,
                  symbol: 'BTC',
                  type: 'p2tr',
                },
                {
                  address: addrs.nativeSegwit.address,
                  publicKey: addrs.nativeSegwit.publicKey,
                  symbol: 'BTC',
                  type: 'p2wpkh',
                },
              ],
            },
          };
        }
        if (method === 'signPsbt') {
          const p = params as
            | string
            | { hex?: string; psbt?: string };
          const psbtHex =
            typeof p === 'string' ? p : p?.hex || p?.psbt || '';
          const signedHex = signPsbtInNode(psbtHex, mnemonic);
          return { result: { hex: signedHex } };
        }
        if (method === 'signMessage') {
          return {
            result: {
              signature: 'mock-leather-signature-' + Date.now(),
            },
          };
        }
        throw new Error('MockLeather: unsupported method ' + method);
      },
    };
    return {
      assignments: {
        LeatherProvider: provider,
        leather: provider,
      },
    };
  },

  'magic-eden': (addrs, mnemonic) => ({
    assignments: {
      magicEden: {
        bitcoin: {
          connect: async (_token?: string) => ({
            addresses: [
              {
                address: addrs.taproot.address,
                publicKey: addrs.taproot.publicKey,
                purpose: 'ordinals',
                addressType: 'p2tr',
              },
              {
                address: addrs.nativeSegwit.address,
                publicKey: addrs.nativeSegwit.publicKey,
                purpose: 'payment',
                addressType: 'p2wpkh',
              },
            ],
          }),
          signPsbt: async (psbtHex: string, _options?: unknown) =>
            signPsbtInNode(psbtHex, mnemonic),
          signMessage: async (_msg: string) =>
            'mock-magiceden-signature-' + Date.now(),
          getNetwork: async () => 'regtest',
        },
      },
    },
  }),

  orange: (addrs, mnemonic) => {
    const provider = {
      connect: async (_token?: string) => ({
        addresses: [
          {
            address: addrs.taproot.address,
            publicKey: addrs.taproot.publicKey,
            purpose: 'ordinals',
            addressType: 'p2tr',
          },
          {
            address: addrs.nativeSegwit.address,
            publicKey: addrs.nativeSegwit.publicKey,
            purpose: 'payment',
            addressType: 'p2wpkh',
          },
        ],
      }),
      signPsbt: async (psbtHex: string, _options?: unknown) =>
        signPsbtInNode(psbtHex, mnemonic),
      signMessage: async (_msg: string) =>
        'mock-orange-signature-' + Date.now(),
    };
    return {
      assignments: {
        OrangeBitcoinProvider: provider,
        OrangeWalletProviders: { OrangeBitcoinProvider: provider },
        OrangecryptoProviders: { BitcoinProvider: provider },
      },
    };
  },

  tokeo: (addrs, mnemonic) => ({
    assignments: {
      tokeo: {
        bitcoin: {
          requestAccounts: async () => [addrs.taproot.address],
          getAccounts: async () => ({
            accounts: [
              {
                address: addrs.taproot.address,
                publicKey: addrs.taproot.publicKey,
                type: 'p2tr',
              },
              {
                address: addrs.nativeSegwit.address,
                publicKey: addrs.nativeSegwit.publicKey,
                type: 'p2wpkh',
              },
            ],
          }),
          signPsbt: async (psbtHex: string, _options?: unknown) =>
            signPsbtInNode(psbtHex, mnemonic),
          signMessage: async (_msg: string) =>
            'mock-tokeo-signature-' + Date.now(),
        },
      },
    },
  }),

  wizz: (addrs, mnemonic) => ({
    assignments: {
      wizz: {
        requestAccounts: async () => [addrs.nativeSegwit.address],
        getAccounts: async () => [addrs.nativeSegwit.address],
        getPublicKey: async () => addrs.nativeSegwit.publicKey,
        signPsbt: async (psbtHex: string, _options?: unknown) =>
          signPsbtInNode(psbtHex, mnemonic),
        signMessage: async (_msg: string) =>
          'mock-wizz-signature-' + Date.now(),
        getNetwork: async () => 'regtest',
        switchNetwork: async (_network: string) => {},
      },
    },
  }),

  keplr: (addrs, mnemonic) => {
    const bitcoinApi = {
      requestAccounts: async () => [addrs.taproot.address],
      getAccounts: async () => [addrs.taproot.address],
      getPublicKey: async () => addrs.taproot.publicKey,
      signPsbt: async (psbtHex: string, _options?: unknown) =>
        signPsbtInNode(psbtHex, mnemonic),
      signMessage: async (_msg: string) =>
        'mock-keplr-signature-' + Date.now(),
    };
    return {
      assignments: {
        keplr: { bitcoin: bitcoinApi },
        bitcoin_keplr: bitcoinApi,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Track installed keys per wallet for clean uninstall
// ---------------------------------------------------------------------------

const installedKeys = new Map<MockWalletId, string[]>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install a mock browser wallet on globalThis (visible as window.* in tests).
 *
 * @param walletId  - One of the 11 supported wallet IDs
 * @param mnemonic  - BIP39 mnemonic (defaults to standard test mnemonic)
 * @returns Derived addresses for the test wallet
 */
export function installMockWallet(
  walletId: MockWalletId,
  mnemonic: string = REGTEST.TEST_MNEMONIC
): MockWalletAddresses {
  const installer = walletInstallers[walletId];
  if (!installer) {
    throw new Error(`Unsupported mock wallet: ${walletId}`);
  }

  const addrs = deriveTestAddresses(mnemonic);
  const { assignments } = installer(addrs, mnemonic);

  const keys = Object.keys(assignments);
  for (const key of keys) {
    (globalThis as any)[key] = assignments[key];
    // Also assign on window if it exists (setup.ts creates globalThis.window)
    if ((globalThis as any).window && typeof (globalThis as any).window === 'object') {
      (globalThis as any).window[key] = assignments[key];
    }
  }

  installedKeys.set(walletId, keys);
  return addrs;
}

/**
 * Remove a previously installed mock wallet from globalThis.
 */
export function uninstallMockWallet(walletId: MockWalletId): void {
  const keys = installedKeys.get(walletId);
  if (!keys) return;

  for (const key of keys) {
    delete (globalThis as any)[key];
    if ((globalThis as any).window && typeof (globalThis as any).window === 'object') {
      delete (globalThis as any).window[key];
    }
  }

  installedKeys.delete(walletId);
}

// ---------------------------------------------------------------------------
// Exported internals for advanced test scenarios
// ---------------------------------------------------------------------------

export { signPsbtInNode, signPsbtBase64, deriveTestAddresses as deriveAddresses };
