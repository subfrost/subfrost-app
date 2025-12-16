import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blocks = 1, address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Call the regtest RPC directly
    const response = await fetch('https://regtest.subfrost.io/v4/subfrost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'bitcoind_generatetoaddress',
        params: [blocks, address],
        id: 1,
      }),
    });

    const result = await response.json();

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || 'RPC error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      blocks: result.result,
      count: blocks,
    });
  } catch (error) {
    console.error('Mine blocks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
