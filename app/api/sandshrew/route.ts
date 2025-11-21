import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const SANDSHREW_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.sandshrew.io/v2/subfrost',
  testnet: 'https://testnet.sandshrew.io/v2/subfrost',
  signet: 'https://signet.sandshrew.io/v2/subfrost',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io/v2/subfrost',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const network = request.nextUrl.searchParams.get('network') || 'mainnet';
    const sandshrewUrl = SANDSHREW_URLS[network] || SANDSHREW_URLS.mainnet;

    const response = await fetch(sandshrewUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Sandshrew proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request to Sandshrew' },
      { status: 500 }
    );
  }
}
