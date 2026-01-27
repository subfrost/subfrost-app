import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blocks = 1, address } = body;

    console.log('[API /regtest/mine] Request:', { blocks, address, network: process.env.NEXT_PUBLIC_NETWORK });

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Validate address format (bcrt1... for regtest)
    if (!address.startsWith('bcrt1')) {
      return NextResponse.json(
        { error: `Invalid regtest address format: ${address}` },
        { status: 400 }
      );
    }

    // Use local Docker endpoint for regtest-local, otherwise use hosted
    const network = process.env.NEXT_PUBLIC_NETWORK;
    const rpcUrl = network === 'regtest-local'
      ? 'http://localhost:18888'
      : 'https://regtest.subfrost.io/v4/subfrost';

    // Mine blocks sequentially (the RPC only mines 1 at a time reliably)
    const allBlockHashes: string[] = [];
    const blocksToMine = Math.min(blocks, 10); // Cap at 10 to prevent timeout

    for (let i = 0; i < blocksToMine; i++) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'bitcoind_generatetoaddress',
            params: [1, address],
            id: i + 1,
          }),
        });

        const result = await response.json();

        if (result.result) {
          const hashes = Array.isArray(result.result) ? result.result : [result.result];
          allBlockHashes.push(...hashes);
        }
      } catch (err) {
        console.error('[API /regtest/mine] Error mining block', i, err);
      }
    }

    console.log('[API /regtest/mine] Mined', allBlockHashes.length, 'blocks');

    return NextResponse.json({
      success: true,
      blocks: allBlockHashes,
      count: allBlockHashes.length,
      requested: blocks,
    });
  } catch (error) {
    console.error('Mine blocks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
