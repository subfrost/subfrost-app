/**
 * Tier 1: DIESEL -> frBTC Swap Test
 *
 * Verifies that swapping DIESEL for frBTC via factory opcode 13 works on regtest.
 * Requires funded wallet with DIESEL tokens (mined via coinbase rewards).
 *
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/swap-diesel-frbtc.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { REGTEST } from '../shared/regtest-constants';
import {
  createRegtestTestContext,
  getAlkaneBalance,
  getBtcBalance,
  mineBlocks,
  simulateSwapQuote,
  getPoolReserves,
  sleep,
} from '../shared/regtest-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import {
  buildSwapProtostone,
  buildSwapInputRequirements,
} from '@/lib/alkanes/builders';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

describe.runIf(INTEGRATION)('Tier 1: Swap DIESEL -> frBTC', () => {
  let provider: WebProvider;
  let signer: TestSignerResult;
  let taprootAddress: string;
  let segwitAddress: string;

  beforeAll(async () => {
    const ctx = await createRegtestTestContext();
    provider = ctx.provider;
    signer = ctx.signer;
    taprootAddress = ctx.taprootAddress;
    segwitAddress = ctx.segwitAddress;

    // Ensure wallet is funded with BTC
    const btcBalance = await getBtcBalance(provider, segwitAddress);
    if (btcBalance < 100_000_000n) {
      await mineBlocks(provider, 201, segwitAddress);
      await sleep(3000);
    }
  }, 120_000);

  it('should swap DIESEL for frBTC and verify balance changes', async () => {
    const swapAmount = '10000000'; // 10M DIESEL (in base units)

    // Check DIESEL balance
    const dieselBefore = await getAlkaneBalance(provider, taprootAddress, REGTEST.DIESEL_ID);
    const frbtcBefore = await getAlkaneBalance(provider, taprootAddress, REGTEST.FRBTC_ID);
    console.log(`[swap] Before: DIESEL=${dieselBefore}, frBTC=${frbtcBefore}`);

    // Get pool reserves for context
    const reserves = await getPoolReserves(REGTEST.POOL_ID);
    console.log(`[swap] Pool reserves: DIESEL=${reserves.reserve0}, frBTC=${reserves.reserve1}`);

    // Get simulated swap quote
    const expectedOutput = await simulateSwapQuote(
      REGTEST.DIESEL_ID,
      REGTEST.FRBTC_ID,
      swapAmount
    );
    console.log(`[swap] Expected output from simulation: ${expectedOutput} frBTC`);

    // Get current block height for deadline
    const heightResult = await (await fetch(REGTEST.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_height', params: [], id: 1 }),
    })).json();
    const deadline = (Number(heightResult.result) + 1000).toString();

    // Build swap protostone
    const protostones = buildSwapProtostone({
      factoryId: REGTEST.FACTORY_ID,
      sellTokenId: REGTEST.DIESEL_ID,
      buyTokenId: REGTEST.FRBTC_ID,
      sellAmount: swapAmount,
      minOutput: '1', // Accept any output for testing
      deadline,
    });

    const inputRequirements = buildSwapInputRequirements({
      alkaneInputs: [{ alkaneId: REGTEST.DIESEL_ID, amount: swapAmount }],
    });

    console.log(`[swap] Protostones: ${protostones}`);
    console.log(`[swap] InputReqs: ${inputRequirements}`);

    // Execute swap
    const result = await alkanesExecuteTyped(provider, {
      protostones,
      inputRequirements,
      feeRate: 2,
      fromAddresses: [segwitAddress, taprootAddress],
      toAddresses: [taprootAddress],
      changeAddress: segwitAddress,
      alkanesChangeAddress: taprootAddress,
    });

    expect(result).toBeTruthy();
    expect(result.readyToSign || result.txid).toBeTruthy();

    // Sign and broadcast
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log(`[swap] Broadcast txid: ${txid}`);
    expect(txid).toBeTruthy();
    expect(txid.length).toBe(64);

    // Wait for indexer
    await sleep(3000);

    // Verify balance changes
    const dieselAfter = await getAlkaneBalance(provider, taprootAddress, REGTEST.DIESEL_ID);
    const frbtcAfter = await getAlkaneBalance(provider, taprootAddress, REGTEST.FRBTC_ID);
    console.log(`[swap] After: DIESEL=${dieselAfter}, frBTC=${frbtcAfter}`);

    // DIESEL should decrease
    expect(dieselAfter).toBeLessThan(dieselBefore);

    // frBTC should increase
    expect(frbtcAfter).toBeGreaterThan(frbtcBefore);

    const frbtcGained = frbtcAfter - frbtcBefore;
    console.log(`[swap] DIESEL spent: ${dieselBefore - dieselAfter}, frBTC gained: ${frbtcGained}`);
  }, 120_000);
});
