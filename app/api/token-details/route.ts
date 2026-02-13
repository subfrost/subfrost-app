/**
 * Token Details API — Proxies the data API's /get-alkane-details endpoint
 *
 * POST /api/token-details
 * Body: { alkaneIds: ["2:25720", "2:21219"], network?: string }
 *
 * Returns metadata for specific tokens not covered by the bulk /get-alkanes fetch.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 */

import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS } from '@/utils/getConfig';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const alkaneIds: string[] = body?.alkaneIds || [];
    const network = body?.network || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

    if (alkaneIds.length === 0) {
      return NextResponse.json({ names: {} });
    }

    // Cap at 50 to avoid abuse
    const ids = alkaneIds.slice(0, 50);
    const baseUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;

    const results: Record<string, { name: string; symbol: string }> = {};

    await Promise.all(ids.map(async (alkaneId) => {
      try {
        const [block, tx] = alkaneId.split(':');
        const resp = await fetch(`${baseUrl}/get-alkane-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alkaneId: { block, tx } }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const d = data?.data;
        if (d?.name || d?.symbol) {
          results[alkaneId] = { name: d.name || '', symbol: d.symbol || '' };
        }
      } catch { /* ignore individual failures */ }
    }));

    return NextResponse.json({ names: results, count: Object.keys(results).length });
  } catch (error) {
    console.error('[token-details] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token details' },
      { status: 500 },
    );
  }
}
