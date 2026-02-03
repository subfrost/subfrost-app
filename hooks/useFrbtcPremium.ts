import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { frbtcPremiumQueryOptions } from '@/queries/market';

// Re-export the type for consumers
export type { FrbtcPremiumData } from '@/queries/market';

export function useFrbtcPremium() {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useQuery(
    frbtcPremiumQueryOptions(network, provider, isInitialized, FRBTC_ALKANE_ID, parseAlkaneId),
  );
}
