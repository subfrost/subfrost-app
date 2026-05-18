/**
 * Esplora REST → JSON-RPC dispatcher against the canonical Subfrost upstream.
 *
 * 2026-05-18 directive (user): "we should NEVER be using espo we use the
 * jsonrpc format for esplora_tx like its done in alkanes-rs ... we basically
 * use that jsonrpc for everything esplora included".
 *
 * Why: the previous proxy forwarded REST requests to `espo.subfrost.io`,
 * which is a per-block-indexed cache. Mempool-only transactions returned
 * 502 — mork1e hit this on a fresh swap (txid 9dd1caf8…) where his
 * pending-tx hydration died with 502 Bad Gateway, which in turn made the
 * alkane row vanish from the wallet card. The /v4/subfrost JSON-RPC
 * upstream serves mempool + confirmed transactions uniformly.
 *
 * Path → JSON-RPC mapping (the only paths the app actually calls):
 *
 *   GET tx/{txid}              → esplora_tx               → JSON
 *   GET tx/{txid}/hex          → esplora_tx::hex          → hex string
 *   GET tx/{txid}/status       → esplora_tx::status       → JSON
 *   GET address/{addr}/utxo    → esplora_address::utxo    → JSON array
 *
 * Adding a new endpoint? Pattern-match the path, derive the JSON-RPC method
 * (the wire form is `esplora_<group>[::<subpath>]`), and add a case below.
 * Don't reach for `espo.subfrost.io` or `mempool.space` — both have been
 * removed.
 *
 * Routing for the JSON-RPC call goes through `/api/rpc` (our own proxy at
 * app/api/rpc/[[...segments]]/route.ts), which knows to hit
 * `mainnet.subfrost.io/v4/subfrost` for mainnet and the right local upstream
 * for non-mainnet. Going through our own proxy from server-side code keeps
 * the URL config in ONE place — see CLAUDE.md "Mainnet metashrew routing".
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Network } from '@/utils/constants';

interface DispatchResult {
  method: string;
  params: unknown[];
  /** True = response is plain text (hex), false = JSON. */
  asText: boolean;
}

function dispatch(pathString: string): DispatchResult | null {
  // tx/{txid}/hex
  const txHex = pathString.match(/^tx\/([0-9a-fA-F]{64})\/hex$/);
  if (txHex) return { method: 'esplora_tx::hex', params: [txHex[1]], asText: true };

  // tx/{txid}/status
  const txStatus = pathString.match(/^tx\/([0-9a-fA-F]{64})\/status$/);
  if (txStatus) return { method: 'esplora_tx::status', params: [txStatus[1]], asText: false };

  // tx/{txid}
  const txOnly = pathString.match(/^tx\/([0-9a-fA-F]{64})$/);
  if (txOnly) return { method: 'esplora_tx', params: [txOnly[1]], asText: false };

  // address/{addr}/utxo
  const addrUtxo = pathString.match(/^address\/([a-zA-Z0-9]+)\/utxo$/);
  if (addrUtxo) return { method: 'esplora_address::utxo', params: [addrUtxo[1]], asText: false };

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathString = path.join('/');
    const { searchParams } = new URL(request.url);
    const network = (searchParams.get('network') || 'mainnet') as Network;

    const dispatched = dispatch(pathString);
    if (!dispatched) {
      console.warn(`[esplora-proxy] unmapped REST path: ${pathString}`);
      return NextResponse.json(
        {
          error: `Unmapped esplora REST path "${pathString}". Add a case to dispatch() in app/api/esplora/[...path]/route.ts.`,
        },
        { status: 404 },
      );
    }

    // Route through our own /api/rpc proxy. On the server this means an
    // absolute URL; deriving the origin from the inbound request keeps
    // staging / prod / preview deploys self-routing without env config.
    const origin = new URL(request.url).origin;
    const rpcUrl = `${origin}/api/rpc?network=${encodeURIComponent(network)}`;

    const upstream = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: dispatched.method,
        params: dispatched.params,
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error(
        `[esplora-proxy] upstream ${upstream.status} for ${dispatched.method}: ${errBody.slice(0, 200)}`,
      );
      return NextResponse.json(
        { error: `Upstream ${upstream.status}: ${upstream.statusText}` },
        { status: upstream.status },
      );
    }

    const body = await upstream.json();
    if (body?.error) {
      console.error(
        `[esplora-proxy] JSON-RPC error for ${dispatched.method}: code=${body.error.code} message=${body.error.message}`,
      );
      // -32000 family typically maps to "not found" for esplora_tx etc.
      const status = body.error.code === -32000 ? 404 : 502;
      return NextResponse.json({ error: body.error.message ?? 'JSON-RPC error' }, { status });
    }

    if (dispatched.asText) {
      return new NextResponse(String(body.result ?? ''), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return NextResponse.json(body.result);
  } catch (error) {
    console.error('[esplora-proxy] proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 500 },
    );
  }
}
