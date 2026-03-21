/**
 * Devnet E2E: Pool Capital Efficiency Comparison
 *
 * Compares constant-product AMM (oyl-amm) vs StableSwap (synth-pool)
 * with $100M TVL and a $100K swap to measure:
 *
 *   1. Slippage: How much output deviates from 1:1 ideal
 *   2. Price impact: Effective exchange rate vs spot rate
 *   3. LP fee revenue: How much LPs earn per swap
 *   4. Capital efficiency: Output per dollar of TVL
 *
 * Both pools use 8-decimal tokens. The AMM uses DIESEL/frBTC,
 * the synth-pool uses frUSD/frBTC (stableswap with A=100).
 *
 * Run: pnpm vitest run __tests__/devnet/e2e-pool-efficiency.test.ts --testTimeout=300000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Pool Capital Efficiency: AMM vs StableSwap', () => {

  // =========================================================================
  // Pure math simulation (no on-chain needed — just compare the formulas)
  // =========================================================================

  // Constants
  const DECIMALS = 8;
  const UNIT = 10n ** BigInt(DECIMALS); // 1e8
  const TVL_EACH = 50_000_000n * UNIT; // $50M per side = $100M total TVL

  // AMM: Constant-product (x * y = k)
  // Fee: 30 bps (0.3%) — standard Uniswap v2 fee (oyl-amm default)
  const AMM_FEE_PER_1000 = 30n; // 30/1000 = 3%... wait, oyl-amm uses fee_per_1000

  // Actually oyl-amm default is 3 per 1000 = 0.3%
  // Let me check: get_amount_out uses (1000 - total_fee_per_1000) * amount_in
  // So fee_per_1000 = 3 means 0.3% fee
  const AMM_FEE = 3n; // 3/1000 = 0.3%

  // StableSwap: Curve invariant with amplification A
  // Fee: 4000000 / 1e10 = 0.04% = 4 bps
  const SYNTH_FEE_NUM = 4000000n;
  const SYNTH_FEE_DENOM = 10000000000n; // 1e10
  const A = 100n; // Amplification coefficient
  const N_COINS = 2n;

  // ---- AMM (Constant Product) Math ----

  function ammGetAmountOut(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
    feePerThousand: bigint,
  ): bigint {
    const amountInWithFee = (1000n - feePerThousand) * amountIn;
    const numerator = amountInWithFee * reserveOut;
    const denominator = 1000n * reserveIn + amountInWithFee;
    return numerator / denominator;
  }

  // ---- StableSwap (Curve) Math ----

  // get_D: Find the StableSwap invariant D
  function getD(balances: bigint[], amp: bigint): bigint {
    const sum = balances.reduce((a, b) => a + b, 0n);
    if (sum === 0n) return 0n;

    let D = sum;
    const Ann = amp * N_COINS;

    for (let i = 0; i < 255; i++) {
      let D_P = D;
      for (const b of balances) {
        D_P = D_P * D / (b * N_COINS);
      }

      const D_prev = D;
      // D = (Ann * sum + D_P * N_COINS) * D / ((Ann - 1) * D + (N_COINS + 1) * D_P)
      const numerator = (Ann * sum + D_P * N_COINS) * D;
      const denominator = (Ann - 1n) * D + (N_COINS + 1n) * D_P;
      D = numerator / denominator;

      if (D > D_prev) {
        if (D - D_prev <= 1n) break;
      } else {
        if (D_prev - D <= 1n) break;
      }
    }
    return D;
  }

  // get_y: Find the new balance of token j after swap
  function getY(i: number, j: number, x: bigint, balances: bigint[], amp: bigint, D: bigint): bigint {
    const Ann = amp * N_COINS;

    let c = D;
    let S = 0n;

    for (let k = 0; k < Number(N_COINS); k++) {
      const xk = k === i ? x : balances[k];
      if (k !== j) {
        S += xk;
        c = c * D / (xk * N_COINS);
      }
    }

    c = c * D / (Ann * N_COINS);
    const b = S + D / Ann;

    let y = D;
    for (let k = 0; k < 255; k++) {
      const y_prev = y;
      y = (y * y + c) / (2n * y + b - D);
      if (y > y_prev) {
        if (y - y_prev <= 1n) break;
      } else {
        if (y_prev - y <= 1n) break;
      }
    }
    return y;
  }

  function synthGetAmountOut(
    amountIn: bigint,
    balances: [bigint, bigint],
    amp: bigint,
    feeNum: bigint,
    feeDenom: bigint,
  ): { amountOut: bigint; fee: bigint } {
    const x = balances[0] + amountIn;
    const D = getD([...balances], amp);
    const y = getY(0, 1, x, [...balances], amp, D);
    const dy = balances[1] - y;
    const dyFee = dy * feeNum / feeDenom;
    return { amountOut: dy - dyFee, fee: dyFee };
  }

  // ---- Test Cases ----

  describe('$100M TVL, $100K Swap', () => {
    const swapAmount = 100_000n * UNIT; // $100K

    it('should calculate AMM (constant-product) output', () => {
      const amountOut = ammGetAmountOut(swapAmount, TVL_EACH, TVL_EACH, AMM_FEE);

      const slippageBps = Number((swapAmount - amountOut) * 10000n / swapAmount);
      const feeAmount = swapAmount * AMM_FEE / 1000n;
      const priceImpactBps = slippageBps - Number(AMM_FEE * 10n); // slippage minus fee

      console.log('[efficiency] === Constant-Product AMM (oyl-amm) ===');
      console.log('  TVL:          $100M ($50M per side)');
      console.log('  Swap:         $100,000');
      console.log('  Fee:          0.3% (30 bps)');
      console.log('  Amount out:   %s (%s)', amountOut, (Number(amountOut) / Number(UNIT)).toFixed(2));
      console.log('  Fee earned:   %s (%s)', feeAmount, (Number(feeAmount) / Number(UNIT)).toFixed(2));
      console.log('  Slippage:     %d bps (%s%)', slippageBps, (slippageBps / 100).toFixed(2));
      console.log('  Price impact: %d bps (%s%)', priceImpactBps, (priceImpactBps / 100).toFixed(2));

      expect(amountOut).toBeGreaterThan(0n);
      expect(amountOut).toBeLessThan(swapAmount); // Must lose some to fee + slippage
    });

    it('should calculate StableSwap (synth-pool) output', () => {
      const { amountOut, fee } = synthGetAmountOut(
        swapAmount,
        [TVL_EACH, TVL_EACH],
        A,
        SYNTH_FEE_NUM,
        SYNTH_FEE_DENOM,
      );

      const slippageBps = Number((swapAmount - amountOut) * 10000n / swapAmount);
      const priceImpactBps = slippageBps - Number(SYNTH_FEE_NUM * 10000n / SYNTH_FEE_DENOM);

      console.log('[efficiency] === StableSwap (synth-pool, A=%s) ===', A);
      console.log('  TVL:          $100M ($50M per side)');
      console.log('  Swap:         $100,000');
      console.log('  Fee:          0.04% (4 bps)');
      console.log('  Amount out:   %s (%s)', amountOut, (Number(amountOut) / Number(UNIT)).toFixed(2));
      console.log('  Fee earned:   %s (%s)', fee, (Number(fee) / Number(UNIT)).toFixed(2));
      console.log('  Slippage:     %d bps (%s%)', slippageBps, (slippageBps / 100).toFixed(2));
      console.log('  Price impact: %d bps (%s%)', priceImpactBps, (priceImpactBps / 100).toFixed(2));

      expect(amountOut).toBeGreaterThan(0n);
      expect(amountOut).toBeLessThan(swapAmount);
    });

    it('should compare both pools side by side', () => {
      const ammOut = ammGetAmountOut(swapAmount, TVL_EACH, TVL_EACH, AMM_FEE);
      const { amountOut: synthOut, fee: synthFee } = synthGetAmountOut(
        swapAmount, [TVL_EACH, TVL_EACH], A, SYNTH_FEE_NUM, SYNTH_FEE_DENOM,
      );
      const ammFee = swapAmount * AMM_FEE / 1000n;

      const ammSlippage = Number((swapAmount - ammOut) * 10000n / swapAmount);
      const synthSlippage = Number((swapAmount - synthOut) * 10000n / swapAmount);
      const improvement = Number(synthOut - ammOut);
      const improvementPct = (Number(synthOut - ammOut) * 100 / Number(ammOut)).toFixed(4);

      console.log('[efficiency]');
      console.log('[efficiency] ╔══════════════════════════════════════════════════════╗');
      console.log('[efficiency] ║  POOL COMPARISON: $100K swap on $100M TVL           ║');
      console.log('[efficiency] ╠══════════════════════════════════════════════════════╣');
      console.log('[efficiency] ║                  AMM (x*y=k)    StableSwap (A=%s)  ║', A.toString().padStart(3));
      console.log('[efficiency] ╠══════════════════════════════════════════════════════╣');
      console.log('[efficiency] ║  Amount out:  $%s    $%s  ║',
        (Number(ammOut) / Number(UNIT)).toFixed(2).padStart(12),
        (Number(synthOut) / Number(UNIT)).toFixed(2).padStart(12));
      console.log('[efficiency] ║  Fee earned:  $%s    $%s  ║',
        (Number(ammFee) / Number(UNIT)).toFixed(2).padStart(12),
        (Number(synthFee) / Number(UNIT)).toFixed(2).padStart(12));
      console.log('[efficiency] ║  Slippage:    %s bps       %s bps        ║',
        ammSlippage.toString().padStart(6),
        synthSlippage.toString().padStart(6));
      console.log('[efficiency] ╠══════════════════════════════════════════════════════╣');
      console.log('[efficiency] ║  StableSwap advantage: +$%s (%s%%)  ║',
        (improvement / Number(UNIT)).toFixed(2).padStart(8),
        improvementPct.padStart(6));
      console.log('[efficiency] ╚══════════════════════════════════════════════════════╝');

      // StableSwap should be significantly better for same-value assets
      expect(synthOut).toBeGreaterThan(ammOut);
    });
  });

  describe('Sweep across swap sizes', () => {
    const swapSizes = [
      { label: '$1K', amount: 1_000n },
      { label: '$10K', amount: 10_000n },
      { label: '$100K', amount: 100_000n },
      { label: '$1M', amount: 1_000_000n },
      { label: '$5M', amount: 5_000_000n },
      { label: '$10M', amount: 10_000_000n },
    ];

    it('should compare slippage across swap sizes', () => {
      console.log('[efficiency]');
      console.log('[efficiency] ┌─────────┬────────────────┬────────────────┬──────────────┐');
      console.log('[efficiency] │ Swap    │ AMM Slippage   │ Synth Slippage │ Synth Adv.   │');
      console.log('[efficiency] ├─────────┼────────────────┼────────────────┼──────────────┤');

      for (const { label, amount } of swapSizes) {
        const swapAmount = amount * UNIT;
        const ammOut = ammGetAmountOut(swapAmount, TVL_EACH, TVL_EACH, AMM_FEE);
        const { amountOut: synthOut } = synthGetAmountOut(
          swapAmount, [TVL_EACH, TVL_EACH], A, SYNTH_FEE_NUM, SYNTH_FEE_DENOM,
        );

        const ammSlippage = Number((swapAmount - ammOut) * 10000n / swapAmount);
        const synthSlippage = Number((swapAmount - synthOut) * 10000n / swapAmount);
        const savedBps = ammSlippage - synthSlippage;
        const savedDollars = Number(synthOut - ammOut) / Number(UNIT);

        console.log('[efficiency] │ %s │ %s bps %s%% │ %s bps %s%% │ +$%s │',
          label.padEnd(7),
          ammSlippage.toString().padStart(5),
          (ammSlippage / 100).toFixed(2).padStart(5),
          synthSlippage.toString().padStart(5),
          (synthSlippage / 100).toFixed(2).padStart(5),
          savedDollars.toFixed(0).padStart(9),
        );
      }

      console.log('[efficiency] └─────────┴────────────────┴────────────────┴──────────────┘');
    });
  });

  describe('Amplification coefficient sensitivity', () => {
    it('should show how A affects slippage for $100K swap', () => {
      const swapAmount = 100_000n * UNIT;
      const amplifications = [1n, 10n, 50n, 100n, 200n, 500n, 1000n, 5000n];

      console.log('[efficiency]');
      console.log('[efficiency] ┌────────┬────────────────┬──────────┐');
      console.log('[efficiency] │ A      │ Amount Out     │ Slippage │');
      console.log('[efficiency] ├────────┼────────────────┼──────────┤');

      for (const amp of amplifications) {
        const { amountOut } = synthGetAmountOut(
          swapAmount, [TVL_EACH, TVL_EACH], amp, SYNTH_FEE_NUM, SYNTH_FEE_DENOM,
        );
        const slippage = Number((swapAmount - amountOut) * 10000n / swapAmount);

        console.log('[efficiency] │ A=%s │ $%s │ %s bps │',
          amp.toString().padStart(5),
          (Number(amountOut) / Number(UNIT)).toFixed(2).padStart(12),
          slippage.toString().padStart(5));
      }

      console.log('[efficiency] └────────┴────────────────┴──────────┘');
      console.log('[efficiency] (AMM constant-product = A→0, pure stablecoin = A→∞)');
    });
  });
});
