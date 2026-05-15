/**
 * Per-pool fee parity tests — FEEDBACK1 #4 follow-up.
 *
 * Anchors swapMath.ts against oyl-amm's `oylswap-library::get_amount_out`.
 * The DIESEL/frBTC pool at 2:77087 charges 1.0% (10/1000) per pool
 * opcode 20, NOT the 0.3% Uniswap-V2 default. The desktop currently
 * uses TOTAL_PROTOCOL_FEE = 0.01 globally, which happens to match
 * for this single pool but is brittle — pools can have different
 * fees. These tests pin the math against the reference impl so any
 * future migration to per-pool fee loading produces identical
 * numbers as the on-chain factory.
 *
 * Reference implementation (oyl-amm/alkanes/oylswap-library/src/lib.rs:206):
 *   fn get_amount_out(amount_in, reserve_in, reserve_out, total_fee_per_1000):
 *     amount_in_with_fee = (1000 - total_fee_per_1000) * amount_in
 *     numerator          = amount_in_with_fee * reserve_out
 *     denominator        = 1000 * reserve_in + amount_in_with_fee
 *     return numerator / denominator
 *
 * `swapMath.ts::swapCalculateOut` parameterises fee as `feePercentage`
 * (= fee_per_1000 / 1000), so the formulas are mathematically
 * identical modulo the `Math.floor` rounding.
 */

import { describe, expect, it } from 'vitest';
import { swapCalculateOut, swapCalculateIn } from '../swapMath';

describe('swapMath / oyl-amm fee parity', () => {
  // Exact reserves the mainnet DIESEL/frBTC pool reported on
  // 2026-05-14 (block 949391) via opcode 999. token0 = DIESEL, token1
  // = frBTC, fee_per_1000 = 10 (1.0%).
  const RESERVE_DIESEL = 533_378_937_262;
  const RESERVE_FRBTC  = 234_873_029;
  const FEE_PCT_ONE    = 0.01;   // 1.0% — fee_per_1000 = 10
  const FEE_PCT_THREE  = 0.003;  // 0.3% — fee_per_1000 = 3 (Uniswap V2 default)

  it('matches oyl-amm reference for the 50K frBTC → DIESEL swap (fee=1.0%)', () => {
    // User's actual on-chain inputs from tx 4eaa26cb71…d3591.
    // swapMath.ts and oyl-amm use mathematically identical formulas
    // (the latter scales numerator+denominator by 1000 internally):
    //   ts:  out = floor( (amount_in * (1-fee)) * reserve_out
    //                     / (reserve_in + amount_in * (1-fee)) )
    //   oyl: out = floor( (1000-fee_per_1000) * amount_in * reserve_out
    //                     / (1000*reserve_in + (1000-fee_per_1000)*amount_in) )
    // For 50_000 frBTC → DIESEL at 1.0% fee against the 2026-05-14
    // reserves, the result is ≈ 112_387_081 (JS f64-then-floor).
    const out = swapCalculateOut({
      amountIn:      50_000,
      reserveIn:     RESERVE_FRBTC,
      reserveOut:    RESERVE_DIESEL,
      feePercentage: FEE_PCT_ONE,
    });
    expect(out).toBeGreaterThan(112_380_000);
    expect(out).toBeLessThan(112_400_000);
  });

  it('a 1.0% fee produces a strictly smaller amount_out than 0.3%', () => {
    // Regression guard: if someone re-hardcodes feePercentage = 0.003
    // (the old Uniswap V2 default) for the DIESEL/frBTC pool, the
    // quote drifts to ~112.8M while the on-chain factory still
    // returns ~112.4M — the on-chain min_amount_out check then
    // fails. This test catches that drift before it ships.
    const outOnePct   = swapCalculateOut({
      amountIn:      50_000,
      reserveIn:     RESERVE_FRBTC,
      reserveOut:    RESERVE_DIESEL,
      feePercentage: FEE_PCT_ONE,
    });
    const outThreeBps = swapCalculateOut({
      amountIn:      50_000,
      reserveIn:     RESERVE_FRBTC,
      reserveOut:    RESERVE_DIESEL,
      feePercentage: FEE_PCT_THREE,
    });
    expect(outOnePct).toBeLessThan(outThreeBps);
    // The gap is ~0.7% of the smaller value — easily exceeds a 0.5%
    // user slippage tolerance, which is why pre-vc=215 mobile swaps
    // were reverting.
    const gapPct = (outThreeBps - outOnePct) / outOnePct;
    expect(gapPct).toBeGreaterThan(0.005);
    expect(gapPct).toBeLessThan(0.02);
  });

  it('round-trip: swapCalculateIn inverts swapCalculateOut at the same fee', () => {
    // amount_in → out (at 1% fee) → required_in (at 1% fee) returns
    // the same amount_in modulo +/-1 rounding. Important because the
    // pre-broadcast guard re-quotes against fresh reserves and we
    // want the inverse path stable.
    const original = 50_000;
    const out = swapCalculateOut({
      amountIn:      original,
      reserveIn:     RESERVE_FRBTC,
      reserveOut:    RESERVE_DIESEL,
      feePercentage: FEE_PCT_ONE,
    });
    const inverted = swapCalculateIn({
      amountOut:     out,
      reserveIn:     RESERVE_FRBTC,
      reserveOut:    RESERVE_DIESEL,
      feePercentage: FEE_PCT_ONE,
    });
    expect(Math.abs(inverted - original)).toBeLessThanOrEqual(2);
  });

  it('zero amount_in throws — no silent zero-output path', () => {
    expect(() =>
      swapCalculateOut({
        amountIn:      0,
        reserveIn:     RESERVE_FRBTC,
        reserveOut:    RESERVE_DIESEL,
        feePercentage: FEE_PCT_ONE,
      })
    ).toThrow(/INSUFFICIENT_INPUT_AMOUNT/);
  });

  it('drained-pool quote rounds to (near-)zero — sanity for the unswappable case', () => {
    // Reproduces the trace pattern seen for txs 62f95efe / 78b59bca:
    // reserves nearly empty, user submits a swap, on-chain factory
    // returns ~0 base units. Mobile-side guard must surface this
    // before broadcast. The math here doesn't fail — it correctly
    // returns a tiny value — but downstream slippage checks against
    // user-tolerance must refuse the trade.
    const drained = swapCalculateOut({
      amountIn:      1_223,
      reserveIn:     69_998,           // micro-reserves
      reserveOut:    4,
      feePercentage: FEE_PCT_ONE,
    });
    // CP math against (69998, 4) with input 1223:
    //   in_with_fee = 990 * 1223 = 1_210_770
    //   out = floor(1_210_770 * 4 / (1000 * 69998 + 1_210_770))
    //       = floor(4_843_080 / 71_208_770) = 0
    expect(drained).toBe(0);
  });
});
