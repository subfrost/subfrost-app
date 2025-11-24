import type { NetworkType } from '@alkanes/ts-sdk';
import { AlkanesProvider, createProvider as createAlkanesProviderFromSdk } from '@alkanes/ts-sdk';
import { SANDSHREW_PROJECT_ID } from '@/constants';
import type { OylConnectProviderAPI } from '@/types'; // Assuming this is still needed, adjust if not
import { NetworkMap, SandshrewUrlMap } from '@/utils/constants';
import { getConfig } from '@/utils/getConfig';

export async function getSandshrewProvider(network: NetworkType): Promise<AlkanesProvider> {
  const url = SandshrewUrlMap[network] ?? SandshrewUrlMap.mainnet!;
  const mappedNetwork = NetworkMap[network] ?? NetworkMap.mainnet!;
  const networkType = network; // Use NetworkType directly

  // Assuming createAlkanesProviderFromSdk can handle network and url directly
  // And it returns an AlkanesProvider
  const provider = createAlkanesProviderFromSdk({
    network: mappedNetwork,
    networkType,
    url,
    projectId: (network === 'regtest' ? 'regtest' : SANDSHREW_PROJECT_ID),
  });
  return provider;
}

export function getApiProvider(network: NetworkType): AlkanesProvider {
  const host = getConfig(network).OYL_API_URL; // Assuming getConfig still works with NetworkType

  // Assuming AlkanesProvider can be initialized with similar config
  const mappedNetwork = NetworkMap[network] ?? NetworkMap.mainnet!;
  const networkType = network; // Use NetworkType directly

  return createAlkanesProviderFromSdk({
    network: mappedNetwork,
    networkType,
    url: host, // Using host as url for API provider
    projectId: (network === 'regtest' ? 'regtest' : SANDSHREW_PROJECT_ID),
  });
}

export const getOylConnectProvider = (): OylConnectProviderAPI | null => {
  if (typeof window === 'undefined' || !window.oyl) {
    return null;
  }

  return window.oyl;
};


