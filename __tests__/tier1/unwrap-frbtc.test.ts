/**
 * Tier 1: frBTC -> BTC Unwrap Test
 *
 * Verifies unwrapping frBTC back to BTC on regtest.
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/unwrap-frbtc.test.ts
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
  buildWrapProtostone,
  buildUnwrapProtostone,
  buildUnwrapInputRequirements,
} from '@/lib/alkanes/builders';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

describe.runIf(INTEGRATION)('Tier 1: Unwrap frBTC -> BTC', () => {
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
    console.log('[unwrap] Wrapping fresh BTC to get frBTC for unwrap test...');
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
    // Mine extra blocks and wait for indexer to fully process the fresh frBTC UTXO
    // This prevents a race condition where the "before" snapshot misses the wrap output
    await provider.bitcoindGenerateToAddress(5, segwitAddress);
    await sleep(8000);
  }, 120_000);

  // SKIP: frBTC contract [32:0] on regtest does not implement unwrap opcode 78.
  // Only opcodes 0,77,99-103 are available. Unwrap cannot be tested until the
  // frBTC contract is redeployed with unwrap support.
  it.skip('should unwrap frBTC to BTC and verify balance changes', async () => {
    const unwrapAmount = '500000'; // 500K frBTC units

    // Snapshot balances (check both addresses since SDK may place alkane change on either)
    const allAddrs = [taprootAddress, segwitAddress];
    const frbtcBefore = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.FRBTC_ID);
    const btcBefore = await getBtcBalance(provider, segwitAddress);
    console.log(`[unwrap] Before: frBTC=${frbtcBefore}, BTC=${btcBefore}`);

    expect(frbtcBefore).toBeGreaterThanOrEqual(BigInt(unwrapAmount));

    // Build unwrap transaction
    const protostones = buildUnwrapProtostone({ frbtcId: REGTEST.FRBTC_ID });
    const inputRequirements = buildUnwrapInputRequirements({
      frbtcId: REGTEST.FRBTC_ID,
      amount: unwrapAmount,
    });

    const result = await alkanesExecuteTyped(provider, {
      protostones,
      inputRequirements,
      feeRate: 2,
      // Put taproot first since frBTC UTXOs are there
      fromAddresses: [taprootAddress, segwitAddress],
      toAddresses: [segwitAddress],
      changeAddress: segwitAddress,
      alkanesChangeAddress: taprootAddress,
    });

    expect(result).toBeTruthy();

    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log(`[unwrap] Broadcast txid: ${txid}`);
    expect(txid).toBeTruthy();

    // Wait for indexer to process the unwrap
    await provider.bitcoindGenerateToAddress(3, segwitAddress);
    await sleep(5000);

    // Verify (check both addresses)
    const frbtcAfter = await getAlkaneBalanceMulti(provider, allAddrs, REGTEST.FRBTC_ID);
    const btcAfter = await getBtcBalance(provider, segwitAddress);
    console.log(`[unwrap] After: frBTC=${frbtcAfter}, BTC=${btcAfter}`);

    // frBTC should have decreased
    expect(frbtcAfter).toBeLessThan(frbtcBefore);

    // BTC should have increased (minus fees, with unwrap fee deducted by contract)
    // Note: BTC balance may also increase from mining in signAndBroadcast
    console.log(`[unwrap] frBTC burned: ${frbtcBefore - frbtcAfter}, BTC delta: ${btcAfter - btcBefore}`);
  }, 120_000);
});
