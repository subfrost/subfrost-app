/**
 * Alkanes Client - Unified interface for all blockchain RPC interactions
 *
 * This module provides a single entry point for all alkanes/metashrew/esplora calls,
 * using @alkanes/ts-sdk as the underlying driver.
 */

import { AlkanesProvider } from '@alkanes/ts-sdk';

// ============================================================================
// Types
// ============================================================================

// SDK types - defined locally to avoid version mismatch issues
interface AlkaneId {
  block: string | number;
  tx: string | number;
}

interface AlkaneBalanceResponse {
  id: AlkaneId | string;
  amount: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export interface TokenBalance {
  runeId: string;
  symbol: string;
  name: string;
  balance: bigint;
  balanceFormatted: number;
  decimals: number;
}

export interface WalletBalances {
  btcBalance: number;
  btcBalanceFormatted: string;
  tokens: TokenBalance[];
  address: string;
  timestamp: number;
}

export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
}

export interface PoolDataPoint {
  height: number;
  timestamp?: number;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  price?: number;
}

export interface PoolConfig {
  id: string;
  key: string;
  name: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  protobufPayload: string;
  alkaneId: AlkaneId;
}

// ============================================================================
// Network Configuration
// ============================================================================

type NetworkType = 'mainnet' | 'testnet' | 'regtest';

interface NetworkConfig {
  network: string;
  networkType: NetworkType;
  url: string;
  dataApiUrl: string;
}

/**
 * Get network configuration for a given network name
 * @param networkName - Network name (e.g., 'mainnet', 'regtest', 'subfrost-regtest')
 *                      If not provided, uses NEXT_PUBLIC_NETWORK env var
 */
