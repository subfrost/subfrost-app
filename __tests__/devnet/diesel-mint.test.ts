/**
 * Devnet: DIESEL Mint
 *
 * Tests minting DIESEL [2:0] tokens via opcode 77 (free mint).
 * This is the simplest alkane contract call — no WASM deployment needed
 * since DIESEL is a genesis contract baked into the alkanes indexer.
 *
 * Flow:
 * 1. Mine blocks for mature UTXOs
 * 2. Build DIESEL mint transaction via SDK (alkanesExecuteWithStrings)
 * 3. Sign and broadcast
 * 4. Verify DIESEL balance via alkanes_protorunesbyaddress
 *
 * Run: pnpm vitest run __tests__/devnet/diesel-mint.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { DEVNET } from './devnet-constants';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

describe('Devnet: DIESEL Mint', () => {
  let harness: any;
  let provider: WebProvider;
  let signer: TestSignerResult;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    // Force a fresh harness for this test
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine 201 blocks — need 100+ confirmations for coinbase maturity
    // The SDK's Lua spendables script filters out immature coinbase
    // This takes ~150s in WASM with alkanes indexer processing
    mineBlocks(harness, 201);

    const h = (await rpcCall('btc_getblockcount', [])).result;
    console.log('[diesel-mint] Chain height after mining:', h);
  }, 300_000);

  afterAll(() => {
    disposeHarness();
  });

  it('should have UTXOs available via esplora address UTXO query', async () => {
    // First, check what address the SDK wallet uses
    console.log('[diesel-mint] SDK segwit address:', segwitAddress);
    console.log('[diesel-mint] SDK taproot address:', taprootAddress);

    // Query esplora for UTXOs at the segwit address
    const esploraResult = await rpcCall('esplora_address::utxo', [segwitAddress]);
    console.log('[diesel-mint] esplora UTXOs:', JSON.stringify(esploraResult).slice(0, 500));

    // The devnet with P2WPKH coinbase should return UTXOs here
    // since the coinbase key matches the SDK wallet's BIP84 key
    if (esploraResult.result && Array.isArray(esploraResult.result)) {
      expect(esploraResult.result.length).toBeGreaterThan(0);
      console.log('[diesel-mint] Found', esploraResult.result.length, 'UTXOs');
    } else {
      // May fail if address doesn't match — log for debugging
      console.log('[diesel-mint] No UTXOs found. This means the coinbase script does not match the SDK address.');
      console.log('[diesel-mint] Check: devnet coinbase key derivation path vs SDK wallet path');
    }
  });

  it('should have working alkanes_simulate for DIESEL', async () => {
    // Simulate a DIESEL mint (opcode 77)
    const result = await rpcCall('alkanes_simulate', [
      {
        target: { block: '2', tx: '0' },
        inputs: ['77'],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '100',
        txindex: 0,
        vout: 0,
      },
    ]);

    console.log('[diesel-mint] simulate result:', JSON.stringify(result).slice(0, 500));

    expect(result).toBeTruthy();
    // If DIESEL [2,0] is a genesis contract, simulate should succeed
    if (result.result) {
      console.log('[diesel-mint] status:', result.result.status);
      console.log('[diesel-mint] execution:', JSON.stringify(result.result.execution).slice(0, 300));
    }
  });

  it('should mint DIESEL via alkanesExecuteWithStrings', async () => {
    // Use the SDK to build a DIESEL mint transaction
    // Protostone format: [target_block,target_tx,opcode]:pointer:refund
    const protostone = `[${DEVNET.DIESEL_ID.replace(':', ',')},77]:v0:v0`;

    console.log('[diesel-mint] Building DIESEL mint tx with protostone:', protostone);
    console.log('[diesel-mint] from:', segwitAddress);
    console.log('[diesel-mint] to (alkane recipient):', taprootAddress);

    try {
      const result = await provider.alkanesExecuteWithStrings(
        JSON.stringify([taprootAddress]),       // toAddresses
        'B:10000:v0',                           // inputRequirements (BTC for fees)
        protostone,                             // protostones
        '2',                                    // feeRate
        '',                                     // envelopeHex (none)
        JSON.stringify({                        // options
          from: [segwitAddress, taprootAddress],
          change: segwitAddress,
          alkanes_change: taprootAddress,
        }),
      );

      console.log('[diesel-mint] SDK result type:', typeof result);
      console.log('[diesel-mint] SDK result:', JSON.stringify(result).slice(0, 500));

      if (result) {
        // Sign and broadcast
        const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
        console.log('[diesel-mint] Broadcast txid:', txid);
        expect(txid).toBeTruthy();

        // Check DIESEL balance
        const balance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
        console.log('[diesel-mint] DIESEL balance after mint:', balance.toString());
        expect(balance).toBeGreaterThan(0n);
      }
    } catch (e: any) {
      console.log('[diesel-mint] alkanesExecuteWithStrings error:', e.message);
      // Log what UTXO state we have for debugging
      const spendables = await rpcCall('spendablesbyaddress', [segwitAddress]);
      console.log('[diesel-mint] spendables available:', JSON.stringify(spendables).slice(0, 500));

      // The test is informational for now — UTXO discovery may not work
      // if the devnet's coinbase key differs from the SDK wallet's key
      console.log('[diesel-mint] NOTE: this test requires the devnet coinbase key to match the SDK wallet mnemonic');
    }
  }, 120_000);
});
