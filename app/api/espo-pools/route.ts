/**
 * Espo Pools API — Server-side pool data via Espo's get_pools RPC
 *
 * GET /api/espo-pools?network=mainnet
 *
 * Replaces N+1 alkanes_simulate calls with a single Espo get_pools call.
 * Espo returns all AMM pools with live reserves in one response.
 *
 * Redis cache: 30s TTL (reserves change with every swap).
 */

import { NextResponse } from 'next/server';
import { cache } from '@/lib/db/redis';

// Espo JSON-RPC endpoints per network
// Espo is co-located with subfrost infrastructure at /v4/api/espo
const ESPO_ENDPOINTS: Record<string, string> = {
  mainnet: process.env.ESPO_MAINNET_URL || 'https://mainnet.subfrost.io/v4/api/espo',
  testnet: process.env.ESPO_TESTNET_URL || 'https://testnet.subfrost.io/v4/api/espo',
  signet: process.env.ESPO_SIGNET_URL || 'https://signet.subfrost.io/v4/api/espo',
  regtest: process.env.ESPO_REGTEST_URL || 'https://regtest.subfrost.io/v4/api/espo',
  'regtest-local': process.env.ESPO_REGTEST_LOCAL_URL || 'http://localhost:18888/espo',
  'subfrost-regtest': process.env.ESPO_REGTEST_URL || 'https://regtest.subfrost.io/v4/api/espo',
  oylnet: process.env.ESPO_MAINNET_URL || 'https://mainnet.subfrost.io/v4/api/espo',
};

const CACHE_TTL_SECONDS = 30;

async function espoRpcCall(endpoint: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });
  if (!response.ok) {
    throw new Error(`Espo RPC ${method} failed: ${response.status}`);
  }
  const json = await response.json();
  if (json.error) {
    throw new Error(`Espo RPC ${method} error: ${json.error.message || JSON.stringify(json.error)}`);
  }
  return json.result;
}

export interface EspoPool {
  pool_id: string;
  base_id: string;
  quote_id: string;
  base_amount: string;
  quote_amount: string;
  pool_name?: string;
  base_name?: string;
  quote_name?: string;
  base_symbol?: string;
  quote_symbol?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  const cacheKey = `espo-pools:${network}`;

  try {
    // Check Redis cache
    const cached = await cache.get<EspoPool[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ pools: cached, source: 'cache' });
    }

    const endpoint = ESPO_ENDPOINTS[network] || ESPO_ENDPOINTS.mainnet;
    const result = await espoRpcCall(endpoint, 'get_pools', { limit: 500 });

    // Normalize Espo's response format into a consistent shape
    const rawPools: any[] = result?.pools || result?.data || result || [];
    const pools: EspoPool[] = rawPools.map((p: any) => ({
      pool_id: p.pool_id || p.poolId || `${p.pool_block || 0}:${p.pool_tx || 0}`,
      base_id: p.base_id || p.baseId || p.base || '',
      quote_id: p.quote_id || p.quoteId || p.quote || '',
      base_amount: String(p.base_amount || p.baseAmount || p.reserve_base || '0'),
      quote_amount: String(p.quote_amount || p.quoteAmount || p.reserve_quote || '0'),
      pool_name: p.pool_name || p.poolName || '',
      base_name: p.base_name || p.baseName || '',
      quote_name: p.quote_name || p.quoteName || '',
      base_symbol: p.base_symbol || p.baseSymbol || '',
      quote_symbol: p.quote_symbol || p.quoteSymbol || '',
    }));

    // Cache for 30 seconds
    await cache.set(cacheKey, pools, CACHE_TTL_SECONDS);

    return NextResponse.json({ pools, source: 'espo' });
  } catch (error) {
    console.error('[espo-pools] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch pools from Espo', pools: [] },
      { status: 500 },
    );
  }
}
