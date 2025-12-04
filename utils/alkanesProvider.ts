/**
 * Alkanes Provider utility
 * Uses @alkanes/ts-sdk to connect to Subfrost backend infrastructure
 */

import type { Network } from '@/utils/constants';

// Map subfrost-app Network type to ts-sdk network preset names
const NETWORK_TO_PRESET: Record<Network, string> = {
  mainnet: 'mainnet',
  testnet: 'testnet',
  signet: 'signet',
  oylnet: 'local',              // Local development uses local preset (localhost:18888)
  regtest: 'local',             // Local Regtest uses local preset (localhost:18888)
  'subfrost-regtest': 'subfrost-regtest', // Hosted at regtest.subfrost.io
};

// Backend URL mapping for different networks (for reference/custom overrides)
export const SubfrostUrlMap: Record<Network, { rpc: string; api: string }> = {
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
    rpc: 'http://localhost:18888',  // Local alkanes-rs
    api: 'http://localhost:18888',  // Local alkanes-rs
  },
  'subfrost-regtest': {
    rpc: 'https://regtest.subfrost.io/v4/subfrost',
    api: 'https://regtest.subfrost.io/v4/subfrost',
  },
};

// Special network for Subfrost Regtest (hosted at regtest.subfrost.io)
export const SUBFROST_REGTEST_URLS = {
  rpc: 'https://regtest.subfrost.io/v4/subfrost',
  api: 'https://regtest.subfrost.io/v4/subfrost',
};

// Provider instance cache
let cachedProvider: any = null;
let cachedNetwork: string | null = null;

/**
 * Get Alkanes provider configured for the specified network
 *
 * Network options:
 * - 'mainnet', 'testnet', 'signet' - Standard Bitcoin networks via Subfrost
 * - 'regtest' - Local regtest (localhost:18888)
 * - 'oylnet' - Local development (localhost:18888)
 * - Custom URL can be passed via customUrls parameter
 *
 * For Subfrost Regtest (regtest.subfrost.io), pass customUrls with SUBFROST_REGTEST_URLS
 */
export async function getAlkanesProvider(network: Network, customUrls?: { rpc?: string; api?: string }) {
  const { AlkanesProvider } = await import('@alkanes/ts-sdk');
  const { NetworkMap } = await import('@/utils/constants');

  // Determine if we need custom URLs
  const hasCustomUrls = customUrls?.rpc || customUrls?.api;

  // Get preset name or use custom
  const presetName = NETWORK_TO_PRESET[network] || 'mainnet';

  // Build provider config
  const config: any = {
    network: presetName,
    bitcoinNetwork: NetworkMap[network] || NetworkMap.mainnet,
  };

  // Apply custom URLs if provided
  if (hasCustomUrls) {
    config.rpcUrl = customUrls?.rpc;
    config.dataApiUrl = customUrls?.api || customUrls?.rpc;
  }

  // Check cache (skip cache if custom URLs)
  const cacheKey = hasCustomUrls ? null : `${network}`;
  if (!hasCustomUrls && cachedProvider && cachedNetwork === cacheKey) {
    return cachedProvider;
  }

  // Create provider
  const provider = new AlkanesProvider(config);
  await provider.initialize();

  // Cache if not using custom URLs
  if (!hasCustomUrls) {
    cachedProvider = provider;
    cachedNetwork = cacheKey;
  }

  return provider;
}

/**
 * Get Alkanes provider for Subfrost Regtest (regtest.subfrost.io)
 * This is the hosted regtest environment for testing
 */
export async function getSubfrostRegtestProvider() {
  return getAlkanesProvider('regtest', SUBFROST_REGTEST_URLS);
}

/**
 * Get the backend URLs for a given network
 */
export function getNetworkUrls(network: Network) {
  return SubfrostUrlMap[network] || SubfrostUrlMap.mainnet;
}

/**
 * Clear the provider cache (useful when switching networks)
 */
export function clearProviderCache() {
  cachedProvider = null;
  cachedNetwork = null;
}
