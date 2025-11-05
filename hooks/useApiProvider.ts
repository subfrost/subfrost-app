import { getApiProvider } from '@/utils/oylProvider';
import { useWallet } from '@/context/WalletContext';

export function useApiProvider() {
  const { network } = useWallet();
  return getApiProvider(network);
}


