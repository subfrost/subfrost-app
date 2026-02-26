/**
 * Alkane Balance API — Aggregates balances from alkanes_protorunesbyaddress RPC
 *
 * GET /api/alkane-balances?address=<address>&network=<network>
 *
 * Returns alkane balances by directly querying the metashrew alkanes indexer
 * and aggregating balances client-side. This ensures balances are always current
 * on regtest networks where the data API (espo) may have delays.
 *
 * JOURNAL ENTRY (2026-02-10): Created with outpoint-by-outpoint approach.
 * JOURNAL ENTRY (2026-02-12): Switched to get-alkanes-by-address REST endpoint.
 * JOURNAL ENTRY (2026-02-20): Switched back to RPC aggregation for regtest networks.
 * The data API (espo) has indexing delays on regtest, so we aggregate balances
 * from the low-level alkanes_protorunesbyaddress RPC method for immediate results.
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
    // Use low-level RPC to get outpoints with alkanes
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alkanes_protorunesbyaddress',
        params: [{ address, protocolTag: '1' }],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC failed: ${response.status}`);
    }

    const data = await response.json();
    const outpoints = data?.result?.outpoints || [];

    // Aggregate balances by alkane ID
    const balanceMap = new Map<string, bigint>();

    for (const outpoint of outpoints) {
      const balances = outpoint?.balance_sheet?.cached?.balances || [];
      for (const bal of balances) {
        const alkaneId = `${bal.block}:${bal.tx}`;
        const amount = BigInt(bal.amount || 0);
        const current = balanceMap.get(alkaneId) || BigInt(0);
        balanceMap.set(alkaneId, current + amount);
      }
    }

    // Convert to array format
    const balances = Array.from(balanceMap.entries()).map(([alkaneId, balance]) => ({
      alkaneId,
      balance: balance.toString(),
      name: '', // TODO: fetch metadata from token registry
      symbol: '',
      priceUsd: 0,
      priceInSatoshi: 0,
      tokenImage: '',
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
