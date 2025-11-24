/* tslint:disable */
/* eslint-disable */

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly multisimluate: () => number;
  readonly simulate: () => number;
  readonly sequence: () => number;
  readonly meta: () => number;
  readonly runesbyaddress: () => number;
  readonly unwrap: () => number;
  readonly runesbyoutpoint: () => number;
  readonly spendablesbyaddress: () => number;
  readonly protorunesbyaddress: () => number;
  readonly getblock: () => number;
  readonly protorunesbyheight: () => number;
  readonly alkanes_id_to_outpoint: () => number;
  readonly traceblock: () => number;
  readonly trace: () => number;
  readonly getbytecode: () => number;
  readonly protorunesbyoutpoint: () => number;
  readonly runesbyheight: () => number;
  readonly getinventory: () => number;
  readonly getstorageat: () => number;
  readonly _start: () => void;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
