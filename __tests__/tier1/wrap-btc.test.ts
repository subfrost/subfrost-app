/**
 * Tier 1: BTC -> frBTC Wrap Test
 *
 * Verifies that wrapping BTC produces frBTC on regtest.
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/wrap-btc.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { REGTEST } from '../shared/regtest-constants';
import {
  createRegtestTestContext,
  getBtcBalance,
  getAlkaneBalance,
  mineBlocks,
  sleep,
} from '../shared/regtest-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import { buildWrapProtostone } from '@/lib/alkanes/builders';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

describe.runIf(INTEGRATION)('Tier 1: Wrap BTC -> frBTC', () => {
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

    // Ensure wallet is funded
    const balance = await getBtcBalance(provider, segwitAddress);
    if (balance < 100_000_000n) {
      console.log('[wrap] Funding wallet...');
      await mineBlocks(provider, 201, segwitAddress);
      await sleep(3000);
    }
  }, 120_000);

  it('should wrap BTC to frBTC and verify balance changes', async () => {
    const wrapAmountSats = 1_000_000; // 0.01 BTC

    // Snapshot balances before
    const btcBefore = await getBtcBalance(provider, segwitAddress);
    const frbtcBefore = await getAlkaneBalance(provider, taprootAddress, REGTEST.FRBTC_ID);
    console.log(`[wrap] Before: BTC=${btcBefore}, frBTC=${frbtcBefore}`);

    // Build wrap transaction
    const protostones = buildWrapProtostone({ frbtcId: REGTEST.FRBTC_ID });
    const inputRequirements = `B:${wrapAmountSats}:v0`;

    const result = await alkanesExecuteTyped(provider, {
      protostones,
      inputRequirements,
      feeRate: 2,
      toAddresses: [REGTEST.FRBTC_SIGNER, taprootAddress],
      fromAddresses: [segwitAddress, taprootAddress],
      changeAddress: segwitAddress,
      alkanesChangeAddress: taprootAddress,
    });

    expect(result).toBeTruthy();
    expect(result.readyToSign || result.txid).toBeTruthy();

    // Sign and broadcast
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log(`[wrap] Broadcast txid: ${txid}`);
    expect(txid).toBeTruthy();
    expect(txid.length).toBe(64);

    // Wait for indexer
    await sleep(3000);

    // Verify balances changed
    const btcAfter = await getBtcBalance(provider, segwitAddress);
    const frbtcAfter = await getAlkaneBalance(provider, taprootAddress, REGTEST.FRBTC_ID);
    console.log(`[wrap] After: BTC=${btcAfter}, frBTC=${frbtcAfter}`);

    // Note: BTC balance may not decrease because signAndBroadcast mines a block
    // to the same address, earning a coinbase reward that can offset the wrap cost.
    // The important assertion is that frBTC was minted.

    // frBTC should have increased (wrap amount minus 0.1% fee)
    expect(frbtcAfter).toBeGreaterThan(frbtcBefore);
    const frbtcGained = frbtcAfter - frbtcBefore;
    const expectedMin = BigInt(Math.floor(wrapAmountSats * 0.99));
    expect(frbtcGained).toBeGreaterThanOrEqual(expectedMin);
    console.log(`[wrap] BTC delta: ${btcAfter - btcBefore}, frBTC gained: ${frbtcGained}`);
  }, 120_000);
});
