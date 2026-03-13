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
  let price = 0.00045; // Starting FIRE/frBTC price

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Random walk with slight upward drift
    const change = (Math.random() - 0.48) * 0.00005;
    price = Math.max(0.0001, price + change);

    data.push({ time: dateStr, value: price });
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
