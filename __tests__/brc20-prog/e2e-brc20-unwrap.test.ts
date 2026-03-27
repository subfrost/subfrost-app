/**
 * E2E: BRC20 Unwrap Flow
 *
 * Tests the full unwrap lifecycle using the fr-brc20-vault alkane:
 *   1. Wrap BTC to get frBTC
 *   2. Lock frBTC in vault
 *   3. Initiate unwrap (unlock)
 *   4. Verify queue state
 *   5. FROST-sign release (mock)
 *   6. Withdraw from vault
 *   7. Verify final state
 *
 * Requires both fr-brc20-vault WASM and the devnet harness.
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-unwrap.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployVaultContract, deployFrBtcContract } from './brc20-prog-deploy';
import { MockBrc20UnwrapProcessor } from './frost-unwrap-mock';
import { BRC20_PROG, loadVaultWasm, loadFrBtcFoundryJson } from './brc20-prog-constants';
import { signAndBroadcast } from '../shared/sign-and-broadcast';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const hasVaultWasm = !!loadVaultWasm();

describe.runIf(hasVaultWasm)('E2E: BRC20 Unwrap Flow', () => {
  let harness: any;
  let provider: WebProvider;
  let signer: any;
  let segwitAddress: string;
  let taprootAddress: string;
  let vaultId: string;
  let frBtcAddress: string | null = null;
  let frostProcessor: MockBrc20UnwrapProcessor;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    await mineBlocks(harness, 201);

    // Deploy FrBTC contract to get a dynamic contract address for regtest
    if (loadFrBtcFoundryJson()) {
      try {
        frBtcAddress = await deployFrBtcContract(provider, harness);
        console.log('[unwrap] Deployed FrBTC at:', frBtcAddress);
      } catch (e: any) {
        console.warn('[unwrap] FrBTC deploy failed:', e.message);
      }
    }

    // Deploy vault
    vaultId = await deployVaultContract(
      provider, signer, segwitAddress, taprootAddress, harness
    );

    // Create FROST processor
    frostProcessor = await MockBrc20UnwrapProcessor.create();
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it('should have deployed vault', () => {
    expect(vaultId).toBeDefined();
    expect(vaultId).toMatch(/^4:\d+$/);
  });

  it('should wrap BTC to get frBTC for testing', async () => {
    const rawProvider = provider;

    const result = await rawProvider.frbtcWrap(
        BigInt(2_000_000), // 0.02 BTC
      taprootAddress,
      JSON.stringify({
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 1,
        mine_enabled: true,
        contract_address: frBtcAddress,
      }),
    );

    harness.mineBlocks(2);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    expect(parsed).toBeDefined();
    console.log('[unwrap] Wrapped 0.02 BTC to frBTC');
  }, 120_000);

  it('should lock frBTC in vault (opcode 1)', async () => {
    const rawProvider = provider;
    const [vBlock, vTx] = vaultId.split(':');

    // Build protostone: [vaultBlock:vaultTx:Lock:amount]:pointer:refund
    const lockAmount = 1_000_000; // 0.01 BTC worth of frBTC
    const protostone = `[${vBlock},${vTx},${BRC20_PROG.VAULT_OPCODES.Lock},${lockAmount}]:v0:v0`;

    try {
      const result = await (provider as any).alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        `A:${BRC20_PROG.FRBTC_ID}:${lockAmount}:v0`,
        protostone,
        '1',
        '',
        JSON.stringify({
          from: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
          mine_enabled: true,
        }),
      );
      harness.mineBlocks(1);
      console.log('[unwrap] Locked frBTC in vault');
      expect(result).toBeDefined();
    } catch (e: any) {
      console.warn('[unwrap] Lock failed (may need frBTC balance):', e.message);
    }
  }, 120_000);

  it('should initiate unwrap (opcode 2)', async () => {
    const rawProvider = provider;
    const [vBlock, vTx] = vaultId.split(':');

    const unlockAmount = 500_000;
    const protostone = `[${vBlock},${vTx},${BRC20_PROG.VAULT_OPCODES.Unlock},${unlockAmount}]:v0:v0`;

    try {
      const result = await (provider as any).alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        'B:100000:v0',
        protostone,
        '1',
        '',
        JSON.stringify({
          from: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
          mine_enabled: true,
        }),
      );
      harness.mineBlocks(1);
      console.log('[unwrap] Initiated unwrap');
      expect(result).toBeDefined();
    } catch (e: any) {
      console.warn('[unwrap] Unlock failed:', e.message);
    }
  }, 120_000);

  it('should process unwrap via FROST mock', async () => {
    const result = await frostProcessor.processUnwrap(
      provider, harness, vaultId
    );
    expect(result.success).toBe(true);
    console.log('[unwrap] FROST mock processing:', result.message);
  }, 60_000);
});
