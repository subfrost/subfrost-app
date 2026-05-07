/**
 * Devnet: Key & UTXO Debug
 *
 * Verifies the devnet coinbase key matches the SDK wallet, and that
 * UTXOs are properly returned after sufficient block depth.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import {
  getOrCreateHarness,
  disposeHarness,
  createDevnetProvider,
  rpcCall,
} from './devnet-helpers';
import { DEVNET } from './devnet-constants';
import { createTestSigner, TEST_MNEMONIC } from '../sdk/test-utils/createTestSigner';

try { bitcoin.initEccLib(ecc); } catch {}
const bip32 = BIP32Factory(ecc);

describe('Devnet: Key & UTXO Debug', () => {
  let harness: any;
  let derivedAddress: string;

  beforeAll(async () => {
    harness = await getOrCreateHarness();
    harness.installFetchInterceptor();

    // Derive expected address
    const seed = bip39.mnemonicToSeedSync(DEVNET.TEST_MNEMONIC);
    const root = bip32.fromSeed(seed);
    const child = root.derivePath("m/84'/1'/0'/0/0");
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: bitcoin.networks.regtest,
    });
    derivedAddress = p2wpkh.address!;

    // Mine 201 blocks for mature coinbase
    harness.mineBlocks(201);
  }, 180_000);

  afterAll(() => {
    disposeHarness();
  });

  it('addresses should match', async () => {
    const signer = await createTestSigner(DEVNET.TEST_MNEMONIC, 'subfrost-regtest');
    console.log('[key] Derived:', derivedAddress);
    console.log('[key] SDK:', signer.addresses.nativeSegwit.address);
    expect(derivedAddress).toBe(signer.addresses.nativeSegwit.address);
  });

  it('should have mature UTXOs after 201 blocks', async () => {
    const height = (await rpcCall('btc_getblockcount', [])).result;
    console.log('[key] Chain height:', height);
    expect(height).toBeGreaterThanOrEqual(201);

    const result = await rpcCall('esplora_address::utxo', [derivedAddress]);
    const utxos = result.result;
    console.log('[key] UTXOs found:', Array.isArray(utxos) ? utxos.length : 'NOT ARRAY');
    if (Array.isArray(utxos) && utxos.length > 0) {
      console.log('[key] First UTXO height:', utxos[0].status?.block_height, 'value:', utxos[0].value);
      console.log('[key] Last UTXO height:', utxos[utxos.length-1].status?.block_height);
    }
    expect(Array.isArray(utxos)).toBe(true);
    // With 201 blocks, UTXOs at height 0-101 should be mature (101 spendable)
    expect(utxos.length).toBeGreaterThan(0);
  });

  it('spendablesbyaddress should return outpoints', async () => {
    const result = await rpcCall('spendablesbyaddress', [derivedAddress]);
    console.log('[key] spendables count:', result.result?.outpoints?.length ?? 'error');
    expect(result.result).toBeTruthy();
    expect(result.result.outpoints.length).toBeGreaterThan(0);
  });

  it('sandshrew_balances should return spendable UTXOs', async () => {
    // Use sandshrew_balances which is the real composite balance query
    // (replaces the Lua stub that was returning empty)
    const result = await rpcCall('sandshrew_balances', [
      { address: derivedAddress },
    ]);
    console.log('[key] sandshrew_balances result keys:', Object.keys(result.result || {}));

    expect(result.result).toBeTruthy();
    expect(result.result.spendable).toBeTruthy();
    expect(Array.isArray(result.result.spendable)).toBe(true);
    expect(result.result.spendable.length).toBeGreaterThan(0);
    console.log('[key] Spendable UTXOs:', result.result.spendable.length);
    if (result.result.spendable.length > 0) {
      console.log('[key] First spendable:', JSON.stringify(result.result.spendable[0]).slice(0, 200));
    }
  });
});
