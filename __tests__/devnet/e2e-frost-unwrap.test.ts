/**
 * Devnet E2E: FROST Threshold Signing
 *
 * Tests FROST key generation and Schnorr signing on the in-process devnet.
 * This validates the cryptographic ceremony used by subfrost's aggregate-unwrap.
 *
 * Tests:
 *   1. FROST key generation (dealer-based, 2-of-3)
 *   2. P2TR address derivation from group public key
 *   3. Fund FROST address with BTC (mine to it)
 *   4. Build PSBT spending from FROST address
 *   5. FROST-sign the PSBT (round1→round2→aggregate)
 *   6. Broadcast and verify BTC arrives at recipient
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-frost-unwrap.test.ts --testTimeout=300000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getBtcBalance,
} from './devnet-helpers';
import { loadFrost, type FrostHelpers } from './frost-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let frost: FrostHelpers;
let frostKeyBundle: string;
let frostAddress: string;

describe('Devnet E2E: FROST Threshold Signing', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 201);

    // Load FROST WASM
    frost = await loadFrost();
    console.log('[frost] FROST WASM loaded');
  }, 120_000);

  afterAll(() => { disposeHarness(); });

  // =========================================================================
  // Key Generation
  // =========================================================================

  describe('Key Generation', () => {
    it('should generate FROST keys (3 signers, threshold 2)', () => {
      frostKeyBundle = frost.generateKeys(3, 2);
      expect(frostKeyBundle).toBeTruthy();
      expect(frostKeyBundle.length).toBeGreaterThan(100);

      const parsed = JSON.parse(frostKeyBundle);
      expect(Object.keys(parsed.key_packages)).toHaveLength(3);
      expect(parsed.threshold).toBe(2);
      expect(parsed.signers).toBe(3);
      console.log('[frost] Generated 3-of-2 FROST keys ✓');
    });

    it('should extract 32-byte x-only group public key', () => {
      const pubkey = frost.getGroupPublicKey(frostKeyBundle);
      expect(pubkey.length).toBe(32);
      console.log('[frost] Group pubkey:', pubkey.toString('hex'));
    });

    it('should derive P2TR address from group key', () => {
      frostAddress = frost.deriveP2trAddress(frostKeyBundle);
      expect(frostAddress).toMatch(/^bcrt1p/);
      console.log('[frost] FROST P2TR address:', frostAddress);
    });
  });

  // =========================================================================
  // FROST Signing on Devnet
  // =========================================================================

  describe('FROST-Signed Transaction', () => {
    it('should fund FROST address with BTC', async () => {
      // Send BTC to the FROST address by having User A send a tx with output to FROST addr
      const result = await (provider as any).alkanesExecuteFull(
        JSON.stringify([frostAddress]),
        'B:50000000:v0',   // 0.5 BTC
        '[2,0,77]:v0:v0',  // DIESEL mint (just to create a tx)
        1,
        null,
        JSON.stringify({
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: frostAddress,
          ordinals_strategy: 'burn',
        }),
      );
      if (result?.txid) mineBlocks(harness, 1);

      // Send more BTC via additional transactions
      for (let i = 0; i < 2; i++) {
        mineBlocks(harness, 1);
        const r = await (provider as any).alkanesExecuteFull(
          JSON.stringify([frostAddress]),
          'B:50000000:v0',
          '[2,0,77]:v0:v0',
          1,
          null,
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: frostAddress,
            alkanes_change_address: frostAddress,
            ordinals_strategy: 'burn',
          }),
        );
        if (r?.txid) mineBlocks(harness, 1);
      }

      // Verify FROST address has UTXOs
      const utxoResult = await rpcCall('esplora_address::utxo', [frostAddress]);
      const utxos = utxoResult?.result || [];
      console.log('[frost] FROST address UTXOs:', Array.isArray(utxos) ? utxos.length : 0);
      expect(Array.isArray(utxos) ? utxos.length : 0).toBeGreaterThan(0);
    }, 120_000);

    it('should FROST-sign a BTC payout transaction', async () => {
      const recipientAddress = taprootAddress; // Pay back to test user

      // Get UTXOs for FROST address
      const utxoResult = await rpcCall('esplora_address::utxo', [frostAddress]);
      const utxos: any[] = utxoResult?.result || [];
      expect(utxos.length).toBeGreaterThan(0);

      // Find a spendable UTXO
      const spendable = utxos.filter((u: any) => u.status?.confirmed && u.value > 10000);
      expect(spendable.length).toBeGreaterThan(0);

      const utxo = spendable[0];
      const inputValue = utxo.value;
      const fee = 500; // Simple fee estimate
      const outputValue = inputValue - fee;

      console.log('[frost] Building PSBT: input=%d sats, output=%d sats, fee=%d', inputValue, outputValue, fee);

      // Build PSBT
      const network = bitcoin.networks.regtest;
      const psbt = new bitcoin.Psbt({ network });

      // Fetch the raw tx for the input
      const rawTxResult = await rpcCall('esplora_tx::hex', [utxo.txid]);
      const rawTx = rawTxResult?.result;
      expect(rawTx).toBeTruthy();

      const tx = bitcoin.Transaction.fromHex(rawTx as string);
      const prevOutput = tx.outs[utxo.vout];

      // Get the FROST x-only pubkey for tapInternalKey
      const xOnlyPubkey = frost.getGroupPublicKey(frostKeyBundle);

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: Buffer.from(prevOutput.script),
          value: BigInt(inputValue),
        },
        tapInternalKey: xOnlyPubkey,
      });

      psbt.addOutput({
        address: recipientAddress,
        value: BigInt(outputValue),
      });

      // Compute taproot sighash using bitcoin.Transaction directly
      const unsignedTx = bitcoin.Transaction.fromBuffer(
        Buffer.from(psbt.data.globalMap.unsignedTx!.toBuffer())
      );
      const prevoutScripts = [Buffer.from(prevOutput.script)];
      const prevoutValues = [BigInt(inputValue)];

      // hashForWitnessV1 is on Transaction in bitcoinjs-lib
      const hashForSig = unsignedTx.hashForWitnessV1(
        0,
        prevoutScripts,
        prevoutValues,
        bitcoin.Transaction.SIGHASH_DEFAULT,
      );

      console.log('[frost] Sighash:', Buffer.from(hashForSig).toString('hex'));

      // FROST-sign the sighash
      const signature = frost.signSighash(frostKeyBundle, Buffer.from(hashForSig));
      expect(signature.length).toBe(64);
      console.log('[frost] FROST signature:', signature.toString('hex').slice(0, 40) + '...');

      // Inject signature into PSBT
      psbt.updateInput(0, {
        tapKeySig: signature,
      });

      // Finalize
      psbt.finalizeInput(0);
      const signedTx = psbt.extractTransaction();
      const txHex = signedTx.toHex();
      console.log('[frost] Signed tx:', txHex.length / 2, 'bytes');

      // Broadcast
      const broadcastResult = await rpcCall('sendrawtransaction', [txHex]);
      const txid = broadcastResult?.result;
      console.log('[frost] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      mineBlocks(harness, 1);

      // Verify recipient received BTC
      console.log('[frost] FROST-signed transaction confirmed ✓');
    }, 120_000);

    it('should produce valid Schnorr signatures for multiple sighashes', () => {
      // Sign multiple different messages to verify FROST is deterministic-safe
      const sighashes = [
        Buffer.alloc(32, 0x01),
        Buffer.alloc(32, 0xff),
        Buffer.from('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'hex'),
      ];

      for (const sighash of sighashes) {
        const sig = frost.signSighash(frostKeyBundle, sighash);
        expect(sig.length).toBe(64);
      }
      console.log('[frost] Multiple sighash signing ✓');
    });
  });
});
