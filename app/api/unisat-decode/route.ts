/**
 * Proxy for Unisat's PSBT decode endpoint.
 *
 * Unisat's signPsbt() internally calls POST wallet-api.unisat.io/v5/tx/decode2
 * to validate + render transaction details before showing the signing UI.
 * This proxy lets us call the same endpoint from our server (no CORS) to
 * diagnose EXACTLY what the server rejects before the extension does.
 *
 * Usage: POST /api/unisat-decode { psbtHex: string, network?: string }
 * Returns the raw Unisat API response so we can see the exact error.
 */
import { NextRequest, NextResponse } from 'next/server';

// Unisat wallet API base URLs per network (from extension source)
const API_URLS: Record<string, string> = {
  mainnet: 'https://wallet-api.unisat.io',
  testnet: 'https://wallet-api-testnet.unisat.io',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { psbtHex, network = 'mainnet' } = body;

    if (!psbtHex) {
      return NextResponse.json({ error: 'psbtHex required' }, { status: 400 });
    }

    const baseUrl = API_URLS[network] || API_URLS.mainnet;
    const decodeUrl = `${baseUrl}/v5/tx/decode2`;

    console.log(`[unisat-decode] Calling ${decodeUrl} with ${psbtHex.length}-char PSBT hex`);

    const resp = await fetch(decodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ psbtHex, website: 'subfrost.io' }),
    });

    const data = await resp.json();
    console.log(`[unisat-decode] Response status=${resp.status}:`, JSON.stringify(data).substring(0, 500));

    return NextResponse.json({
      httpStatus: resp.status,
      apiResponse: data,
    });
  } catch (error) {
    console.error('[unisat-decode] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy error' },
      { status: 500 },
    );
  }
}
