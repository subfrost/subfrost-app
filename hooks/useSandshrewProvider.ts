import { useEffect, useState } from 'react';
import type { Network, Provider } from '@oyl/sdk';

import { getSandshrewProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

export function useSandshrewProvider(): Provider | null {
  const { network } = useWallet();
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    let mounted = true;
    
    getSandshrewProvider(network as Network).then((p) => {
      if (mounted) setProvider(p);
    });

    return () => {
      mounted = false;
    };
  }, [network]);

  return provider;
}


