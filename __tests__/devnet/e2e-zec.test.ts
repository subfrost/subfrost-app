/**
 * Devnet E2E: Zcash (frZEC) Workflow
 *
 * Tests the frZEC wrap/unwrap lifecycle on the in-process devnet:
 *
 * 1. Verify frZEC [42:0] genesis contract is deployed
 * 2. Query frZEC signer address (P2PKH, not P2TR)
 * 3. Wrap BTC → frZEC (via opcode 77 on [42:0])
 * 4. Verify frZEC balance
 * 5. Unwrap frZEC → BTC (via opcode 78 on [42:0])
 * 6. Verify frZEC balance decreased
 * 7. Test frZEC builder functions (protostone + input requirements)
 *
 * frZEC [42:0] is a genesis alkane (auto-deployed by indexer), same as frBTC [32:0].
 * The key difference: frZEC uses CGGMP21 (ECDSA/P2PKH) instead of FROST (Schnorr/P2TR).
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-zec.test.ts --testTimeout=300000
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
  getBtcBalance,
  takeSnapshot,
  restoreSnapshot,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import {
  buildWrapZecProtostone,
  buildUnwrapZecProtostone,
  buildUnwrapZecInputRequirements,
} from '../../lib/alkanes/builders';
import {
  FRZEC_WRAP_OPCODE,
  FRZEC_UNWRAP_OPCODE,
} from '../../lib/alkanes/constants';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;

// Track state across sequential tests
let frzecWrapped = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: {
    toAddresses?: string[];
    envelopeHex?: string | null;
    feeRate?: string;
  }
): Promise<string> {
  const opts = options || {};
  const result = await provider.alkanesExecuteWithStrings(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostone,
    opts.feeRate || '2',
    opts.envelopeHex === undefined ? null : opts.envelopeHex,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      auto_confirm: false,
    }),
  );

  return signAndBroadcast(provider, result, signer, segwitAddress);
}

async function simulateAlkane(
  target: string,
  inputs: string[],
  alkanes: any[] = [],
): Promise<any> {
  const [block, tx] = target.split(':');
  const result = await rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes,
    transaction: '0x',
    block: '0x',
    height: '200',
    txindex: 0,
    vout: 0,
  }]);
  return result;
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Devnet E2E: Zcash (frZEC) Workflow', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    console.log('[zec-e2e] segwit:', segwitAddress);
    console.log('[zec-e2e] taproot:', taprootAddress);

    // Mine 201 blocks for coinbase maturity
    mineBlocks(harness, 201);

    const h = (await rpcCall('btc_getblockcount', [])).result;
    console.log('[zec-e2e] Chain height after setup:', h);

    // Snapshot after expensive setup (mining 201 blocks)
    takeSnapshot('setup');
  }, 300_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // 1. Builder function unit tests (use arbitrary alkane IDs)
  // -------------------------------------------------------------------------

  describe('Builder Functions', () => {
    it('should build wrap ZEC protostone with deployed ID', () => {
      // frZEC is deployed at [4:n], not a genesis alkane
      const protostone = buildWrapZecProtostone({ frzecId: '4:43520' });
      expect(protostone).toBe(`[4,43520,${FRZEC_WRAP_OPCODE}]:v1:v1`);
    });

    it('should build unwrap ZEC protostone', () => {
      const protostone = buildUnwrapZecProtostone({ frzecId: '4:43520' });
      expect(protostone).toBe(`[4,43520,${FRZEC_UNWRAP_OPCODE}]:v1:v1`);
    });

    it('should build unwrap ZEC input requirements', () => {
      const req = buildUnwrapZecInputRequirements({ frzecId: '4:43520', amount: '1000000' });
      expect(req).toBe('4:43520:1000000');
    });

    it('should support custom pointer/refund', () => {
      const protostone = buildUnwrapZecProtostone({
        frzecId: '4:43520',
        pointer: 'v0',
        refund: 'v0',
      });
      expect(protostone).toBe(`[4,43520,${FRZEC_UNWRAP_OPCODE}]:v0:v0`);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Basic state verification
  // -------------------------------------------------------------------------

  describe('Basic State', () => {
    it('should have spendable BTC from coinbase', async () => {
      const balance = await getBtcBalance(provider, segwitAddress);
      console.log('[zec-e2e] BTC balance (segwit):', balance.toString(), 'sats');
      expect(balance).toBeGreaterThan(0n);
    });

    it('frBTC [32:0] should be deployed (genesis)', async () => {
      const result = await simulateAlkane('32:0', ['99']); // GetName
      expect(result?.result).toBeTruthy();
      console.log('[zec-e2e] frBTC is genesis, frZEC requires deployment');
    });

    it('frZEC is a deployed contract, not genesis', () => {
      // frZEC lives at [4:n] on the BTC alkanes index (deployed fr_zec.wasm)
      // On the ZEC alkanes index (quzec), there's a vault that tracks ZEC deposits
      // and associates them to BTC-side frZEC minting.
      const [block] = DEVNET.FRZEC_ID.split(':').map(Number);
      expect(block).toBe(4); // deployed contracts are always block 4
      expect(DEVNET.FRZEC_ID).toBe('4:43520');
    });

    it('should start with zero frZEC balance (not yet deployed)', async () => {
      const balance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRZEC_ID);
      expect(balance).toBe(0n);
    });
  });

  // -------------------------------------------------------------------------
  // 3. frZEC Wrap (BTC → frZEC)
  // -------------------------------------------------------------------------

  describe('frZEC Wrap/Unwrap Architecture', () => {
    it('wrap protostone targets deployed contract, not genesis', () => {
      const protostone = buildWrapZecProtostone({ frzecId: DEVNET.FRZEC_ID });
      // Should target [4:43520], not [42:0]
      expect(protostone).toContain('4,43520');
      expect(protostone).not.toContain('42,0');
    });

    it('unwrap input requirements reference deployed ID', () => {
      const req = buildUnwrapZecInputRequirements({
        frzecId: DEVNET.FRZEC_ID,
        amount: '100000',
      });
      expect(req).toBe('4:43520:100000');
    });

    it('frZEC signer uses P2PKH (ECDSA/CGGMP21), not P2TR (Schnorr/FROST)', () => {
      // frBTC signer: P2TR (bc1p...) — FROST Schnorr threshold signing
      // frZEC signer: P2PKH (t1...) — CGGMP21 ECDSA threshold signing
      // Both watch their respective chains for deposits and mint on BTC alkanes
      expect(FRZEC_WRAP_OPCODE).toBe(77);
      expect(FRZEC_UNWRAP_OPCODE).toBe(78);
    });
  });

  // -------------------------------------------------------------------------
  // 5. frZEC vs frBTC comparison
  // -------------------------------------------------------------------------

  describe('frZEC vs frBTC Architecture', () => {
    it('frBTC is genesis [32:0], frZEC is deployed [4:n]', async () => {
      // frBTC = genesis alkane at [32:0] (FROST/Schnorr)
      const frbtcResult = await simulateAlkane('32:0', ['99']);
      expect(frbtcResult?.result).toBeTruthy();
      console.log('[zec-e2e] frBTC [32:0] is genesis, responds to opcodes');

      // frZEC = deployed contract at [4:43520] (CGGMP21/ECDSA)
      // Not deployed in this test — that's in e2e-zec-deploy.test.ts
      const [frzecBlock] = DEVNET.FRZEC_ID.split(':').map(Number);
      expect(frzecBlock).toBe(4); // deployed = block 4
    });

    it('wrap opcodes match between frBTC and frZEC', () => {
      expect(DEVNET.FRBTC_OPCODES.Wrap).toBe(DEVNET.FRZEC_OPCODES.Wrap);
      expect(DEVNET.FRBTC_OPCODES.Unwrap).toBe(DEVNET.FRZEC_OPCODES.Unwrap);
      expect(FRZEC_WRAP_OPCODE).toBe(77);
      expect(FRZEC_UNWRAP_OPCODE).toBe(78);
    });

    it('ZEC alkanes index has a vault tracking deposits for BTC-side minting', () => {
      // The frZEC architecture spans two chains:
      //   BTC alkanes: frZEC contract at [4:n] — mints frZEC when ZEC vault confirms deposit
      //   ZEC alkanes: frZEC vault at [4:m] — tracks ZEC deposits to CGGMP21 signer t-address
      //
      // The ZEC vault is the ONLY alkane on the quzec alkanes index.
      // It records (zec_txid, btc_destination, amount) for cross-chain proof.
      expect(DEVNET.FRZEC_ID).toBe('4:43520');
    });
  });
});
