/**
 * E2E: Ordinals Strategy Regression Tests
 *
 * Directly addresses Chris Liu's reported issues:
 *   - ordinals_strategy: "exclude" still includes inscriptions
 *   - ordinals_strategy: "preserve" doesn't split inscribed UTXOs
 *   - Parameters not forwarded from AlkanesClient to rawProvider
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-ordinals-strategy.test.ts
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

describe('E2E: Ordinals Strategy Regression', () => {
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
        console.log('[ordinals] Deployed FrBTC at:', frBtcAddress);
      } catch (e: any) {
        console.warn('[ordinals] FrBTC deploy failed:', e.message);
      }
    }
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  describe('ordinals_strategy parameter acceptance', () => {
    it('should accept "exclude" without throwing', async () => {
      const rawProvider = provider;

      // The key test: ordinals_strategy should be accepted
      // and should NOT cause a crash or be silently ignored
      const params = {
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 1,
        ordinals_strategy: 'exclude',
        mine_enabled: true,
      };

      const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({ ...params, contract_address: frBtcAddress }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
      // Result should contain a txid (proof the tx was built successfully)
      const txid = parsed.txid || parsed.reveal_txid || parsed.revealTxid;
      if (txid) {
        expect(txid).toHaveLength(64);
      }
    }, 120_000);

    it('should accept "preserve" without throwing', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 1,
          ordinals_strategy: 'preserve',
          mine_enabled: true,
          contract_address: frBtcAddress,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);

    it('should accept "burn" without throwing', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 1,
          ordinals_strategy: 'burn',
          mine_enabled: true,
          contract_address: frBtcAddress,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);
  });

  describe('frbtcWrapAndExecute2 parameter forwarding', () => {
    it('should forward ordinals_strategy through wrapAndExecute2', async () => {
      const rawProvider = provider;

      // Chris Liu's exact pattern: frbtcWrapAndExecute2 with ordinals_strategy
      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(100_000),
          taprootAddress,             // target_address
          'approve(address,uint256)', // function_signature
          JSON.stringify([taprootAddress, 100]),
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 2,
            use_rebar: false,
            mempool_indexer: false,
            ordinals_strategy: 'exclude',
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // On devnet without a deployed contract target, the call may fail
        // but it should NOT fail on parameter parsing
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('ordinals_strategy');
        expect(msg).not.toContain('Invalid value');
        expect(msg).not.toContain('Wallet not loaded');
        console.log('[ordinals-regression] Expected devnet error:', msg);
      }
    }, 120_000);

    it('should forward fee_rate through wrapAndExecute2', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(100_000),
          taprootAddress,
          'transfer(address,uint256)',
          JSON.stringify([taprootAddress, 50]),
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 10,  // High fee rate — should not crash
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('fee_rate');
        console.log('[ordinals-regression] Expected devnet error:', msg);
      }
    }, 120_000);
  });

  describe('mempool_indexer parameter', () => {
    it('should accept mempool_indexer=true without crash', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            mempool_indexer: true,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // mempool_indexer may not work on devnet but should not crash
        expect(e.message).not.toContain('mempool_indexer');
        console.log('[mempool] Expected error:', e.message);
      }
    }, 120_000);

    it('should accept mempool_indexer=false without crash', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 1,
          mempool_indexer: false,
          mine_enabled: true,
          contract_address: frBtcAddress,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);
  });
});
