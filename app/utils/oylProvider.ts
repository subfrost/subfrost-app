import { OylApiClient } from '@oyl/api-provider';
import { Provider } from '@oyl/sdk';
import type { Network } from './constants';
import { NetworkMap, SandshrewUrlMap } from './constants';
import { getConfig } from './getConfig';

const SANDSHREW_PROJECT_ID = process.env.NEXT_PUBLIC_SANDSHREW_PROJECT_ID || 'd6aebfed1769128379aca7d215f0b689';

export function getSandshrewProvider(network: Network): Provider {
  return new Provider({
    version: 'v2',
    network: NetworkMap[network],
    networkType: network === 'oylnet' ? 'regtest' : network,
    url: SandshrewUrlMap[network],
    projectId: network === 'oylnet' || network === 'regtest' ? 'regtest' : SANDSHREW_PROJECT_ID,
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


