/**
 * Protostone Builder — constructs OP_RETURN protostone strings for bridge operations.
 *
 * Protostones encode the intent of what to do with bridged frUSD on Bitcoin.
 * Format: [block,tx,opcode,args...]:pointer:refund:[edict1],[edict2],...
 *
 * The protostone is embedded in the Bitcoin transaction's OP_RETURN output
 * and processed by the alkanes runtime when the block is indexed.
 *
 * References:
 * - ~/subfrost-erc20/src/libraries/ProtostoneParser.sol (Solidity parser)
 * - ~/subfrost-erc20/coordinator-usd/src/protostone.rs (Rust builder)
 */

/**
 * Parse an alkane ID string "block:tx" into components.
 */
function parseAlkaneId(id: string): [string, string] {
  const [block, tx] = id.split(':');
  if (!block || !tx) throw new Error(`Invalid alkane ID: ${id}`);
  return [block, tx];
}

/**
 * Build a protostone for swapping via the AMM factory (opcode 13).
 *
 * SwapExactTokensForTokens: [factory_block, factory_tx, 13, path_len, ...path_ids, amount_in, min_out, deadline]
 *
 * @param factoryId - AMM factory alkane ID (e.g., "4:65498")
 * @param path - Array of alkane IDs forming the swap path (e.g., ["4:8201", "32:0"] for frUSD → frBTC)
 * @param amountIn - Input amount in base units
 * @param minOut - Minimum output amount (slippage protection)
 * @param deadline - Block height deadline
 */
export function buildAmmSwapProtostone(
  factoryId: string,
  path: string[],
  amountIn: bigint | string,
  minOut: bigint | string,
  deadline: number | string,
): string {
  const [fBlock, fTx] = parseAlkaneId(factoryId);
  const pathParts = path.flatMap(id => parseAlkaneId(id));

  return `[${fBlock},${fTx},13,${path.length},${pathParts.join(',')},${amountIn},${minOut},${deadline}]:v0:v0`;
}

/**
 * Build a protostone for swapping via the synth pool (StableSwap).
 *
 * Synth pool uses opcode 3 (Swap) with the input token as incomingAlkanes.
 *
 * @param synthPoolId - Synth pool alkane ID (e.g., "4:8202")
 * @param minOut - Minimum output amount
 * @param deadline - Block height deadline
 */
export function buildSynthPoolSwapProtostone(
  synthPoolId: string,
  minOut: bigint | string,
  deadline: number | string,
): string {
  const [pBlock, pTx] = parseAlkaneId(synthPoolId);
  return `[${pBlock},${pTx},3,${minOut},${deadline}]:v0:v0`;
}

/**
 * Build a protostone for adding liquidity to a pool.
 *
 * Pool opcode 1 (AddLiquidity) expects two tokens in incomingAlkanes.
 *
 * @param poolId - Pool alkane ID
 */
export function buildAddLiquidityProtostone(poolId: string): string {
  const [pBlock, pTx] = parseAlkaneId(poolId);
  return `[${pBlock},${pTx},1]:v0:v0`;
}

/**
 * Build a protostone for minting frUSD (coordinator use).
 *
 * frUSD opcode 1 (Mint) requires auth token in incomingAlkanes.
 *
 * @param frusdId - frUSD alkane ID (e.g., "4:8201")
 * @param amount - Amount to mint (18 decimals)
 */
export function buildMintFrusdProtostone(
  frusdId: string,
  amount: bigint | string,
): string {
  const [block, tx] = parseAlkaneId(frusdId);
  return `[${block},${tx},1,${amount}]:v0:v0`;
}

/**
 * Build a protostone for BurnAndBridge (frUSD → EVM withdrawal).
 *
 * frUSD opcode 5 (BurnAndBridge) encodes the EVM recipient address.
 * The address is split into two u128 values (hi 12 bytes, lo 8 bytes).
 *
 * @param frusdId - frUSD alkane ID
 * @param evmAddress - Ethereum address (0x-prefixed, 20 bytes)
 */
export function buildBurnAndBridgeProtostone(
  frusdId: string,
  evmAddress: string,
): string {
  const [block, tx] = parseAlkaneId(frusdId);
  const addr = evmAddress.toLowerCase().replace('0x', '');
  if (addr.length !== 40) throw new Error(`Invalid EVM address: ${evmAddress}`);

  // Split 20-byte address into two u128 values for the contract
  // hi: first 12 bytes, lo: last 8 bytes
  const hi = BigInt('0x' + addr.slice(0, 24));
  const lo = BigInt('0x' + addr.slice(24, 40));

  return `[${block},${tx},5,${hi},${lo}]:v0:v0`;
}

/**
 * Build a composed protostone for bridge-to-BTC:
 * frUSD → synth pool swap → frBTC → unwrap → BTC
 *
 * This requires two protostones:
 * p0: edict transferring frUSD to p1
 * p1: synth pool swap (frUSD → frBTC)
 *
 * The unwrap step would need a separate transaction after the swap confirms.
 * For atomic execution, the coordinator would need to compose this into the mint tx.
 */
export function buildBridgeToBtcProtostone(
  synthPoolId: string,
  frusdAmount: bigint | string,
  minFrbtcOut: bigint | string,
  deadline: number | string,
): string {
  // Single protostone: swap frUSD for frBTC via synth pool
  // The frUSD arrives as incomingAlkanes from the mint operation
  return buildSynthPoolSwapProtostone(synthPoolId, minFrbtcOut, deadline);
}

/**
 * Build a protostone for placing a CLOB limit order via carbine controller.
 *
 * @param controllerId - Carbine controller alkane ID
 * @param pairTokenA - First token in pair
 * @param pairTokenB - Second token in pair
 * @param side - 0 = buy, 1 = sell
 * @param price - Order price
 * @param amount - Order amount
 */
export function buildLimitOrderProtostone(
  controllerId: string,
  pairTokenA: string,
  pairTokenB: string,
  side: 0 | 1,
  price: bigint | string,
  amount: bigint | string,
): string {
  const [cBlock, cTx] = parseAlkaneId(controllerId);
  const [aBlock, aTx] = parseAlkaneId(pairTokenA);
  const [bBlock, bTx] = parseAlkaneId(pairTokenB);

  return `[${cBlock},${cTx},20,${aBlock},${aTx},${bBlock},${bTx},${side},${price},${amount}]:v0:v0`;
}

/**
 * Validate a protostone string format.
 * Returns null if valid, error message if invalid.
 */
export function validateProtostone(protostone: string): string | null {
  // Must start with [ and contain ]:
  if (!protostone.startsWith('[')) return 'Must start with [';
  const cellpackEnd = protostone.indexOf(']');
  if (cellpackEnd < 0) return 'Missing closing ]';

  // Must have pointer and refund after cellpack
  const rest = protostone.slice(cellpackEnd + 1);
  const parts = rest.split(':');
  if (parts.length < 3) return 'Missing pointer or refund (need [cellpack]:pointer:refund)';

  // Pointer must be vN or pN
  const pointer = parts[1];
  if (!pointer.match(/^[vp]\d+$/)) return `Invalid pointer: ${pointer}`;

  const refund = parts[2];
  if (!refund.match(/^[vp]\d+$/)) return `Invalid refund: ${refund}`;

  return null;
}
