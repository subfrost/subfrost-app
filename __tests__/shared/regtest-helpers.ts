/**
 * Regtest helper utilities for integration tests.
 *
 * Provides balance checking, block mining, pool queries, and provider setup.
 * Used by both Tier 1 (terminal) and Tier 2 (puppeteer) tests.
 */

import { REGTEST } from './regtest-constants';
import {
  createTestSigner,
  TEST_MNEMONIC,
  type TestSignerResult,
} from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// ---------------------------------------------------------------------------
// Provider setup
// ---------------------------------------------------------------------------

/**
 * Create a WebProvider configured for regtest with the test mnemonic loaded.
 */
export async function createRegtestProvider(): Promise<WebProvider> {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  const provider = new wasm.WebProvider(REGTEST.PROVIDER_NETWORK, {
    jsonrpc_url: REGTEST.RPC_URL,
    data_api_url: REGTEST.DATA_API_URL,
  });

  // Load wallet into WASM provider for UTXO selection
  provider.walletLoadMnemonic(TEST_MNEMONIC, null);

  return provider;
}

/**
 * Create provider + signer bundle for tests.
 */
export async function createRegtestTestContext(): Promise<{
  provider: WebProvider;
  signer: TestSignerResult;
  taprootAddress: string;
  segwitAddress: string;
}> {
  const provider = await createRegtestProvider();
  const signer = await createTestSigner(TEST_MNEMONIC, 'subfrost-regtest');

  return {
    provider,
    signer,
    taprootAddress: signer.addresses.taproot.address,
    segwitAddress: signer.addresses.nativeSegwit.address,
  };
}

// ---------------------------------------------------------------------------
// Mining
// ---------------------------------------------------------------------------

/**
 * Mine blocks to an address. Uses bitcoindGenerateToAddress RPC.
 */
export async function mineBlocks(
  provider: WebProvider,
  count: number,
  address: string
): Promise<void> {
  console.log(`[regtest] Mining ${count} blocks to ${address.slice(0, 20)}...`);
  await provider.bitcoindGenerateToAddress(count, address);
  // Wait briefly for indexer to catch up
  await sleep(2000);
}

// ---------------------------------------------------------------------------
// Balance queries
// ---------------------------------------------------------------------------

/**
 * Get BTC balance for an address (sum of confirmed UTXOs in sats).
 *
 * NOTE: The SDK's getEnrichedBalances returns nested Map objects (not plain objects).
 * Each level must be accessed via .get() for Maps.
 */
export async function getBtcBalance(
  provider: WebProvider,
  address: string
): Promise<bigint> {
  try {
    const enriched = await provider.getEnrichedBalances(address, '1');
    if (!enriched) return 0n;

    // Handle Map response (SDK returns Maps, not plain objects)
    const returns = mapGet(enriched, 'returns') || enriched;
    const spendable = mapGet(returns, 'spendable') || [];
    const assets = mapGet(returns, 'assets') || [];

    const allUtxos = [
      ...(Array.isArray(spendable) ? spendable : []),
      ...(Array.isArray(assets) ? assets : []),
    ];

    let total = 0n;
    for (const utxo of allUtxos) {
      const value = mapGet(utxo, 'value') || 0;
      total += BigInt(value);
    }
    return total;
  } catch (error) {
    console.error(`[regtest] Error getting BTC balance for ${address}:`, error);
    return 0n;
  }
}

/**
 * Get alkane token balance for an address.
 *
 * Uses alkanes_protorunesbyaddress RPC which returns all alkane holdings.
 * Falls back to per-UTXO checking if the batch method returns empty.
 *
 * NOTE: On some regtest versions, protorunesbyaddress returns 0x.
 * In that case we check only "asset" UTXOs (not all spendable UTXOs,
 * which would be too slow with rate limiting).
 */
export async function getAlkaneBalance(
  provider: WebProvider,
  address: string,
  alkaneId: string
): Promise<bigint> {
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);

  try {
    // Method 1: Try batch query via alkanes_protorunesbyaddress
    const batchResult = await rpcCall('alkanes_protorunesbyaddress', [
      { address, protocolTag: '1' },
    ]);

    if (batchResult?.result?.outpoints) {
      let total = 0n;
      for (const outpointData of batchResult.result.outpoints) {
        // Response format: balance_sheet.cached.balances[{ amount, block, tx }]
        const balances =
          outpointData.balance_sheet?.cached?.balances ||
          outpointData.runes ||
          outpointData.balances ||
          [];
        for (const entry of balances) {
          const block = parseInt(entry.block ?? 0, 10);
          const tx = parseInt(entry.tx ?? 0, 10);
          if (block === targetBlock && tx === targetTx) {
            total += BigInt(entry.amount || entry.value || '0');
          }
        }
      }
      if (total > 0n) return total;
    }

    // Method 2: Check only asset UTXOs (enriched balance categorizes alkane-holding UTXOs as assets)
    const enriched = await provider.getEnrichedBalances(address, '1');
    if (!enriched) return 0n;

    const returns = mapGet(enriched, 'returns') || enriched;
    const assets = mapGet(returns, 'assets') || [];
    const assetUtxos = Array.isArray(assets) ? assets : [];

    let total = 0n;
    for (const utxo of assetUtxos) {
      const outpoint = mapGet(utxo, 'outpoint');
      if (!outpoint || typeof outpoint !== 'string') continue;

      // Check inline runes data first (enriched balance may include it)
      const runes = mapGet(utxo, 'runes');
      if (Array.isArray(runes)) {
        for (const rune of runes) {
          const alkane = mapGet(rune, 'alkane_id') || mapGet(rune, 'id') || rune;
          const block = parseInt(mapGet(alkane, 'block') ?? 0, 10);
          const tx = parseInt(mapGet(alkane, 'tx') ?? 0, 10);
          if (block === targetBlock && tx === targetTx) {
            total += BigInt(mapGet(rune, 'value') || '0');
          }
        }
        continue;
      }

      // Fallback: query this specific UTXO
      const [txid, voutStr] = outpoint.split(':');
      const vout = parseInt(voutStr, 10);
      if (!txid) continue;

      try {
        const rpcResult = await rpcCall('alkanes_protorunesbyoutpoint', [
          { txid, vout },
        ]);
        if (!rpcResult?.result?.outpoint?.balances) continue;

        for (const balance of rpcResult.result.outpoint.balances) {
          const alkane = balance.alkane_id || balance.id;
          if (!alkane) continue;
          const block = parseInt(alkane.block ?? alkane[0], 10);
          const tx = parseInt(alkane.tx ?? alkane[1], 10);
          if (block === targetBlock && tx === targetTx) {
            total += BigInt(balance.value || '0');
          }
        }
      } catch {
        // skip
      }
    }
    return total;
  } catch (error) {
    console.error(`[regtest] Error getting alkane balance for ${address}:`, error);
    return 0n;
  }
}

