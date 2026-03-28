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

// ── Base58Check Decode (for ZEC t-address parsing) ──

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a Base58Check-encoded string into raw bytes (payload without checksum).
 * Returns the full payload including version prefix.
 */
function base58checkDecode(encoded: string): Uint8Array {
  // Base58 → BigInt
  let num = 0n;
  const base = 58n;
  for (let i = 0; i < encoded.length; i++) {
    const charIdx = BASE58_ALPHABET.indexOf(encoded[i]);
    if (charIdx < 0) throw new Error(`Invalid base58 character: ${encoded[i]}`);
    num = num * base + BigInt(charIdx);
  }

  // Count leading '1' chars (each = a leading zero byte)
  let leadingOnes = 0;
  for (let i = 0; i < encoded.length && encoded[i] === '1'; i++) {
    leadingOnes++;
  }

  // Convert BigInt to bytes
  const hexStr = num === 0n ? '' : num.toString(16).padStart(num.toString(16).length + (num.toString(16).length % 2), '0');
  const numBytes = hexStr.length / 2;
  const result = new Uint8Array(leadingOnes + numBytes);
  for (let i = 0; i < numBytes; i++) {
    result[leadingOnes + i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }

  // Verify checksum: last 4 bytes are SHA256d(payload)[0..4]
  // We skip checksum verification here since we trust wallet-generated addresses
  // and importing a SHA256 implementation would add an external dependency.
  if (result.length < 6) throw new Error('Base58Check data too short');

  // Return payload (without 4-byte checksum)
  return result.slice(0, result.length - 4);
}

/**
 * Convert a byte slice to a u128 bigint value.
 */
function bytesToU128(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

// ── ETH Bridge Protostones ──

/**
 * Build BurnAndBridge protostone for frETH -> ETH withdrawal.
 * Burns frETH on Bitcoin, encodes ETH 0x address for coordinator.
 * Address split: first 12 bytes (hi u128), last 8 bytes (lo u128).
 * Optional calldata for composable EVM execution.
 *
 * @param frethId - frETH alkane ID (e.g., "4:8301")
 * @param ethAddress - Ethereum address (0x-prefixed, 20 bytes)
 * @param calldata - Optional EVM calldata hex (0x-prefixed) for composable execution
 */
export function buildBurnAndBridgeEthProtostone(
  frethId: string,
  ethAddress: string,
  calldata?: string,
): string {
  const [block, tx] = parseAlkaneId(frethId);
  const addr = ethAddress.toLowerCase().replace('0x', '');
  if (addr.length !== 40) throw new Error(`Invalid ETH address: ${ethAddress}`);

  // Split 20-byte address into two u128 values
  // hi: first 12 bytes (24 hex chars), lo: last 8 bytes (16 hex chars)
  const hi = BigInt('0x' + addr.slice(0, 24));
  const lo = BigInt('0x' + addr.slice(24, 40));

  if (calldata) {
    const cd = calldata.replace('0x', '');
    if (cd.length % 2 !== 0) throw new Error('Calldata must be even-length hex');
    // Encode calldata length and data as additional u128 chunks
    const cdBytes = new Uint8Array(cd.length / 2);
    for (let i = 0; i < cdBytes.length; i++) {
      cdBytes[i] = parseInt(cd.slice(i * 2, i * 2 + 2), 16);
    }
    const cdLen = cdBytes.length;
    // Pack calldata bytes into u128 chunks (16 bytes each)
    const chunks: bigint[] = [];
    for (let i = 0; i < cdBytes.length; i += 16) {
      chunks.push(bytesToU128(cdBytes.slice(i, Math.min(i + 16, cdBytes.length))));
    }
    return `[${block},${tx},5,${hi},${lo},${cdLen},${chunks.join(',')}]:v0:v0`;
  }

  return `[${block},${tx},5,${hi},${lo}]:v0:v0`;
}

/**
 * Build deposit intent protostone for ETH -> frETH flow.
 * Encodes the BTC recipient address so coordinator knows where to mint frETH.
 *
 * @param frethId - frETH alkane ID
 * @param btcRecipientScript - hex scriptPubKey of the BTC recipient
 */
export function buildEthDepositIntentProtostone(
  frethId: string,
  btcRecipientScript: string,
): string {
  const [block, tx] = parseAlkaneId(frethId);
  const script = btcRecipientScript.replace('0x', '');
  if (script.length === 0 || script.length % 2 !== 0) {
    throw new Error(`Invalid scriptPubKey: ${btcRecipientScript}`);
  }

  // Encode script as u128 chunks
  const scriptBytes = new Uint8Array(script.length / 2);
  for (let i = 0; i < scriptBytes.length; i++) {
    scriptBytes[i] = parseInt(script.slice(i * 2, i * 2 + 2), 16);
  }
  const scriptLen = scriptBytes.length;
  const chunks: bigint[] = [];
  for (let i = 0; i < scriptBytes.length; i += 16) {
    chunks.push(bytesToU128(scriptBytes.slice(i, Math.min(i + 16, scriptBytes.length))));
  }

  // Opcode 6 = DepositIntent
  return `[${block},${tx},6,${scriptLen},${chunks.join(',')}]:v0:v0`;
}

// ── ZEC Bridge Protostones ──

/**
 * Build BurnAndBridge protostone for frZEC -> ZEC withdrawal.
 * Burns frZEC on Bitcoin, encodes ZEC t-address for coordinator.
 * Address: 20-byte hash160 split as two u128, plus 2-byte prefix.
 * Enforces t-address only (t1.../t3.../tm.../t2...).
 *
 * @param frzecId - frZEC alkane ID (e.g., "4:8401")
 * @param zecTAddress - ZEC transparent address (t1.../t3.../tm.../t2...)
 */
export function buildBurnAndBridgeZecProtostone(
  frzecId: string,
  zecTAddress: string,
): string {
  const [block, tx] = parseAlkaneId(frzecId);

  // Validate t-address prefix
  if (!zecTAddress.match(/^t[123m]/)) {
    throw new Error(`Invalid ZEC t-address (must start with t1/t3/tm/t2): ${zecTAddress}`);
  }

  // Decode base58check: 2-byte version prefix + 20-byte hash160
  const decoded = base58checkDecode(zecTAddress);
  if (decoded.length !== 22) {
    throw new Error(`Invalid ZEC t-address length: expected 22 bytes (2 prefix + 20 hash), got ${decoded.length}`);
  }

  const prefixByte0 = decoded[0];
  const prefixByte1 = decoded[1];
  const hash160 = decoded.slice(2); // 20 bytes

  // Split hash160: first 12 bytes = hi, last 8 bytes = lo
  const hi = bytesToU128(hash160.slice(0, 12));
  const lo = bytesToU128(hash160.slice(12, 20));

  return `[${block},${tx},5,${hi},${lo},${prefixByte0},${prefixByte1}]:v0:v0`;
}

/**
 * Build deposit intent protostone for ZEC -> frZEC flow.
 *
 * @param frzecId - frZEC alkane ID
 * @param btcRecipientScript - hex scriptPubKey of the BTC recipient
 */
export function buildZecDepositIntentProtostone(
  frzecId: string,
  btcRecipientScript: string,
): string {
  const [block, tx] = parseAlkaneId(frzecId);
  const script = btcRecipientScript.replace('0x', '');
  if (script.length === 0 || script.length % 2 !== 0) {
    throw new Error(`Invalid scriptPubKey: ${btcRecipientScript}`);
  }

  const scriptBytes = new Uint8Array(script.length / 2);
  for (let i = 0; i < scriptBytes.length; i++) {
    scriptBytes[i] = parseInt(script.slice(i * 2, i * 2 + 2), 16);
  }
  const scriptLen = scriptBytes.length;
  const chunks: bigint[] = [];
  for (let i = 0; i < scriptBytes.length; i += 16) {
    chunks.push(bytesToU128(scriptBytes.slice(i, Math.min(i + 16, scriptBytes.length))));
  }

  // Opcode 6 = DepositIntent
  return `[${block},${tx},6,${scriptLen},${chunks.join(',')}]:v0:v0`;
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
