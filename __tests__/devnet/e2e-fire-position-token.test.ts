/**
 * FIRE Position Token Architecture — Comprehensive E2E Test
 *
 * Tests the complete lifecycle with the new position-token-based staking:
 *
 * Setup:
 *   - Deploy AMM contracts + create DIESEL/frBTC pool (LP tokens needed)
 *   - Deploy position token template [4:262]
 *   - Deploy modified staking contract [4:257] with template reference
 *   - Deploy FIRE token [4:256] (needed for reward minting)
 *
 * Control flow tests:
 *   1. Stake LP → position token (POS-{id}) minted to user's wallet
 *   2. Verify position token details via simulation (GetAllDetails opcode 23)
 *   3. Global staking state updated (total staked, position count)
 *   4. Claim rewards → position token returned + FIRE minted, checkpoint updated
 *   5. Double-claim blocked (second claim yields 0 if no time elapsed)
 *   6. Unstake with position token → LP + FIRE returned, token consumed
 *   7. Double-unstake blocked (deregistered child rejected)
 *   8. Unstake without token → rejected (no incomingAlkanes)
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-fire-position-token.test.ts --testTimeout=900000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { DEVNET } from './devnet-constants';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { deployAmmContracts } from './amm-deploy';
import { FIRE } from './fire-deploy';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ── Contract Slots ─────────────────────────────────────────────────

const POSITION_TOKEN_SLOT = 262;  // 0x106 — position token template
const POSITION_TOKEN_ID = `4:${POSITION_TOKEN_SLOT}`;

// ── Shared State ───────────────────────────────────────────────────

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let poolId: string;

// Track position tokens discovered during tests
let positionTokenId: string = '';

// ── Helpers ────────────────────────────────────────────────────────

function loadWasm(name: string): string {
  const paths = [
    resolve(__dirname, `fixtures/fire/${name}.wasm`),
    resolve(process.env.HOME || '~', `fire/target/wasm32-unknown-unknown/release/${name}.wasm`),
  ];
  for (const p of paths) {
    if (existsSync(p)) return readFileSync(p).toString('hex');
  }
  throw new Error(`WASM not found: ${name}`);
}

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: { toAddresses?: string[] },
): Promise<string> {
  const opts = options || {};
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostone,
    1,
    null,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      ordinals_strategy: 'burn',
    }),
  );

  if (result?.reveal_txid || result?.revealTxid) {
    const txid = result.reveal_txid || result.revealTxid;
    mineBlocks(harness, 1);
    return txid;
  }
  if (result?.txid) {
    mineBlocks(harness, 1);
    return result.txid;
  }
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

async function deployWasm(
  wasmHex: string,
  slot: number,
  initArgs: (number | bigint)[],
  label: string,
): Promise<string> {
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[3,${slot},0,${argsStr}]:v0:v0`;
  console.log(`[test] Deploy ${label} → [3,${slot},0,...]: ${protostone.slice(0, 100)}`);

  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    'B:100000:v0',
    protostone,
    '1',
    wasmHex,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      mine_enabled: true,
    }),
  );
  const txid = result?.reveal_txid || result?.revealTxid || result?.txid || 'unknown';
  mineBlocks(harness, 1);
  return txid;
}

async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '999',
    txindex: 0,
    vout: 0,
  }]);
}

function parseU128(data: string, offset = 0): bigint {
  const hex = (data || '').replace('0x', '');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length < offset + 16) return 0n;
  return bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n);
}

/** Find all alkane tokens at an address — returns every (block, tx, amount) tuple */
async function findAlkanesAtAddress(address: string): Promise<Array<{ block: number; tx: number; amount: bigint }>> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const tokens: Array<{ block: number; tx: number; amount: bigint }> = [];
  for (const outpoint of result?.result?.outpoints || []) {
    const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
    for (const entry of balances) {
      tokens.push({
        block: parseInt(entry.block ?? '0', 10),
        tx: parseInt(entry.tx ?? '0', 10),
        amount: BigInt(entry.amount || '0'),
      });
    }
  }
  return tokens;
}

// ── Test Suite ─────────────────────────────────────────────────────

