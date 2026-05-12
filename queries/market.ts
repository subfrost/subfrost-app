/**
 * Market data query options: BTC price, frBTC premium, token display map, fee estimates.
 *
 * All functions are pure — no React hooks or context imports.
 * Dependencies (provider, network, etc.) are passed as parameters.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { FRBTC_WRAP_FEE_PER_1000, FRBTC_UNWRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import { getBitcoinPrice as rpcGetBitcoinPrice } from '@/lib/alkanes/rpc';
// Pricing data is global — always use mainnet subpricer regardless of connected network
const SUBPRICER_BASE = 'https://mainnet.subfrost.io/v4/subfrost';

// Re-export the premium type so hooks can use it
export type FrbtcPremiumData = {
  premium: number;
  wrapFeePerThousand: number;
  unwrapFeePerThousand: number;
  isLive: boolean;
  error?: string;
};

// Re-export token display type
export type TokenDisplay = { id: string; name?: string; symbol?: string };

// Hardcoded canonical names. Checked before espo so protocol-canonical
// alkanes (genesis tokens, etc.) resolve instantly and don't fall through to
// the raw-id fallback when espo has no metadata for them.
const KNOWN_TOKENS: Record<string, TokenDisplay> = {
  btc: { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  frbtc: { id: 'frbtc', name: 'frBTC', symbol: 'frBTC' },
  '32:0': { id: '32:0', name: 'frBTC', symbol: 'frBTC' },
  '2:0': { id: '2:0', name: 'DIESEL', symbol: 'DIESEL' },
  '2:56801': { id: '2:56801', name: 'bUSD', symbol: 'bUSD' },
  '2:68479': { id: '2:68479', name: 'TORTILLA', symbol: 'TORTILLA' },
  '2:69': { id: '2:69', name: 'FARTANE', symbol: 'FARTANE' },
};

// ---------------------------------------------------------------------------
// BTC price
// ---------------------------------------------------------------------------

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

interface BitcoinPriceCtx {
  usd: number;
  lastUpdated: number;
}

/**
 * BTC price source-of-truth contract (2026-05-04, fixes the $110K/$79K oscillation):
 *
 *   1. Subpricer — protocol-canonical. Same endpoint the contracts price against.
 *   2. rpc.getBitcoinPrice() — Next.js `/api/btc-price` route through the
 *      shared SDK-mediated rpc.ts layer. Whatever upstream that route resolves
 *      to (currently coingecko in the route handler).
 *   3. Last-resort coingecko direct-fetch with a 5s timeout.
 *
 * "First non-zero wins, no second writer." Each leg returns immediately on
 * a positive price, so a slow leg never races a fast leg and overwrites.
 * `staleTime: Infinity` + HeightPoller invalidation means the cache is
 * written exactly once per block — no flicker between divergent sources.
 *
 * `cachedPrice` from `AlkanesSDKContext` was previously consulted first
 * here, but it's populated by a separate `/api/btc-price` one-shot in the
 * context that bypasses subpricer — that's where the $79K-vs-$110K
 * disagreement came from. Removed: subpricer is now the sole primary, and
 * the context fetch becomes display-only. The `cachedPrice` parameter
 * stays in the signature for backwards compat with existing callers.
 */
export function btcPriceQueryOptions(
  network: string,
  provider: WebProvider | null,
  isInitialized: boolean,
  _cachedPrice: BitcoinPriceCtx | null,
) {
  return queryOptions<number>({
    queryKey: queryKeys.market.btcPrice(network),
    enabled: isInitialized && !!provider,
    // Mainnet: pin until HeightPoller invalidates on new block.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Primary: subpricer — protocol-canonical price.
      try {
        const resp = await fetch(`${SUBPRICER_BASE}/api/v1/bitcoin-price`, {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const price = data?.usd ?? data?.price ?? 0;
          if (price > 0) return price;
        }
      } catch { /* fall through to rpc.ts */ }

      // Fallback 1: SDK-mediated rpc.ts layer (Next.js /api/btc-price).
      try {
        const data = await rpcGetBitcoinPrice(AbortSignal.timeout(5000));
        const price = (data as { usd?: number; price?: number })?.usd
          ?? (data as { price?: number })?.price
          ?? (typeof data === 'number' ? data : 0);
        if (price > 0) return price;
      } catch { /* fall through to coingecko */ }

      // Fallback 2: coingecko public API (last resort).
      try {
        const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const price = data?.bitcoin?.usd ?? 0;
          if (price > 0) return price;
        }
      } catch { /* fall through */ }

      // No source returned a price. Surface this honestly rather than
      // returning a hardcoded 90000 — display "—" is better than a wrong
      // number that triggers wrong USD math everywhere downstream.
      return 0;
    },
  });
}

// ---------------------------------------------------------------------------
// frBTC premium
// ---------------------------------------------------------------------------

function parseU128FromBytes(data: number[] | Uint8Array): bigint {
  if (!data || data.length === 0) throw new Error('No data to parse');
  const bytes = new Uint8Array(data);
  if (bytes.length < 16) throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(bytes[i]) << BigInt(i * 8);
  }
  return result;
}

