import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint for minting test tokens in regtest mode
 * 
 * This endpoint:
 * 1. Sends BTC to the specified address via Bitcoin regtest RPC
 * 2. Mines blocks to confirm
 * 3. Returns success status
 * 
 * NOTE: This endpoint should ONLY be available in regtest mode.
 * In production, add additional security checks.
 */

export async function POST(request: NextRequest) {
  console.log('=== Mint API called ===');
  console.log('NEXT_PUBLIC_NETWORK:', process.env.NEXT_PUBLIC_NETWORK);
  console.log('NODE_ENV:', process.env.NODE_ENV);

  // Security: Only allow in regtest/development
  const network = process.env.NEXT_PUBLIC_NETWORK;
  if (network !== 'regtest' && process.env.NODE_ENV !== 'development') {
    console.log('Security check failed: not in regtest mode');
    return NextResponse.json(
      { error: 'This endpoint is only available in regtest mode' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    console.log('Request body:', body);
    const { address, tokens } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Bitcoin RPC configuration from environment
    // For docker-compose setup: use bitcoinrpc credentials
    const rpcUrl = process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443';
    const rpcUser = process.env.BITCOIN_RPC_USER || 'bitcoinrpc';
    const rpcPassword = process.env.BITCOIN_RPC_PASSWORD || 'bitcoinrpc';
    const rpcWallet = process.env.BITCOIN_RPC_WALLET || 'test'; // Wallet name in docker-compose

    console.log('Bitcoin RPC config:', { rpcUrl, rpcUser, rpcPassword: '***', rpcWallet });

    const btcAmount = tokens?.btc || 1.0;
    const blocksToGenerate = 6; // Standard confirmation threshold

    // Helper function to call Bitcoin RPC
    const callBitcoinRPC = async (method: string, params: any[] = [], useWallet: boolean = true) => {
      console.log(`Calling Bitcoin RPC: ${method}`, params);
      
      // Use btoa for base64 encoding (works in both Node and Edge runtime)
      const auth = btoa(`${rpcUser}:${rpcPassword}`);
      
      // Use wallet-specific endpoint for wallet operations
      const url = useWallet ? `${rpcUrl}/wallet/${rpcWallet}` : rpcUrl;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: 'mint-tokens',
          method: method,
          params: params,
        }),
      });

      if (!response.ok) {
        throw new Error(`Bitcoin RPC call failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Bitcoin RPC error: ${data.error.message}`);
      }

      return data.result;
    };

    try {
      // First, check if the node is accessible
      try {
        await callBitcoinRPC('getblockchaininfo', [], false);
      } catch (connectionError: any) {
        console.error('Cannot connect to Bitcoin node:', connectionError);
        throw new Error('BITCOIN_NODE_NOT_RUNNING');
      }

      // 1. Send BTC to the address
      // Add fee parameters for regtest (no fee estimation available)
      const comment = ''; // Optional comment
      const commentTo = ''; // Optional comment about recipient
      const subtractFeeFromAmount = false;
      const replaceable = true; // RBF enabled
      const confTarget = 6;
      const estimateMode = 'unset'; // Don't use fee estimation
      const avoidReuse = false;
      const feeRate = 0.00001; // 1 sat/vB (low fee for regtest)
      
      const txid = await callBitcoinRPC('sendtoaddress', [
        address, 
        btcAmount,
        comment,
        commentTo,
        subtractFeeFromAmount,
        replaceable,
        confTarget,
        estimateMode,
        avoidReuse,
        feeRate
      ], true);
      console.log(`Sent ${btcAmount} BTC to ${address}, txid: ${txid}`);

      // 2. Mine blocks to confirm the transaction
      // Get a mining address first (generate to our own wallet)
      const miningAddress = await callBitcoinRPC('getnewaddress', [], true);
      const blockHashes = await callBitcoinRPC('generatetoaddress', [blocksToGenerate, miningAddress], false);
      console.log(`Mined ${blocksToGenerate} blocks to confirm transaction`);

      // TODO: Mint Alkane tokens (DIESEL, frBTC, bUSD)
      // This would require:
      // - Calling OYL API to create alkane token transactions
      // - Or implementing direct protocol calls
      // For now, just sending BTC which can be wrapped to frBTC

      return NextResponse.json({
        success: true,
        address,
        txid,
        blocksGenerated: blocksToGenerate,
        blockHashes: blockHashes.slice(0, 2), // Just show first 2 blocks
        message: `Successfully sent ${btcAmount} BTC and mined ${blocksToGenerate} blocks`,
        note: 'Alkane token minting (DIESEL, frBTC, bUSD) requires OYL API integration',
      });

    } catch (rpcError: any) {
      console.error('Bitcoin RPC error:', rpcError);
      
      // Provide helpful error messages
      if (rpcError.message === 'BITCOIN_NODE_NOT_RUNNING' || rpcError.message?.includes('connect') || rpcError.message?.includes('ECONNREFUSED')) {
        return NextResponse.json({
          error: 'Bitcoin regtest node is not running',
          details: 'The minting feature requires a local Bitcoin regtest node',
          setup: [
            '1. Install Bitcoin Core: https://bitcoin.org/en/download',
            '2. Create ~/.bitcoin/bitcoin.conf with regtest settings',
            '3. Start node: bitcoind -regtest -daemon',
            '4. Create wallet: bitcoin-cli -regtest createwallet "test"',
            '5. Generate blocks: bitcoin-cli -regtest generatetoaddress 101 $(bitcoin-cli -regtest getnewaddress)',
          ],
          hint: 'See docs/REGTEST_SETUP.md for detailed instructions',
          note: 'This is optional - you can still use the app without minting',
        }, { status: 503 });
      }

      if (rpcError.message?.includes('auth')) {
        return NextResponse.json({
          error: 'Bitcoin RPC authentication failed',
          details: 'Check BITCOIN_RPC_USER and BITCOIN_RPC_PASSWORD in .env.local',
          hint: 'Default credentials: user=subfrost, password=subfrost123',
        }, { status: 503 });
      }

      throw rpcError;
    }

  } catch (error: any) {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      error: error.message,
      stack: error.stack,
      rpcConfig: {
        url: process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443',
        user: process.env.BITCOIN_RPC_USER || 'bitcoinrpc',
        wallet: process.env.BITCOIN_RPC_WALLET || 'test',
      }
    };
    
    console.error('=== Mint API error ===');
    console.error(JSON.stringify(errorLog, null, 2));
    console.error('======================');
    
    return NextResponse.json(
      { 
        error: 'Failed to mint tokens',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp,
      },
      { status: 500 }
    );
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to mint tokens.' },
    { status: 405 }
  );
}