export function getNetworkConfig(networkName?: string): NetworkConfig {
  const network = networkName || (process.env.NEXT_PUBLIC_NETWORK || 'subfrost-regtest') as string;

  // Map to SDK network preset names and URLs
  switch (network) {
    case 'mainnet':
      return {
        network: 'mainnet',
        networkType: 'mainnet',
        url: process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost',
        dataApiUrl: process.env.ALKANES_DATA_API_URL || 'https://mainnet.subfrost.io/v4/subfrost',
      };
    case 'testnet':
      return {
        network: 'testnet',
        networkType: 'testnet',
        url: process.env.ALKANES_RPC_URL || 'https://testnet.subfrost.io/v4/subfrost',
        dataApiUrl: process.env.ALKANES_DATA_API_URL || 'https://testnet.subfrost.io/v4/subfrost',
      };
    case 'signet':
      return {
        network: 'signet',
        networkType: 'testnet',
        url: process.env.ALKANES_RPC_URL || 'https://signet.subfrost.io/v4/subfrost',
        dataApiUrl: process.env.ALKANES_DATA_API_URL || 'https://signet.subfrost.io/v4/subfrost',
      };
    case 'subfrost-regtest':
      // subfrost-regtest is a development network that uses mainnet RPC for pool data
      return {
        network: 'subfrost-regtest',
        networkType: 'regtest',
        url: process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost',
        dataApiUrl: process.env.ALKANES_DATA_API_URL || 'https://mainnet.subfrost.io/v4/subfrost',
      };
    case 'regtest':
    case 'oylnet':
    default:
      return {
        network: 'regtest',
        networkType: 'regtest',
        url: process.env.ALKANES_RPC_URL || 'https://regtest.subfrost.io/v4/subfrost',
        dataApiUrl: process.env.ALKANES_DATA_API_URL || 'https://regtest.subfrost.io/v4/subfrost',
      };
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Known token metadata - fallback values for common tokens.
 * NOTE: 2:0 is ALWAYS DIESEL on all networks. bUSD is 2:56801 on mainnet.
 */
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  // DIESEL is always 2:0 on all networks
  '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
  '32:0': { symbol: 'frBTC', name: 'Fractional BTC', decimals: 8 },
  '2:56801': { symbol: 'bUSD', name: 'Bitcoin USD', decimals: 8 },
  '2:68441': { symbol: 'DIESEL/bUSD LP', name: 'DIESEL/bUSD LP Token', decimals: 8 },
  '2:77087': { symbol: 'DIESEL/frBTC LP', name: 'DIESEL/frBTC LP Token', decimals: 8 },
  // Note: frBTC is always 32:0 on all networks
};

/**
 * Encode a number as a protobuf varint (little-endian variable-length integer)
 */
function encodeVarint(n: number): string {
  const bytes: number[] = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate protobuf payload for a pool ID
 * Format: 0x2096ce382a0602{varint_tx}e7073001
 * Note: Currently all mainnet pools use block 2, so block is encoded as 02 in the payload
 */
function generatePoolPayload(_block: number, tx: number): string {
  const txVarint = encodeVarint(tx);
  return `0x2096ce382a0602${txVarint}e7073001`;
}

/** Pool configurations - mainnet */
export const MAINNET_POOLS: Record<string, PoolConfig> = {
  DIESEL_FRBTC: {
    id: '2:77087',
    key: 'DIESEL_FRBTC',
    name: 'DIESEL/frBTC',
    token0Symbol: 'DIESEL',
    token1Symbol: 'frBTC',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 77087),
    alkaneId: { block: 2, tx: 77087 },
  },
  DIESEL_BUSD: {
    id: '2:68441',
    key: 'DIESEL_BUSD',
    name: 'DIESEL/bUSD',
    token0Symbol: 'DIESEL',
    token1Symbol: 'bUSD',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 68441),
    alkaneId: { block: 2, tx: 68441 },
  },
  BUSD_FRBTC: {
    id: '2:77222',
    key: 'BUSD_FRBTC',
    name: 'bUSD/frBTC',
    token0Symbol: 'bUSD',
    token1Symbol: 'frBTC',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 77222),
    alkaneId: { block: 2, tx: 77222 },
  },
  METHANE_FRBTC: {
    id: '2:77221',
    key: 'METHANE_FRBTC',
    name: 'METHANE/frBTC',
    token0Symbol: 'METHANE',
    token1Symbol: 'frBTC',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 77221),
    alkaneId: { block: 2, tx: 77221 },
  },
  GOLDDUST_FRBTC: {
    id: '2:77228',
    key: 'GOLDDUST_FRBTC',
    name: 'GOLD DUST/frBTC',
    token0Symbol: 'GOLD DUST',
    token1Symbol: 'frBTC',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 77228),
    alkaneId: { block: 2, tx: 77228 },
  },
  ALKAMIST_FRBTC: {
    id: '2:77237',
    key: 'ALKAMIST_FRBTC',
    name: 'ALKAMIST/frBTC',
    token0Symbol: 'ALKAMIST',
    token1Symbol: 'frBTC',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 77237),
    alkaneId: { block: 2, tx: 77237 },
  },
  METHANE_BUSD: {
    id: '2:68433',
    key: 'METHANE_BUSD',
    name: 'METHANE/bUSD',
    token0Symbol: 'METHANE',
    token1Symbol: 'bUSD',
    token0Decimals: 8,
    token1Decimals: 8,
    protobufPayload: generatePoolPayload(2, 68433),
    alkaneId: { block: 2, tx: 68433 },
  },
};

/** Pool configurations - regtest (extend as needed) */
export const REGTEST_POOLS: Record<string, PoolConfig> = {
  // Add regtest pool configs here when available
};

/** Get pools for specified network (or current network if not specified) */
export function getPools(networkName?: string): Record<string, PoolConfig> {
  const { network } = getNetworkConfig(networkName);
  // Use mainnet pools for mainnet and subfrost-regtest (which queries mainnet data)
  // Only use regtest pools for actual regtest networks with their own pools
  if (network === 'mainnet' || network === 'subfrost-regtest') {
    return MAINNET_POOLS;
  }
  return REGTEST_POOLS;
}

