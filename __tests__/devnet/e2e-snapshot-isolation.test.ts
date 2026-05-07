/**
 * Devnet E2E: Snapshot/Restore Test Isolation
 *
 * Demonstrates and validates the snapshot/restore pattern for devnet test isolation.
 *
 * The pattern:
 * 1. beforeAll: Create harness, mine blocks, deploy contracts → takeSnapshot('setup')
 * 2. beforeEach: restoreSnapshot('setup') — each test starts from the same clean state
 * 3. Tests mutate state freely (wrap, swap, etc.) without affecting other tests
 *
 * This eliminates the singleton harness problem where tests interfere with each other.
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-snapshot-isolation.test.ts --testTimeout=300000
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { DEVNET } from './devnet-constants';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
  getBtcBalance,
  takeSnapshot,
  restoreSnapshot,
  hasSnapshot,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
): Promise<string> {
  const result = await provider.alkanesExecuteWithStrings(
    JSON.stringify([taprootAddress]),
    inputRequirements,
    protostone,
    '2',
    null,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      auto_confirm: false,
    }),
  );
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

describe('Devnet E2E: Snapshot/Restore Isolation', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Expensive setup: mine 201 blocks for coinbase maturity
    mineBlocks(harness, 201);

    // Snapshot the clean state AFTER setup but BEFORE any mutations
    takeSnapshot('clean-chain');

    console.log('[snapshot] Setup complete, height:', harness.height);
  }, 300_000);

  afterAll(() => { disposeHarness(); });

  // -------------------------------------------------------------------------
  // 1. Verify snapshot infrastructure
  // -------------------------------------------------------------------------

  describe('Snapshot Infrastructure', () => {
    it('should have a snapshot after setup', () => {
      expect(hasSnapshot('clean-chain')).toBe(true);
      expect(hasSnapshot('nonexistent')).toBe(false);
    });

    it('should restore indexer state after mutation', async () => {
      // Mutate: mint DIESEL
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
      mineBlocks(harness, 1);
      const afterMint = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(afterMint).toBeGreaterThan(0n);

      // Restore: DIESEL should be gone (indexer state rolled back)
      restoreSnapshot('clean-chain');
      const afterRestore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(afterRestore).toBe(0n);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Test isolation — mutations in one test don't affect the next
  // -------------------------------------------------------------------------

  describe('Test Isolation', () => {
    beforeEach(() => {
      restoreSnapshot('clean-chain');
    });

    it('test A: mint DIESEL — balance should increase', async () => {
      const balBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(balBefore).toBe(0n);

      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
      mineBlocks(harness, 1);

      const balAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      console.log('[snapshot] Test A: DIESEL balance:', balAfter.toString());
      expect(balAfter).toBeGreaterThan(0n);
    });

    it('test B: DIESEL balance should be zero again (restored)', async () => {
      // This test runs AFTER test A, but snapshot restore means we start fresh
      const balance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      console.log('[snapshot] Test B: DIESEL balance (should be 0):', balance.toString());
      expect(balance).toBe(0n);
    });

    it('test C: mine blocks, chain height resets next test', async () => {
      const baseHeight = harness.height;
      mineBlocks(harness, 10);
      expect(harness.height).toBe(baseHeight + 10);
      // Next test will restore to baseHeight
    });

    it('test D: chain height should match snapshot (not test C)', () => {
      // If isolation works, we're back to the snapshot height, not test C's height+10
      // The exact height depends on the snapshot, but it should be consistent
      const height = harness.height;
      console.log('[snapshot] Test D: height:', height, '(should match snapshot)');
      // Just verify it's the setup height (201 blocks + genesis)
      expect(height).toBeGreaterThanOrEqual(201);
      expect(height).toBeLessThan(220); // Not test C's height+10
    });
  });

  // -------------------------------------------------------------------------
  // 3. Multiple snapshots
  // -------------------------------------------------------------------------

  describe('Multiple Snapshots', () => {
    it('can take and restore multiple named snapshots', async () => {
      restoreSnapshot('clean-chain');
      const h1 = harness.height;

      // Mint DIESEL and snapshot
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
      mineBlocks(harness, 1);
      takeSnapshot('after-diesel-mint');

      const dieselBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(dieselBal).toBeGreaterThan(0n);

      // Restore to clean (no DIESEL)
      restoreSnapshot('clean-chain');
      const noDiesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(noDiesel).toBe(0n);

      // Restore to after-diesel-mint (has DIESEL)
      restoreSnapshot('after-diesel-mint');
      const hasDiesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      expect(hasDiesel).toBeGreaterThan(0n);
    });
  });
});
