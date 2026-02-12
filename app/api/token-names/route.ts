/**
 * Token Names API — Proxies the data API's /get-alkanes endpoint
 *
 * GET /api/token-names?network=<network>&limit=<limit>
 *
 * Returns a map of alkaneId → { name, symbol } for the top N tokens.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 */

import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS } from '@/utils/getConfig';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
  const limit = Math.min(Number(url.searchParams.get('limit') || 500), 1000);

  const baseUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;

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