/** DIESEL token configuration */
export const DIESEL_TOKEN = {
  alkaneId: { block: 2, tx: 0 },
  decimals: 8,
  totalSupplyPayload: '0x20e3ce382a030200653001',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse a little-endian u128 from a hex string
 */
export function parseU128LE(hexStr: string): bigint {
  if (!hexStr || hexStr.length === 0) return BigInt(0);

  const padded = hexStr.length % 2 === 0 ? hexStr : '0' + hexStr;

  let reversed = '';
  for (let i = padded.length - 2; i >= 0; i -= 2) {
    reversed += padded.slice(i, i + 2);
  }

  return BigInt('0x' + (reversed || '0'));
}

/**
 * Parse a little-endian u128 from a hex string at a specific byte offset
 */
export function parseU128LEAtOffset(hexStr: string, byteOffset: number): bigint {
  const hexOffset = byteOffset * 2;
  const slice = hexStr.slice(hexOffset, hexOffset + 32);
  return parseU128LE(slice);
}

/**
 * Calculate price from pool reserves
 */
export function calculatePrice(
  reserve0: bigint,
  reserve1: bigint,
  decimals0: number = 8,
  decimals1: number = 8
): number {
  if (reserve0 === BigInt(0)) return 0;

  const r0 = Number(reserve0) / Math.pow(10, decimals0);
  const r1 = Number(reserve1) / Math.pow(10, decimals1);

  return r1 / r0;
}

/**
 * Format alkane ID to string
 */
export function formatAlkaneId(id: AlkaneId | string): string {
  if (typeof id === 'string') return id;
  return `${id.block}:${id.tx}`;
}

// ============================================================================
// Alkanes Client Class
// ============================================================================

class AlkanesClient {
  private provider: AlkanesProvider | null = null;
  private initPromise: Promise<void> | null = null;
  private networkConfig: NetworkConfig;
  private networkName: string | undefined;

  constructor(networkName?: string) {
    this.networkName = networkName;
    this.networkConfig = getNetworkConfig(networkName);
  }

  getNetwork(): string {
    return this.networkConfig.network;
  }

  getNetworkType(): NetworkType {
    return this.networkConfig.networkType;
  }

  getNetworkName(): string | undefined {
    return this.networkName;
  }

  private async ensureProvider(): Promise<AlkanesProvider> {
    if (this.provider) return this.provider;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        // Provide all required config fields for the SDK
        this.provider = new AlkanesProvider({
          network: this.networkConfig.network,
          networkType: this.networkConfig.networkType,
          rpcUrl: this.networkConfig.url,
        });
        await this.provider.initialize();
      })();
    }

    await this.initPromise;
    return this.provider!;
  }

  // ==========================================================================
  // Esplora Methods
  // ==========================================================================

  async getAddressUtxos(address: string): Promise<UTXO[]> {
    const provider = await this.ensureProvider();
    const utxos = await provider.esplora.getAddressUtxos(address);
    return utxos as UTXO[];
  }

  async getBtcBalance(address: string): Promise<number> {
    const utxos = await this.getAddressUtxos(address);
    return utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
  }

  // ==========================================================================
  // Alkanes Methods
  // ==========================================================================

  async getAlkaneBalances(address: string): Promise<AlkaneBalanceResponse[]> {
    const provider = await this.ensureProvider();
    return provider.alkanes.getBalance(address);
  }

  async getWalletBalances(address: string): Promise<WalletBalances> {
    const [btcBalance, alkaneBalances] = await Promise.all([
      this.getBtcBalance(address),
      this.getAlkaneBalances(address),
    ]);

    const tokens: TokenBalance[] = alkaneBalances.map((ab) => {
      const alkaneId = ab.id;
      if (!alkaneId) {
        throw new Error('Invalid balance entry: missing id');
      }
      const runeId = formatAlkaneId(alkaneId);
      const tokenInfo = KNOWN_TOKENS[runeId] || {
        symbol: ab.symbol || runeId,
        name: ab.name || `Unknown (${runeId})`,
        decimals: 8,
      };
      const balanceValue = ab.amount ?? '0';

      return {
        runeId,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        balance: BigInt(balanceValue),
        balanceFormatted: Number(balanceValue) / Math.pow(10, tokenInfo.decimals),
        decimals: tokenInfo.decimals,
      };
    });

    return {
      btcBalance,
      btcBalanceFormatted: (btcBalance / 100000000).toFixed(8),
      tokens,
      address,
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // Metashrew Methods
  // ==========================================================================

  async getCurrentHeight(): Promise<number> {
    // TODO: Migrate to @alkanes/ts-sdk once SDK correctly constructs JSON-RPC URLs
    // Currently the SDK uses /v4/jsonrpc instead of /v4/subfrost/jsonrpc
    try {
      const jsonRpcUrl = `${this.networkConfig.url}/jsonrpc`;
      const response = await fetch(jsonRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'metashrew_height',
          params: [],
        }),
      });
      const result = await response.json();
      if (result?.result) {
        return parseInt(result.result, 10);
      }
      // Fallback to SDK
      const provider = await this.ensureProvider();
      return provider.getBlockHeight();
    } catch {
      const provider = await this.ensureProvider();
      return provider.getBlockHeight();
    }
  }

  async metashrewView(viewFn: string, payload: string, blockTag: string = 'latest'): Promise<string> {
    const provider = await this.ensureProvider();
    return provider.metashrew.view(viewFn, payload, blockTag);
  }

  async executeLuaScript<T>(script: string, args: unknown[]): Promise<T> {
    // TODO: Migrate to @alkanes/ts-sdk once SDK correctly constructs JSON-RPC URLs
    // Currently the SDK uses /v4/jsonrpc instead of /v4/subfrost/jsonrpc, causing rate limits
    try {
      const jsonRpcUrl = `${this.networkConfig.url}/jsonrpc`;
      const response = await fetch(jsonRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'lua_evalscript',
          params: [script, args],
        }),
      });
      const result = await response.json();

      if (result?.error) {
        throw new Error(`Lua eval failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      if (result?.result !== undefined) {
        // Handle the returns wrapper if present
        if (result.result && typeof result.result === 'object' && 'returns' in result.result) {
          return result.result.returns as T;
        }
        return result.result as T;
      }

      // Fallback to SDK
      const provider = await this.ensureProvider();
      const sdkResult = await provider.lua.eval(script, args);
      if (sdkResult && sdkResult.returns !== undefined) {
        return sdkResult.returns as T;
      }
      return sdkResult as T;
    } catch (error) {
      // If our direct call fails, try SDK as fallback
      const provider = await this.ensureProvider();
      const result = await provider.lua.eval(script, args);
      if (result && result.returns !== undefined) {
        return result.returns as T;
      }
      return result as T;
    }
  }

  // ==========================================================================
  // Pool Methods
  // ==========================================================================

  async getPoolReserves(pool: PoolConfig, _blockTag: string = 'latest'): Promise<PoolReserves | null> {
    try {
      // TODO: Migrate to @alkanes/ts-sdk once SDK correctly supports get-pool-details endpoint
      // Currently using direct REST API call as workaround for SDK issues:
      // - SDK's getPoolReserves() calls get-reserves endpoint which returns zeros
      // - SDK's alkanes.getPoolDetails() returns raw hex requiring custom parsing
      // See: https://mainnet.subfrost.io/v4/subfrost/get-pool-details
      const baseUrl = this.networkConfig.url; // includes /subfrost API key
      const response = await fetch(`${baseUrl}/get-pool-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: {
            block: String(pool.alkaneId.block),
            tx: String(pool.alkaneId.tx),
          },
        }),
      });
      const result = await response.json();

      if (result?.statusCode === 200 && result?.data) {
        const data = result.data;
        return {
          reserve0: BigInt(data.token0_amount || '0'),
          reserve1: BigInt(data.token1_amount || '0'),
          totalSupply: BigInt(data.token_supply || '0'),
        };
      }

      console.warn(`[AlkanesClient] Unexpected pool details response for ${pool.id}:`, JSON.stringify(result));
      return null;
    } catch (error) {
      console.error(`[AlkanesClient] Error fetching pool reserves for ${pool.id}:`, error);
      return null;
    }
  }

  parsePoolReservesHex(hex: string): PoolReserves | null {
    try {
      const data = hex.startsWith('0x') ? hex.slice(2) : hex;
      if (!data || data.length < 224) return null;

      const marker0a = data.indexOf('0a');
      if (marker0a === -1) return null;

      const innerStart = marker0a + 4;
      const innerHex = data.slice(innerStart);

      return {
        reserve0: parseU128LEAtOffset(innerHex, 64),
        reserve1: parseU128LEAtOffset(innerHex, 80),
        totalSupply: parseU128LEAtOffset(innerHex, 96),
      };
    } catch {
      return null;
    }
  }

  async getDieselTotalSupply(): Promise<bigint | null> {
    try {
      const hex = await this.metashrewView('simulate', DIESEL_TOKEN.totalSupplyPayload, 'latest');
      return this.parseTotalSupplyHex(hex);
    } catch (error) {
      console.error('[AlkanesClient] Error fetching DIESEL total supply:', error);
      return null;
    }
  }

  parseTotalSupplyHex(hex: string): bigint | null {
    try {
      const data = hex.startsWith('0x') ? hex.slice(2) : hex;
      if (!data) return null;

      const marker1a = data.indexOf('1a');
      if (marker1a === -1) return null;

      const valueStart = marker1a + 4;
      const valueEnd = data.indexOf('10', valueStart);

      if (valueEnd === -1) {
        const valueHex = data.slice(valueStart, Math.min(valueStart + 32, data.length));
        return parseU128LE(valueHex);
      }

      const valueHex = data.slice(valueStart, valueEnd);
      const paddedHex = valueHex.padEnd(32, '0');
      return parseU128LE(paddedHex);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Data API Methods
  // ==========================================================================

  async getBitcoinPrice(): Promise<number> {
    // TODO: Migrate to @alkanes/ts-sdk once SDK correctly parses the API response
    // Currently using direct REST API call as workaround for SDK issue:
    // - SDK's getBitcoinPrice() returns 0 because it expects result.price
    //   but API returns { statusCode: 200, data: { bitcoin: { usd: number } } }
    // See: https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price
    try {
      // Always use mainnet for BTC price (network-agnostic) with subfrost API key
      const response = await fetch('https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      const price = result?.data?.bitcoin?.usd;
      if (typeof price === 'number' && price > 0) {
        return price;
      }
      console.warn('[AlkanesClient] Unexpected BTC price response:', JSON.stringify(result));
    } catch (error) {
      console.error('[AlkanesClient] getBitcoinPrice failed:', error);
    }

    return 0;
  }
}

// ============================================================================
// Client Factory and Singleton Export
// ============================================================================

// Cache of network-specific clients
const clientCache = new Map<string, AlkanesClient>();

/**
 * Get an AlkanesClient for a specific network.
 * Clients are cached per network to avoid creating multiple instances.
 * @param networkName - Network name (e.g., 'mainnet', 'regtest')
 *                      If not provided, uses default network from env
 */
export function getAlkanesClient(networkName?: string): AlkanesClient {
  const cacheKey = networkName || '_default_';

  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new AlkanesClient(networkName);
    clientCache.set(cacheKey, client);
  }

  return client;
}

// Default singleton for backwards compatibility
export const alkanesClient = getAlkanesClient();
export { AlkanesClient };
