/**
 * BRC20-Prog devnet test helpers.
 *
 * Creates a DevnetTestHarness with brc20shrew loaded as a tertiary indexer
 * alongside the standard alkanes indexer. Follows the pattern from
 * ~/subfrost-app/__tests__/devnet/devnet-helpers.ts.
 */

import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';

import {
  BRC20_PROG,
  loadAlkanesWasm,
  loadBrc20ShrewWasm,
} from './brc20-prog-constants';
import {
  createTestSigner,
  TEST_MNEMONIC,
  type TestSignerResult,
} from '../sdk/test-utils/createTestSigner';
import { resolve } from 'path';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const bip32 = BIP32Factory(ecc);
let _harness: any = null;

function deriveSecretKeyFromMnemonic(mnemonic: string): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/84'/1'/0'/0/0");
  if (!child.privateKey) throw new Error('Failed to derive private key');
  return new Uint8Array(child.privateKey);
}

/**
 * Create or return the shared DevnetTestHarness singleton
 * with brc20shrew loaded as a tertiary indexer.
 */
export async function getOrCreateBrc20Harness(): Promise<any> {
  if (_harness) return _harness;

  const alkanesWasm = loadAlkanesWasm();
  if (!alkanesWasm) {
    throw new Error(
      'alkanes indexer WASM not found. Check ~/.local/qubitcoin/indexers/alkanes/program.wasm'
    );
  }

  const brc20ShrewWasm = loadBrc20ShrewWasm();

  const secretKey = deriveSecretKeyFromMnemonic(BRC20_PROG.TEST_MNEMONIC);
  const home = process.env.HOME || '/home/ubuntu';
  const luaScriptsDir = resolve(home, 'alkanes-rs/lua');

  // Load brc20shrew as a tertiary indexer.
  // Note: brc20shrew conceptually IS a secondary (indexes blocks directly),
  // but the vendored qubitcoin SDK's dist/devnet-server.js only exposes
  // tertiaryIndexers, not additionalSecondaries. The tertiary runtime
  // provides the same host functions so it works correctly.
  const tertiaryIndexers: Array<{ label: string; wasm: Uint8Array }> = [];
  if (brc20ShrewWasm) {
    tertiaryIndexers.push({ label: 'brc20shrew', wasm: brc20ShrewWasm });
  }

  const sdk = await import('@qubitcoin/sdk');
  _harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    tertiaryIndexers: tertiaryIndexers.length > 0 ? tertiaryIndexers : undefined,
    secretKey,
    luaScriptsDir,
  });

  return _harness;
}

/**
 * Dispose the shared harness (call in afterAll).
 */
export function disposeBrc20Harness(): void {
  if (_harness) {
    _harness.dispose();
    _harness = null;
  }
}

/**
 * Create a WebProvider configured for the devnet with fetch interceptor active.
 */
export async function createBrc20DevnetProvider(): Promise<WebProvider> {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  const provider = new wasm.WebProvider(BRC20_PROG.PROVIDER_NETWORK, {
    jsonrpc_url: BRC20_PROG.RPC_URL,
    data_api_url: BRC20_PROG.RPC_URL,
    qubitcoin_rpc_url: BRC20_PROG.RPC_URL, // Enable qubitcoin mode for brc20-prog routing
  });

  provider.walletLoadMnemonic(TEST_MNEMONIC, null);
  return provider;
}

/**
 * Full test context: harness + provider + signer + addresses.
 */
export async function createBrc20DevnetContext(): Promise<{
  harness: any;
  provider: WebProvider;
  signer: TestSignerResult;
  taprootAddress: string;
  segwitAddress: string;
}> {
  const harness = await getOrCreateBrc20Harness();
  harness.installFetchInterceptor();

  const provider = await createBrc20DevnetProvider();
  const signer = await createTestSigner(TEST_MNEMONIC, 'subfrost-regtest');

  return {
    harness,
    provider,
    signer,
    taprootAddress: signer.addresses.taproot.address,
    segwitAddress: signer.addresses.nativeSegwit.address,
  };
}

/**
 * Mine blocks on the devnet (auto-indexed, no waiting needed).
 */
export async function mineBlocks(
  harness: any,
  count: number,
): Promise<void> {
  try {
    harness.mineBlocks(count);
  } catch (e: any) {
    console.error(`[brc20-helpers] mineBlocks(${count}) error:`, e?.message || String(e));
    throw e;
  }
}
