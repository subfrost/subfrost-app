/**
 * Alkane Balance API — Proxies the data API's get-alkanes-by-address endpoint
 *
 * GET /api/alkane-balances?address=<address>&network=<network>
 *
 * Returns enriched alkane balances including name, symbol, price, and image
 * from the subfrost data API (espo-backed, not metashrew).
 *
 * JOURNAL ENTRY (2026-02-10): Created with outpoint-by-outpoint approach.
 * JOURNAL ENTRY (2026-02-12): Switched to get-alkanes-by-address REST endpoint.
 * The outpoint approach was missing tokens due to stale metashrew indexer.
 * The data API returns complete balances with metadata (name, symbol, prices).
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
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  if (!address) {
    return NextResponse.json({ error: 'address parameter is required' }, { status: 400 });
  }

  const baseUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

  try {
    const response = await fetch(`${baseUrl}/get-alkanes-by-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      throw new Error(`Data API failed: ${response.status}`);
    }

    const data = await response.json();
    const items: any[] = data?.data || [];

    const balances = items.map((item: any) => ({
      alkaneId: `${item.alkaneId?.block || 0}:${item.alkaneId?.tx || 0}`,
      balance: String(item.balance || '0'),
      name: item.name || '',
      symbol: item.symbol || '',
      priceUsd: item.priceUsd || 0,
      priceInSatoshi: item.priceInSatoshi ? Number(item.priceInSatoshi) : 0,
      tokenImage: item.tokenImage || '',
    }));

    return NextResponse.json({ balances });
  } catch (error) {
    console.error('[alkane-balances] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alkane balances' },
      { status: 500 },
    );
  }
}
