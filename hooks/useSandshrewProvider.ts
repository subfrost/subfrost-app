import { useEffect, useState } from 'react';

import { getSandshrewProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

// Define types locally - Network without 'regtest' to match getSandshrewProvider signature
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet';
type Provider = any;

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
