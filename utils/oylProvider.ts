import { OylApiClient } from '@/lib/api-provider';
import type { Network } from '@oyl/sdk';
import { Provider } from '@oyl/sdk';
import { createAlkanesProvider } from '@/lib/oyl/alkanes/wallet-integration';

import { SANDSHREW_PROJECT_ID } from '@/constants';
import type { OylConnectProviderAPI } from '@/types';
import { NetworkMap, SandshrewUrlMap } from '@/utils/constants';
import { getConfig } from '@/utils/getConfig';

export async function getSandshrewProvider(network: Network): Promise<any> {
  const isClient = typeof window !== 'undefined';
  const baseUrl = isClient 
    ? `${window.location.origin}/api/sandshrew?network=${network}`
    : SandshrewUrlMap[network] ?? SandshrewUrlMap.mainnet!;
  
  try {
    const alkanesProvider = await createAlkanesProvider(network, baseUrl);
    return alkanesProvider;
  } catch (error) {
    console.error('Failed to create Alkanes provider, falling back to default:', error);
    const mappedNetwork = NetworkMap[network] ?? NetworkMap.mainnet!;
    const networkType = ((network as any) === 'oylnet' ? 'regtest' : (network as any)) as
      | 'mainnet'
      | 'testnet'
      | 'regtest'
      | 'signet';
    return new Provider({
      version: isClient ? '' : 'v2',
      network: mappedNetwork,
      networkType,
      url: baseUrl,
      projectId: isClient ? '' : ((network as any) === 'oylnet' ? 'regtest' : SANDSHREW_PROJECT_ID),
    });
  }
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


