import { NextRequest, NextResponse } from 'next/server';

/**
 * CHADSON 2025-12-01: Esplora Proxy Route
 *
 * WHY THIS EXISTS:
 * Browser cannot directly fetch from localhost:50010 due to CORS.
 * The useEnrichedWalletData hook needs to fetch UTXOs for wallet balances.
 * Without this proxy, wallet balances show 0 even when UTXOs exist.
 *
 * USAGE:
 * Frontend: fetch('/api/esplora/address/{addr}/utxo')
 * This proxies to: http://localhost:50010/address/{addr}/utxo
 *
 * LESSON LEARNED:
 * Direct esplora calls from browser = CORS blocked = silent failure = 0 balance
 * Always proxy external service calls through Next.js API routes in dev.
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