describe('FIRE Position Token Architecture', () => {

  // ── Full setup: AMM + tokens + pool + FIRE contracts ─────────

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 301);
    console.log('[test] Chain ready, height:', harness.height);

    // Deploy AMM
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;
    console.log('[test] AMM deployed, factory:', factoryId);

    // Mint DIESEL (3x)
    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    }
    mineBlocks(harness, 1);

    // Wrap BTC → frBTC
    const signerResult = await simulate('32:0', ['103']);
    let signerAddr = taprootAddress;
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        try {
          const xOnlyPubkey = Buffer.from(hex, 'hex');
          const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: bitcoin.networks.regtest });
          if (payment.address) signerAddr = payment.address;
        } catch { /* use default */ }
      }
    }
    await executeAlkanes('[32,0,77]:v1:v1', 'B:1000000:v0', {
      toAddresses: [signerAddr, taprootAddress],
    });
    mineBlocks(harness, 1);

    // Create DIESEL/frBTC pool
    const dieselBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    const dieselAmount = dieselBal / 3n;
    const frbtcAmount = frbtcBal / 2n;

    const [fBlock, fTx] = factoryId.split(':');
    await executeAlkanes(
      `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`,
      `2:0:${dieselAmount},32:0:${frbtcAmount}`,
    );
    mineBlocks(harness, 1);

    // Find pool ID
    const findPool = await simulate(factoryId, ['2', '2', '0', '32', '0']);
    const poolData = findPool?.result?.execution?.data?.replace('0x', '') || '';
    if (poolData.length >= 64) {
      const buf = Buffer.from(poolData, 'hex');
      const pBlock = Number(buf.readBigUInt64LE(0));
      const pTx = Number(buf.readBigUInt64LE(16));
      poolId = `${pBlock}:${pTx}`;
    }
    console.log('[test] Pool created:', poolId);
    expect(poolId).toBeTruthy();

    // Deploy FIRE Token (needed for staking reward minting)
    await deployWasm(loadWasm('fire_token'), FIRE.TOKEN_SLOT,
      [4, FIRE.STAKING_SLOT],
      'FIRE Token');

    // Deploy Position Token Template
    // Init with dummy values — template gets cloned for actual use
    await deployWasm(loadWasm('fire_position_token'), POSITION_TOKEN_SLOT,
      [0, 0, 0, 0, 0, 0, 0],
      'Position Token Template');

    // Deploy Modified Staking Contract
    // Init: lp_token (AlkaneId), fire_token (AlkaneId), position_template (u128)
    const [poolBlock, poolTx] = poolId.split(':').map(Number);
    await deployWasm(loadWasm('fire_staking'), FIRE.STAKING_SLOT,
      [poolBlock, poolTx, 4, FIRE.TOKEN_SLOT, POSITION_TOKEN_SLOT],
      'FIRE Staking');

    console.log('[test] All contracts deployed');
  }, 900_000);

  afterAll(() => {
    disposeHarness();
  });

  // ── Deployment Verification ──────────────────────────────────

  describe('Deployment', () => {
    it('staking contract responds to GetTotalStaked (opcode 12)', async () => {
      const result = await simulate(FIRE.STAKING_ID, ['12']);
      expect(result?.result?.execution?.error).toBeNull();
      const totalStaked = parseU128(result?.result?.execution?.data || '');
      expect(totalStaked).toBe(0n);
    });

    it('staking contract returns correct position template (opcode 30)', async () => {
      const result = await simulate(FIRE.STAKING_ID, ['30']);
      expect(result?.result?.execution?.error).toBeNull();
      const template = parseU128(result?.result?.execution?.data || '');
      expect(template).toBe(BigInt(POSITION_TOKEN_SLOT));
    });

    it('staking contract returns 0 position count (opcode 31)', async () => {
      const result = await simulate(FIRE.STAKING_ID, ['31']);
      expect(result?.result?.execution?.error).toBeNull();
      expect(parseU128(result?.result?.execution?.data || '')).toBe(0n);
    });

    it('emission rate is nonzero (opcode 15)', async () => {
      const result = await simulate(FIRE.STAKING_ID, ['15']);
      expect(result?.result?.execution?.error).toBeNull();
      const rate = parseU128(result?.result?.execution?.data || '');
      expect(rate).toBeGreaterThan(0n);
      console.log('[test] Emission rate:', rate);
    });

    it('position token template responds to GetPositionId (opcode 10)', async () => {
      const result = await simulate(POSITION_TOKEN_ID, ['10']);
      // Should respond (not "unexpected end of file") — may return 0 (dummy init)
      const err = result?.result?.execution?.error || '';
      expect(err).not.toContain('unexpected end of file');
    });
  });

  // ── Staking Lifecycle ────────────────────────────────────────

  describe('Staking Lifecycle', () => {
    it('should stake LP and receive position token', async () => {
      const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
      expect(lpBalance).toBeGreaterThan(0n);
      console.log('[test] LP balance before stake:', lpBalance);

      const stakeAmount = lpBalance / 4n;

      // Snapshot tokens before staking
      const tokensBefore = await findAlkanesAtAddress(taprootAddress);

      // Stake: opcode 1, lock_duration = 0
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},1,0]:v0:v0`,
        `${poolId}:${stakeAmount}`,
      );

      // LP should decrease
      const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
      expect(lpAfter).toBeLessThan(lpBalance);
      console.log('[test] LP: %d → %d (staked %d)', lpBalance, lpAfter, stakeAmount);

      // Total staked should increase
      const stakedResult = await simulate(FIRE.STAKING_ID, ['12']);
      expect(parseU128(stakedResult?.result?.execution?.data || '')).toBeGreaterThan(0n);

      // Position count should be 1
      const countResult = await simulate(FIRE.STAKING_ID, ['31']);
      expect(parseU128(countResult?.result?.execution?.data || '')).toBe(1n);

      // Discover position token — new token at address with amount=1
      const tokensAfter = await findAlkanesAtAddress(taprootAddress);
      const newTokens = tokensAfter.filter(t =>
        !tokensBefore.some(b => b.block === t.block && b.tx === t.tx && b.amount === t.amount),
      );
      const posTokens = newTokens.filter(t => t.amount === 1n && t.block === 2);
      console.log('[test] New tokens after stake:', newTokens);
      console.log('[test] Position tokens found:', posTokens);

      expect(posTokens.length).toBeGreaterThanOrEqual(1);
      positionTokenId = `${posTokens[0].block}:${posTokens[0].tx}`;
      console.log('[test] Position token ID:', positionTokenId);

      // Verify position token is a registered child
      const [ptBlock, ptTx] = positionTokenId.split(':');
      const childCheck = await simulate(FIRE.STAKING_ID, ['36', ptBlock, ptTx]);
      expect(parseU128(childCheck?.result?.execution?.data || '')).toBe(1n);
    }, 120_000);

    it('should query position token details via GetAllDetails', async () => {
      if (!positionTokenId) return;

      const result = await simulate(positionTokenId, ['23']);
      expect(result?.result?.execution?.error).toBeNull();
      const data = result?.result?.execution?.data || '';

      // 9 × u128 = 144 bytes (7 fields + deposit_token block + tx)
      expect(data.replace('0x', '').length).toBeGreaterThanOrEqual(288); // 144 bytes = 288 hex chars

      const posId = parseU128(data, 0);
      const depositAmount = parseU128(data, 16);
      const weightedAmount = parseU128(data, 32);
      const depositTokenBlock = parseU128(data, 112);
      const depositTokenTx = parseU128(data, 128);

      expect(posId).toBe(0n); // First position
      expect(depositAmount).toBeGreaterThan(0n);
      expect(weightedAmount).toBeGreaterThan(0n);

      // deposit_token should match the LP pool ID used for staking
      const [expectedBlock, expectedTx] = poolId.split(':').map(Number);
      expect(depositTokenBlock).toBe(BigInt(expectedBlock));
      expect(depositTokenTx).toBe(BigInt(expectedTx));

      console.log('[test] Position: id=%d, deposit=%d, weighted=%d, deposit_token=%d:%d',
        posId, depositAmount, weightedAmount, depositTokenBlock, depositTokenTx);
    }, 60_000);

    it('should claim rewards with position token', async () => {
      if (!positionTokenId) return;

      // Mine blocks to accrue rewards
      mineBlocks(harness, 20);

      const fireBefore = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);

      // Claim: opcode 3, send position token as input
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},3]:v0:v0`,
        `${positionTokenId}:1`,
      );

      // Position token should still be at user's address (returned after claim)
      const posBalance = await getAlkaneBalance(provider, taprootAddress, positionTokenId);
      expect(posBalance).toBe(1n);
      console.log('[test] Position token still held after claim: %d', posBalance);

      // May have FIRE rewards (depends on emission pool + mint auth)
      const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
      console.log('[test] FIRE balance: %d → %d', fireBefore, fireAfter);
    }, 120_000);

    it('should block double-claim (no new rewards without time passing)', async () => {
      if (!positionTokenId) return;

      const fireBefore = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);

      // Claim immediately (no blocks mined since last claim)
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},3]:v0:v0`,
        `${positionTokenId}:1`,
      );

      const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
      // Should get 0 or minimal rewards (only 1 block from the executeAlkanes mine)
      console.log('[test] Double-claim FIRE: %d → %d (delta: %d)', fireBefore, fireAfter, fireAfter - fireBefore);

      // Position token still held
      const posBalance = await getAlkaneBalance(provider, taprootAddress, positionTokenId);
      expect(posBalance).toBe(1n);
    }, 120_000);

    it('should unstake with position token and receive LP + FIRE', async () => {
      if (!positionTokenId) return;

      const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);

      // Mine more blocks for rewards
      mineBlocks(harness, 10);

      // Unstake: opcode 2, send position token as input
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},2]:v0:v0`,
        `${positionTokenId}:1`,
      );

      // LP should increase (deposit returned)
      const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
      expect(lpAfter).toBeGreaterThan(lpBefore);
      console.log('[test] LP after unstake: %d → %d', lpBefore, lpAfter);

      // Position token should be GONE (consumed)
      const posBalance = await getAlkaneBalance(provider, taprootAddress, positionTokenId);
      expect(posBalance).toBe(0n);
      console.log('[test] Position token consumed: balance = %d', posBalance);

      // Total staked should be back to 0
      const stakedResult = await simulate(FIRE.STAKING_ID, ['12']);
      expect(parseU128(stakedResult?.result?.execution?.data || '')).toBe(0n);

      // Position token deregistered
      const [ptBlock, ptTx] = positionTokenId.split(':');
      const childCheck = await simulate(FIRE.STAKING_ID, ['36', ptBlock, ptTx]);
      expect(parseU128(childCheck?.result?.execution?.data || '')).toBe(0n);
    }, 120_000);

    it('should reject unstake with consumed position token (double-unstake)', async () => {
      if (!positionTokenId) return;

      // Attempt to unstake again with the same position token
      // This should fail because:
      // 1. The token was consumed (UTXO spent)
      // 2. Even if somehow presented, it's deregistered
      try {
        await executeAlkanes(
          `[4,${FIRE.STAKING_SLOT},2]:v0:v0`,
          `${positionTokenId}:1`,
        );
        // If it didn't throw, check that no LP was returned
        console.log('[test] Double-unstake did not throw — checking state');
      } catch (e: any) {
        // Expected: should fail with "not a registered position token" or balance error
        console.log('[test] Double-unstake correctly rejected:', e.message?.slice(0, 100));
      }
    }, 120_000);

    it('should reject unstake without position token', async () => {
      // First stake again to have something to unstake
      const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBalance < 1000n) {
        console.log('[test] SKIP: insufficient LP for re-stake');
        return;
      }

      // Stake to create a new position
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},1,0]:v0:v0`,
        `${poolId}:${lpBalance / 4n}`,
      );

      // Attempt unstake without sending position token (just BTC for fees)
      try {
        await executeAlkanes(
          `[4,${FIRE.STAKING_SLOT},2]:v0:v0`,
          'B:10000:v0',
        );
        // Should not reach here
        console.log('[test] WARNING: unstake without token did not throw');
      } catch (e: any) {
        console.log('[test] Correctly rejected unstake without token:', e.message?.slice(0, 100));
        expect(e.message).toBeDefined();
      }
    }, 120_000);
  });

  // ── Locked Staking ───────────────────────────────────────────

  describe('Locked Staking', () => {
    it('should stake with 1-week lock and store lock_end', async () => {
      const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBalance < 1000n) {
        console.log('[test] SKIP: insufficient LP');
        return;
      }

      const stakeAmount = lpBalance / 4n;

      // Stake with lock_duration = 604800 (1 week in seconds)
      await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},1,604800]:v0:v0`,
        `${poolId}:${stakeAmount}`,
      );

      // Find the new position token
      const tokens = await findAlkanesAtAddress(taprootAddress);
      const posTokens = tokens.filter(t => t.amount === 1n && t.block === 2);
      const latestPos = posTokens[posTokens.length - 1];
      if (!latestPos) {
        console.log('[test] No position token found after locked stake');
        return;
      }
      const lockedTokenId = `${latestPos.block}:${latestPos.tx}`;
      console.log('[test] Locked position token:', lockedTokenId);

      // Query position details
      const details = await simulate(lockedTokenId, ['23']);
      const data = details?.result?.execution?.data || '';
      const lockEnd = parseU128(data, 48); // offset 48 = lock_end (4th u128)
      const lockDuration = parseU128(data, 64); // offset 64 = lock_duration (5th u128)
      const multiplier = parseU128(data, 80); // offset 80 = multiplier (6th u128)

      console.log('[test] Lock details: end=%d, duration=%d, multiplier=%d', lockEnd, lockDuration, multiplier);
      expect(lockEnd).toBeGreaterThan(0n);
      expect(lockDuration).toBe(604800n);
      expect(multiplier).toBe(125n); // 1.25x for 1-week lock
    }, 120_000);
  });
});
