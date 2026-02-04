/**
 * Esplora API proxy to avoid CORS issues.
 *
 * Proxies requests from the browser to the Esplora server.
 * Browser -> /api/esplora/tx/{txid}/hex?network=mainnet -> espo.subfrost.io/mainnet/api/tx/{txid}/hex
 *
 * Falls back to mempool.space for mainnet if the primary esplora returns 404
 * (espo.subfrost.io may not have the full mainnet transaction index).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/utils/getConfig';
import type { Network } from '@/utils/constants';

// Public esplora fallback for mainnet (standard /api/ format)
const MAINNET_FALLBACK_URL = 'https://mempool.space';

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

    // If primary esplora fails with 404 on mainnet, try mempool.space fallback
    if (!response.ok && response.status === 404 && network === 'mainnet') {
      const fallbackUrl = `${MAINNET_FALLBACK_URL}/api/${pathString}`;
      console.log(`[Esplora Proxy] Primary 404, trying fallback: ${fallbackUrl}`);

      const fallbackResponse = await fetch(fallbackUrl, {
        method: 'GET',
        headers: { 'Accept': '*/*' },
      });

      if (fallbackResponse.ok) {
        return handleSuccessResponse(fallbackResponse, pathString);
      }
      // If fallback also fails, return the fallback error
      return NextResponse.json(
        { error: `Esplora returned ${fallbackResponse.status}: ${fallbackResponse.statusText}` },
        { status: fallbackResponse.status }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Esplora returned ${response.status}: ${response.statusText}` },
        { status: response.status }
      );
    }

    return handleSuccessResponse(response, pathString);
  } catch (error) {
    console.error('[Esplora Proxy] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 500 }
    );
  }
}

function handleSuccessResponse(response: Response, pathString: string) {
  const contentType = response.headers.get('Content-Type') || 'text/plain';

  // For text responses (like hex), return as text
  if (contentType.includes('text') || pathString.endsWith('/hex')) {
    return response.text().then(text =>
      new NextResponse(text, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }

  // For JSON responses
  return response.json().then(data => NextResponse.json(data));
}
