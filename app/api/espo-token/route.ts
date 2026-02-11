/**
 * Espo Token Info API — Server-side token metadata via Espo's get_alkane_info RPC
 *
 * GET /api/espo-token?alkane=2:0&network=mainnet
 *
 * Replaces alkanesReflect (alkanes_simulate) with Espo's indexed token metadata.
 * Permanent Redis cache — token metadata is immutable.
 */

import { NextResponse } from 'next/server';
import { cache } from '@/lib/db/redis';

// Espo JSON-RPC endpoints per network
// Espo is co-located with subfrost infrastructure at /v4/subfrost/espo
const ESPO_ENDPOINTS: Record<string, string> = {
  mainnet: process.env.ESPO_MAINNET_URL || 'https://mainnet.subfrost.io/v4/api/espo',
  testnet: process.env.ESPO_TESTNET_URL || 'https://testnet.subfrost.io/v4/api/espo',
  signet: process.env.ESPO_SIGNET_URL || 'https://signet.subfrost.io/v4/api/espo',
  regtest: process.env.ESPO_REGTEST_URL || 'https://regtest.subfrost.io/v4/api/espo',
  'regtest-local': process.env.ESPO_REGTEST_LOCAL_URL || 'http://localhost:18888/espo',
  'subfrost-regtest': process.env.ESPO_REGTEST_URL || 'https://regtest.subfrost.io/v4/api/espo',
  oylnet: process.env.ESPO_MAINNET_URL || 'https://mainnet.subfrost.io/v4/api/espo',
};

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const alkane = url.searchParams.get('alkane');
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  if (!alkane) {
    return NextResponse.json({ error: 'alkane parameter is required' }, { status: 400 });
  }

  const cacheKey = `espo-token:${network}:${alkane}`;

  try {
    // Check Redis cache (permanent — token metadata is immutable)
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: 'cache' });
    }

    const endpoint = ESPO_ENDPOINTS[network] || ESPO_ENDPOINTS.mainnet;
    const result = await espoRpcCall(endpoint, 'get_alkane_info', { alkane });

    const info = {
      alkane,
      name: result?.name || '',
      symbol: result?.symbol || '',
      decimals: result?.decimals ?? 8,
    };

    // Cache permanently — token metadata doesn't change
    await cache.set(cacheKey, info);

    return NextResponse.json({ ...info, source: 'espo' });
  } catch (error) {
    console.error(`[espo-token] Error for ${alkane}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token info', alkane },
      { status: 500 },
    );
  }
}
