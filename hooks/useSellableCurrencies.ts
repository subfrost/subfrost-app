import { useQuery } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig, fetchAlkaneBalances } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';
import { sellableCurrenciesQueryOptions } from '@/queries/account';

export const useSellableCurrencies = (
  walletAddress?: string,
  tokensWithPools?: { id: string; name?: string }[],
) => {
  const { provider, isInitialized } = useAlkanesSDK();
  const { network, account } = useWallet();
  const config = getConfig(network);

  return useQuery(
    sellableCurrenciesQueryOptions({
      provider,
      isInitialized,
      network,
      walletAddress,
      account,
      tokensWithPools,
      fetchAlkaneBalances,
      alkanodeUrl: config.OYL_ALKANODE_URL,
    }),
  );
};
