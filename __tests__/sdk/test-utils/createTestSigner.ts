/**
 * Test Signer Utility
 *
 * Creates a test-compatible signer using the same AlkanesWallet from @alkanes/ts-sdk
 * that the app uses. This allows us to test the actual code paths without needing
 * browser context or wallet extensions.
 *
 * WORKAROUND: The ts-sdk bundles its own copy of bitcoinjs-lib which has an
 * uninitialized ecc library in vitest environment. We work around this by:
 * 1. Using our own bitcoinjs-lib (with ecc initialized) for address derivation
 * 2. Using ts-sdk's wallet for key derivation and signing
 *
 * Usage:
 *   const { signer, wallet, account, getUtxos } = await createTestSigner(mnemonic, network);
 *   const result = await executeWithBtcWrapUnwrap({
 *     utxos: await getUtxos(),
 *     calldata,
 *     feeRate: 10,
 *     account,
 *     provider,
 *     signer,
 *     frbtcWrapAmount: 10000,
 *   });
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import BIP32Factory from 'bip32';
import * as bip39 from 'bip39';

// Initialize ECC library - must be done before using bitcoinjs-lib
// Note: @alkanes/ts-sdk bundles its own copy which may not be initialized in vitest
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Check if already initialized (some versions of bitcoinjs-lib throw if called twice)
try {
  bitcoin.initEccLib(ecc);
} catch (e) {
  // Already initialized - ignore
}

// Network mapping
export const NetworkMap: Record<string, bitcoin.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet,
  regtest: bitcoin.networks.regtest,
  'subfrost-regtest': bitcoin.networks.regtest,
  oylnet: bitcoin.networks.regtest,
};

// SDK network mapping
export function toSdkNetwork(network: string): 'mainnet' | 'testnet' | 'regtest' {
  switch (network) {
    case 'mainnet':
      return 'mainnet';
    case 'testnet':
    case 'signet':
      return 'testnet';
    case 'regtest':
    case 'subfrost-regtest':
    case 'oylnet':
      return 'regtest';
    default:
      return 'mainnet';
  }
}

export type TestAccount = {
  taproot?: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
  nativeSegwit?: { address: string; pubkey: string; hdPath: string };
  spendStrategy: { addressOrder: string[]; utxoSortGreatestToLeast: boolean; changeAddress: string };
  network: bitcoin.Network;
};

export type FormattedUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: any[];
  runes: any[];
  alkanes: Record<string, { value: string; name: string; symbol: string }>;
  indexed: boolean;
  confirmations: number;
};

export type TestSignerResult = {
  signer: {
    signAllInputs: (params: { rawPsbtHex: string }) => Promise<{ signedPsbt: string; signedHexPsbt: string }>;
    signAllInputsMultiplePsbts: (params: {
      rawPsbts?: string[];
      rawPsbtsHex?: string[];
    }) => Promise<{ signedPsbt: string; signedHexPsbt: string }[]>;
    taprootKeyPair: ReturnType<typeof ECPair.makeRandom>;
  };
  wallet: any; // AlkanesWallet
  account: TestAccount;
  addresses: {
    taproot: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
    nativeSegwit: { address: string; pubkey: string; hdPath: string };
  };
  getUtxos: (provider: any) => Promise<FormattedUtxo[]>;
  mnemonic: string;
};

/**
 * Derive address using our own bitcoinjs-lib (with ecc initialized)
 * This works around the ts-sdk bundled bitcoinjs-lib ecc initialization issue
 */
