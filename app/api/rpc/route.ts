/**
 * RPC Proxy Route - Bypasses CORS restrictions for browser-side RPC calls
 *
 * This proxy forwards JSON-RPC requests to the appropriate subfrost endpoint
 * based on the configured network. This is necessary because browser fetch
 * calls are blocked by CORS when the server doesn't return proper headers.
 *
 * JOURNAL ENTRY (2026-01-28):
 * Added to work around CORS issues on regtest.subfrost.io that were blocking
 * balance fetches from localhost:3001. The WASM SDK makes direct fetch calls
 * which get blocked, so this proxy allows the fallback esplora fetch to work.
 */

import { NextRequest, NextResponse } from 'next/server';

// RPC endpoints by network
const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const network = process.env.NEXT_PUBLIC_NETWORK || 'regtest';
    const rpcUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest;

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `RPC request failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[RPC Proxy] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'RPC proxy error' },
      { status: 500 }
    );
  }
}
