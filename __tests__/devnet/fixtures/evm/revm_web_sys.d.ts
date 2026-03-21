/* tslint:disable */
/* eslint-disable */
export class EvmDevnet {
  free(): void;
  /**
   * Advance block number + timestamp.
   */
  mine_block(): void;
  /**
   * Fund an address with ETH (wei as hex string).
   */
  fund_account(address: string, wei_hex: string): void;
  get_block_number(): bigint;
  /**
   * Get last receipt JSON.
   */
  get_last_receipt(): string;
  /**
   * State-changing transaction.
   */
  eth_send_transaction(from: string, to: string, data_hex: string, value_hex: string): string;
  constructor();
  /**
   * Deploy a contract. Returns the deployed address as hex.
   */
  deploy(from: string, bytecode_hex: string): string;
  /**
   * Read-only call (eth_call).
   */
  eth_call(to: string, data_hex: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_evmdevnet_free: (a: number, b: number) => void;
  readonly evmdevnet_deploy: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly evmdevnet_eth_call: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly evmdevnet_eth_send_transaction: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
  readonly evmdevnet_fund_account: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly evmdevnet_get_block_number: (a: number) => bigint;
  readonly evmdevnet_get_last_receipt: (a: number) => [number, number];
  readonly evmdevnet_mine_block: (a: number) => void;
  readonly evmdevnet_new: () => number;
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
