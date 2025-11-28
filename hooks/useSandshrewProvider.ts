import { useEffect, useState } from 'react';

import { getAlkanesProvider } from '@/utils/alkanesProvider';
import { useWallet } from '@/context/WalletContext';

type Provider = any;

export function useSandshrewProvider(): Provider | null {
  const { network } = useWallet();
  const [provider, setProvider] = useState<Provider | null>(null);

  useEffect(() => {
    let mounted = true;

    getAlkanesProvider(network).then((p) => {
      if (mounted) setProvider(p);
    });

    return () => {
      mounted = false;
    };
  }, [network]);

  return provider;
}
