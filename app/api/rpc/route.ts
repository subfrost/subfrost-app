/**
 * RPC Proxy Route - Bypasses CORS restrictions for browser-side RPC calls
 *
 * This proxy forwards JSON-RPC requests to the appropriate subfrost endpoint
 * based on the configured network. This is necessary because browser fetch
 * calls are blocked by CORS when the server doesn't return proper headers.
 *
 * JOURNAL ENTRY (2026-01-28):
 * Created to work around CORS issues on regtest.subfrost.io (and other subfrost
 * endpoints) that block browser requests from localhost origins.
 *
 * This proxy is used by:
 * 1. useEnrichedWalletData.ts - for esplora_address::utxo fallback balance fetching
 * 2. AlkanesSDKContext.tsx - WASM WebProvider configured to use this proxy when in
 *    browser localhost context (jsonrpc_url and data_api_url point here)
 *
 * The WASM SDK makes direct fetch calls internally for all RPC operations (balance
 * lookups, transaction building, UTXO selection, etc.). Without this proxy, the SDK
 * would fail with 403 Forbidden errors when running on localhost.
 *
 * TODO: Fix CORS headers on subfrost.io nginx/ingress config to allow localhost
 * origins, so direct calls can work without proxy. Once fixed, this proxy becomes
 * a safety net rather than a required component.
 */

import { NextRequest, NextResponse } from 'next/server';

// RPC endpoints by network
// Note: batch JSON-RPC requests are more reliably handled by the explicit
// /jsonrpc path on subfrost. ESPO calls bypass these and use ESPO_RPC_URL.
const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
};

const BATCH_RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/jsonrpc',
  testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
  signet: 'https://signet.subfrost.io/v4/jsonrpc',
  regtest: 'https://regtest.subfrost.io/v4/jsonrpc',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/jsonrpc',
  oylnet: 'https://regtest.subfrost.io/v4/jsonrpc',
};

const ESPO_RPC_URL = (process.env.NEXT_PUBLIC_ESPO_RPC_URL || process.env.ESPO_RPC_URL || 'https://api.alkanode.com/rpc').replace(/\/$/, '');

function isEspoMethod(method?: string): boolean {
  if (!method) return false;
  return method.startsWith('essentials.');
}

function pickEndpoint(body: any, network: string) {
  const isBatch = Array.isArray(body);
  const firstMethod = isBatch ? body[0]?.method : body?.method;

  // Essentials calls must go to ESPO
  if (isEspoMethod(firstMethod)) return ESPO_RPC_URL;

  // Otherwise choose subfrost endpoints
  const single = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest;
  const batch = BATCH_RPC_ENDPOINTS[network] || BATCH_RPC_ENDPOINTS.regtest;
  return isBatch ? batch : single;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Read network from query parameter (set by AlkanesSDKContext proxy URL),
    // fall back to env var, then default to regtest
    const network = request.nextUrl.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'regtest';
    const rpcUrl = pickEndpoint(body, network);

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
