import { NextRequest, NextResponse } from 'next/server';

/**
 * Esplora Proxy - CORS bypass for local esplora API
 *
 * Proxies requests to esplora (default: localhost:50010) to avoid CORS issues.
 * Used by useEnrichedWalletData to fetch UTXOs for wallet balance display.
 *
 * Example: /api/esplora/address/{addr}/utxo -> http://localhost:50010/address/{addr}/utxo
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const esploraUrl = process.env.NEXT_PUBLIC_ESPLORA_URL || 'http://localhost:50010';
  const targetPath = path.join('/');

  try {
    const response = await fetch(`${esploraUrl}/${targetPath}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Esplora error: ${response.status}` },
        { status: response.status }
      );
    }

    // Check content type to handle both JSON and plain text responses
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // If it's JSON, parse and return as JSON
    if (contentType.includes('application/json')) {
      return NextResponse.json(JSON.parse(text));
    }

    // Try to parse as JSON anyway (esplora sometimes returns JSON without proper content-type)
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    } catch {
      // Return plain text as-is (e.g., for /blocks/tip/height which returns just a number)
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    }
  } catch (error) {
    console.error('[esplora proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from esplora' },
      { status: 500 }
    );
  }
}
