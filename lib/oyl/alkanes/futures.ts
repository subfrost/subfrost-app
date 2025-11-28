/**
 * Futures (ftrBTC) Integration
 * 
 * Provides methods for interacting with ftrBTC futures on regtest.
 * ftrBTC futures are at alkane ID [31, n] where n is the block height.
 * 
 * Commands:
 * - Generate future: alkanes-cli -p regtest bitcoind generatefuture
 * - Claim futures: cellpack [31, 0, 14] targets all pending futures
 */

import type { AlkanesWalletInstance } from './wallet-integration';

/**
 * Future token information
 */
export interface FutureToken {
  id: string; // e.g., "ftrBTC[31:800123]"
  alkaneId: { block: number; tx: number }; // [31, height]
  expiryBlock: number;
  blocksLeft: number;
  timeLeft: string;
  totalSupply: number; // in BTC
  exercised: number; // in BTC
  mempoolQueue: number; // in BTC
  remaining: number; // in BTC
  marketPrice: number; // BTC per 1 ftrBTC
  exercisePrice: number; // BTC per 1 ftrBTC (with premium)
  underlyingYield: string;
  created: string;
}

/**
 * Generate a future on regtest
 * Calls the generatefuture RPC method which creates a coinbase with future-claiming protostone
 * 
 * **IMPORTANT**: This requires patched Bitcoin Core with the generatefuture RPC method.
 * To enable it:
 * 1. cd ~/alkanes-rs
 * 2. docker-compose build bitcoind
 * 3. docker-compose up -d bitcoind
 * 
 * @param rpcUrl - Bitcoin RPC URL (e.g., http://localhost:18443)
 * @returns Block hash of the generated block
 */
