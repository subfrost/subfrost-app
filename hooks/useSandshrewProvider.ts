import { useEffect, useState } from 'react';
import type { NetworkType, AlkanesProvider } from '@alkanes/ts-sdk';

import { getSandshrewProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

export function useSandshrewProvider(): AlkanesProvider | null {
  const { network } = useWallet();
  const [provider, setProvider] = useState<AlkanesProvider | null>(null);

  useEffect(() => {
    let mounted = true;
    
    getSandshrewProvider(network as NetworkType).then((p) => {
      if (mounted) setProvider(p);
    });

    return () => {
      mounted = false;
    };
  }, [network]);

  return provider;
}