function deriveAddressFromNode(
  accountNode: ReturnType<typeof bip32.fromSeed>,
  addressType: 'p2wpkh' | 'p2tr',
  change: number,
  index: number,
  btcNetwork: bitcoin.Network
): { address: string; pubkey: string; pubKeyXOnly?: string; path: string } {
  const childNode = accountNode.derive(change).derive(index);
  const pubkey = Buffer.from(childNode.publicKey);

  if (addressType === 'p2wpkh') {
    const payment = bitcoin.payments.p2wpkh({ pubkey, network: btcNetwork });
    return {
      address: payment.address!,
      pubkey: pubkey.toString('hex'),
      path: `m/84'/${btcNetwork === bitcoin.networks.bitcoin ? 0 : 1}'/0'/${change}/${index}`,
    };
  } else {
    // p2tr - use x-only pubkey (remove the prefix byte)
    const xOnlyPubkey = pubkey.slice(1); // Remove 02/03 prefix
    const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: btcNetwork });
    return {
      address: payment.address!,
      pubkey: pubkey.toString('hex'),
      pubKeyXOnly: xOnlyPubkey.toString('hex'),
      path: `m/86'/${btcNetwork === bitcoin.networks.bitcoin ? 0 : 1}'/0'/${change}/${index}`,
    };
  }
}

/**
 * Creates a test signer that mimics the app's useSignerShim hook
 * but works without React context.
 */
