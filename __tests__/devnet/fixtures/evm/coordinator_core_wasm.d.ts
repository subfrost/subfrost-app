/* tslint:disable */
/* eslint-disable */
/**
 * Build the MarkBridgeProcessed protostone.
 * Opcode 7, args = [bridge_id]
 */
export function build_mark_processed_protostone(frusd_block: number, frusd_tx: number, bridge_id: string): string;
/**
 * Build the protostone string for minting frUSD on Bitcoin.
 *
 * Input: frUSD alkane ID (block:tx), amount to mint.
 * Returns: protostone string like "[4,8192,1,0,0,amount]:v0:v0"
 *
 * Opcode 1 = Mint, args = [to_block, to_tx, amount]
 * to = AlkaneId(0, 0) means mint to the transaction output (user's address)
 */
export function build_mint_protostone(frusd_block: number, frusd_tx: number, amount: string): string;
/**
 * Convert frUSD amount (18 decimals) to USDC amount (6 decimals).
 */
export function frusd_to_usdc(frusd_amount: string): string;
/**
 * Apply protocol fee (10 bps = 0.1%).
 */
export function apply_protocol_fee(amount: string): string;
/**
 * Build EVM withdrawFromBridge calldata.
 *
 * Solidity: withdrawFromBridge(uint256 amount, address target, bytes script)
 * Function selector: keccak256("withdrawFromBridge(uint256,address,bytes)")
 */
export function build_withdraw_calldata(amount_wei: string, recipient: string, script: string): string;
/**
 * Build BIP340 authenticated call message hash.
 *
 * message = keccak256(abi.encode(calldata, nonce, chainId, vaultAddress))
 */
export function build_auth_message_hash(calldata: string, nonce: bigint, chain_id: bigint, vault_address: string): Uint8Array;
/**
 * Parse bridge records from frUSD alkane opcode 6 response.
 * Input: hex-encoded data from alkanes_simulate response.
 * Each record is 58 bytes.
 */
export function parse_bridge_records(data_hex: string): string;
/**
 * Build the protostone string for BurnAndBridge (user burns frUSD).
 *
 * Opcode 5 = BurnAndBridge, args = [eth_addr_hi, eth_addr_lo]
 * eth_addr split into two u128: hi = first 12 bytes, lo = last 8 bytes
 */
export function build_burn_and_bridge_protostone(frusd_block: number, frusd_tx: number, eth_address: string): string;
/**
 * Convert USDC amount (6 decimals) to frUSD amount (18 decimals).
 */
export function usdc_to_frusd(usdc_amount: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly apply_protocol_fee: (a: number, b: number) => [number, number, number, number];
  readonly build_auth_message_hash: (a: number, b: number, c: bigint, d: bigint, e: number, f: number) => [number, number, number, number];
  readonly build_burn_and_bridge_protostone: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly build_mark_processed_protostone: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly build_mint_protostone: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly build_withdraw_calldata: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
  readonly frusd_to_usdc: (a: number, b: number) => [number, number, number, number];
  readonly parse_bridge_records: (a: number, b: number) => [number, number, number, number];
  readonly usdc_to_frusd: (a: number, b: number) => [number, number, number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
