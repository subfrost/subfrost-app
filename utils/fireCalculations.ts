/**
 * FIRE Protocol client-side calculations
 *
 * Emission schedule (halving curve), APY estimation, floor price derivation.
 * These are pure functions — no network calls.
 */

/** Total FIRE max supply */
export const FIRE_MAX_SUPPLY = 2_100_000;

/** Emission pool = 30% of max supply */
export const FIRE_EMISSION_POOL = FIRE_MAX_SUPPLY * 0.3; // 630,000

/** Blocks per epoch (~2 years at 10min blocks) */
export const BLOCKS_PER_EPOCH = 105_120;

/** Halving factor per epoch */
export const HALVING_FACTOR = 0.5;

/** Lock tier multipliers */
export const LOCK_TIERS = [
  { label: 'None', duration: 0, multiplier: 1.0 },
  { label: '1 Week', duration: 1008, multiplier: 1.25 },    // ~7 days of blocks
  { label: '1 Month', duration: 4320, multiplier: 1.5 },    // ~30 days
  { label: '3 Months', duration: 12960, multiplier: 2.0 },  // ~90 days
  { label: '6 Months', duration: 25920, multiplier: 2.5 },  // ~180 days
  { label: '1 Year', duration: 52560, multiplier: 3.0 },    // ~365 days
] as const;

export type LockTier = typeof LOCK_TIERS[number];

/**
 * Compute the full emission schedule (epoch-by-epoch halving).
 * Returns array of { epoch, ratePerBlock, totalEmitted, startBlock }.
 */
export function computeEmissionSchedule(numEpochs: number = 10) {
  let remaining = FIRE_EMISSION_POOL;
  let cumulativeEmitted = 0;
  const schedule: Array<{
    epoch: number;
    ratePerBlock: number;
    totalEmittedInEpoch: number;
    cumulativeEmitted: number;
    startBlock: number;
  }> = [];

  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const emittedThisEpoch = remaining * HALVING_FACTOR;
    const ratePerBlock = emittedThisEpoch / BLOCKS_PER_EPOCH;
    cumulativeEmitted += emittedThisEpoch;
    remaining -= emittedThisEpoch;

    schedule.push({
      epoch,
      ratePerBlock,
      totalEmittedInEpoch: emittedThisEpoch,
      cumulativeEmitted,
      startBlock: epoch * BLOCKS_PER_EPOCH,
    });
  }

  return schedule;
}

/**
 * Generate chart data points for the emission curve.
 * Returns monthly-resolution points over the schedule.
 */
export function generateEmissionChartData(numYears: number = 10) {
  const pointsPerYear = 12;
  const totalPoints = numYears * pointsPerYear;
  const blocksPerMonth = BLOCKS_PER_EPOCH / 24; // ~4380

  let remaining = FIRE_EMISSION_POOL;
  const data: Array<{ month: number; emitted: number; remaining: number; ratePerBlock: number }> = [];

  let cumulativeEmitted = 0;
  let currentEpoch = 0;
  let epochRemaining = remaining * HALVING_FACTOR;
  let ratePerBlock = epochRemaining / BLOCKS_PER_EPOCH;

  for (let month = 0; month < totalPoints; month++) {
    const blockNum = month * blocksPerMonth;
    const epoch = Math.floor(blockNum / BLOCKS_PER_EPOCH);

    if (epoch > currentEpoch) {
      remaining -= epochRemaining;
      currentEpoch = epoch;
      epochRemaining = remaining * HALVING_FACTOR;
      ratePerBlock = epochRemaining / BLOCKS_PER_EPOCH;
    }

    const blocksIntoEpoch = blockNum - epoch * BLOCKS_PER_EPOCH;
    const emittedInCurrentEpoch = ratePerBlock * blocksIntoEpoch;
    const totalEmittedSoFar = (FIRE_EMISSION_POOL - remaining) + emittedInCurrentEpoch;

    data.push({
      month,
      emitted: totalEmittedSoFar,
      remaining: FIRE_EMISSION_POOL - totalEmittedSoFar,
      ratePerBlock,
    });
  }

  return data;
}

/**
 * Estimate APY for a given staking position.
 * @param emissionRatePerBlock - FIRE emitted per block
 * @param totalWeightedStake - Total weighted stake across all stakers
 * @param userStake - User's raw LP stake amount
 * @param lockMultiplier - User's lock tier multiplier (1.0-3.0)
 * @param firePrice - Current FIRE price in frBTC
 * @param lpPrice - Current LP token price in frBTC
 */
export function estimateAPY(
  emissionRatePerBlock: number,
  totalWeightedStake: number,
  userStake: number,
  lockMultiplier: number,
  firePrice: number = 1,
  lpPrice: number = 1,
): number {
  if (totalWeightedStake === 0 || userStake === 0) return 0;

  const userWeightedStake = userStake * lockMultiplier;
  const userShareOfEmissions = userWeightedStake / totalWeightedStake;
  const blocksPerYear = 52560; // ~365.25 days
  const annualFireReward = emissionRatePerBlock * blocksPerYear * userShareOfEmissions;
  const rewardValueInFrbtc = annualFireReward * firePrice;
  const stakeValueInFrbtc = userStake * lpPrice;

  if (stakeValueInFrbtc === 0) return 0;
  return (rewardValueInFrbtc / stakeValueInFrbtc) * 100;
}

/**
 * Calculate floor price (backing per FIRE token).
 * @param totalBacking - Total treasury backing in sats
 * @param circulatingSupply - Current circulating FIRE supply
 */
export function calculateFloorPrice(totalBacking: number, circulatingSupply: number): number {
  if (circulatingSupply === 0) return 0;
  return totalBacking / circulatingSupply;
}

/**
 * Get lock multiplier for a given tier index.
 */
export function getLockMultiplier(tierIndex: number): number {
  if (tierIndex < 0 || tierIndex >= LOCK_TIERS.length) return 1.0;
  return LOCK_TIERS[tierIndex].multiplier;
}

/**
 * Estimate daily FIRE rewards for the rewards projector widget.
 */
export function estimateDailyRewards(
  emissionRatePerBlock: number,
  totalWeightedStake: number,
  userStake: number,
  lockMultiplier: number,
): number {
  if (totalWeightedStake === 0 || userStake === 0) return 0;
  const userWeightedStake = userStake * lockMultiplier;
  const userShare = userWeightedStake / totalWeightedStake;
  const blocksPerDay = 144;
  return emissionRatePerBlock * blocksPerDay * userShare;
}

/**
 * Format large numbers with K/M/B suffixes.
 */
export function formatCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}