export async function createTestSigner(
  mnemonic: string,
  network: string = 'regtest'
): Promise<TestSignerResult> {
  // Import ts-sdk for wallet/signing functionality
  const sdk = await import('@alkanes/ts-sdk');
  const { createWalletFromMnemonic } = sdk;

  const btcNetwork = NetworkMap[network] || bitcoin.networks.regtest;
  const sdkNetwork = toSdkNetwork(network);

  // Create wallet from mnemonic using ts-sdk (for signing)
  const wallet = createWalletFromMnemonic(mnemonic, sdkNetwork);

  // WORKAROUND: ts-sdk's bundled bitcoinjs-lib has uninitialized ecc in vitest
  // We use our own bip32/bitcoinjs-lib for address derivation
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, btcNetwork);

  // Derive account node (BIP84 for native segwit, BIP86 for taproot)
  const coinType = btcNetwork === bitcoin.networks.bitcoin ? 0 : 1;
  const segwitAccountPath = `m/84'/${coinType}'/0'`;
  const taprootAccountPath = `m/86'/${coinType}'/0'`;

  const segwitAccountNode = root.derivePath(segwitAccountPath);
  const taprootAccountNode = root.derivePath(taprootAccountPath);

  // Derive addresses using our own bitcoinjs-lib (with ecc initialized)
  const segwitInfo = deriveAddressFromNode(segwitAccountNode, 'p2wpkh', 0, 0, btcNetwork);
  const taprootInfo = deriveAddressFromNode(taprootAccountNode, 'p2tr', 0, 0, btcNetwork);

  const addresses = {
    nativeSegwit: {
      address: segwitInfo.address,
      pubkey: segwitInfo.pubkey,
      hdPath: segwitInfo.path,
    },
    taproot: {
      address: taprootInfo.address,
      pubkey: taprootInfo.pubkey,
      pubKeyXOnly: taprootInfo.pubKeyXOnly || taprootInfo.pubkey.slice(2),
      hdPath: taprootInfo.path,
    },
  };

  // Build account structure (same as WalletContext)
  const account: TestAccount = {
    nativeSegwit: addresses.nativeSegwit.address ? addresses.nativeSegwit : undefined,
    taproot: addresses.taproot.address ? addresses.taproot : undefined,
    spendStrategy: {
      addressOrder: ['nativeSegwit', 'taproot'],
      utxoSortGreatestToLeast: true,
      changeAddress: 'nativeSegwit',
    },
    network: btcNetwork,
  };

  // Helper to finalize PSBT (same as useSignerShim)
  const finalizePsbt = (signedPsbtBase64: string | undefined) => {
    if (!signedPsbtBase64) throw new Error('Failed to sign PSBT');
    const psbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (!input) throw new Error('input is undefined');
      if (input.finalScriptWitness || input.finalScriptSig) continue;
      psbt.finalizeInput(i);
    }
    return { signedPsbt: psbt.toBase64(), signedHexPsbt: psbt.toHex() };
  };

  // Create signer shim (same interface as useSignerShim)
  const signer = {
    signAllInputs: async ({ rawPsbtHex }: { rawPsbtHex: string }) => {
      // Convert hex to base64 for wallet.signPsbt
      const psbtBase64 = Buffer.from(rawPsbtHex, 'hex').toString('base64');
      const signedPsbt = await wallet.signPsbt(psbtBase64);
      return finalizePsbt(signedPsbt);
    },
    signAllInputsMultiplePsbts: async ({
      rawPsbts,
      rawPsbtsHex,
    }: {
      rawPsbts?: string[];
      rawPsbtsHex?: string[];
    }) => {
      if (!rawPsbtsHex) {
        if (!rawPsbts) throw new Error('Either rawPsbts or rawPsbtsHex must be provided');
        rawPsbtsHex = rawPsbts.map((psbt) => Buffer.from(psbt, 'base64').toString('hex'));
      }
      const results = await Promise.all(
        rawPsbtsHex.map(async (hex) => {
          const psbtBase64 = Buffer.from(hex, 'hex').toString('base64');
          const signedPsbt = await wallet.signPsbt(psbtBase64);
          return finalizePsbt(signedPsbt);
        })
      );
      return results;
    },
    taprootKeyPair: ECPair.makeRandom({ network: btcNetwork }),
  };

  // Helper to get UTXOs from provider (same pattern as WalletContext)
  const getUtxos = async (provider: any): Promise<FormattedUtxo[]> => {
    const utxos: FormattedUtxo[] = [];

    // Fetch UTXOs for native segwit address
    if (addresses.nativeSegwit.address) {
      try {
        const enriched = await provider.getEnrichedBalances(addresses.nativeSegwit.address, '1');
        if (enriched) {
          const allUtxos = [
            ...(enriched.spendable || []),
            ...(enriched.assets || []),
            ...(enriched.pending || []),
          ];
          for (const utxo of allUtxos) {
            utxos.push({
              txId: utxo.txid || '',
              outputIndex: utxo.vout || 0,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: addresses.nativeSegwit.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.status?.confirmed ? 1 : 0,
            });
          }
        }
      } catch (error) {
        console.error('[TestSigner] Error fetching nativeSegwit UTXOs:', error);
      }
    }

    // Fetch UTXOs for taproot address
    if (addresses.taproot.address) {
      try {
        const enriched = await provider.getEnrichedBalances(addresses.taproot.address, '1');
        if (enriched) {
          const allUtxos = [
            ...(enriched.spendable || []),
            ...(enriched.assets || []),
            ...(enriched.pending || []),
          ];
          for (const utxo of allUtxos) {
            utxos.push({
              txId: utxo.txid || '',
              outputIndex: utxo.vout || 0,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: addresses.taproot.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.status?.confirmed ? 1 : 0,
            });
          }
        }
      } catch (error) {
        console.error('[TestSigner] Error fetching taproot UTXOs:', error);
      }
    }

    // Sort by value (descending)
    utxos.sort((a, b) => b.satoshis - a.satoshis);

    return utxos;
  };

  return {
    signer,
    wallet,
    account,
    addresses,
    getUtxos,
    mnemonic,
  };
}

/**
 * Standard test mnemonic for regtest
 * WARNING: DO NOT use on mainnet!
 */
export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Generate a random mnemonic for testing
 */
export async function generateTestMnemonic(): Promise<string> {
  const { KeystoreManager } = await import('@alkanes/ts-sdk');
  const manager = new KeystoreManager();
  // The manager should have a way to generate mnemonics, or we use createKeystore
  const { createKeystore } = await import('@alkanes/ts-sdk');
  const { mnemonic } = await createKeystore('test-password', { network: 'regtest' });
  return mnemonic;
}
