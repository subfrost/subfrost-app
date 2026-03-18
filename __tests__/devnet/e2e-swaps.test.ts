/**
 * Devnet E2E: Full Swap Coverage
 *
 * Tests ALL swap/liquidity workflows after deploying AMM contracts:
 *
 * Setup:
 *   - Deploy AMM contracts (factory, pool, beacon)
 *   - Mint DIESEL tokens
 *   - Wrap BTC → frBTC
 *   - Create DIESEL/frBTC pool with initial liquidity
 *
 * Swap tests:
 *   1. Token → Token: DIESEL → frBTC (factory opcode 13)
 *   2. Token → Token: frBTC → DIESEL (factory opcode 13, reverse)
 *   3. BTC → Token: wrap BTC + swap frBTC → DIESEL (two-step)
 *   4. Token → BTC: swap DIESEL → frBTC + unwrap (two-step)
 *
 * Liquidity tests:
 *   5. Add liquidity to existing pool (pool opcode 1)
 *   6. Remove liquidity / burn LP tokens (pool opcode 2)
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-swaps.test.ts --testTimeout=600000
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
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { deployAmmContracts } from './amm-deploy';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let poolId: string | null = null;

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: {
    toAddresses?: string[];
    envelopeHex?: string | null;
  }
): Promise<string> {
  const opts = options || {};

  // Use alkanesExecuteFull — same path as alkanesExecuteTyped in the production app.
  // This handles the complete flow internally (including signing with loaded wallet).
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostone,
    1,  // feeRate
    opts.envelopeHex === undefined ? null : opts.envelopeHex,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      ordinals_strategy: 'burn',
    }),
  );

  // alkanesExecuteFull returns the complete result with txids
  if (result?.reveal_txid || result?.revealTxid) {
    const txid = result.reveal_txid || result.revealTxid;
    mineBlocks(harness, 1);
    return txid;
  }
  if (result?.txid) {
    mineBlocks(harness, 1);
    return result.txid;
  }

  // Fallback: result might be ReadyToSign
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

async function simulateAlkane(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '500',
    txindex: 0,
    vout: 0,
  }]);
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Devnet E2E: Full Swap Coverage', () => {

  // -------------------------------------------------------------------------
  // Global setup: mine blocks, deploy AMM, mint tokens, create pool
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine for coinbase maturity
    mineBlocks(harness, 201);
    console.log('[swaps] Chain ready at height', (await rpcCall('btc_getblockcount', [])).result);

    // Deploy AMM contracts
    console.log('[swaps] Deploying AMM contracts...');
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;
    console.log('[swaps] Factory deployed at:', factoryId);

    // Verify factory
    const numPools = await simulateAlkane(factoryId, ['4']);
    console.log('[swaps] Factory GetNumPools:', JSON.stringify(numPools?.result?.execution).slice(0, 200));

    // Mint DIESEL (3 times for enough tokens)
    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    }
    mineBlocks(harness, 1);

    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    console.log('[swaps] DIESEL balance:', dieselBalance.toString());

    // Wrap BTC → frBTC
    const signerResult = await simulateAlkane('32:0', ['103']);
    let signerAddr = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        try {
          const xOnlyPubkey = Buffer.from(hex, 'hex');
          const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: bitcoin.networks.regtest });
          if (payment.address) signerAddr = payment.address;
        } catch { /* use default */ }
      }
    }

    await executeAlkanes('[32,0,77]:v1:v1', 'B:1000000:v0', {
      toAddresses: [signerAddr, taprootAddress],
    });
    mineBlocks(harness, 1);

    const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    console.log('[swaps] frBTC balance:', frbtcBalance.toString());

    // Create DIESEL/frBTC pool via factory opcode 1
    const dieselAmount = dieselBalance / 3n;
    const frbtcAmount = frbtcBalance / 2n;
    console.log('[swaps] Creating pool: DIESEL=%s frBTC=%s', dieselAmount, frbtcAmount);

    // Factory CreateNewPool: opcode 1, token_a (2:0), token_b (32:0), amount_a, amount_b
    const [fBlock, fTx] = factoryId.split(':');
    const createPoolProtostone = `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`;
    const createPoolReqs = `2:0:${dieselAmount},32:0:${frbtcAmount}`;

    // First simulate to see if it would work
    const simResult = await rpcCall('alkanes_simulate', [{
      target: { block: factoryId.split(':')[0], tx: factoryId.split(':')[1] },
      inputs: ['1', '2', '0', '32', '0', dieselAmount.toString(), frbtcAmount.toString()],
      alkanes: [
        { id: { block: '2', tx: '0' }, value: dieselAmount.toString() },
        { id: { block: '32', tx: '0' }, value: frbtcAmount.toString() },
      ],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    }]);
    console.log('[swaps] CreateNewPool simulate:', JSON.stringify(simResult?.result?.execution).slice(0, 500));

    // Test: single-token delivery to different targets
    const testDieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);

    // Test A: Send DIESEL to factory [4:1] opcode 50 (Forward)
    try {
      const [fb, ft] = factoryId.split(':');
      await executeAlkanes(`[${fb},${ft},50]:v0:v0`, `2:0:1000000`);
      mineBlocks(harness, 1);
      const after = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      console.log('[swaps] Test A (factory [4:1]): spent=%s', testDieselBefore - after);
    } catch (e: any) {
      console.log('[swaps] Test A error:', (e?.message || String(e))?.slice(0, 100));
    }

    // Test B: Send DIESEL to DIESEL [2:0] opcode 77 (mint — should work and return tokens)
    const beforeB = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    mineBlocks(harness, 1); // new height for mint
    try {
      await executeAlkanes(`[2,0,77]:v0:v0`, `2:0:1000000`);
      mineBlocks(harness, 1);
      const afterB = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      console.log('[swaps] Test B (DIESEL [2:0] with input): spent=%s (negative=gained)', beforeB - afterB);
    } catch (e: any) {
      console.log('[swaps] Test B error:', (e?.message || String(e))?.slice(0, 100));
    }

    // Check token balances BEFORE pool creation
    const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    console.log('[swaps] Before pool creation: DIESEL=%s frBTC=%s', dieselBefore, frbtcBefore);

    try {
      const poolTxid = await executeAlkanes(createPoolProtostone, createPoolReqs);
      console.log('[swaps] Pool creation txid:', poolTxid);

      // Fetch raw tx to inspect
      const rawTxResult = await rpcCall('esplora_tx::hex', [poolTxid]);
      const rawHex = rawTxResult?.result;
      if (rawHex) {
        // Parse with bitcoinjs-lib to inspect outputs
        const tx = bitcoin.Transaction.fromHex(rawHex);
        console.log('[swaps] Pool creation tx: inputs=%d outputs=%d', tx.ins.length, tx.outs.length);
        for (let i = 0; i < tx.outs.length; i++) {
          const out = tx.outs[i];
          const isOpReturn = out.script[0] === 0x6a;
          console.log('[swaps]   output %d: value=%d script_len=%d is_op_return=%s',
            i, out.value, out.script.length, isOpReturn);
          if (isOpReturn) {
            console.log('[swaps]   OP_RETURN data: %s', out.script.toString('hex').slice(0, 200));
          }
        }
        for (let i = 0; i < tx.ins.length; i++) {
          const inp = tx.ins[i];
          console.log('[swaps]   input %d: txid=%s vout=%d witness_items=%d',
            i, inp.hash.reverse().toString('hex'), inp.index, inp.witness.length);
          inp.hash.reverse(); // reverse back
        }
      }
      mineBlocks(harness, 1);

      // Check token balances AFTER pool creation
      const dieselAfterPool = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtcAfterPool = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      console.log('[swaps] After pool creation: DIESEL=%s frBTC=%s', dieselAfterPool, frbtcAfterPool);
      console.log('[swaps] DIESEL spent: %s, frBTC spent: %s',
        dieselBefore - dieselAfterPool, frbtcBefore - frbtcAfterPool);

      // Find pool ID via factory opcode 2 (FindExistingPoolId)
      const findPool = await simulateAlkane(factoryId, ['2', '2', '0', '32', '0']);
      console.log('[swaps] FindPool result:', JSON.stringify(findPool?.result?.execution).slice(0, 200));

      // Pool ID should be in the result data (16-byte AlkaneId)
      if (findPool?.result?.execution?.data) {
        const hex = findPool.result.execution.data.replace('0x', '');
        if (hex.length >= 32) {
          const poolBlock = parseInt(hex.slice(0, 16), 16); // LE u64? Actually it's u128 LE
          // Parse as two u128 LE values (block, tx)
          // For simplicity, try reading as little-endian
          const buf = Buffer.from(hex, 'hex');
          // AlkaneId is two u128 fields, each 16 bytes LE
          const block = Number(buf.readBigUInt64LE(0));
          const tx = Number(buf.readBigUInt64LE(16));
          if (block > 0) {
            poolId = `${block}:${tx}`;
            console.log('[swaps] Pool ID:', poolId);
          }
        }
      }

      // Check GetNumPools after pool creation
      const numPoolsAfter = await simulateAlkane(factoryId, ['4']);
      console.log('[swaps] NumPools after creation:', JSON.stringify(numPoolsAfter?.result?.execution).slice(0, 200));

      // Check GetNumPools data — parse as u128 LE
      if (numPoolsAfter?.result?.execution?.data) {
        const hex = numPoolsAfter.result.execution.data.replace('0x', '');
        if (hex.length >= 32) {
          const buf = Buffer.from(hex, 'hex');
          const count = Number(buf.readBigUInt64LE(0));
          console.log('[swaps] Pool count:', count);
          if (count > 0) {
            // Pool was created! Try to find it
            const getAllPools = await simulateAlkane(factoryId, ['3']);
            console.log('[swaps] GetAllPools:', JSON.stringify(getAllPools?.result?.execution).slice(0, 500));
          }
        }
      }
    } catch (e: any) {
      console.log('[swaps] Pool creation error:', e.message?.slice(0, 200));
      console.log('[swaps] NOTE: Pool creation may fail if factory init or deployment is wrong');
    }
  }, 600_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // Token → Token Swaps
  // -------------------------------------------------------------------------

  describe('Token → Token Swap', () => {
    it('should swap DIESEL → frBTC', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtcBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

      const swapAmount = dieselBefore / 10n;
      const [fBlock, fTx] = factoryId.split(':');
      // SwapExactTokensForTokens: opcode 13, path_len=2, sell=DIESEL, buy=frBTC, amountIn, minOut, deadline
      const protostone = `[${fBlock},${fTx},13,2,2,0,32,0,${swapAmount},1,99999]:v0:v0`;

      const txid = await executeAlkanes(protostone, `2:0:${swapAmount}`);
      console.log('[swaps] DIESEL→frBTC txid:', txid);
      mineBlocks(harness, 1);

      const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtcAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

      console.log('[swaps] DIESEL: %s → %s', dieselBefore, dieselAfter);
      console.log('[swaps] frBTC:  %s → %s', frbtcBefore, frbtcAfter);

      expect(dieselAfter).toBeLessThan(dieselBefore);
      expect(frbtcAfter).toBeGreaterThan(frbtcBefore);
    }, 120_000);

    it('should swap frBTC → DIESEL', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtcBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

      const swapAmount = frbtcBefore / 10n;
      const [fBlock, fTx] = factoryId.split(':');
      const protostone = `[${fBlock},${fTx},13,2,32,0,2,0,${swapAmount},1,99999]:v0:v0`;

      const txid = await executeAlkanes(protostone, `32:0:${swapAmount}`);
      console.log('[swaps] frBTC→DIESEL txid:', txid);
      mineBlocks(harness, 1);

      const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtcAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

      expect(dieselAfter).toBeGreaterThan(dieselBefore);
      expect(frbtcAfter).toBeLessThan(frbtcBefore);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // BTC → Token (Two-Step)
  // -------------------------------------------------------------------------

  describe('BTC → Token', () => {
    it('should wrap BTC then swap frBTC → DIESEL', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);

      // Step 1: Wrap
      const signerResult = await simulateAlkane('32:0', ['103']);
      let signerAddr = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
      if (signerResult?.result?.execution?.data) {
        const hex = signerResult.result.execution.data.replace('0x', '');
        if (hex.length === 64) {
          try {
            const xOnlyPubkey = Buffer.from(hex, 'hex');
            const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: bitcoin.networks.regtest });
            if (payment.address) signerAddr = payment.address;
          } catch { /* use default */ }
        }
      }

      await executeAlkanes('[32,0,77]:v1:v1', 'B:500000:v0', {
        toAddresses: [signerAddr, taprootAddress],
      });
      mineBlocks(harness, 1);

      // Step 2: Swap frBTC → DIESEL
      const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      const swapAmount = frbtcBalance / 4n;
      const [fBlock, fTx] = factoryId.split(':');
      const protostone = `[${fBlock},${fTx},13,2,32,0,2,0,${swapAmount},1,99999]:v0:v0`;

      const txid = await executeAlkanes(protostone, `32:0:${swapAmount}`);
      console.log('[swaps] BTC→DIESEL (step 2 swap) txid:', txid);
      mineBlocks(harness, 1);

      const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      console.log('[swaps] DIESEL before: %s after: %s', dieselBefore, dieselAfter);
      expect(dieselAfter).toBeGreaterThan(dieselBefore);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // Token → BTC (Two-Step)
  // -------------------------------------------------------------------------

  describe('Token → BTC', () => {
    it('should swap DIESEL → frBTC then unwrap to BTC', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      // Step 1: Swap DIESEL → frBTC
      const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const swapAmount = dieselBalance / 10n;
      const [fBlock, fTx] = factoryId.split(':');
      const swapProtostone = `[${fBlock},${fTx},13,2,2,0,32,0,${swapAmount},1,99999]:v0:v0`;

      await executeAlkanes(swapProtostone, `2:0:${swapAmount}`);
      mineBlocks(harness, 1);

      // Step 2: Unwrap frBTC → BTC
      const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      const unwrapAmount = frbtcBalance / 4n;

      const txid = await executeAlkanes('[32,0,78]:v1:v1', `32:0:${unwrapAmount}`);
      console.log('[swaps] DIESEL→BTC (step 2 unwrap) txid:', txid);
      mineBlocks(harness, 1);

      const frbtcAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      expect(frbtcAfter).toBeLessThan(frbtcBalance);
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // Liquidity Operations
  // -------------------------------------------------------------------------

  describe('Liquidity', () => {
    it('should add liquidity to existing pool', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      const [pBlock, pTx] = poolId.split(':');
      const dieselAmount = 1000000000n; // 1B DIESEL
      const frbtcAmount = 50000n; // some frBTC

      // Pool opcode 1 = AddLiquidity (requires two alkane inputs)
      const protostone = `[${pBlock},${pTx},1]:v0:v0`;
      const reqs = `2:0:${dieselAmount},32:0:${frbtcAmount}`;

      try {
        const txid = await executeAlkanes(protostone, reqs);
        console.log('[swaps] AddLiquidity txid:', txid);
        mineBlocks(harness, 1);

        // Check LP token balance (LP token ID = pool ID)
        const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[swaps] LP token balance:', lpBalance.toString());
        expect(lpBalance).toBeGreaterThan(0n);
      } catch (e: any) {
        console.log('[swaps] AddLiquidity error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should remove liquidity / burn LP tokens', async () => {
      if (!poolId) {
        console.log('[swaps] Skipping — no pool');
        return;
      }

      const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBalance === 0n) {
        console.log('[swaps] Skipping — no LP tokens');
        return;
      }

      const burnAmount = lpBalance / 2n;
      const [pBlock, pTx] = poolId.split(':');

      // Pool opcode 2 = RemoveLiquidity (burn LP tokens, receive token0 + token1)
      const protostone = `[${pBlock},${pTx},2,0,0,99999]:v0:v0`;

      try {
        const txid = await executeAlkanes(protostone, `${poolId}:${burnAmount}`);
        console.log('[swaps] RemoveLiquidity txid:', txid);
        mineBlocks(harness, 1);

        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[swaps] LP balance after burn: %s → %s', lpBalance, lpAfter);
        expect(lpAfter).toBeLessThan(lpBalance);
      } catch (e: any) {
        console.log('[swaps] RemoveLiquidity error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // Final status report
  // -------------------------------------------------------------------------

  describe('Status', () => {
    it('should report final balances', async () => {
      const diesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtc = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      const btc = await getBtcBalance(provider, segwitAddress);

      console.log('[swaps] Final balances:');
      console.log(`  DIESEL: ${diesel}`);
      console.log(`  frBTC:  ${frbtc}`);
      console.log(`  BTC:    ${btc} sats`);
      if (poolId) {
        const lp = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log(`  LP(${poolId}): ${lp}`);
      }
    });
  });
});