/**
 * Get total alkane balance across multiple addresses.
 * Useful because the SDK may place alkane change on either segwit or taproot.
 */
export async function getAlkaneBalanceMulti(
  provider: WebProvider,
  addresses: string[],
  alkaneId: string
): Promise<bigint> {
  let total = 0n;
  for (const addr of addresses) {
    total += await getAlkaneBalance(provider, addr, alkaneId);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Pool queries
// ---------------------------------------------------------------------------

/**
 * Get pool reserves via RPC simulation (opcode 97).
 */
export async function getPoolReserves(
  poolId: string
): Promise<{ reserve0: bigint; reserve1: bigint }> {
  const result = await rpcCall('alkanes_simulate', [
    {
      target: poolId,
      inputs: ['97'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '50000',
      txindex: 0,
      vout: 0,
    },
  ]);

  if (result?.result?.execution?.error) {
    throw new Error(`Pool reserves query failed: ${result.result.execution.error}`);
  }

  const data = result?.result?.execution?.data;
  if (!data || data === '0x') {
    return { reserve0: 0n, reserve1: 0n };
  }

  // Data is two u128 values (32 hex chars each, little-endian)
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  const reserve0 = parseLittleEndianU128(hex.slice(0, 32));
  const reserve1 = parseLittleEndianU128(hex.slice(32, 64));

  return { reserve0, reserve1 };
}

/**
 * Get number of pools from factory via opcode 4.
 */
export async function getNumPools(): Promise<number> {
  const result = await rpcCall('alkanes_simulate', [
    {
      target: REGTEST.FACTORY_ID,
      inputs: ['4'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '50000',
      txindex: 0,
      vout: 0,
    },
  ]);

  if (result?.result?.execution?.error) {
    throw new Error(`GetNumPools failed: ${result.result.execution.error}`);
  }

  const data = result?.result?.execution?.data;
  if (!data || data === '0x') return 0;

  const hex = data.startsWith('0x') ? data.slice(2) : data;
  return Number(parseLittleEndianU128(hex.slice(0, 32)));
}

/**
 * Simulate a swap quote via factory opcode 13.
 * Returns the expected output amount.
 */
export async function simulateSwapQuote(
  sellTokenId: string,
  buyTokenId: string,
  amountIn: string
): Promise<bigint> {
  const [sellBlock, sellTx] = sellTokenId.split(':');
  const [buyBlock, buyTx] = buyTokenId.split(':');

  const result = await rpcCall('alkanes_simulate', [
    {
      target: REGTEST.FACTORY_ID,
      inputs: [
        '13', '2',
        sellBlock, sellTx,
        buyBlock, buyTx,
        amountIn, '0', '999999',
      ],
      alkanes: [
        { id: { block: sellBlock, tx: sellTx }, value: amountIn },
      ],
      transaction: '0x',
      block: '0x',
      height: '50000',
      txindex: 0,
      vout: 0,
    },
  ]);

  if (result?.result?.execution?.error) {
    throw new Error(`Swap simulation failed: ${result.result.execution.error}`);
  }

  // The swap returns alkanes in the execution result
  const alkanes = result?.result?.execution?.alkanes;
  if (alkanes && alkanes.length > 0) {
    return BigInt(alkanes[0].value || '0');
  }

  return 0n;
}

/**
 * Get the current metashrew indexer height.
 */
export async function getIndexerHeight(): Promise<number> {
  const result = await rpcCall('metashrew_height', []);
  return Number(result?.result || 0);
}

/**
 * Wait for the indexer to reach a target height.
 */
export async function waitForIndexer(
  targetHeight: number,
  timeoutMs: number = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const height = await getIndexerHeight();
    if (height >= targetHeight) return;
    await sleep(1000);
  }
  throw new Error(`Indexer did not reach height ${targetHeight} within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// RPC helper
// ---------------------------------------------------------------------------

let rpcId = 1;

export async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(REGTEST.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: rpcId++,
    }),
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Get a value from either a Map or plain object.
 * The SDK returns nested Maps from Rust's HashMap serialization.
 */
function mapGet(obj: any, key: string): any {
  if (!obj) return undefined;
  if (obj instanceof Map) return obj.get(key);
  return obj[key];
}

function parseLittleEndianU128(hex: string): bigint {
  // hex is 32 chars (16 bytes), little-endian
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  // Reverse for big-endian interpretation
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
