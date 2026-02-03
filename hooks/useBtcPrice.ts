import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { btcPriceQueryOptions } from '@/queries/market';

export function useBtcPrice() {
  const { provider, isInitialized, bitcoinPrice, network } = useAlkanesSDK();

  return useQuery(btcPriceQueryOptions(network, provider, isInitialized, bitcoinPrice));
}
