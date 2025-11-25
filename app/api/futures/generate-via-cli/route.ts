/**
 * API Route: Generate Future via CLI
 * 
 * Alternative approach that shells out to alkanes-cli instead of calling RPC directly.
 * This avoids any RPC connection issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  console.log('[API-CLI] Generate future via CLI called');
  
  try {
    const alkanesDir = process.env.ALKANES_DIR || `${process.env.HOME}/alkanes-rs`;
    const cliPath = `${alkanesDir}/target/release/alkanes-cli`;
    
    console.log('[API-CLI] Using CLI at:', cliPath);
    
    // Execute the CLI command
    const command = `${cliPath} -p regtest bitcoind generatefuture`;
    console.log('[API-CLI] Executing:', command);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
    });
    
    console.log('[API-CLI] stdout:', stdout);
    if (stderr) {
      console.log('[API-CLI] stderr:', stderr);
    }
    
    // Extract block hash from output
    const blockHashMatch = stdout.match(/Block hash: ([a-f0-9]+)/i);
    const blockHash = blockHashMatch ? blockHashMatch[1] : 'unknown';
    
    console.log('[API-CLI] Success! Block hash:', blockHash);
    
    return NextResponse.json({
      success: true,
      blockHash,
      output: stdout,
    });
  } catch (error) {
    console.error('[API-CLI] ERROR:', error);
    console.error('[API-CLI] Error details:', error instanceof Error ? error.message : 'Unknown');
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check server logs for details'
      },
      { status: 500 }
    );
  }
}
