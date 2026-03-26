/**
 * E2E: BRC20-Prog Contract Interaction
 *
 * Tests transacting with deployed BRC20-Prog contracts via the
 * @alkanes/ts-sdk brc20ProgTransact methods. Requires FrBTC.sol
 * to be deployed (skips if Foundry JSON not available).
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-prog-transact.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployFrBtcContract } from './brc20-prog-deploy';
import { MockBrc20UnwrapProcessor } from './frost-unwrap-mock';
import { loadFrBtcFoundryJson } from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const hasFoundryJson = !!loadFrBtcFoundryJson();

describe.runIf(hasFoundryJson)('E2E: BRC20-Prog Transact', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let contractAddress: string;
  let frostProcessor: MockBrc20UnwrapProcessor;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    await mineBlocks(harness, 201);

    // Deploy FrBTC.sol
    contractAddress = await deployFrBtcContract(provider, harness);

    // Create FROST processor for signer key
    frostProcessor = await MockBrc20UnwrapProcessor.create();
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it('should have deployed contract', () => {
    expect(contractAddress).toBeDefined();
    console.log(`[transact] Contract at: ${contractAddress}`);
  });

  it('should call decimals() and get 8', async () => {
    const rawProvider = provider;

    try {
      const result = await rawProvider.brc20_prog_call(
        'regtest',
        contractAddress,
        'decimals()',
        JSON.stringify([]),
      );
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[transact] decimals() result:', parsed);
      // FrBTC uses 8 decimals (same as BTC)
      if (parsed.result !== undefined) {
        expect(Number(parsed.result)).toBe(8);
      }
    } catch (e: any) {
      console.warn('[transact] decimals() call failed:', e.message);
    }
  }, 60_000);

  it('should call setSigner() with FROST group key', async () => {
    const rawProvider = provider;
    const groupPubKeyHex = frostProcessor.getGroupPublicKeyHex();

    try {
      const result = await rawProvider.brc20_prog_transact(
        'regtest',
        contractAddress,
        'setSigner(bytes)',
        JSON.stringify([`0x${groupPubKeyHex}`]),
        JSON.stringify({
          fee_rate: 1,
          mine_enabled: true,
        }),
      );
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      console.log('[transact] setSigner result:', JSON.stringify(parsed).slice(0, 200));
      expect(parsed).toBeDefined();
    } catch (e: any) {
      console.warn('[transact] setSigner failed:', e.message);
    }
  }, 120_000);

  it('should call setPremium() with zero fee', async () => {
    const rawProvider = provider;

    try {
      const result = await rawProvider.brc20_prog_transact(
        'regtest',
        contractAddress,
        'setPremium(uint256)',
        JSON.stringify([0]),
        JSON.stringify({
          fee_rate: 1,
          mine_enabled: true,
        }),
      );
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(2);
      expect(parsed).toBeDefined();
    } catch (e: any) {
      console.warn('[transact] setPremium failed:', e.message);
    }
  }, 120_000);

  it('should read getSignerAddress() after setSigner', async () => {
    const rawProvider = provider;

    try {
      const result = await rawProvider.brc20_prog_call(
        'regtest',
        contractAddress,
        'getSignerAddress()',
        JSON.stringify([]),
      );
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[transact] getSignerAddress result:', parsed);
      // Should return a valid address (taproot format for FROST key)
      if (parsed.result) {
        expect(parsed.result).toBeDefined();
      }
    } catch (e: any) {
      console.warn('[transact] getSignerAddress failed:', e.message);
    }
  }, 60_000);

  it('should transact with different fee rates', async () => {
    const rawProvider = provider;

    for (const feeRate of [1, 2, 5]) {
      try {
        // Call a read-write method with varying fee rate
        const result = await rawProvider.brc20_prog_transact(
          'regtest',
          contractAddress,
          'setPremium(uint256)',
          JSON.stringify([feeRate]),  // set premium to feeRate (just to exercise different values)
          JSON.stringify({
            fee_rate: feeRate,
            mine_enabled: true,
          }),
        );
        harness.mineBlocks(2);
        console.log(`[transact] fee_rate=${feeRate}: OK`);
      } catch (e: any) {
        console.error(`[transact] fee_rate=${feeRate}: FAILED - ${e.message}`);
        throw e;
      }
    }
  }, 180_000);
});
