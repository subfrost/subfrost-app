/**
 * Alkanes Provider utility
 * Uses @alkanes/ts-sdk to connect to Subfrost backend infrastructure
 */

import type { Network } from '@/utils/constants';

// Backend URL mapping for different networks
// ALL networks use /v4/subfrost as the unified RPC endpoint (Sandshrew/Metashrew/Esplora combined)
const SubfrostUrlMap: Record<Network, { rpc: string; api: string }> = {
  mainnet: {
    rpc: 'https://mainnet.subfrost.io/v4/subfrost',
    api: 'https://mainnet.subfrost.io/v4/subfrost',
  },
  testnet: {
    rpc: 'https://testnet.subfrost.io/v4/subfrost',
    api: 'https://testnet.subfrost.io/v4/subfrost',
  },
  signet: {
    rpc: 'https://signet.subfrost.io/v4/subfrost',
    api: 'https://signet.subfrost.io/v4/subfrost',
  },
  oylnet: {
    rpc: 'http://localhost:18888',
    api: 'http://localhost:18888',
  },
  regtest: {
    rpc: 'https://regtest.subfrost.io/v4/subfrost',
    api: 'https://regtest.subfrost.io/v4/subfrost',
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
