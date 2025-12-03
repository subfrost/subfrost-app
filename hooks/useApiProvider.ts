import { getApiProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

export function useApiProvider() {
  const { network } = useWallet();
  // Cast network to handle regtest which is used in WalletContext but not in oylProvider
  const networkForApi = network === 'regtest' ? 'oylnet' : network;
  return getApiProvider(networkForApi as 'mainnet' | 'testnet' | 'signet' | 'oylnet');
}


