/**
 * Token Names API — Proxies the data API's /get-alkanes endpoint
 *
 * GET /api/token-names?network=<network>&limit=<limit>
 *
 * Returns a map of alkaneId → { name, symbol } for the top N tokens.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 */

import { NextResponse } from 'next/server';

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  devnet: 'http://localhost:18888', // In-browser only
};

/**
 * Well-known devnet token names — returned directly when network=devnet
 * since the devnet WASM runs in-browser and server-side can't reach it.
 */
const DEVNET_TOKEN_NAMES: Record<string, { name: string; symbol: string }> = {
  '2:0': { name: 'DIESEL', symbol: 'DIESEL' },
  '32:0': { name: 'frBTC', symbol: 'frBTC' },
  '4:256': { name: 'FIRE', symbol: 'FIRE' },
  '4:7000': { name: 'FUEL', symbol: 'FUEL' },
  '4:7010': { name: 'ftrBTC Template', symbol: 'ftrBTC' },
  '4:7020': { name: 'dxBTC Vault', symbol: 'dxBTC' },
  '4:7030': { name: 'vxFUEL Gauge', symbol: 'vxFUEL' },
  '4:7031': { name: 'vxBTCUSD Gauge', symbol: 'vxBTCUSD' },
  '4:8201': { name: 'frUSD', symbol: 'frUSD' },
  '4:65522': { name: 'AMM Factory', symbol: 'FACTORY' },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
  const limit = Math.min(Number(url.searchParams.get('limit') || 500), 1000);

  // Devnet runs in-browser WASM — server can't reach it, return known tokens
  if (network === 'devnet' || network === 'regtest-local') {
    return NextResponse.json({ names: DEVNET_TOKEN_NAMES, count: Object.keys(DEVNET_TOKEN_NAMES).length });
  }

  const baseUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

  try {
    const response = await fetch(`${baseUrl}/get-alkanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, offset: 0 }),
    });

    if (!response.ok) {
      throw new Error(`Data API failed: ${response.status}`);
    }

    const data = await response.json();
    const tokens: any[] = data?.data?.tokens || [];

    // Build a flat map: alkaneId → { name, symbol }
    const names: Record<string, { name: string; symbol: string }> = {};
    for (const token of tokens) {
      const alkaneId = `${token.id?.block || 0}:${token.id?.tx || 0}`;
      if (alkaneId && (token.name || token.symbol)) {
        names[alkaneId] = { name: token.name || '', symbol: token.symbol || '' };
      }
    }

    return NextResponse.json({ names, count: Object.keys(names).length });
  } catch (error) {
    console.error('[token-names] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token names' },
      { status: 500 },
    );
  }
}
