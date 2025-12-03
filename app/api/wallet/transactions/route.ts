/**
 * API Route: Get transaction history via alkanes-cli
 *
 * Fetches transaction history for an address using alkanes-cli esplora commands.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TransactionRequest {
  address: string;
  network?: 'regtest' | 'mainnet' | 'signet';
}

export async function POST(request: NextRequest) {
  console.log('[API:transactions] Fetching transaction history...');

  try {
    const body: TransactionRequest = await request.json();
    const { address, network = 'regtest' } = body;

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    const alkanesDir = process.env.ALKANES_DIR || `${process.env.HOME}/alkanes-rs`;
    const cliPath = `${alkanesDir}/target/release/alkanes-cli`;

    // Use alkanes-cli to get address transactions
    // esplora address-txs --raw returns transaction history as JSON
    const command = `RUST_LOG=error ${cliPath} -p ${network} esplora address-txs --raw "${address}"`;

    console.log('[API:transactions] Running command:', command);

    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large tx histories
    });

    if (stderr && !stderr.includes('INFO') && !stderr.includes('WARN')) {
      console.error('[API:transactions] stderr:', stderr);
    }

    // Parse the JSON output
    let transactions = [];
    try {
      transactions = JSON.parse(stdout);
    } catch (parseError) {
      console.error('[API:transactions] Failed to parse output:', stdout.substring(0, 500));
      return NextResponse.json({
        error: 'Failed to parse transaction data',
        transactions: []
      });
    }

    console.log(`[API:transactions] Found ${transactions.length} transactions`);

    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length,
    });

  } catch (error) {
    console.error('[API:transactions] ERROR:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        transactions: [],
      },
      { status: 500 }
    );
  }
}
