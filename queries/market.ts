/**
 * Market data query options: BTC price, frBTC premium, token display map, fee estimates.
 *
 * All functions are pure — no React hooks or context imports.
 * Dependencies (provider, network, etc.) are passed as parameters.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { FRBTC_WRAP_FEE_PER_1000, FRBTC_UNWRAP_FEE_PER_1000 } from '@/constants/alkanes';

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

// Hardcoded fallbacks for well-known tokens
const KNOWN_TOKENS: Record<string, TokenDisplay> = {
  btc: { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  frbtc: { id: 'frbtc', name: 'frBTC', symbol: 'frBTC' },
};

// ---------------------------------------------------------------------------
// BTC price
// ---------------------------------------------------------------------------

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

interface BitcoinPriceCtx {
  usd: number;
  lastUpdated: number;
}

export function btcPriceQueryOptions(
  network: string,
  provider: WebProvider | null,
  isInitialized: boolean,
  cachedPrice: BitcoinPriceCtx | null,
) {
  return queryOptions<number>({
    queryKey: queryKeys.market.btcPrice(network),
    enabled: isInitialized && !!provider,
    queryFn: async () => {
      if (cachedPrice && cachedPrice.usd > 0) {
        return cachedPrice.usd;
      }
      if (!provider) return 90000;
      try {
        const response = await provider.dataApiGetBitcoinPrice();
        const price =
          typeof response === 'number'
            ? response
            : (response as { usd?: number; price?: number })?.usd ??
              (response as { price?: number })?.price ??
              0;
        return price > 0 ? price : 90000;
      } catch {
        return 90000;
      }
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
          calldata: [104],
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

async function fetchAlkaneNamesBatch(alkaneIds: string[]): Promise<Record<string, TokenDisplay>> {
  const map: Record<string, TokenDisplay> = {};
  if (alkaneIds.length === 0) return map;

  const batch = alkaneIds.map((id, i) => ({
    jsonrpc: '2.0',
    id: i,
    method: 'essentials.get_alkane_info',
    params: { alkane: id },
  }));

  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    console.warn('[tokenDisplayMap] Espo batch failed:', response.status);
    return map;
  }

  const results: Array<{ id: number; result?: { name?: string; symbol?: string }; error?: any }> =
    await response.json();

  for (const res of results) {
    const alkaneId = alkaneIds[res.id];
    if (!alkaneId) continue;
    if (res.result && res.result.name) {
      const name = res.result.name.replace('SUBFROST BTC', 'frBTC');
      map[alkaneId] = { id: alkaneId, name, symbol: res.result.symbol || '' };
    } else {
      map[alkaneId] = { id: alkaneId };
    }
  }

  return map;
}

export function tokenDisplayMapQueryOptions(
  network: string,
  ids: string[] | undefined,
) {
  const unique = ids ? Array.from(new Set(ids)) : [];
  const sortedKey = unique.sort().join(',');

  return queryOptions<Record<string, TokenDisplay>>({
    queryKey: queryKeys.market.tokenDisplayMap(network, sortedKey),
    enabled: unique.length > 0,
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
        const batchResults = await fetchAlkaneNamesBatch(toFetch);
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
