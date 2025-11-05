import { useMemo } from 'react';
import type { Network, Provider } from '@oyl/sdk';

import { getSandshrewProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

export function useSandshrewProvider(): Provider {
  const { network } = useWallet();
  return useMemo(() => getSandshrewProvider(network as Network), [network]);
}


