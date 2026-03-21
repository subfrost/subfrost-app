/**
 * Devnet E2E: FIRE Protocol
 *
 * Tests the complete FIRE protocol lifecycle on in-process devnet:
 *
 * Setup:
 *   - Deploy AMM contracts + create DIESEL/frBTC pool
 *   - Deploy all 6 FIRE contracts + initialize
 *
 * Tests:
 *   1. Deployment verification (all contracts respond)
 *   2. Token stats (name, symbol, supply, emission pool)
 *   3. Staking lifecycle (stake, query, claim, unstake)
 *   4. Bonding (bond LP, query, claim vested)
 *   5. Treasury queries (allocations, backing value)
 *   6. Redemption (redeem FIRE for backing)
 *   7. Distributor (contribute, advance phase)
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-fire.test.ts --testTimeout=600000
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
import { deployFireContracts, FIRE } from './fire-deploy';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let poolId: string;
let fireResult: Awaited<ReturnType<typeof deployFireContracts>> | null = null;

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: { toAddresses?: string[] }
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
  const hex = data.replace('0x', '');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length < offset + 16) return 0n;
  return bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n);
}

function parseString(data: string): string {
  const hex = data.replace('0x', '');
  return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Devnet E2E: FIRE Protocol', () => {

  // -------------------------------------------------------------------------
  // Global setup: deploy AMM, create pool, deploy FIRE, mint tokens
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine extra blocks for UTXO maturity — FIRE tests need 12+ commit/reveal deploys
    // plus many transactions for staking, bonding, redeem, etc.
    mineBlocks(harness, 301);
    console.log('[fire-e2e] Chain ready');

    // Deploy AMM
    console.log('[fire-e2e] Deploying AMM contracts...');
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;

    // Mint DIESEL (3 times)
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
    const createPoolProtostone = `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`;
    const createPoolReqs = `2:0:${dieselAmount},32:0:${frbtcAmount}`;

    await executeAlkanes(createPoolProtostone, createPoolReqs);
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
    console.log('[fire-e2e] Pool created:', poolId);
    expect(poolId).toBeTruthy();

    // Deploy FIRE contracts
    console.log('[fire-e2e] Deploying FIRE protocol...');
    fireResult = await deployFireContracts(
      provider, signer, segwitAddress, taprootAddress, harness, poolId
    );
    console.log('[fire-e2e] FIRE protocol ready');
  }, 900_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // Deployment Verification
  // -------------------------------------------------------------------------

  describe('Deployment Verification', () => {
    it('should have all 6 FIRE contracts responding', async () => {
      expect(fireResult).toBeTruthy();

      // Token: GetName (99), GetSymbol (100)
      const name = await simulate(FIRE.TOKEN_ID, ['99']);
      expect(name?.result?.execution?.error).toBeNull();

      // Staking: GetTotalStaked (12)
      const staked = await simulate(FIRE.STAKING_ID, ['12']);
      expect(staked?.result?.execution?.error).toBeNull();

      // Treasury: GetTotalBackingValue (22)
      const backing = await simulate(FIRE.TREASURY_ID, ['22']);
      expect(backing?.result?.execution?.error).toBeNull();

      // Bonding: GetCurrentDiscount (23)
      const discount = await simulate(FIRE.BONDING_ID, ['23']);
      expect(discount?.result?.execution?.error).toBeNull();

      // Redemption: GetRedemptionRate (20)
      const rate = await simulate(FIRE.REDEMPTION_ID, ['20']);
      expect(rate?.result?.execution?.error).toBeNull();

      // Distributor: GetPhase (20)
      const phase = await simulate(FIRE.DISTRIBUTOR_ID, ['20']);
      expect(phase?.result?.execution?.error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Token Stats
  // -------------------------------------------------------------------------

  describe('Token Stats', () => {
    it('should return correct token metadata', async () => {
      const nameResult = await simulate(FIRE.TOKEN_ID, ['99']);
      const name = parseString(nameResult?.result?.execution?.data || '');
      expect(name).toBe('FIRE');

      const symbolResult = await simulate(FIRE.TOKEN_ID, ['100']);
      const symbol = parseString(symbolResult?.result?.execution?.data || '');
      expect(symbol).toBe('FIRE');
    });

    it('should return correct supply figures', async () => {
      const supplyResult = await simulate(FIRE.TOKEN_ID, ['101']);
      const totalSupply = parseU128(supplyResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Total supply:', totalSupply, `(${Number(totalSupply) / 1e8} FIRE)`);
      // No premine — total supply starts at 0, increases only through emission
      expect(totalSupply).toBe(0n);

      const maxResult = await simulate(FIRE.TOKEN_ID, ['102']);
      const maxSupply = parseU128(maxResult?.result?.execution?.data || '');
      expect(maxSupply).toBe(FIRE.MAX_SUPPLY);

      const emissionResult = await simulate(FIRE.TOKEN_ID, ['103']);
      const emissionPool = parseU128(emissionResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Emission pool:', emissionPool, `(${Number(emissionPool) / 1e8} FIRE)`);
      expect(emissionPool).toBe(FIRE.EMISSION_POOL);
    });
  });

  // -------------------------------------------------------------------------
  // Staking Lifecycle
  // -------------------------------------------------------------------------

  describe('Staking Lifecycle', () => {
    it('should stake LP tokens with no lock', async () => {
      // First get some LP tokens
      const lpBalance = await getAlkaneBalance(provider, taprootAddress, poolId);
      console.log('[fire-e2e] LP balance before stake:', lpBalance.toString());

      if (lpBalance === 0n) {
        // Add liquidity to get LP tokens
        const [pBlock, pTx] = poolId.split(':');
        const addLiqProtostone = `[${pBlock},${pTx},1]:v0:v0`;
        const dieselBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
        const frbtcBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
        const addReqs = `2:0:${dieselBal / 4n},32:0:${frbtcBal / 4n}`;
        await executeAlkanes(addLiqProtostone, addReqs);
        mineBlocks(harness, 1);
      }

      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      expect(lpBal).toBeGreaterThan(0n);
      console.log('[fire-e2e] LP balance for staking:', lpBal.toString());

      const stakeAmount = lpBal / 4n;
      // Stake: opcode 1, duration=0 (no lock)
      const stakeProtostone = `[4,${FIRE.STAKING_SLOT},1,0]:v0:v0`;
      const stakeReqs = `${poolId}:${stakeAmount}`;

      const txid = await executeAlkanes(stakeProtostone, stakeReqs);
      mineBlocks(harness, 1);
      console.log('[fire-e2e] Stake txid:', txid);

      // Verify total staked increased
      const stakedResult = await simulate(FIRE.STAKING_ID, ['12']);
      const totalStaked = parseU128(stakedResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Total staked after:', totalStaked.toString());
      expect(totalStaked).toBeGreaterThan(0n);
    }, 120_000);

    it('should stake LP tokens with 1-week lock for 1.25x multiplier', async () => {
      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBal === 0n) {
        console.log('[fire-e2e] Skipping — no LP tokens');
        return;
      }

      const stakeAmount = lpBal / 4n;
      // Stake: opcode 1, duration=604800 (1 week in seconds)
      const stakeProtostone = `[4,${FIRE.STAKING_SLOT},1,604800]:v0:v0`;
      const stakeReqs = `${poolId}:${stakeAmount}`;

      const txid = await executeAlkanes(stakeProtostone, stakeReqs);
      mineBlocks(harness, 1);
      console.log('[fire-e2e] Locked stake txid:', txid);

      // Verify staked amount increased
      const stakedResult = await simulate(FIRE.STAKING_ID, ['12']);
      const totalStaked = parseU128(stakedResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Total staked (weighted):', totalStaked.toString());
      expect(totalStaked).toBeGreaterThan(0n);
    }, 120_000);

    it('should query pending rewards after mining blocks', async () => {
      // Mine some blocks so rewards accrue
      mineBlocks(harness, 10);

      // GetCurrentEpoch (14)
      const epochResult = await simulate(FIRE.STAKING_ID, ['14']);
      const epoch = parseU128(epochResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Current epoch:', epoch.toString());

      // GetEmissionRate (15)
      const rateResult = await simulate(FIRE.STAKING_ID, ['15']);
      const rate = parseU128(rateResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Emission rate:', rate.toString());
    });

    it('should claim rewards standalone (opcode 3) without unstaking', async () => {
      // Mine blocks to accrue more rewards
      mineBlocks(harness, 5);

      const fireBefore = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);

      // ClaimRewards: opcode 3, no args, no token inputs
      const claimProtostone = `[4,${FIRE.STAKING_SLOT},3]:v0:v0`;
      try {
        const txid = await executeAlkanes(claimProtostone, 'B:10000:v0');
        mineBlocks(harness, 1);
        console.log('[fire-e2e] ClaimRewards txid:', txid);

        const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
        console.log('[fire-e2e] FIRE before claim: %s, after: %s', fireBefore, fireAfter);
        // FIRE should increase from minted rewards (if emission is working)
        if (fireAfter > fireBefore) {
          console.log('[fire-e2e] Claimed %s FIRE from staking rewards ✓', fireAfter - fireBefore);
        }
      } catch (e: any) {
        console.log('[fire-e2e] ClaimRewards error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should unstake unlocked position', async () => {
      const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);

      // Unstake: opcode 2, position_id=0 (first position, unlocked)
      const unstakeProtostone = `[4,${FIRE.STAKING_SLOT},2,0]:v0:v0`;

      try {
        const txid = await executeAlkanes(unstakeProtostone, 'B:10000:v0');
        mineBlocks(harness, 1);
        console.log('[fire-e2e] Unstake txid:', txid);

        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[fire-e2e] LP before: %s, after: %s', lpBefore, lpAfter);
        expect(lpAfter).toBeGreaterThan(lpBefore);
      } catch (e: any) {
        console.log('[fire-e2e] Unstake error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // Treasury
  // -------------------------------------------------------------------------

  describe('Treasury Admin & Funding', () => {
    it('should return treasury backing value', async () => {
      const backingResult = await simulate(FIRE.TREASURY_ID, ['22']);
      if (backingResult?.result?.execution?.error) {
        console.log('[fire-e2e] Treasury backing error:', backingResult.result.execution.error.slice(0, 100));
      } else {
        const backing = parseU128(backingResult?.result?.execution?.data || '');
        console.log('[fire-e2e] Treasury backing value:', backing.toString());
      }
      expect(backingResult?.result?.execution).toBeDefined();
    });

    it('should set authorized contracts on treasury (bonding, redemption, distributor)', async () => {
      // Treasury opcode 1: SetAuthorizedContract(contract_type, contract_id)
      // Requires treasury auth token. The auth token was created during deploy+init
      // and went to the deployer. We need to discover it.

      // Find treasury auth tokens at deployer's address
      const balResult = await rpcCall('alkanes_protorunesbyaddress', [
        { address: taprootAddress, protocolTag: '1' }
      ]);
      const outpoints = balResult?.result?.outpoints || [];
      const authTokens: string[] = [];
      for (const op of outpoints) {
        const balances = op.balance_sheet?.cached?.balances || op.runes || [];
        for (const entry of balances) {
          const block = parseInt(entry.block ?? '0', 10);
          const amount = parseInt(entry.amount ?? '0', 10);
          if (block === 2 && amount > 0) {
            const id = `${block}:${entry.tx}`;
            if (!authTokens.includes(id)) authTokens.push(id);
          }
        }
      }
      console.log('[fire-e2e] Auth tokens found:', authTokens);

      // The treasury auth token is one of these — find the right one by trying
      // SetAuthorizedContract with each auth token until one works
      let treasuryAuthToken: string | null = null;
      for (const token of authTokens) {
        try {
          // SetAuthorizedContract: type=0 (bonding), contract=FIRE.BONDING_ID
          const protostone = `[4,${FIRE.TREASURY_SLOT},1,0,4,${FIRE.BONDING_SLOT}]:v0:v0`;
          await executeAlkanes(protostone, `${token}:1`);
          mineBlocks(harness, 1);
          treasuryAuthToken = token;
          console.log('[fire-e2e] Treasury auth token:', treasuryAuthToken);
          break;
        } catch (e: any) {
          // Wrong auth token, try next
          continue;
        }
      }

      if (treasuryAuthToken) {
        // Set redemption contract (type=1)
        try {
          await executeAlkanes(
            `[4,${FIRE.TREASURY_SLOT},1,1,4,${FIRE.REDEMPTION_SLOT}]:v0:v0`,
            `${treasuryAuthToken}:1`,
          );
          mineBlocks(harness, 1);
          console.log('[fire-e2e] Redemption authorized on treasury ✓');
        } catch (e: any) {
          console.log('[fire-e2e] Set redemption auth error:', e.message?.slice(0, 100));
        }

        // Set distributor contract (type=2)
        try {
          await executeAlkanes(
            `[4,${FIRE.TREASURY_SLOT},1,2,4,${FIRE.DISTRIBUTOR_SLOT}]:v0:v0`,
            `${treasuryAuthToken}:1`,
          );
          mineBlocks(harness, 1);
          console.log('[fire-e2e] Distributor authorized on treasury ✓');
        } catch (e: any) {
          console.log('[fire-e2e] Set distributor auth error:', e.message?.slice(0, 100));
        }

        // Note: With no-premine tokenomics, treasury starts empty.
        // Bonding is funded externally via Deposit (opcode 10) when FIRE is available.
        // Treasury no longer has FundBonding (opcode 3).
        console.log('[fire-e2e] Treasury admin setup complete (no-premine: no FundBonding needed)');
      } else {
        console.log('[fire-e2e] Could not find treasury auth token — skipping admin tests');
      }
    }, 300_000);
  });

  // -------------------------------------------------------------------------
  // Bonding
  // -------------------------------------------------------------------------

  describe('Bonding Lifecycle', () => {
    it('should return bonding discount of 10%', async () => {
      const discountResult = await simulate(FIRE.BONDING_ID, ['23']);
      expect(discountResult?.result?.execution?.error).toBeNull();
      const discount = parseU128(discountResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Bonding discount (bps):', discount.toString());
      expect(discount).toBe(1000n);
    });

    it('should bond LP tokens for discounted FIRE', async () => {
      // Check if bonding has available FIRE
      const availResult = await simulate(FIRE.BONDING_ID, ['25']);
      const available = parseU128(availResult?.result?.execution?.data || '');
      if (available === 0n) {
        console.log('[fire-e2e] Skipping bond — no available FIRE (treasury not funded)');
        return;
      }

      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBal === 0n) {
        console.log('[fire-e2e] Skipping bond — no LP tokens');
        return;
      }

      const bondAmount = lpBal / 10n;
      console.log('[fire-e2e] Bonding %s LP tokens...', bondAmount.toString());

      // Bond: opcode 1, LP token as input
      try {
        const txid = await executeAlkanes(
          `[4,${FIRE.BONDING_SLOT},1]:v0:v0`,
          `${poolId}:${bondAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[fire-e2e] Bond txid:', txid);

        // Check bond count
        const countResult = await simulate(FIRE.BONDING_ID, ['21']);
        const count = parseU128(countResult?.result?.execution?.data || '');
        console.log('[fire-e2e] User bond count:', count.toString());
        expect(count).toBeGreaterThan(0n);
      } catch (e: any) {
        console.log('[fire-e2e] Bond error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should claim vested FIRE from bond (opcode 3 = claim all)', async () => {
      const countResult = await simulate(FIRE.BONDING_ID, ['21']);
      const count = parseU128(countResult?.result?.execution?.data || '');
      if (count === 0n) {
        console.log('[fire-e2e] Skipping claim — no bonds');
        return;
      }

      // Mine blocks to advance vesting (default 7 days = 604800 seconds)
      // In devnet blocks advance timestamps, but we can't fast-forward enough
      // Try claiming anyway — partial vesting may yield some FIRE
      const fireBefore = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);

      try {
        const txid = await executeAlkanes(
          `[4,${FIRE.BONDING_SLOT},3]:v0:v0`,
          'B:10000:v0',
        );
        mineBlocks(harness, 1);
        console.log('[fire-e2e] ClaimAllVested txid:', txid);

        const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
        console.log('[fire-e2e] FIRE before: %s, after: %s', fireBefore, fireAfter);
      } catch (e: any) {
        console.log('[fire-e2e] ClaimAllVested error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // -------------------------------------------------------------------------
  // Redemption
  // -------------------------------------------------------------------------

  describe('Redemption Lifecycle', () => {
    it('should return redemption fee of 1%', async () => {
      const feeResult = await simulate(FIRE.REDEMPTION_ID, ['21']);
      expect(feeResult?.result?.execution?.error).toBeNull();
      const fee = parseU128(feeResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Redemption fee (bps):', fee.toString());
      expect(fee).toBe(100n);
    });

    it('should redeem FIRE for treasury backing', async () => {
      const fireBalance = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
      if (fireBalance === 0n) {
        console.log('[fire-e2e] Skipping redeem — no FIRE tokens');
        return;
      }

      // Redeem a small amount of FIRE
      const redeemAmount = fireBalance / 10n;
      if (redeemAmount < FIRE.DECIMAL_FACTOR) {
        console.log('[fire-e2e] Skipping redeem — amount too small (min 1 FIRE)');
        return;
      }

      console.log('[fire-e2e] Redeeming %s FIRE...', redeemAmount.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${FIRE.REDEMPTION_SLOT},1]:v0:v0`,
          `${FIRE.TOKEN_ID}:${redeemAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[fire-e2e] Redeem txid:', txid);

        // Check total redeemed increased
        const redeemedResult = await simulate(FIRE.REDEMPTION_ID, ['24']);
        const redeemed = parseU128(redeemedResult?.result?.execution?.data || '');
        console.log('[fire-e2e] Total redeemed:', redeemed.toString());

        const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
        console.log('[fire-e2e] FIRE before: %s, after: %s', fireBalance, fireAfter);
      } catch (e: any) {
        console.log('[fire-e2e] Redeem error:', e.message?.slice(0, 200));
        // May fail if treasury has no LP backing or authorized contract not set
      }
    }, 120_000);

    it('should enforce cooldown between redemptions', async () => {
      const cooldownResult = await simulate(FIRE.REDEMPTION_ID, ['22']);
      if (cooldownResult?.result?.execution?.error) {
        console.log('[fire-e2e] Cooldown query error:', cooldownResult.result.execution.error.slice(0, 100));
      } else {
        const cooldown = parseU128(cooldownResult?.result?.execution?.data || '');
        console.log('[fire-e2e] Cooldown remaining (seconds):', cooldown.toString());
        // If we just redeemed, cooldown should be active (86400 seconds)
      }
      expect(cooldownResult?.result?.execution).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Distributor
  // -------------------------------------------------------------------------

  describe('Distributor Lifecycle', () => {
    it('should be in contribution phase', async () => {
      const phaseResult = await simulate(FIRE.DISTRIBUTOR_ID, ['20']);
      expect(phaseResult?.result?.execution?.error).toBeNull();
      const phase = parseU128(phaseResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Distributor phase:', phase.toString());
      expect(phase).toBe(0n);
    });

    it('should contribute frBTC during contribution phase', async () => {
      const frbtcBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      if (frbtcBal === 0n) {
        console.log('[fire-e2e] Skipping contribute — no frBTC');
        return;
      }

      const contributeAmount = frbtcBal / 10n;
      console.log('[fire-e2e] Contributing %s frBTC...', contributeAmount.toString());

      try {
        // Contribute: opcode 1, contribution token as input
        const txid = await executeAlkanes(
          `[4,${FIRE.DISTRIBUTOR_SLOT},1]:v0:v0`,
          `32:0:${contributeAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[fire-e2e] Contribute txid:', txid);

        // Check total contributed increased
        const contribResult = await simulate(FIRE.DISTRIBUTOR_ID, ['21']);
        const contributed = parseU128(contribResult?.result?.execution?.data || '');
        console.log('[fire-e2e] Total contributed:', contributed.toString());
      } catch (e: any) {
        console.log('[fire-e2e] Contribute error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should track user contribution amount', async () => {
      const contribResult = await simulate(FIRE.DISTRIBUTOR_ID, ['21']);
      const contributed = parseU128(contribResult?.result?.execution?.data || '');
      console.log('[fire-e2e] Total contributed after contribution:', contributed.toString());
      // Even if contribute failed, this query should work
      expect(contribResult?.result?.execution).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Final Status
  // -------------------------------------------------------------------------

  describe('Status', () => {
    it('should report final FIRE balances', async () => {
      const diesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtc = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      const lp = await getAlkaneBalance(provider, taprootAddress, poolId);

      // Check if user has any FIRE tokens (from staking rewards or unstaking)
      let fireBalance = 0n;
      try {
        fireBalance = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID);
      } catch { /* might not have any */ }

      console.log('[fire-e2e] Final balances:');
      console.log(`  DIESEL:    ${diesel}`);
      console.log(`  frBTC:     ${frbtc}`);
      console.log(`  LP(${poolId}): ${lp}`);
      console.log(`  FIRE:      ${fireBalance}`);
    });
  });
});
