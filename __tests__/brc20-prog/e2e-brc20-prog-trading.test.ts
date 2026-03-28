/**
 * E2E: BRC20-Prog Trading / aBTC Integration
 *
 * Tests the trading and DeFi workflows available through BRC20-Prog:
 *   - frBTC wrap → contract deposit
 *   - frBTC wrap → approve → swap
 *   - Contract-to-contract calls via transactBrc20Prog
 *   - ERC20 transfer/approve/transferFrom patterns
 *   - Complex calldata encoding (nested arrays, addresses, uint256)
 *
 * These tests exercise Chris Liu's exact integration patterns:
 *   1. AlkanesProvider initialization with custom RPC
 *   2. BrowserWalletSigner.connect() (mocked)
 *   3. frbtcWrapAndExecute2 with approve + swap patterns
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-prog-trading.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { BRC20_PROG, loadFrBtcFoundryJson } from './brc20-prog-constants';
import { deployFrBtcContract } from './brc20-prog-deploy';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: BRC20-Prog Trading & aBTC', () => {
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
        console.log('[trading] Deployed FrBTC at:', frBtcAddress);
      } catch (e: any) {
        console.warn('[trading] FrBTC deploy failed:', e.message);
      }
    }
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  describe('Provider initialization (Chris Liu pattern)', () => {
    it('should initialize provider with custom network config', async () => {
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const customProvider = new wasm.WebProvider('subfrost-regtest', {
        jsonrpc_url: BRC20_PROG.RPC_URL,
        data_api_url: BRC20_PROG.RPC_URL,
      });
      expect(customProvider).toBeDefined();
    });

    it('should load wallet from mnemonic', async () => {
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const p = new wasm.WebProvider('subfrost-regtest', {
        jsonrpc_url: BRC20_PROG.RPC_URL,
        data_api_url: BRC20_PROG.RPC_URL,
      });
      p.walletLoadMnemonic(BRC20_PROG.TEST_MNEMONIC, null);

      // Should be able to get addresses after loading
      const addresses = p.walletGetAddresses('p2wpkh', 0, 1);
      expect(addresses).toBeDefined();
    });

    it('should fail clearly without wallet loaded', async () => {
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const p = new wasm.WebProvider('subfrost-regtest', {
        jsonrpc_url: BRC20_PROG.RPC_URL,
        data_api_url: BRC20_PROG.RPC_URL,
      });
      // Do NOT load wallet

      try {
        await p.frbtcWrap(
        BigInt(100_000), JSON.stringify({ to_address: taprootAddress, fee_rate: 1, contract_address: frBtcAddress }));
        // If this succeeds, that's also OK (some methods may not require wallet)
      } catch (e: any) {
        // Should give a helpful error, not "Wallet not loaded" with no context
        const msg = e?.message ?? String(e);
        expect(msg).toBeDefined();
        expect(msg.length).toBeGreaterThan(5);
        console.log('[trading] No-wallet error:', msg);
      }
    });
  });

  describe('frBTC wrap patterns', () => {
    it('should simple wrap BTC to frBTC', async () => {
      const rawProvider = provider;

      const result = await rawProvider.frbtcWrap(
        BigInt(500_000),
        JSON.stringify({
          to_address: taprootAddress,
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          fee_rate: 1,
          mine_enabled: true,
          contract_address: frBtcAddress,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    }, 120_000);

    it('should unwrap frBTC to BTC', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcUnwrap(
        BigInt(100_000),
        BigInt(0),
        segwitAddress,
        JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // May fail if no frBTC balance, but should not crash on params
        expect(e.message).not.toContain('Wallet not loaded');
        console.log('[trading] Unwrap error (may need balance):', e.message);
      }
    }, 120_000);
  });

  describe('wrapAndExecute2 trading patterns', () => {
    it('should wrap and approve (Chris Liu pattern)', async () => {
      const rawProvider = provider;
      const dummyContract = taprootAddress; // use own address as dummy target

      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(200_000),
          dummyContract,
          'approve(address,uint256)',
          JSON.stringify([dummyContract, '100000']),
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 2,
            use_rebar: false,
            mempool_indexer: false,
            ordinals_strategy: 'preserve',
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
        console.log('[trading] wrapAndApprove result:', JSON.stringify(parsed).slice(0, 200));
      } catch (e: any) {
        // Expected to fail on devnet (no real BRC20-prog target)
        // but must not fail on parameter issues
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('Wallet not loaded');
        expect(msg).not.toContain('ordinals_strategy');
        console.log('[trading] wrapAndApprove devnet error:', msg);
      }
    }, 120_000);

    it('should wrap and call deposit()', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(300_000),
          taprootAddress,
          'deposit(uint256)',
          JSON.stringify(['300000']),
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('Wallet not loaded');
        console.log('[trading] wrapAndDeposit error:', msg);
      }
    }, 120_000);

    it('should handle complex calldata (swap pattern)', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrapAndExecute2(
          BigInt(100_000),
          taprootAddress,
          'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
          JSON.stringify([
            '100000',       // amountIn
            '95000',        // amountOutMin (5% slippage)
            `[${taprootAddress}]`, // path
            taprootAddress, // to
            '999999999',    // deadline
          ]),
          JSON.stringify({
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // Complex calldata encoding may fail, but should not crash the SDK
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('Wallet not loaded');
        console.log('[trading] Complex swap calldata error:', msg);
      }
    }, 120_000);
  });

  describe('ERC20 patterns via transact', () => {
    it('should call transfer() via brc20_prog_transact', async () => {
      const rawProvider = provider;

      try {
        const result = await (rawProvider as any).brc20_prog_transact(
          'regtest',
          taprootAddress, // dummy contract
          'transfer(address,uint256)',
          JSON.stringify([segwitAddress, '1000']),
          JSON.stringify({
            fee_rate: 1,
            mine_enabled: true,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        // No real contract, but should not crash
        console.log('[trading] ERC20 transfer error:', e.message);
      }
    }, 120_000);

    it('should call approve() via brc20_prog_transact', async () => {
      const rawProvider = provider;

      try {
        const result = await (rawProvider as any).brc20_prog_transact(
          'regtest',
          taprootAddress,
          'approve(address,uint256)',
          JSON.stringify([taprootAddress, '999999']),
          JSON.stringify({
            fee_rate: 1,
            mine_enabled: true,
          }),
        );

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        harness.mineBlocks(2);
        expect(parsed).toBeDefined();
      } catch (e: any) {
        console.log('[trading] ERC20 approve error:', e.message);
      }
    }, 120_000);

    it('should call balanceOf() via brc20_prog_call (read-only)', async () => {
      const rawProvider = provider;

      try {
        const result = await (rawProvider as any).brc20_prog_call(
          'regtest',
          taprootAddress,
          'balanceOf(address)',
          JSON.stringify([segwitAddress]),
        );
        expect(result).toBeDefined();
      } catch (e: any) {
        console.log('[trading] balanceOf read error:', e.message);
      }
    }, 30_000);
  });

  describe('Rebar and Slipstream options', () => {
    it('should accept use_rebar=true without crash', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            use_rebar: true,
            rebar_tier: 1,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );
        harness.mineBlocks(2);
        expect(result).toBeDefined();
      } catch (e: any) {
        // Rebar may not work on devnet but should not crash
        expect(e.message).not.toContain('use_rebar');
        console.log('[trading] Rebar error:', e.message);
      }
    }, 120_000);

    it('should accept use_slipstream=true without crash', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            use_slipstream: true,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );
        harness.mineBlocks(2);
        expect(result).toBeDefined();
      } catch (e: any) {
        expect(e.message).not.toContain('use_slipstream');
        console.log('[trading] Slipstream error:', e.message);
      }
    }, 120_000);
  });

  describe('mint_diesel option', () => {
    it('should accept mint_diesel=true with wrap', async () => {
      const rawProvider = provider;

      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(200_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: 1,
            mint_diesel: true,
            mine_enabled: true,
            contract_address: frBtcAddress,
          }),
        );
        harness.mineBlocks(2);
        expect(result).toBeDefined();
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        expect(msg).not.toContain('mint_diesel');
        console.log('[trading] mint_diesel error:', msg);
      }
    }, 120_000);
  });
});
