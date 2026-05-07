/**
 * Type definitions for FIRE Protocol chart data.
 *
 * These types are used by useFireChartData (which derives values from
 * on-chain FIRE protocol state) and by chart components.
 */

export interface PricePoint {
  time: string; // YYYY-MM-DD
  value: number;
}

export interface StakerDistribution {
  address: string;
  amount: number;
  percentage: number;
}

export interface FireChartData {
  priceHistory: PricePoint[];
  tvlHistory: PricePoint[];
  stakerDistribution: StakerDistribution[];
}
