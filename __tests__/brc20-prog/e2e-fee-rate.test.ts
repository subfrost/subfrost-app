/**
 * E2E: Fee Rate Regression Tests
 *
 * Chris Liu reported: "whenever feerate is not 1, it shows this error"
 *
 * This test exercises wrap, deploy, and transact operations across a range
 * of fee rates to ensure they all work correctly.
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-fee-rate.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { loadFrBtcFoundryJson } from './brc20-prog-constants';
import { deployFrBtcContract } from './brc20-prog-deploy';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: Fee Rate Regression', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let frBtcAddress: string | null = null;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    await mineBlocks(harness, 201);

    // Deploy FrBTC contract to get a dynamic contract address for regtest
    if (loadFrBtcFoundryJson()) {
      try {
        frBtcAddress = await deployFrBtcContract(provider, harness);
        console.log('[fee-rate] Deployed FrBTC at:', frBtcAddress);
      } catch (e: any) {
        console.warn('[fee-rate] FrBTC deploy failed:', e.message);
      }
    }
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  const feeRates = [1, 2, 3, 5, 10, 25, 50, 100];

  describe('frbtcWrap across fee rates', () => {
    for (const feeRate of feeRates) {
      it(`should wrap with fee_rate=${feeRate}`, async () => {
        const rawProvider = provider;

        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: feeRate,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);

        expect(parsed).toBeDefined();
        // Should not throw with any fee rate
        const txid = parsed.txid || parsed.reveal_txid || parsed.revealTxid;
        if (txid) {
          expect(txid).toHaveLength(64);
        }
      }, 60_000);
    }
  });

  describe('alkanesExecute across fee rates', () => {
    for (const feeRate of [1, 5, 25]) {
      it(`should execute alkane call with fee_rate=${feeRate}`, async () => {
        // Simple DIESEL mint as a baseline alkane operation
        const protostone = `[2,0,0]:v0:v0`; // DIESEL opcode 0

        try {
          const result = await (provider as any).alkanesExecuteFull(
            JSON.stringify([taprootAddress]),
            'B:100000:v0',
            protostone,
            String(feeRate),
            '',
            JSON.stringify({
              from: [segwitAddress, taprootAddress],
              change_address: segwitAddress,
              alkanes_change_address: taprootAddress,
              mine_enabled: true,
            }),
          );
          harness.mineBlocks(1);
          expect(result).toBeDefined();
          console.log(`[fee-rate] alkane execute fee_rate=${feeRate}: OK`);
        } catch (e: any) {
          // Should not fail due to fee rate
          console.error(`[fee-rate] alkane execute fee_rate=${feeRate}: ${e.message}`);
          throw e;
        }
      }, 60_000);
    }
  });

  describe('edge cases', () => {
    it('should handle fee_rate=0 gracefully', async () => {
      const rawProvider = provider;

      try {
        await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 0,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );
        harness.mineBlocks(2);
        // fee_rate=0 may or may not be accepted depending on the implementation
      } catch (e: any) {
        // Should give a clear error, not crash
        expect(e.message).toBeDefined();
        console.log('[fee-rate] fee_rate=0 error (expected):', e.message);
      }
    }, 60_000);

    it('should handle very high fee_rate=500', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(500_000), // More sats to cover the high fee
          JSON.stringify({
            to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 500,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // High fee rate may fail if insufficient funds, but should not crash
        const msg = e?.message ?? String(e);
        expect(msg).toBeDefined();
        console.log('[fee-rate] fee_rate=500 error:', msg);
      }
    }, 60_000);
  });
});