export async function generateFuture(rpcUrl: string = 'http://localhost:18443'): Promise<string> {
  // Call our Next.js API route which uses alkanes-cli to generate futures
  // This is the most reliable approach as it uses the exact same CLI command
  const response = await fetch('/api/futures/generate-via-cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const json = await response.json();
  
  if (!response.ok || json.error) {
    throw new Error(json.error || 'Failed to generate future');
  }

  return json.blockHash; // Block hash
}

/**
 * Get all available futures (all deployed futures, not just user's balance)
 * Queries alkanes provider for ALL [31, n] alkanes with bytecode
 * 
 * @param provider - Alkanes provider instance
 * @param currentBlock - Current blockchain height
 * @returns Array of future tokens
 */
export async function getAllFutures(
  provider: any,
  currentBlock: number
): Promise<FutureToken[]> {
  console.log(`[getAllFutures] Checking futures from block ${Math.max(1, currentBlock - 100)} to ${currentBlock}`);
  
  // ftrBTC futures are at [31, n] where n is the block height
  const futures: FutureToken[] = [];
  
  // Query a range of heights (last 100 blocks)
  const startBlock = Math.max(1, currentBlock - 100);
  
  for (let height = startBlock; height <= currentBlock; height++) {
    try {
      // Encode alkane ID as protobuf for metashrew_view call
      // Format: 0a080a0208{block}120208{tx}
      // For [31:height], block=31 (0x1f), tx=height
      const blockHex = (31).toString(16).padStart(2, '0'); // 31 = 0x1f
      const txHex = height.toString(16).padStart(2, '0');
      const params = `0x0a080a0208${blockHex}120208${txHex}`;
      
      // Debug logging for key blocks
      if (height >= 50 && height <= 55) {
        console.log(`[getAllFutures] Checking [31:${height}], params: ${params}`);
      }
      
      // Call metashrew_view to get bytecode
      // Use _call() directly since _metashrewCall() only handles alkanes_ methods
      const result = await provider.alkanes._call('metashrew_view', [
        'getbytecode',
        params,
        'latest'
      ]);
      
      // Debug the result
      if (height >= 50 && height <= 55) {
        console.log(`[getAllFutures] Result for [31:${height}]: ${result ? result.substring(0, 20) + '...' : 'null'} (length: ${result ? result.length : 0})`);
      }
      
      // If we got bytecode, this is a future
      if (result && result !== '0x' && result.length > 100) {
        console.log(`[getAllFutures] ✅ Found future at [31:${height}] with bytecode length: ${(result.length - 2) / 2}`);
        const blocksLeft = Math.max(0, height + 100 - currentBlock); // Assume 100 block expiry
        const timeLeft = formatBlocksToTime(blocksLeft);
        
        // Mock supply data - in real impl, would query contract storage
        const totalSupply = 100.0; // Mock: 100 BTC per future
        const exercised = Math.random() * 30; // Mock: random exercised amount
        const mempoolQueue = Math.random() * 5; // Mock: random queue amount
        
        futures.push({
          id: `ftrBTC[31:${height}]`,
          alkaneId: { block: 31, tx: height },
          expiryBlock: height + 100,
          blocksLeft,
          timeLeft,
          totalSupply,
          exercised,
          mempoolQueue,
          remaining: totalSupply - exercised - mempoolQueue,
          marketPrice: calculateMarketPrice(blocksLeft),
          exercisePrice: calculateExercisePrice(blocksLeft),
          underlyingYield: 'auto-compounding',
          created: `${currentBlock - height} blocks ago`,
        });
      }
    } catch (error) {
      // Skip if alkane doesn't exist (this is expected for most blocks)
      if (height >= 50 && height <= 55) {
        console.error(`[getAllFutures] Error at [31:${height}]:`, error);
      } else if (height % 10 === 0) {
        console.log(`[getAllFutures] No future at [31:${height}]`);
      }
      continue;
    }
  }
  
  console.log(`[getAllFutures] Found ${futures.length} total futures`);
  return futures;
}

/**
 * Get futures for a specific address (user's balance)
 * Queries alkanes provider for balance of all [31, n] alkanes
 * 
 * @param provider - Alkanes provider instance
 * @param address - Bitcoin address to check
 * @param currentBlock - Current blockchain height
 * @returns Array of future tokens owned by address
 */
export async function getFutures(
  provider: any,
  address: string,
  currentBlock: number
): Promise<FutureToken[]> {
  // For now, just return all futures (balance checking not fully implemented)
  return getAllFutures(provider, currentBlock);
}

/**
 * Claim pending futures by calling [31, 0, 14]
 * This cellpack targets all futures pending from previous generatefuture invocations
 * 
 * @param wallet - Alkanes wallet instance
 * @param provider - Alkanes provider instance
 * @returns Transaction ID of the claim transaction
 */
export async function claimFutures(
  wallet: AlkanesWalletInstance,
  provider: any
): Promise<string> {
  // Build cellpack [31, 0, 14] to claim all pending futures
  const cellpack = {
    target: { block: 31, tx: 0 },
    inputs: [14], // Opcode 14 = claim futures
  };
  
  // Build and sign transaction with cellpack
  // This would use the wallet's PSBT signing capabilities
  // For now, return a mock txid
  throw new Error('Claiming futures not yet implemented - need PSBT builder with cellpack support');
}

/**
 * Calculate market price based on blocks until expiry
 * Market price approaches 1 BTC as expiry nears
 */
function calculateMarketPrice(blocksLeft: number): number {
  if (blocksLeft <= 0) return 1.0;
  if (blocksLeft <= 10) return 0.998;
  if (blocksLeft <= 20) return 0.990;
  if (blocksLeft <= 50) return 0.975;
  return 0.965;
}

/**
 * Calculate exercise price (with premium)
 * Exercise price is slightly lower than market price
 */
function calculateExercisePrice(blocksLeft: number): number {
  const market = calculateMarketPrice(blocksLeft);
  // Exercise price is ~0.5-2% lower than market
  const premium = 0.005 + (blocksLeft / 100) * 0.015;
  return market - premium;
}

/**
 * Format blocks to human-readable time
 */
function formatBlocksToTime(blocks: number): string {
  if (blocks <= 0) return 'Expired';
  if (blocks === 1) return '1 block';
  if (blocks < 60) return `${blocks} blocks`;
  
  const hours = Math.floor(blocks / 6);
  if (hours === 1) return '~1 hour';
  if (hours < 24) return `~${hours} hours`;
  
  const days = Math.floor(hours / 24);
  return `~${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Get current block height from provider
 * Uses the new AlkanesProvider API (provider.getBlockHeight() or provider.bitcoin.getBlockCount())
 */
export async function getCurrentBlockHeight(provider: any): Promise<number> {
  try {
    // Try the new AlkanesProvider method first
    if (typeof provider.getBlockHeight === 'function') {
      return await provider.getBlockHeight();
    }
    // Fallback to bitcoin RPC client
    if (provider.bitcoin && typeof provider.bitcoin.getBlockCount === 'function') {
      return await provider.bitcoin.getBlockCount();
    }
    throw new Error('Provider does not support getBlockHeight or bitcoin.getBlockCount');
  } catch (error) {
    console.error('Failed to get block height:', error);
    throw error;
  }
}

/**
 * Trade a future (buy or sell)
 * This would integrate with the OYL AMM for swapping ftrBTC
 * 
 * @param wallet - Alkanes wallet instance
 * @param provider - Alkanes provider instance
 * @param futureId - Future alkane ID
 * @param amount - Amount to trade (in BTC)
 * @param action - 'buy' or 'sell'
 * @returns Transaction ID
 */
export async function tradeFuture(
  wallet: AlkanesWalletInstance,
  provider: any,
  futureId: { block: number; tx: number },
  amount: number,
  action: 'buy' | 'sell'
): Promise<string> {
  // This would use the OYL AMM to swap frBTC <-> ftrBTC
  // For now, throw not implemented
  throw new Error('Trading futures not yet implemented - needs OYL AMM integration');
}
