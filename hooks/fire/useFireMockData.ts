/**
 * Mock data hook for FIRE Protocol charts.
 * Provides placeholder price history, TVL history, and staker distribution
 * until espo fire module (Phase 2) provides real historical data.
 */

import { useMemo } from 'react';

export interface PricePoint {
  time: string; // YYYY-MM-DD
  value: number;
}

export interface StakerDistribution {
  address: string;
  amount: number;
  percentage: number;
}

export interface FireMockData {
  priceHistory: PricePoint[];
  tvlHistory: PricePoint[];
  stakerDistribution: StakerDistribution[];
}

function generateMockPriceHistory(days: number = 30): PricePoint[] {
  const data: PricePoint[] = [];
  const now = new Date();
  const startPrice = 0.00045; // Starting FIRE/frBTC price
  // Target a positive return: end 0.5-35% higher than start
  const targetEndPrice = startPrice * (1.005 + Math.random() * 0.345);

  // Generate a random walk, then rescale so it always ends positive
  const rawPrices: number[] = [];
  let price = startPrice;
  for (let i = days; i >= 0; i--) {
    rawPrices.push(price);
    const change = (Math.random() - 0.5) * 0.00005;
    price = Math.max(0.0001, price + change);
  }

  // Linearly interpolate the drift so final price hits targetEndPrice
  const rawStart = rawPrices[0];
  const rawEnd = rawPrices[rawPrices.length - 1];
  const totalSteps = rawPrices.length - 1;

  for (let idx = 0; idx <= totalSteps; idx++) {
    const i = days - idx;
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Shift each point so the path drifts from startPrice to targetEndPrice
    const t = idx / totalSteps;
    const driftAdjustment = t * (targetEndPrice - rawEnd) + (1 - t) * (rawStart - rawPrices[idx]);
    const adjustedPrice = Math.max(0.0001, rawPrices[idx] + driftAdjustment);

    data.push({ time: dateStr, value: adjustedPrice });
  }

  return data;
}

function generateMockTvlHistory(days: number = 30): PricePoint[] {
  const data: PricePoint[] = [];
  const now = new Date();
  let tvl = 12_500_000; // Starting TVL in sats

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const change = (Math.random() - 0.45) * 500_000;
    tvl = Math.max(5_000_000, tvl + change);

    data.push({ time: dateStr, value: tvl });
  }

  return data;
}

function generateMockStakerDistribution(): StakerDistribution[] {
  const stakers = [
    { address: 'bc1p...a7k2', amount: 45_000_000, percentage: 35 },
    { address: 'bc1p...m4n9', amount: 25_000_000, percentage: 19.5 },
    { address: 'bc1p...x8f3', amount: 18_000_000, percentage: 14 },
    { address: 'bc1p...q2w1', amount: 12_000_000, percentage: 9.4 },
    { address: 'bc1p...j6h5', amount: 8_000_000, percentage: 6.3 },
    { address: 'Others', amount: 20_300_000, percentage: 15.8 },
  ];
  return stakers;
}

export function useFireMockData(): FireMockData {
  return useMemo(() => ({
    priceHistory: generateMockPriceHistory(30),
    tvlHistory: generateMockTvlHistory(30),
    stakerDistribution: generateMockStakerDistribution(),
  }), []);
}
