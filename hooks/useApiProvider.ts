import { getAlkanesProvider } from '@/utils/alkanesProvider';
import { useWallet } from '@/context/WalletContext';
import { useEffect, useState } from 'react';

export function useApiProvider() {
  const { network } = useWallet();
  const [provider, setProvider] = useState<any>(null);
  
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


