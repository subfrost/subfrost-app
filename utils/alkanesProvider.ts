/**
 * Alkanes Provider utility
 * Uses @alkanes/ts-sdk to connect to Subfrost backend infrastructure
 */

import type { Network } from '@/utils/constants';

// Get URLs from environment or use defaults
// For regtest, prefer local Docker URLs from .env.local
const getRegtestUrls = () => {
  const rpc = process.env.NEXT_PUBLIC_OYL_API_URL || 'http://localhost:18888';
  const api = process.env.NEXT_PUBLIC_DATA_API_URL || 'http://localhost:4000';
  const esplora = process.env.NEXT_PUBLIC_ESPLORA_URL || 'http://localhost:50010';
  return { rpc, api, esplora };
};

// Backend URL mapping for different networks
// ALL networks use /v4/subfrost as the unified RPC endpoint (Sandshrew/Metashrew/Esplora combined)
// For production networks, esplora is proxied through the same endpoint
const SubfrostUrlMap: Record<Network, { rpc: string; api: string; esplora: string }> = {
  mainnet: {
    rpc: 'https://mainnet.subfrost.io/v4/subfrost',
    api: 'https://mainnet.subfrost.io/v4/subfrost',
    esplora: 'https://mainnet.subfrost.io/v4/subfrost',
  },
  testnet: {
    rpc: 'https://testnet.subfrost.io/v4/subfrost',
    api: 'https://testnet.subfrost.io/v4/subfrost',
    esplora: 'https://testnet.subfrost.io/v4/subfrost',
  },
  signet: {
    rpc: 'https://signet.subfrost.io/v4/subfrost',
    api: 'https://signet.subfrost.io/v4/subfrost',
    esplora: 'https://signet.subfrost.io/v4/subfrost',
  },
  oylnet: {
    rpc: 'http://localhost:18888',
    api: 'http://localhost:18888',
    esplora: 'http://localhost:50010',
  },
  regtest: getRegtestUrls(),
};

/**
 * Get Alkanes provider configured for the specified network
 */
export async function getAlkanesProvider(network: Network, customUrls?: { rpc?: string; api?: string }) {
  const { createProvider } = await import('@alkanes/ts-sdk');
  const { NetworkMap } = await import('@/utils/constants');

  const defaultUrls = SubfrostUrlMap[network] || SubfrostUrlMap.mainnet;
  const urls = {
    rpc: customUrls?.rpc || defaultUrls.rpc,
    api: customUrls?.api || defaultUrls.api,
  };
  const bitcoinNetwork = NetworkMap[network] || NetworkMap.mainnet;
  const networkType = network;

  return createProvider({
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
