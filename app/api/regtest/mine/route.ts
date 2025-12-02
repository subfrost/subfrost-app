import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const BITCOIND_CONTAINER = process.env.BITCOIND_CONTAINER || 'alkanes-rs-bitcoind-1';
const RPC_USER = process.env.RPC_USER || 'bitcoinrpc';
const RPC_PASSWORD = process.env.RPC_PASSWORD || 'bitcoinrpc';

export async function POST(request: NextRequest) {
  // Only allow in development/regtest
  if (process.env.NEXT_PUBLIC_NETWORK !== 'regtest') {
    return NextResponse.json(
      { error: 'Mining is only available on regtest network' },
      { status: 403 }
    );
  }

  try {
    const { address, blocks = 1 } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Validate address format (basic check for regtest addresses)
    if (!address.startsWith('bcrt1')) {
      return NextResponse.json(
        { error: 'Invalid regtest address format' },
        { status: 400 }
      );
    }

    // Limit blocks to prevent abuse
    const blockCount = Math.min(Math.max(1, blocks), 500);

    // Execute bitcoin-cli generatetoaddress via Docker
    const command = `docker exec ${BITCOIND_CONTAINER} /opt/bitcoin-28.0/bin/bitcoin-cli -regtest -rpcuser=${RPC_USER} -rpcpassword=${RPC_PASSWORD} generatetoaddress ${blockCount} ${address}`;

    console.log(`[Regtest Mine] Mining ${blockCount} blocks to ${address}`);

    const { stdout, stderr } = await execAsync(command, { timeout: 60000 });

    if (stderr && !stderr.includes('Warning')) {
      console.error('[Regtest Mine] Error:', stderr);
      return NextResponse.json(
        { error: stderr },
        { status: 500 }
      );
    }

    // Parse the result (array of block hashes)
    let blockHashes: string[] = [];
    try {
      blockHashes = JSON.parse(stdout);
    } catch {
      blockHashes = stdout.trim().split('\n').filter(Boolean);
    }

    // Get the new block count after mining
    const { stdout: blockCountStr } = await execAsync(
      `docker exec ${BITCOIND_CONTAINER} /opt/bitcoin-28.0/bin/bitcoin-cli -regtest -rpcuser=${RPC_USER} -rpcpassword=${RPC_PASSWORD} getblockcount`,
      { timeout: 10000 }
    );
    const newBlockHeight = parseInt(blockCountStr.trim(), 10);

    console.log(`[Regtest Mine] Successfully mined ${blockHashes.length} blocks. New height: ${newBlockHeight}`);

    return NextResponse.json({
      success: true,
      blocks: blockHashes.length,
      address,
      hashes: blockHashes.slice(0, 5), // Return first 5 hashes
      newBlockHeight, // Return the expected block height for esplora sync check
    });
  } catch (error) {
    console.error('[Regtest Mine] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for common Docker errors
    if (message.includes('Cannot connect to the Docker daemon')) {
      return NextResponse.json(
        { error: 'Docker is not running. Please start Docker.' },
        { status: 500 }
      );
    }

    if (message.includes('No such container')) {
      return NextResponse.json(
        { error: `Bitcoin container "${BITCOIND_CONTAINER}" not found. Is the alkanes-rs stack running?` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
