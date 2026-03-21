/* tslint:disable */
/* eslint-disable */
/**
 * Generate FROST key shares using dealer-based key generation.
 *
 * Returns a JSON-serialized FrostKeyBundle containing all key packages
 * and the group public key package.
 */
export function generate_frost_keys(signers: number, threshold: number): string;
/**
 * Sign a 32-byte sighash using FROST threshold signing.
 *
 * Performs the full FROST ceremony locally:
 *   1. round1::commit() — generate nonces and commitments for `threshold` signers
 *   2. round2::sign_with_tweak() — generate signature shares
 *   3. frost::aggregate_with_tweak() — combine shares into group signature
 *
 * Returns a 64-byte Schnorr signature compatible with Bitcoin's BIP340/taproot.
 */
export function sign_sighash(bundle_json: string, sighash: Uint8Array): Uint8Array;
/**
 * Extract the 32-byte x-only group public key from a FrostKeyBundle.
 *
 * This is the key used to derive the P2TR (taproot) address that the
 * FROST group controls. In Bitcoin, this becomes the internal key for
 * a pay-to-taproot output.
 */
export function get_group_public_key(bundle_json: string): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly generate_frost_keys: (a: number, b: number) => [number, number, number, number];
  readonly get_group_public_key: (a: number, b: number) => [number, number, number, number];
  readonly sign_sighash: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
