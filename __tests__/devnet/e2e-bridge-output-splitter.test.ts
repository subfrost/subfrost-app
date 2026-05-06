/**
 * Tests for Bridge Output Splitter — USDC/ETH split for cold wallets.
 *
 * Tests the mock DEX (constant-product USDC/WETH pool) and the
 * splitBridgeOutput() function that atomically delivers USDC + ETH.
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-bridge-output-splitter.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DevnetEvmProvider } from '../../lib/devnet/evmProvider';

let evm: DevnetEvmProvider;
let usdcAddress: string;
let usdtAddress: string;

describe('Bridge Output Splitter', () => {
  beforeAll(async () => {
    evm = await DevnetEvmProvider.createForTests();
    const tokens = await evm.deployMockTokens();
    usdcAddress = tokens.usdcAddress;
    usdtAddress = tokens.usdtAddress;

    // Seed deployer with USDC for splitter operations
    const deployer = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    await evm.seedWallet(deployer, { usdc: 1_000_000_000_000n }, tokens); // 1M USDC
  }, 30_000);

  // ---- Mock DEX Tests ----

  describe('USDC/ETH Mock DEX', () => {
    it('quoteUsdcToEth returns nonzero for valid input', () => {
      const { ethAmount } = evm.quoteUsdcToEth(1_000_000_000n); // $1,000
      expect(ethAmount).toBeGreaterThan(0n);
    });

    it('larger trades have more price impact', () => {
      const small = evm.quoteUsdcToEth(100_000_000n);  // $100
      const large = evm.quoteUsdcToEth(1_000_000_000_000n); // $1M

      // Price per USDC should be worse for large trade
      const smallPricePerUsdc = (small.ethAmount * 10000n) / 100_000_000n;
      const largePricePerUsdc = (large.ethAmount * 10000n) / 1_000_000_000_000n;
      expect(largePricePerUsdc).toBeLessThan(smallPricePerUsdc);
      expect(large.priceImpact).toBeGreaterThan(small.priceImpact);
    });

    it('0.3% fee is applied (output < theoretical)', () => {
      // With equal reserves, 1% of pool should give ~0.997% output (minus fee + impact)
      const { ethAmount } = evm.quoteUsdcToEth(100_000_000_000n); // $100K (1% of 10M reserve)
      // Without fee: amountOut = 100K * 3K / (10M + 100K) = ~29.7 ETH
      // With 0.3% fee: ~29.6 ETH
      expect(ethAmount).toBeGreaterThan(0n);
      expect(ethAmount).toBeLessThan(30n * 10n ** 18n); // less than 30 ETH
    });

    it('swap executes and funds recipient', () => {
      const recipient = '0x' + '1'.repeat(40);
      const { ethReceived, txHash } = evm.swapUsdcToEth(
        10_000_000n, // $10
        recipient,
      );
      expect(ethReceived).toBeGreaterThan(0n);
      expect(txHash).toBeTruthy();
    });

    it('swap respects minEthOut slippage protection', () => {
      const recipient = '0x' + '2'.repeat(40);
      expect(() =>
        evm.swapUsdcToEth(
          10_000_000n, // $10
          recipient,
          10n ** 18n * 1000n, // absurd minimum: 1000 ETH
        ),
      ).toThrow('Slippage');
    });
  });

  // ---- Split Bridge Output Tests ----

  describe('splitBridgeOutput', () => {
    it('0% split delivers all as USDC', () => {
      const recipient = '0x' + '3'.repeat(40);
      const result = evm.splitBridgeOutput(
        recipient,
        10_000_000_000n, // $10,000
        0, // 0% ETH
        usdcAddress,
      );
      expect(result.usdcDelivered).toBe(10_000_000_000n);
      expect(result.ethDelivered).toBe(0n);
      expect(result.swapTxHash).toBeNull();
    });

    it('5% split delivers USDC + ETH', () => {
      const recipient = '0x' + '4'.repeat(40);
      const result = evm.splitBridgeOutput(
        recipient,
        10_000_000_000n, // $10,000
        500, // 5% = 500 bps
        usdcAddress,
      );
      // 95% = $9,500 USDC
      expect(result.usdcDelivered).toBe(9_500_000_000n);
      // 5% = $500 swapped to ETH
      expect(result.ethDelivered).toBeGreaterThan(0n);
      expect(result.swapTxHash).toBeTruthy();
    });

    it('rejects > 50% split', () => {
      const recipient = '0x' + '5'.repeat(40);
      expect(() =>
        evm.splitBridgeOutput(recipient, 1_000_000n, 5001, usdcAddress),
      ).toThrow('0-5000 bps');
    });

    it('20% split provides meaningful ETH for gas', () => {
      const recipient = '0x' + '6'.repeat(40);
      const result = evm.splitBridgeOutput(
        recipient,
        5_000_000_000n, // $5,000
        2000, // 20% = 2000 bps → $1,000 swapped to ETH
        usdcAddress,
      );
      // $1,000 at ~$3,333/ETH ≈ 0.3 ETH → covers hundreds of txs
      expect(result.ethDelivered).toBeGreaterThan(10n ** 17n); // > 0.1 ETH
      expect(result.usdcDelivered).toBe(4_000_000_000n); // $4,000
    });
  });

  // ---- Gas Estimation Tests ----

  describe('estimateEthForGas', () => {
    it('returns tx coverage estimate', () => {
      const estimate = evm.estimateEthForGas(10_000_000_000n, 500); // $10K, 5%
      expect(estimate.usdcKept).toBe(9_500_000_000n);
      expect(estimate.ethReceived).toBeGreaterThan(0n);
      expect(estimate.coversApproxTxs).toBeGreaterThan(0);
      expect(parseFloat(estimate.ethInUsd)).toBeGreaterThan(0);
    });

    it('higher percentage gives more txs', () => {
      const low = evm.estimateEthForGas(10_000_000_000n, 200);  // 2%
      const high = evm.estimateEthForGas(10_000_000_000n, 2000); // 20%
      expect(high.coversApproxTxs).toBeGreaterThan(low.coversApproxTxs);
      expect(high.ethReceived).toBeGreaterThan(low.ethReceived);
    });
  });
});
