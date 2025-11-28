/**
 * Alkanes Provider utility
 * Uses @alkanes/ts-sdk to connect to Subfrost backend infrastructure
 */

import type { Network } from '@/utils/constants';

// Backend URL mapping for different networks
const SubfrostUrlMap: Record<Network, { rpc: string; api: string }> = {
  mainnet: {
    rpc: 'https://mainnet.subfrost.io/v4/jsonrpc',
    api: 'https://mainnet.subfrost.io/v4/api',
  },
  testnet: {
    rpc: 'https://testnet.subfrost.io/v4/jsonrpc',
    api: 'https://testnet.subfrost.io/v4/api',
  },
  signet: {
    rpc: 'https://signet.subfrost.io/v4/jsonrpc',
    api: 'https://signet.subfrost.io/v4/api',
  },
  oylnet: {
    rpc: 'http://localhost:18888',
    api: 'http://localhost:50010',
  },
  regtest: {
    rpc: 'http://localhost:18888',
    api: 'http://localhost:50010',
  },
};

/**
 * Get Alkanes provider configured for the specified network
 */
export async function getAlkanesProvider(network: Network, customUrls?: { rpc?: string; api?: string }) {
  const { AlkanesProvider } = await import('@alkanes/ts-sdk');
  const { NetworkMap } = await import('@/utils/constants');
  
  const defaultUrls = SubfrostUrlMap[network] || SubfrostUrlMap.mainnet;
  const urls = {
    rpc: customUrls?.rpc || defaultUrls.rpc,
    api: customUrls?.api || defaultUrls.api,
  };
  const bitcoinNetwork = NetworkMap[network] || NetworkMap.mainnet;
  const networkType = network === 'oylnet' ? 'regtest' : network;
  
  return new AlkanesProvider({
    url: urls.rpc,
    dataApiUrl: urls.api,
    network: bitcoinNetwork!,
    networkType: networkType as string,
  });
}

/**
 * Get the backend URLs for a given network
 */
export function getNetworkUrls(network: Network) {
  return SubfrostUrlMap[network] || SubfrostUrlMap.mainnet;
}
