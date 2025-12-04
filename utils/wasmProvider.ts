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

/**
 * Get a WebProvider instance for direct WASM calls
 * @deprecated Use useAlkanesSDK hook instead
 */
export async function getWebProvider(network: Network) {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  const providerName = NETWORK_URLS[network] || 'mainnet';
  return new wasm.WebProvider(providerName, undefined);
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
