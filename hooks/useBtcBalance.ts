import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { btcBalanceQueryOptions } from '@/queries/account';

export function useBtcBalance() {
  const { isConnected, getSpendableTotalBalance, address, network } = useWallet();

  return useQuery(
    btcBalanceQueryOptions(network, address, isConnected, getSpendableTotalBalance),
  );
}
