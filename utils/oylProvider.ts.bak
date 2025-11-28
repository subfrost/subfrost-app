import { OylApiClient } from '@/lib/api-provider';
// All heavy SDK imports are now dynamic to avoid blocking initial page load

import { SANDSHREW_PROJECT_ID } from '@/constants';
import type { OylConnectProviderAPI } from '@/types';
import { NetworkMap, SandshrewUrlMap, type Network } from '@/utils/constants';
import { getConfig } from '@/utils/getConfig';

export async function getSandshrewProvider(network: Network): Promise<any> {
  const baseUrl = SandshrewUrlMap[network] ?? SandshrewUrlMap.mainnet!;

  try {
    // Lazy import to avoid loading @alkanes/ts-sdk on initial page load
    const { createAlkanesProvider } = await import('@/lib/oyl/alkanes/wallet-integration');
    const alkanesProvider = await createAlkanesProvider(network, baseUrl);
    return alkanesProvider;
  } catch (error) {
    console.error('Failed to create Alkanes provider, falling back to default:', error);
    // Lazy import ts-sdk Provider from sub-module to avoid WASM dependency
    const { AlkanesProvider } = await import('@alkanes/ts-sdk');
    const mappedNetwork = NetworkMap[network] ?? NetworkMap.mainnet!;
    const networkType = ((network as any) === 'oylnet' ? 'regtest' : (network as any)) as
      | 'mainnet'
      | 'testnet'
      | 'regtest'
      | 'signet';
    return new AlkanesProvider({
      version: '',
      network: mappedNetwork,
      networkType,
      url: baseUrl,
      projectId: '',
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


