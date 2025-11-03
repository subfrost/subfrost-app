'use client';

import { useMemo } from 'react';
import { getSandshrewProvider } from '../utils/oylProvider';
import type { Network } from '../utils/constants';

export function useSandshrewProvider() {
  const network: Network = (process.env.NEXT_PUBLIC_NETWORK as Network) || 'mainnet';
  const provider = useMemo(() => getSandshrewProvider(network), [network]);
  return provider;
}


