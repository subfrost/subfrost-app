/**
 * Devnet helper utilities for in-process integration tests.
 *
 * Mirror of regtest-helpers.ts but using DevnetTestHarness instead of
 * external infrastructure. No network, no Docker, no INTEGRATION=true.
 */

import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';

import { DEVNET, loadIndexerWasm } from './devnet-constants';
import {
  createTestSigner,
  TEST_MNEMONIC,
  type TestSignerResult,
} from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const bip32 = BIP32Factory(ecc);

// We import DevnetTestHarness dynamically since the WASM must be loaded async
let _harness: any = null;

/**
 * Derive the coinbase private key from the test mnemonic.
 *
 * Uses BIP84 (native segwit) derivation path m/84'/1'/0'/0/0 so the
 * devnet's coinbase UTXOs are spendable by the SDK wallet.
 */
function deriveSecretKeyFromMnemonic(mnemonic: string): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  // Use m/84'/1'/0'/0/0 (BIP84 regtest native segwit)
  const child = root.derivePath("m/84'/1'/0'/0/0");
  if (!child.privateKey) throw new Error('Failed to derive private key');
  return new Uint8Array(child.privateKey);
}

/**
 * Create or return the shared DevnetTestHarness singleton.
 *
 * The harness is created once and reused across all tests in a suite.
 * Call dispose() in afterAll() to clean up.
 */
export async function getOrCreateHarness(): Promise<any> {
  if (_harness) return _harness;

  const alkanesWasm = loadIndexerWasm('alkanes');
  if (!alkanesWasm) {
    throw new Error(
      'alkanes indexer WASM not found. Expected at ~/.local/qubitcoin/indexers/alkanes/program.wasm'
    );
  }

  const esploraWasm = loadIndexerWasm('esplora');

  // Derive the coinbase key from the test mnemonic so the devnet mines
  // to the same address the SDK wallet controls.
  const secretKey = deriveSecretKeyFromMnemonic(DEVNET.TEST_MNEMONIC);

  // Dynamic import of the qubitcoin SDK
  const sdk = await import('@qubitcoin/sdk');
  _harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    esploraWasm: esploraWasm ?? undefined,
    secretKey,
  });

  return _harness;
}

/**
 * Dispose the shared harness (call in afterAll).
 */
export function disposeHarness(): void {
  if (_harness) {
    _harness.dispose();
    _harness = null;
  }
}

/**
 * Create a WebProvider configured for the devnet with fetch interceptor active.
 */
export async function createDevnetProvider(): Promise<WebProvider> {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  const provider = new wasm.WebProvider(DEVNET.PROVIDER_NETWORK, {
    jsonrpc_url: DEVNET.RPC_URL,
    data_api_url: DEVNET.RPC_URL,
  });

  provider.walletLoadMnemonic(TEST_MNEMONIC, null);
  return provider;
}

/**
 * Create provider + signer bundle for devnet tests.
 */
export async function createDevnetTestContext(): Promise<{
  harness: any;
  provider: WebProvider;
  signer: TestSignerResult;
  taprootAddress: string;
  segwitAddress: string;
}> {
  const harness = await getOrCreateHarness();
  harness.installFetchInterceptor();

  const provider = await createDevnetProvider();
  const signer = await createTestSigner(TEST_MNEMONIC, 'subfrost-regtest');

  return {
    harness,
    provider,
    signer,
    taprootAddress: signer.addresses.taproot.address,
    segwitAddress: signer.addresses.nativeSegwit.address,
  };
}

// ---------------------------------------------------------------------------
// Mining (auto-indexed, no waiting needed)
// ---------------------------------------------------------------------------

export async function mineBlocks(
  harness: any,
  count: number,
): Promise<void> {
  harness.mineBlocks(count);
  // No sleep needed — devnet auto-indexes synchronously
}

// ---------------------------------------------------------------------------
// Balance queries (via RPC through the intercepted fetch)
// ---------------------------------------------------------------------------

export async function getBtcBalance(
  provider: WebProvider,
  address: string
): Promise<bigint> {
  try {
    const enriched = await provider.getEnrichedBalances(address, '1');
    if (!enriched) return 0n;

    const returns = mapGet(enriched, 'returns') || enriched;
    const spendable = mapGet(returns, 'spendable') || [];
    const assets = mapGet(returns, 'assets') || [];

    const allUtxos = [
      ...(Array.isArray(spendable) ? spendable : []),
      ...(Array.isArray(assets) ? assets : []),
    ];

    let total = 0n;
    for (const utxo of allUtxos) {
      const value = mapGet(utxo, 'value') || 0;
      total += BigInt(value);
    }
    return total;
  } catch {
    return 0n;
  }
}

export async function getAlkaneBalance(
  provider: WebProvider,
  address: string,
  alkaneId: string
): Promise<bigint> {
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);

  try {
    const batchResult = await rpcCall('alkanes_protorunesbyaddress', [
      { address, protocolTag: '1' },
    ]);

    if (batchResult?.result?.outpoints) {
      let total = 0n;
      for (const outpointData of batchResult.result.outpoints) {
        const balances =
          outpointData.balance_sheet?.cached?.balances ||
          outpointData.runes ||
          outpointData.balances ||
          [];
        for (const entry of balances) {
          const block = parseInt(entry.block ?? 0, 10);
          const tx = parseInt(entry.tx ?? 0, 10);
          if (block === targetBlock && tx === targetTx) {
            total += BigInt(entry.amount || entry.value || '0');
          }
        }
      }
      return total;
    }

    return 0n;
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// RPC helper (goes through intercepted fetch)
// ---------------------------------------------------------------------------

let rpcId = 1;

export async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(DEVNET.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: rpcId++,
    }),
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function mapGet(obj: any, key: string): any {
  if (!obj) return undefined;
  if (obj instanceof Map) return obj.get(key);
  return obj[key];
}
