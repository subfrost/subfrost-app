/**
 * Tier 1: frBTC -> DIESEL Swap Test
 *
 * Verifies reverse swap direction via factory opcode 13 works on regtest.
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/swap-frbtc-diesel.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { REGTEST } from '../shared/regtest-constants';
import {
  createRegtestTestContext,
  getAlkaneBalance,
  getAlkaneBalanceMulti,
  getBtcBalance,
  mineBlocks,
  sleep,
} from '../shared/regtest-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import {
  buildSwapProtostone,
  buildSwapInputRequirements,
} from '@/lib/alkanes/builders';
import { buildWrapProtostone } from '@/lib/alkanes/builders';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

describe.runIf(INTEGRATION)('Tier 1: Swap frBTC -> DIESEL', () => {
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

    // Fund with BTC if needed
    const btcBalance = await getBtcBalance(provider, segwitAddress);
    if (btcBalance < 100_000_000n) {
      await mineBlocks(provider, 201, segwitAddress);
      await sleep(3000);
    }

    // Always wrap fresh BTC→frBTC to ensure a fresh UTXO on taproot.
    // This prevents issues where the SDK selects stale 0-balance frBTC UTXOs
    // from previous tests.
    console.log('[swap-frbtc] Wrapping fresh BTC to get frBTC...');
    const wrapProtostones = buildWrapProtostone({ frbtcId: REGTEST.FRBTC_ID });
    const wrapResult = await alkanesExecuteTyped(provider, {
      protostones: wrapProtostones,
      inputRequirements: `B:5000000:v0`,
      feeRate: 2,
      toAddresses: [REGTEST.FRBTC_SIGNER, taprootAddress],
      fromAddresses: [segwitAddress, taprootAddress],
      changeAddress: segwitAddress,
      alkanesChangeAddress: taprootAddress,
    });
    await signAndBroadcast(provider, wrapResult, signer, segwitAddress);
    await sleep(3000);
  }, 120_000);

  it('should swap frBTC for DIESEL and verify balance changes', async () => {
    const swapAmount = '500000'; // 500K frBTC (in base units)

    // Snapshot balances (check both addresses since SDK may place alkane change on either)
    const allAddrs = [taprootAddress, segwitAddress];
    const frbtcBefore = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.FRBTC_ID);
    const dieselBefore = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.DIESEL_ID);
    console.log(`[swap] Before: frBTC=${frbtcBefore}, DIESEL=${dieselBefore}`);

    expect(frbtcBefore).toBeGreaterThanOrEqual(BigInt(swapAmount));

    // Get deadline
    const heightResult = await (await fetch(REGTEST.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_height', params: [], id: 1 }),
    })).json();
    const deadline = (Number(heightResult.result) + 1000).toString();

    // Build swap
    const protostones = buildSwapProtostone({
      factoryId: REGTEST.FACTORY_ID,
      sellTokenId: REGTEST.FRBTC_ID,
      buyTokenId: REGTEST.DIESEL_ID,
      sellAmount: swapAmount,
      minOutput: '1',
      deadline,
    });

    const inputRequirements = buildSwapInputRequirements({
      alkaneInputs: [{ alkaneId: REGTEST.FRBTC_ID, amount: swapAmount }],
    });

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

    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log(`[swap] Broadcast txid: ${txid}`);
    expect(txid).toBeTruthy();

    await sleep(3000);

    // Verify (check both addresses)
    const frbtcAfter = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.FRBTC_ID);
    const dieselAfter = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.DIESEL_ID);
    console.log(`[swap] After: frBTC=${frbtcAfter}, DIESEL=${dieselAfter}`);

    expect(frbtcAfter).toBeLessThan(frbtcBefore);
    expect(dieselAfter).toBeGreaterThan(dieselBefore);

    console.log(`[swap] frBTC spent: ${frbtcBefore - frbtcAfter}, DIESEL gained: ${dieselAfter - dieselBefore}`);
  }, 120_000);
});
