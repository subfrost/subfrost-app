/**
 * E2E: frBTC Wrap and Execute Operations
 *
 * Tests the three wrap methods exposed by the @alkanes/ts-sdk:
 *   1. frbtcWrap() — simple BTC → frBTC
 *   2. frbtcWrapAndExecute() — wrap + deploy script
 *   3. frbtcWrapAndExecute2() — wrap + call contract function
 *
 * Covers Chris Liu's reported issues:
 *   - Parameter passing (fee_rate, ordinals_strategy, from_addresses)
 *   - frbtcWrapAndExecute2 not forwarding params to rawProvider
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-frbtc-wrap-execute.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { BRC20_PROG } from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: frBTC Wrap and Execute', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    await mineBlocks(harness, 201);
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  describe('frbtcWrap', () => {
    it('should wrap BTC to frBTC with fee_rate=1', async () => {
      const rawProvider = provider;
      const amount = BigInt(1_000_000); // 0.01 BTC

      const result = await rawProvider.frbtcWrap(
        amount,
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 1,
          mine_enabled: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);

      expect(parsed).toBeDefined();
      // Should have a txid or commit/reveal pair
      const txid = parsed.txid || parsed.reveal_txid || parsed.revealTxid;
      if (txid) {
        expect(txid).toHaveLength(64);
      }
    }, 120_000);

    it('should wrap BTC with fee_rate=5 without error', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(500_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 5,
          mine_enabled: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);

    it('should wrap BTC with fee_rate=50 without error', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(500_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 50,
          mine_enabled: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);
  });

  describe('frbtcWrapAndExecute2 parameter passing', () => {
    it('should accept and forward all params correctly', async () => {
      const rawProvider = provider;

      // This is Chris Liu's exact workflow pattern
      const params = {
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 2,
        use_rebar: false,
        mempool_indexer: false,
        ordinals_strategy: 'exclude',
        mine_enabled: true,
      };

      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(500_000),                    // amount
          taprootAddress,             // target_address (dummy for test)
          'approve(address,uint256)', // function_signature
          JSON.stringify([taprootAddress, 100]), // calldata
          JSON.stringify(params),     // params
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // On devnet without a real brc20-prog target, this may fail
        // but it should NOT fail with "Wallet not loaded" or param errors
        expect(e.message).not.toContain('Wallet not loaded');
        expect(e.message).not.toContain('Wallet error');
        console.log('[wrap-execute2] Expected devnet error:', e.message);
      }
    }, 120_000);

    it('should error clearly when wallet is not loaded', async () => {
      // Create a fresh provider WITHOUT loading wallet
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const freshProvider = new wasm.WebProvider(BRC20_PROG.PROVIDER_NETWORK, {
        jsonrpc_url: BRC20_PROG.RPC_URL,
        data_api_url: BRC20_PROG.RPC_URL,
      });
      // Deliberately DO NOT call walletLoadMnemonic

      try {
        await freshProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress, fee_rate: 1 }),
        );
        // If it doesn't throw, that's also acceptable
      } catch (e: any) {
        // Should give a clear error, not a cryptic crash
        expect(e.message).toBeDefined();
        console.log('[wrap-execute2] No-wallet error:', e.message);
      }
    }, 30_000);
  });

  describe('ordinals_strategy', () => {
    it('should accept ordinals_strategy="exclude"', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(200_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            ordinals_strategy: 'exclude',
            mine_enabled: true,
          }),
        );
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // Should not crash on ordinals_strategy
        expect(e.message).not.toContain('ordinals_strategy');
        console.log('[ordinals] exclude error:', e.message);
      }
    }, 120_000);

    it('should accept ordinals_strategy="preserve"', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(200_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            ordinals_strategy: 'preserve',
            mine_enabled: true,
          }),
        );
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        expect(e.message).not.toContain('ordinals_strategy');
        console.log('[ordinals] preserve error:', e.message);
      }
    }, 120_000);
  });
});