export function frbtcPremiumQueryOptions(
  network: string,
  provider: WebProvider | null,
  isInitialized: boolean,
  frbtcAlkaneId: string,
  parseAlkaneId: (id: string) => { block: number | string; tx: number | string },
) {
  return queryOptions<FrbtcPremiumData>({
    queryKey: queryKeys.market.frbtcPremium(network, frbtcAlkaneId),
    enabled: isInitialized && !!provider && !!frbtcAlkaneId && frbtcAlkaneId !== '',
    retry: 3,
    retryDelay: 1000,
    queryFn: async () => {
      if (!provider) throw new Error('Provider not initialized');

      if (!frbtcAlkaneId || frbtcAlkaneId === '') {
        return {
          premium: 100_000,
          wrapFeePerThousand: FRBTC_WRAP_FEE_PER_1000,
          unwrapFeePerThousand: FRBTC_UNWRAP_FEE_PER_1000,
          isLive: false,
          error: 'frBTC not configured for this network',
        };
      }

      try {
        const frbtcId = parseAlkaneId(frbtcAlkaneId);
        const contractId = `${frbtcId.block}:${frbtcId.tx}`;
        const context = JSON.stringify({
          alkanes: [],
          calldata: encodeSimulateCalldata(contractId, [104]),
          height: 1000000,
          txindex: 0,
          pointer: 0,
          refund_pointer: 0,
          vout: 0,
          transaction: [],
          block: [],
        });

        const result = await provider.alkanesSimulate(contractId, context, 'latest');
        if (!result?.execution?.data) throw new Error('No response data');

        const premium = parseU128FromBytes(result.execution.data);
        const feePerThousand = Number(premium) / 100_000;

        return {
          premium: Number(premium),
          wrapFeePerThousand: feePerThousand,
          unwrapFeePerThousand: feePerThousand,
          isLive: true,
        };
      } catch (error) {
        console.warn('[frbtcPremium] Using fallback:', error instanceof Error ? error.message : 'Unknown error');
        return {
          premium: 100_000,
          wrapFeePerThousand: FRBTC_WRAP_FEE_PER_1000,
          unwrapFeePerThousand: FRBTC_UNWRAP_FEE_PER_1000,
          isLive: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Token display map
// ---------------------------------------------------------------------------

// Convert Map instances (from WASM serde) to plain objects
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

/**
 * Fetch token names/symbols via SDK's espoGetAlkaneInfo.
 *
 * JOURNAL ENTRY (2026-02-10):
 * Replaced raw essentials.get_alkane_info batch fetch with individual
 * SDK espoGetAlkaneInfo() calls. Slightly more HTTP requests but uses
 * Direct RPC fetch — no WASM overhead. Each call is a simple JSON-RPC
 * to essentials.get_alkane_info which returns { name, symbol, ... }.
 */
async function fetchAlkaneNamesBatch(
  _provider: WebProvider,
  alkaneIds: string[],
  network?: string,
): Promise<Record<string, TokenDisplay>> {
  const map: Record<string, TokenDisplay> = {};
  if (alkaneIds.length === 0) return map;

  const rpcUrl = `/api/rpc/${network || 'mainnet'}/espo`;

  try {
    const request = alkaneIds.map((id, index) => ({
      jsonrpc: '2.0',
      id: index + 1,
      method: 'essentials.get_alkane_info',
      params: { alkane: id },
    }));
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(request),
    });
    const json = await resp.json();
    const responses = Array.isArray(json) ? json : [];
    const byId = new Map<number, any>();
    for (const item of responses) {
      if (typeof item?.id === 'number') byId.set(item.id, item);
    }

    for (const [index, id] of alkaneIds.entries()) {
      const data = byId.get(index + 1)?.result;
      if (data?.name) {
        const name = (data.name as string).replace('SUBFROST BTC', 'frBTC');
        map[id] = { id, name, symbol: data.symbol || '' };
      } else {
        map[id] = { id, name: id, symbol: id };
      }
    }
  } catch {
    for (const id of alkaneIds) {
      map[id] = { id, name: id, symbol: id };
    }
  }

  return map;
}

export function tokenDisplayMapQueryOptions(
  network: string,
  ids: string[] | undefined,
  provider?: WebProvider | null,
) {
  const unique = ids ? Array.from(new Set(ids)) : [];
  const sortedKey = unique.sort().join(',');

  return queryOptions<Record<string, TokenDisplay>>({
    queryKey: queryKeys.market.tokenDisplayMap(network, sortedKey),
    enabled: unique.length > 0 && !!provider,
    // Token names/symbols never change — fetch once, cache forever
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const map: Record<string, TokenDisplay> = {};
      const toFetch: string[] = [];
      for (const id of unique) {
        if (KNOWN_TOKENS[id]) {
          map[id] = KNOWN_TOKENS[id];
        } else {
          toFetch.push(id);
        }
      }
      if (toFetch.length > 0) {
        const batchResults = await fetchAlkaneNamesBatch(provider as WebProvider, toFetch, network);
        Object.assign(map, batchResults);
      }
      return map;
    },
  });
}

// ---------------------------------------------------------------------------
// Fee estimates
// ---------------------------------------------------------------------------

export interface FeeEstimates {
  slow: number;
  medium: number;
  fast: number;
  lastUpdated: number;
}

export function feeEstimatesQueryOptions(network: string) {
  return queryOptions<FeeEstimates>({
    queryKey: queryKeys.market.feeEstimates(network),
    queryFn: async () => {
      try {
        const response = await fetch('/api/fees');
        const data = await response.json();
        if (data) {
          return {
            fast: Math.max(1, data.fast || 25),
            medium: Math.max(1, data.medium || 10),
            slow: Math.max(1, data.slow || 2),
            lastUpdated: Date.now(),
          };
        }
      } catch (error) {
        console.error('Failed to fetch fee estimates:', error);
      }
      return { fast: 25, medium: 10, slow: 2, lastUpdated: Date.now() };
    },
  });
}
