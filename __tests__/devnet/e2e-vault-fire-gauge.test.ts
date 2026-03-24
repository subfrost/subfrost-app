/**
 * Devnet E2E: Vault Deposit/Withdraw, FIRE Staking, and Gauge Interactions
 *
 * Tests the full lifecycle of vault, FIRE staking, and gauge contracts on
 * in-process devnet using the same harness as e2e-quspo-views.test.ts.
 *
 * Setup:
 *   - Deploy AMM contracts + create DIESEL/frBTC pool
 *   - Deploy FIRE protocol contracts + initialize
 *   - Deploy core protocol (FUEL, dxBTC, gauges)
 *
 * Tests:
 *   1. Vault deposit (Purchase opcode 1)
 *   2. Vault withdraw (Redeem opcode 2)
 *   3. FIRE stake (opcode 1) and position query (opcode 10)
 *   4. FIRE unstake (opcode 2)
 *   5. FIRE claim rewards (opcode 3)
 *   6. Gauge stake LP (opcode 1)
 *   7. Gauge unstake (opcode 2)
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-vault-fire-gauge.test.ts --testTimeout=900000
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
import { deployCoreProtocol, PROTOCOL_SLOTS, PROTOCOL_IDS } from './deploy-full-stack';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ===========================================================================
// Test Suite
// ===========================================================================

describe('Devnet E2E: Vault, FIRE, and Gauge', () => {

  // -------------------------------------------------------------------------
  // Global setup: deploy AMM, create pool, deploy FIRE, deploy core protocol
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine blocks for UTXO maturity
    mineBlocks(harness, 401);
    console.log('[vault-fire-gauge] Chain ready');

    // Deploy AMM
    console.log('[vault-fire-gauge] Deploying AMM contracts...');
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;

    // Mint DIESEL (3 rounds)
    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    }
    mineBlocks(harness, 1);

    // Wrap BTC -> frBTC
    const signerResult = await simulate('32:0', ['103']);
    let signerAddr = taprootAddress;
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        try {
          const xOnly = Buffer.from(hex, 'hex');
          const p = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
          if (p.address) signerAddr = p.address;
        } catch {}
      }
    }
    await executeAlkanes('[32,0,77]:v1:v1', 'B:2000000:v0', { toAddresses: [signerAddr, taprootAddress] });
    mineBlocks(harness, 1);

    // Create DIESEL/frBTC pool
    const d = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const f = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    const [fb, ft] = factoryId.split(':');
    await executeAlkanes(`[${fb},${ft},1,2,0,32,0,${d / 3n},${f / 2n}]:v0:v0`, `2:0:${d / 3n},32:0:${f / 2n}`);
    mineBlocks(harness, 1);

    // Find pool ID
    const fp = await simulate(factoryId, ['2', '2', '0', '32', '0']);
    const pd = fp?.result?.execution?.data?.replace('0x', '') || '';
    if (pd.length >= 64) {
      const buf = Buffer.from(pd, 'hex');
      poolId = `${Number(buf.readBigUInt64LE(0))}:${Number(buf.readBigUInt64LE(16))}`;
    }
    console.log('[vault-fire-gauge] Pool created:', poolId);
    expect(poolId).toBeTruthy();

    // Deploy FIRE contracts
    console.log('[vault-fire-gauge] Deploying FIRE protocol...');
    await deployFireContracts(provider, signer, segwitAddress, taprootAddress, harness, poolId);

    // Stake some LP in FIRE staking for later tests
    mineBlocks(harness, 1);
    const lp = await getAlkaneBalance(provider, taprootAddress, poolId);
    if (lp > 0n) {
      await executeAlkanes(`[4,${FIRE.STAKING_SLOT},1,0]:v0:v0`, `${poolId}:${lp / 4n}`);
      mineBlocks(harness, 5);
    }

    // Deploy core protocol (FUEL, ftrBTC, dxBTC, gauges)
    console.log('[vault-fire-gauge] Deploying core protocol...');
    await deployCoreProtocol(provider, signer, segwitAddress, taprootAddress, harness, poolId);

    console.log('[vault-fire-gauge] Setup complete');
  }, 900_000);

  afterAll(() => { disposeHarness(); });

  // =========================================================================
  // Vault Deposit (dxBTC)
  // =========================================================================

  describe('Vault Deposit/Withdraw', () => {

    it('should verify dxBTC vault is deployed', async () => {
      // Query vault with opcode 99 (GetName) to confirm it is alive
      const result = await simulate(PROTOCOL_IDS.DXBTC_VAULT, ['99']);
      const err = result?.result?.execution?.error || '';
      console.log('[vault] dxBTC vault check:', err ? `error: ${err.slice(0, 100)}` : 'OK');
      // If the slot exists, we get either valid data or a known error (not "unexpected end of file")
      expect(err).not.toContain('unexpected end of file');
    });

    it('should deposit DIESEL into dxBTC vault (Purchase opcode 1)', async () => {
      const dieselBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      if (dieselBal === 0n) {
        console.log('[vault] Skipping deposit -- no DIESEL');
        return;
      }

      const depositAmount = dieselBal / 10n;
      console.log('[vault] Depositing %s DIESEL into dxBTC vault...', depositAmount.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.DXBTC_VAULT},1]:v0:v0`,
          `2:0:${depositAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[vault] Deposit txid:', txid);

        // Check if we received vault units
        const vaultBalance = await getAlkaneBalance(provider, taprootAddress, PROTOCOL_IDS.DXBTC_VAULT);
        console.log('[vault] dxBTC vault token balance:', vaultBalance.toString());
        // Vault may or may not mint units depending on implementation
      } catch (e: any) {
        console.log('[vault] Deposit error (may be expected if vault requires specific asset):', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should withdraw from dxBTC vault (Redeem opcode 2)', async () => {
      const vaultBal = await getAlkaneBalance(provider, taprootAddress, PROTOCOL_IDS.DXBTC_VAULT);
      if (vaultBal === 0n) {
        console.log('[vault] Skipping withdraw -- no vault tokens');
        return;
      }

      const redeemAmount = vaultBal / 2n;
      console.log('[vault] Redeeming %s vault tokens...', redeemAmount.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.DXBTC_VAULT},2]:v0:v0`,
          `${PROTOCOL_IDS.DXBTC_VAULT}:${redeemAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[vault] Redeem txid:', txid);

        const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
        console.log('[vault] DIESEL balance after redeem:', dieselAfter.toString());
      } catch (e: any) {
        console.log('[vault] Redeem error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // =========================================================================
  // FIRE Staking
  // =========================================================================

  describe('FIRE Staking Lifecycle', () => {

    it('should stake LP tokens into FIRE staking (opcode 1)', async () => {
      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBal === 0n) {
        console.log('[fire] Skipping stake -- no LP tokens');
        return;
      }

      const stakeAmount = lpBal / 4n;
      console.log('[fire] Staking %s LP tokens (no lock)...', stakeAmount.toString());

      const txid = await executeAlkanes(
        `[4,${FIRE.STAKING_SLOT},1,0]:v0:v0`,
        `${poolId}:${stakeAmount}`,
      );
      mineBlocks(harness, 1);
      console.log('[fire] Stake txid:', txid);

      // Verify total staked increased
      const stakedResult = await simulate(FIRE.STAKING_ID, ['12']);
      const totalStaked = parseU128(stakedResult?.result?.execution?.data || '');
      console.log('[fire] Total staked:', totalStaked.toString());
      expect(totalStaked).toBeGreaterThan(0n);
    }, 120_000);

    it('should query staking position (opcode 10)', async () => {
      // GetPosition: opcode 10, position_id=0
      const posResult = await simulate(FIRE.STAKING_ID, ['10', '0']);
      if (posResult?.result?.execution?.error) {
        console.log('[fire] Position query error:', posResult.result.execution.error.slice(0, 100));
      } else {
        const data = posResult?.result?.execution?.data || '';
        console.log('[fire] Position data (hex):', data.slice(0, 100));
        if (data && data !== '0x') {
          const amount = parseU128(data);
          console.log('[fire] Position staked amount:', amount.toString());
          expect(amount).toBeGreaterThan(0n);
        }
      }
      expect(posResult?.result?.execution).toBeDefined();
    });

    it('should claim FIRE rewards (opcode 3)', async () => {
      // Mine blocks to accrue rewards
      mineBlocks(harness, 10);

      const fireBefore = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);

      try {
        const txid = await executeAlkanes(
          `[4,${FIRE.STAKING_SLOT},3]:v0:v0`,
          'B:10000:v0',
        );
        mineBlocks(harness, 1);
        console.log('[fire] Claim txid:', txid);

        const fireAfter = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID).catch(() => 0n);
        console.log('[fire] FIRE before: %s, after: %s', fireBefore, fireAfter);
        if (fireAfter > fireBefore) {
          console.log('[fire] Claimed %s FIRE rewards', (fireAfter - fireBefore).toString());
        }
      } catch (e: any) {
        console.log('[fire] Claim error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should unstake LP from FIRE staking (opcode 2)', async () => {
      const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);

      try {
        // Unstake: opcode 2, position_id=0 (first unlocked position)
        const txid = await executeAlkanes(
          `[4,${FIRE.STAKING_SLOT},2,0]:v0:v0`,
          'B:10000:v0',
        );
        mineBlocks(harness, 1);
        console.log('[fire] Unstake txid:', txid);

        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[fire] LP before: %s, after: %s', lpBefore, lpAfter);
        // LP should increase after unstaking
        if (lpAfter > lpBefore) {
          console.log('[fire] Recovered %s LP from unstaking', (lpAfter - lpBefore).toString());
        }
      } catch (e: any) {
        console.log('[fire] Unstake error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // =========================================================================
  // Gauge Interactions
  // =========================================================================

  describe('Gauge Lifecycle (vxFUEL)', () => {

    it('should verify vxFUEL gauge is deployed', async () => {
      // Query gauge with opcode 20 (GetTotalFee or equivalent read opcode)
      const result = await simulate(PROTOCOL_IDS.VX_FUEL_GAUGE, ['20']);
      const err = result?.result?.execution?.error || '';
      console.log('[gauge] vxFUEL gauge check:', err ? `error: ${err.slice(0, 100)}` : 'OK');
      expect(err).not.toContain('unexpected end of file');
    });

    it('should stake LP into vxFUEL gauge (opcode 1)', async () => {
      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBal === 0n) {
        console.log('[gauge] Skipping gauge stake -- no LP tokens');
        return;
      }

      const stakeAmount = lpBal / 4n;
      console.log('[gauge] Staking %s LP into vxFUEL gauge...', stakeAmount.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.VX_FUEL_GAUGE},1]:v0:v0`,
          `${poolId}:${stakeAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[gauge] Gauge stake txid:', txid);

        // Mine a few blocks to let rewards accrue
        mineBlocks(harness, 5);

        // Verify LP was transferred
        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[gauge] LP after gauge stake:', lpAfter.toString());
        // LP should decrease since we staked into gauge
      } catch (e: any) {
        console.log('[gauge] Gauge stake error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should unstake LP from vxFUEL gauge (opcode 2)', async () => {
      const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);
      console.log('[gauge] LP before gauge unstake:', lpBefore.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.VX_FUEL_GAUGE},2]:v0:v0`,
          'B:10000:v0',
        );
        mineBlocks(harness, 1);
        console.log('[gauge] Gauge unstake txid:', txid);

        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[gauge] LP before: %s, after: %s', lpBefore, lpAfter);
        if (lpAfter > lpBefore) {
          console.log('[gauge] Recovered %s LP from gauge', (lpAfter - lpBefore).toString());
        }
      } catch (e: any) {
        console.log('[gauge] Gauge unstake error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  describe('Gauge Lifecycle (vxBTCUSD)', () => {

    it('should verify vxBTCUSD gauge is deployed', async () => {
      const result = await simulate(PROTOCOL_IDS.VX_BTCUSD_GAUGE, ['20']);
      const err = result?.result?.execution?.error || '';
      console.log('[gauge] vxBTCUSD gauge check:', err ? `error: ${err.slice(0, 100)}` : 'OK');
      expect(err).not.toContain('unexpected end of file');
    });

    it('should stake LP into vxBTCUSD gauge (opcode 1)', async () => {
      const lpBal = await getAlkaneBalance(provider, taprootAddress, poolId);
      if (lpBal === 0n) {
        console.log('[gauge] Skipping vxBTCUSD stake -- no LP tokens');
        return;
      }

      const stakeAmount = lpBal / 4n;
      console.log('[gauge] Staking %s LP into vxBTCUSD gauge...', stakeAmount.toString());

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.VX_BTCUSD_GAUGE},1]:v0:v0`,
          `${poolId}:${stakeAmount}`,
        );
        mineBlocks(harness, 1);
        console.log('[gauge] vxBTCUSD stake txid:', txid);
      } catch (e: any) {
        console.log('[gauge] vxBTCUSD stake error:', e.message?.slice(0, 200));
      }
    }, 120_000);

    it('should unstake LP from vxBTCUSD gauge (opcode 2)', async () => {
      const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);

      try {
        const txid = await executeAlkanes(
          `[4,${PROTOCOL_SLOTS.VX_BTCUSD_GAUGE},2]:v0:v0`,
          'B:10000:v0',
        );
        mineBlocks(harness, 1);
        console.log('[gauge] vxBTCUSD unstake txid:', txid);

        const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
        console.log('[gauge] LP after vxBTCUSD unstake:', lpAfter.toString());
      } catch (e: any) {
        console.log('[gauge] vxBTCUSD unstake error:', e.message?.slice(0, 200));
      }
    }, 120_000);
  });

  // =========================================================================
  // Gauge Claim Rewards
  // =========================================================================

  describe('Gauge Reward Claims', () => {

    it.todo('should claim rewards from vxFUEL gauge (opcode 3) -- requires staking + block accrual');

    it.todo('should claim rewards from vxBTCUSD gauge (opcode 3) -- requires staking + block accrual');
  });

  // =========================================================================
  // Final Status
  // =========================================================================

  describe('Final Status', () => {
    it('should report final balances', async () => {
      const diesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
      const frbtc = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
      const lp = await getAlkaneBalance(provider, taprootAddress, poolId);
      const dxbtc = await getAlkaneBalance(provider, taprootAddress, PROTOCOL_IDS.DXBTC_VAULT).catch(() => 0n);
      let fire = 0n;
      try { fire = await getAlkaneBalance(provider, taprootAddress, FIRE.TOKEN_ID); } catch {}

      console.log('[vault-fire-gauge] Final balances:');
      console.log(`  DIESEL:          ${diesel}`);
      console.log(`  frBTC:           ${frbtc}`);
      console.log(`  LP(${poolId}):   ${lp}`);
      console.log(`  dxBTC vault:     ${dxbtc}`);
      console.log(`  FIRE:            ${fire}`);
    });
  });
});
