/**
 * Esplora API proxy to avoid CORS issues.
 *
 * Proxies requests from the browser to the Esplora server.
 * Browser -> /api/esplora/tx/{txid}/hex?network=mainnet -> espo.subfrost.io/mainnet/api/tx/{txid}/hex
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/utils/getConfig';
import type { Network } from '@/utils/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathString = path.join('/');
    const { searchParams } = new URL(request.url);
    const network = (searchParams.get('network') || 'mainnet') as Network;

    const esploraUrl = getConfig(network).BLOCK_EXPLORER_URL_BTC;
    const targetUrl = `${esploraUrl}/api/${pathString}`;

    console.log(`[Esplora Proxy] Forwarding: ${pathString} -> ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Esplora returned ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('Content-Type') || 'text/plain';

    // For text responses (like hex), return as text
    if (contentType.includes('text') || pathString.endsWith('/hex')) {
      const text = await response.text();
      return new NextResponse(text, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // For JSON responses
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Esplora Proxy] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 500 }
    );
  }
}
