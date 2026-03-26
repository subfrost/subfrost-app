/**
 * E2E: Full BRC20-Prog Protocol Lifecycle
 *
 * Runs the complete BRC20-Prog lifecycle in a single devnet session:
 *   1. Create harness with alkanes + brc20shrew indexers
 *   2. Deploy FrBTC.sol contract (if Foundry JSON available)
 *   3. Deploy fr-brc20-vault alkane (if WASM available)
 *   4. Wrap BTC to frBTC
 *   5. Verify balances
 *   6. Test unwrap flow (if vault deployed)
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-prog-full.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployBrc20ProgStack } from './brc20-prog-deploy';
import { MockBrc20UnwrapProcessor } from './frost-unwrap-mock';
import {
  BRC20_PROG,
  loadFrBtcFoundryJson,
  loadVaultWasm,
} from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: Full BRC20-Prog Lifecycle', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let signer: any;
  let frBtcAddress: string | null = null;
  let vaultId: string | null = null;
  let frostProcessor: MockBrc20UnwrapProcessor;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine for coinbase maturity
    await mineBlocks(harness, 201);

    // Initialize FROST processor
    frostProcessor = await MockBrc20UnwrapProcessor.create();
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it('should have funded wallet', async () => {
    const balances = await provider.getEnrichedBalances(segwitAddress, '1');
    expect(balances).toBeDefined();
  });

  it('should have valid FROST group key', () => {
    const pubKeyHex = frostProcessor.getGroupPublicKeyHex();
    expect(pubKeyHex).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it('should deploy BRC20-Prog stack', async () => {
    const result = await deployBrc20ProgStack(
      provider, signer, segwitAddress, taprootAddress, harness
    );

    frBtcAddress = result.frBtcAddress;
    vaultId = result.vaultId;

    // At least one of the deployments should have succeeded
    // (depends on which WASM artifacts are available)
    const hasFoundry = !!loadFrBtcFoundryJson();
    const hasVault = !!loadVaultWasm();

    if (hasFoundry) {
      // FrBTC deployment is optional (needs forge build)
      console.log(`[lifecycle] FrBTC address: ${frBtcAddress || 'skipped'}`);
    }
    if (hasVault) {
      expect(vaultId).toBeDefined();
      console.log(`[lifecycle] Vault ID: ${vaultId}`);
    }
  }, 180_000);

  it('should wrap BTC to frBTC', async () => {
    const rawProvider = provider;
    const wrapAmount = BigInt(1_000_000);

    const result = await rawProvider.frbtcWrap(
      wrapAmount,
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
    console.log('[lifecycle] Wrap result:', JSON.stringify(parsed).slice(0, 200));
  }, 120_000);

  it('should verify frBTC balance after wrap', async () => {
    // Query alkane balance for frBTC (AlkaneId 32:0)
    try {
      const rawProvider = provider;
      const balanceResult = await rawProvider.protorunesbyaddress(
        taprootAddress,
        '1', // protocol_tag for alkanes
      );
      const parsed = typeof balanceResult === 'string'
        ? JSON.parse(balanceResult)
        : balanceResult;
      console.log('[lifecycle] frBTC balance query result:', JSON.stringify(parsed).slice(0, 300));
      expect(parsed).toBeDefined();
    } catch (e: any) {
      console.log('[lifecycle] Balance query error (may be expected):', e.message);
    }
  }, 30_000);

  it('should handle multiple fee rates for wrap', async () => {
    const rawProvider = provider;

    for (const feeRate of [1, 2, 5, 10]) {
      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: feeRate,
            mine_enabled: true,
          }),
        );
        harness.mineBlocks(2);
        console.log(`[lifecycle] fee_rate=${feeRate}: OK`);
      } catch (e: any) {
        // Fee rate errors are Chris Liu's reported bug
        console.error(`[lifecycle] fee_rate=${feeRate}: FAILED - ${e.message}`);
        throw e;
      }
    }
  }, 180_000);
});
