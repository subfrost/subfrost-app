/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 *
 * WASM Provider utilities for direct alkanes method calls.
 * These functions create new WebProvider instances on each call.
 * For React components, prefer using the provider from context.
 */

import type { Network } from '@/utils/constants';

// Network URL mapping (duplicated from context to avoid circular deps)
const NETWORK_URLS: Record<Network, string> = {
  mainnet: 'mainnet',
  testnet: 'testnet',
  signet: 'signet',
  regtest: 'regtest',
  oylnet: 'regtest',
  'subfrost-regtest': 'subfrost-regtest',
};

// Subfrost uses /v4/subfrost endpoint for both jsonrpc and data_api_url
const NETWORK_CONFIG: Record<Network, Record<string, string>> = {
  mainnet: {
    jsonrpc_url: 'https://mainnet.subfrost.io/v4/subfrost',
    data_api_url: 'https://mainnet.subfrost.io/v4/subfrost',
  },
  testnet: {
    jsonrpc_url: 'https://testnet.subfrost.io/v4/subfrost',
    data_api_url: 'https://testnet.subfrost.io/v4/subfrost',
  },
  signet: {
    jsonrpc_url: 'https://signet.subfrost.io/v4/subfrost',
    data_api_url: 'https://signet.subfrost.io/v4/subfrost',
  },
  regtest: {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
  oylnet: {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
  'subfrost-regtest': {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  },
};

/**
 * Get a WebProvider instance for direct WASM calls
 * @deprecated Use useAlkanesSDK hook instead
 */
export async function getWebProvider(network: Network) {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  const providerName = NETWORK_URLS[network] || 'mainnet';
  const configOverrides = NETWORK_CONFIG[network];
  return new wasm.WebProvider(providerName, configOverrides);
}

/**
 * Simulate an alkanes contract call
 * @deprecated Use provider.alkanesSimulate from useAlkanesSDK instead
 */
export async function simulateAlkaneCall(
  network: Network,
  contractId: string,
  calldata: string,
  blockTag: string = 'latest'
): Promise<any> {
  const provider = await getWebProvider(network);

  // Create minimal MessageContextParcel for simulation
  const context = {
    calldata,
    height: 1000000,
    txindex: 0,
    pointer: 0,
    refund_pointer: 0,
    vout: 0,
    transaction: '0x',
    block: '0x',
    atomic: null,
    runes: [],
    sheets: {},
    runtime_balances: {},
    trace: null,
  };

  return await provider.alkanesSimulate(contractId, JSON.stringify(context), blockTag);
}

/**
 * Get enriched balances for an address
 * @deprecated Use provider.getEnrichedBalances from useAlkanesSDK instead
 */
export async function getEnrichedBalances(
  network: Network,
  address: string,
  protocolTag: string = '1'
): Promise<any> {
  const provider = await getWebProvider(network);
  return await provider.getEnrichedBalances(address, protocolTag);
}

/**
 * Get all pools with details from a factory
 * @deprecated Use provider.alkanesGetAllPoolsWithDetails from useAlkanesSDK instead
 */
export async function getAllPoolsWithDetails(
  network: Network,
  factoryId: string,
  chunkSize: number = 30,
  maxConcurrent: number = 10
): Promise<any> {
  const provider = await getWebProvider(network);
  return await provider.alkanesGetAllPoolsWithDetails(factoryId, chunkSize, maxConcurrent);
}
