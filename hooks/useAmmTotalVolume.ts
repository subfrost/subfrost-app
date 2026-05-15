/**
 * useAmmTotalVolume — cumulative AMM volume time-series for the landing page.
 *
 * Hits `/api/amm-volume`, which proxies espo's `ammdata.get_total_volume_amm`
 * (alkanode by default, configurable via env). Values come pre-scaled to USD
 * floats — no fixed-point math required at the call site.
 */
'use client';

import { useQuery } from '@tanstack/react-query';

export interface AmmVolumePoint {
  height: number;
  valueUsd: number;
}

export interface AmmTotalVolumeData {
  ok: true;
  unit: string;
  latest: { height: number; valueUsd: number } | null;
  points: AmmVolumePoint[];
}

async function fetchAmmTotalVolume(limit: number): Promise<AmmTotalVolumeData> {
  const resp = await fetch(`/api/amm-volume?limit=${limit}`, { cache: 'no-store' });
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({}));
    throw new Error(`amm-volume HTTP ${resp.status}: ${j?.error ?? 'unknown'}`);
  }
  const j = (await resp.json()) as AmmTotalVolumeData;
  if (!j?.ok) throw new Error('amm-volume returned ok=false');
  return j;
}

export function useAmmTotalVolume(limit = 1000) {
  return useQuery({
    queryKey: ['ammTotalVolume', limit],
    queryFn: () => fetchAmmTotalVolume(limit),
    staleTime: 60_000, // 1 min — landing-page chart, not real-time critical
    refetchOnWindowFocus: false,
  });
}
