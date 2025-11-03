import { OylApiClient } from '@/api-provider';
import type { Network } from '@oyl/sdk';
import { Provider } from '@oyl/sdk';

import { SANDSHREW_PROJECT_ID } from './constants';
import type { OylConnectProviderAPI } from '@/types';
import { NetworkMap, SandshrewUrlMap } from './constants';
import { getConfig } from './getConfig';

export function getSandshrewProvider(network: Network): Provider {
  return new Provider({
    version: 'v2',
    network: NetworkMap[network],
    networkType: network === 'oylnet' ? 'regtest' : network,
    url: SandshrewUrlMap[network],
    projectId:
      network === 'oylnet' || network === 'regtest'
        ? 'regtest'
        : SANDSHREW_PROJECT_ID,
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
