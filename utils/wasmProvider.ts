/**
 * WASM Provider utilities for direct alkanes method calls
 * Uses the WebProvider from alkanes-web-sys for optimized browser operations
 */

import type { Network } from '@/utils/constants';
import { getNetworkUrls } from '@/utils/alkanesProvider';

/**
 * Get a WebProvider instance for direct WASM calls
 * This bypasses the ts-sdk wrapper and uses WASM methods directly
 */
export async function getWebProvider(network: Network) {
  const { WebProvider } = await import('@/ts-sdk/build/wasm/alkanes_web_sys');
  const urls = getNetworkUrls(network);
  
  return new WebProvider(urls.rpc, null);
}

/**
 * Simulate an alkanes contract call
 * 
 * The alkanesSimulate method actually expects a MessageContextParcel as JSON,
 * but for simple read-only calls, we can construct a minimal context.
 * 
 * @param network - Network to use
 * @param contractId - Alkane ID in "block:tx" format
 * @param calldata - Hex-encoded calldata (opcode + args, with 0x prefix)
 * @param blockTag - Optional block tag (default: "latest")
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
    height: 1000000, // High enough for latest
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
    trace: null
  };
  
  return await provider.alkanesSimulate(contractId, JSON.stringify(context), blockTag);
}

/**
 * Get enriched balances for an address
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
