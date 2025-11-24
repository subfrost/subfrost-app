/**
 * API Route: Generate Future
 * 
 * Proxies the generatefuture RPC call to Bitcoin Core to avoid CORS issues.
 * The browser cannot call Bitcoin Core directly, so we proxy through Next.js API.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('[API] Generate future called');
  try {
    // Get RPC URL from request or use default (Sandshrew proxy)
    const body = await request.json().catch(() => ({}));
    const rpcUrl = body.rpcUrl || 'https://regtest.subfrost.io/v4/jsonrpc';
    console.log('[API] Using RPC URL:', rpcUrl);
    
    // Use the hardcoded frBTC signer address that we know works
    // This address is derived from the frBTC contract at [32:0]
    const address = 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft';
    console.log('[API] Using address:', address);
    
    // Call generatefuture RPC via Sandshrew proxy
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'generatefuture',
        params: [address],
      }),
    });

    // Check if response is ok before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error('Bitcoin RPC error:', response.status, text);
      return NextResponse.json(
        { error: `Bitcoin RPC returned status ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.error) {
      if (data.error.code === -32601) {
        return NextResponse.json(
          {
            error: 'generatefuture RPC not found. You need to rebuild bitcoind with the patch:\n' +
                   '1. cd ~/alkanes-rs\n' +
                   '2. docker-compose build bitcoind\n' +
                   '3. docker-compose up -d bitcoind\n' +
                   '4. Wait for sync and try again'
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `RPC error: ${data.error.message}` },
        { status: 400 }
      );
    }

    console.log('[API] Success! Block hash:', data.result);
    return NextResponse.json({
      success: true,
      blockHash: data.result,
    });
  } catch (error) {
    console.error('[API] ERROR:', error);
    console.error('[API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
