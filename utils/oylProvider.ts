import { OylApiClient } from '@/lib/api-provider';
import type { Network } from '@oyl/sdk';
import { Provider } from '@oyl/sdk';

import { SANDSHREW_PROJECT_ID } from '@/constants';
import type { OylConnectProviderAPI } from '@/types';
import { NetworkMap, SandshrewUrlMap } from '@/utils/constants';
import { getConfig } from '@/utils/getConfig';

export function getSandshrewProvider(network: Network): Provider {
  const mappedNetwork = NetworkMap[network] ?? NetworkMap.mainnet!;
  const url = SandshrewUrlMap[network] ?? SandshrewUrlMap.mainnet!;
  const networkType = ((network as any) === 'oylnet' ? 'regtest' : (network as any)) as
    | 'mainnet'
    | 'testnet'
    | 'regtest'
    | 'signet';
  return new Provider({
    version: 'v2',
    network: mappedNetwork,
    networkType,
    url,
    projectId: (network as any) === 'oylnet' ? 'regtest' : SANDSHREW_PROJECT_ID,
  });
}

export function getApiProvider(network: Network) {
  const host = getConfig(network).OYL_API_URL;

  return new OylApiClient({
    network,
    host,
    apiKey: SANDSHREW_PROJECT_ID,
  });
}

export const getOylConnectProvider = (): OylConnectProviderAPI | null => {
  if (typeof window === 'undefined' || !window.oyl) {
    return null;
  }

  return window.oyl;
};


