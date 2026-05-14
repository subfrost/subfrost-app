/**
 * Tests for CoordinatorWallet — balance tracking, fee accounting, rebalancing.
 *
 * These are unit-style tests using mock callbacks (no devnet harness needed).
 * They verify the state machine logic: idle → detecting → rebalancing → cooldown.
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-coordinator-wallet.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoordinatorWallet,
  type WalletCallbacks,
  type ChainBalances,
} from '../../lib/devnet/coordinatorWallet';

// ---- Mock Setup ----

function createMockBalances(): ChainBalances {
  return {
    btcSats: 0n,
    frbtcUnits: 0n,
    frusdUnits: 0n,
    usdcUnits: 0n,
    usdtUnits: 0n,
  };
}

function createMockCallbacks(balances: ChainBalances): WalletCallbacks {
  return {
    getBtcBalance: async () => balances.btcSats,
    getAlkaneBalance: async (_addr, alkaneId) => {
      if (alkaneId === '32:0') return balances.frbtcUnits;
      if (alkaneId === '4:8201') return balances.frusdUnits;
      return 0n;
    },
    getEvmTokenBalance: async (tokenAddr) => {
      if (tokenAddr.includes('usdc')) return balances.usdcUnits;
      if (tokenAddr.includes('usdt')) return balances.usdtUnits;
      return 0n;
    },
    executeBtcOp: async () => 'mock-btc-tx',
    executeEvmOp: async () => 'mock-evm-tx',
    confirmBtc: async () => {},
  };
}

function createTestWallet(
  balances: ChainBalances,
  configOverrides?: Record<string, any>,
): CoordinatorWallet {
  return new CoordinatorWallet(
    createMockCallbacks(balances),
    {
      btcAddress: 'bcrt1ptest',
      evmAddress: '0x1234',
      usdcAddress: '0xusdc',
      usdtAddress: '0xusdt',
      frusdId: '4:8201',
      frbtcId: '32:0',
      synthPoolId: '4:56578',
      factoryId: '4:65522',
    },
    {
      cooldownMs: 0, // no cooldown for tests
      ...configOverrides,
    },
  );
}

// ---- Tests ----

describe('CoordinatorWallet', () => {
  describe('Balance Tracking', () => {
    it('refreshBalances returns current chain state', async () => {
      const balances = createMockBalances();
      balances.btcSats = 100_000n;
      balances.usdcUnits = 5_000_000n; // $5
      const wallet = createTestWallet(balances);

      const result = await wallet.refreshBalances();
      expect(result.btcSats).toBe(100_000n);
      expect(result.usdcUnits).toBe(5_000_000n);
    });

    it('getSummary computes USDC-equivalent values', async () => {
      const balances = createMockBalances();
      // 1 BTC worth of sats at $100,000/BTC = $100,000
      balances.btcSats = 100_000_000n;
      // $50,000 USDC on EVM
      balances.usdcUnits = 50_000_000_000n;
      const wallet = createTestWallet(balances);
      await wallet.refreshBalances();

      const summary = wallet.getSummary();
      expect(parseFloat(summary.btcValueUsdc)).toBeGreaterThan(0);
      expect(parseFloat(summary.evmValueUsdc)).toBeGreaterThan(0);
    });
  });

  describe('Fee Accounting', () => {
    it('recordFee splits 50/50 between reserve and revenue', () => {
      const wallet = createTestWallet(createMockBalances());

      // Record fee on a $10,000 bridge (0.1% = $10)
      wallet.recordFee(10_000_000_000n); // $10,000 in 6-dec

      const fees = wallet.getFees();
      // 0.1% of $10,000 = $10 = 10_000_000 (6-dec)
      expect(fees.totalFeesCollected).toBe(10_000_000n);
      // Split 50/50
      expect(fees.operationalReserve).toBe(5_000_000n);
      expect(fees.protocolRevenue).toBe(5_000_000n);
    });

    it('multiple fees accumulate', () => {
      const wallet = createTestWallet(createMockBalances());

      wallet.recordFee(1_000_000n); // $1
      wallet.recordFee(2_000_000n); // $2
      wallet.recordFee(3_000_000n); // $3

      const fees = wallet.getFees();
      // 0.1% of each: 1000 + 2000 + 3000 = 6000
      expect(fees.totalFeesCollected).toBe(6000n);
    });
  });

  describe('Imbalance Detection', () => {
    it('no rebalance when balanced', async () => {
      const balances = createMockBalances();
      balances.btcSats = 50_000_000n; // 0.5 BTC ≈ $50,000
      balances.usdcUnits = 50_000_000_000n; // $50,000
      const wallet = createTestWallet(balances);

      const result = await wallet.checkAndRebalance();
      expect(result).toBeNull();
      expect(wallet.getState()).toBe('idle');
    });

    it('no rebalance when both sides are zero', async () => {
      const wallet = createTestWallet(createMockBalances());
      const result = await wallet.checkAndRebalance();
      expect(result).toBeNull();
    });

    it('detects BTC overweight and triggers btc_to_evm', async () => {
      const balances = createMockBalances();
      // BTC side: 1 BTC = $100,000, EVM: $10,000 → BTC is 91% overweight
      balances.btcSats = 100_000_000n;
      balances.usdcUnits = 10_000_000_000n;
      const wallet = createTestWallet(balances, {
        minFeeRevenueForRebalance: 0n, // disable fee gate for test
      });
      // Seed operational reserve so profitability check passes
      wallet.recordFee(100_000_000_000n); // large fee to fund reserve

      const result = await wallet.checkAndRebalance();
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('btc_to_evm');
      expect(result!.success).toBe(true);
    });

    it('detects EVM overweight and triggers evm_to_btc', async () => {
      const balances = createMockBalances();
      // BTC side: $5,000, EVM: $95,000 → EVM is 95% overweight
      balances.btcSats = 5_000_000n; // 0.05 BTC ≈ $5,000
      balances.usdcUnits = 95_000_000_000n;
      const wallet = createTestWallet(balances, {
        minFeeRevenueForRebalance: 0n,
      });
      wallet.recordFee(100_000_000_000n);

      const result = await wallet.checkAndRebalance();
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('evm_to_btc');
    });

    it('does NOT rebalance without sufficient fee revenue', async () => {
      const balances = createMockBalances();
      balances.btcSats = 100_000_000n;
      balances.usdcUnits = 1_000_000n; // very unbalanced
      const wallet = createTestWallet(balances, {
        minFeeRevenueForRebalance: 1_000_000n, // require $1 in fees
      });
      // No fees recorded → operational reserve is 0

      const result = await wallet.checkAndRebalance();
      expect(result).toBeNull(); // blocked by profitability gate
    });
  });

  describe('Cooldown', () => {
    it('respects cooldown period between rebalances', async () => {
      const balances = createMockBalances();
      balances.btcSats = 100_000_000n;
      balances.usdcUnits = 1_000_000n;
      const wallet = createTestWallet(balances, {
        cooldownMs: 60_000, // 1 minute cooldown
        minFeeRevenueForRebalance: 0n,
      });
      wallet.recordFee(100_000_000_000n);

      // First rebalance succeeds
      const first = await wallet.checkAndRebalance();
      expect(first).not.toBeNull();
      expect(wallet.getState()).toBe('cooldown');

      // Second attempt during cooldown returns null
      const second = await wallet.checkAndRebalance();
      expect(second).toBeNull();
    });
  });

  describe('Profitability', () => {
    it('isProfitable returns true when fees > costs', () => {
      const wallet = createTestWallet(createMockBalances());
      wallet.recordFee(10_000_000_000n); // $10 fee → $1 collected
      expect(wallet.isProfitable()).toBe(true); // no rebalances yet, 0 costs
    });
  });
});
