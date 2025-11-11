/**
 * Tests for gauge boost calculation
 * 
 * Formula: boost = min(1 + (veDIESEL * total_stake) / (stake * total_veDIESEL), 2.5)
 * 
 * Validates:
 * - Correct boost formula implementation
 * - Min boost is 1.0x (no veDIESEL)
 * - Max boost is 2.5x (cap)
 * - Edge cases (zero values, large numbers)
 */

import BigNumber from 'bignumber.js';

function calculateBoost(
  userVeDiesel: string,
  userStake: string,
  totalVeDiesel: string,
  totalStake: string
): number {
  const vd = new BigNumber(userVeDiesel);
  const us = new BigNumber(userStake);
  const tvd = new BigNumber(totalVeDiesel);
  const ts = new BigNumber(totalStake);

  // Handle edge cases
  if (us.isZero() || tvd.isZero() || ts.isZero()) {
    return 1.0;
  }

  // boost = 1 + (vd * ts) / (us * tvd)
  const numerator = vd.multipliedBy(ts);
  const denominator = us.multipliedBy(tvd);
  
  if (denominator.isZero()) {
    return 1.0;
  }

  const boostFactor = numerator.dividedBy(denominator);
  const boost = 1 + boostFactor.toNumber();

  // Cap at 2.5x
  return Math.min(boost, 2.5);
}

describe('Boost Calculation', () => {
  test('Should return 1.0x boost with no veDIESEL', () => {
    const boost = calculateBoost(
      '0',           // No veDIESEL
      '100000000',   // User staked 1 LP
      '1000000000',  // Total 10 veDIESEL
      '1000000000'   // Total 10 LP staked
    );
    expect(boost).toBe(1.0);
  });

  test('Should return 1.0x boost with no stake', () => {
    const boost = calculateBoost(
      '100000000',   // 1 veDIESEL
      '0',           // No stake
      '1000000000',  // Total 10 veDIESEL
      '1000000000'   // Total 10 LP staked
    );
    expect(boost).toBe(1.0);
  });

  test('Should calculate correct boost for example from docs', () => {
    // Example: User: 100 LP, 50 veDIESEL | Pool: 1000 LP, 200 veDIESEL
    // boost = min(1 + (50 * 1000) / (100 * 200), 2.5)
    //       = min(1 + 50000 / 20000, 2.5)
    //       = min(1 + 2.5, 2.5)
    //       = 2.5x
    const boost = calculateBoost(
      '5000000000',   // 50 veDIESEL
      '10000000000',  // 100 LP
      '20000000000',  // 200 veDIESEL total
      '100000000000'  // 1000 LP total
    );
    expect(boost).toBe(2.5);
  });

  test('Should cap boost at 2.5x maximum', () => {
    // Extreme case: very high veDIESEL relative to stake
    const boost = calculateBoost(
      '1000000000000', // 10,000 veDIESEL
      '100000000',     // 1 LP
      '1000000000',    // 10 veDIESEL total
      '1000000000'     // 10 LP total
    );
    expect(boost).toBe(2.5);
    expect(boost).toBeLessThanOrEqual(2.5);
  });

  test('Should calculate moderate boost correctly', () => {
    // User: 100 LP, 10 veDIESEL | Pool: 1000 LP, 200 veDIESEL
    // boost = 1 + (10 * 1000) / (100 * 200)
    //       = 1 + 10000 / 20000
    //       = 1 + 0.5
    //       = 1.5x
    const boost = calculateBoost(
      '1000000000',   // 10 veDIESEL
      '10000000000',  // 100 LP
      '20000000000',  // 200 veDIESEL total
      '100000000000'  // 1000 LP total
    );
    expect(boost).toBeCloseTo(1.5, 5);
  });

  test('Should handle equal ratios (proportional)', () => {
    // User has same % of veDIESEL as % of LP staked
    // User: 100 LP, 20 veDIESEL | Pool: 1000 LP, 200 veDIESEL
    // boost = 1 + (20 * 1000) / (100 * 200)
    //       = 1 + 20000 / 20000
    //       = 1 + 1
    //       = 2.0x
    const boost = calculateBoost(
      '2000000000',   // 20 veDIESEL
      '10000000000',  // 100 LP
      '20000000000',  // 200 veDIESEL total
      '100000000000'  // 1000 LP total
    );
    expect(boost).toBeCloseTo(2.0, 5);
  });

  test('Should handle very small numbers', () => {
    const boost = calculateBoost(
      '1',       // 0.00000001 veDIESEL
      '100',     // 0.000001 LP
      '1000',    // 0.00001 veDIESEL total
      '10000'    // 0.0001 LP total
    );
    expect(boost).toBeGreaterThanOrEqual(1.0);
    expect(boost).toBeLessThanOrEqual(2.5);
  });

  test('Should handle very large numbers', () => {
    const boost = calculateBoost(
      '1000000000000000', // 10M veDIESEL
      '5000000000000000', // 50M LP
      '10000000000000000', // 100M veDIESEL total
      '50000000000000000'  // 500M LP total
    );
    expect(boost).toBeGreaterThanOrEqual(1.0);
    expect(boost).toBeLessThanOrEqual(2.5);
  });

  test('Boost should always be between 1.0 and 2.5', () => {
    const testCases = [
      ['0', '100000000', '1000000000', '1000000000'],
      ['100000000', '100000000', '1000000000', '1000000000'],
      ['500000000', '100000000', '1000000000', '1000000000'],
      ['1000000000', '100000000', '1000000000', '1000000000'],
      ['10000000000', '100000000', '1000000000', '1000000000'],
    ];

    testCases.forEach(([vd, us, tvd, ts]) => {
      const boost = calculateBoost(vd, us, tvd, ts);
      expect(boost).toBeGreaterThanOrEqual(1.0);
      expect(boost).toBeLessThanOrEqual(2.5);
    });
  });

  test('Should return 1.0 if total veDIESEL is zero', () => {
    const boost = calculateBoost(
      '100000000',  // User has veDIESEL (edge case)
      '100000000',  // User staked
      '0',          // Total veDIESEL is 0
      '1000000000'  // Total stake
    );
    expect(boost).toBe(1.0);
  });

  test('Should return 1.0 if total stake is zero', () => {
    const boost = calculateBoost(
      '100000000',  // User veDIESEL
      '100000000',  // User staked (edge case)
      '1000000000', // Total veDIESEL
      '0'           // Total stake is 0
    );
    expect(boost).toBe(1.0);
  });
});
