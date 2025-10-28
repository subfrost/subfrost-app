'use client';

import { useMemo } from 'react';
import { getApiProvider } from '../utils/oylProvider';
import type { Network } from '../utils/constants';

export function useApiProvider() {
  const network: Network = (process.env.NEXT_PUBLIC_NETWORK as Network) || 'mainnet';
  return useMemo(() => getApiProvider(network), [network]);
}


