/* tslint:disable */
/* eslint-disable */

/**
 * WASM-accessible wrapper around the peer health tracker.
 */
export class WasmHealthTracker {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the group has enough active signers to produce a signature.
     */
    can_sign(): boolean;
    /**
     * Number of currently active (online + not-banned) signers.
     */
    effective_group_size(): number;
    /**
     * Check whether a peer is banned (score < 0).
     */
    is_banned(id: number): boolean;
    /**
     * Create a new health tracker.
     *
     * * `threshold` - minimum signers required for a threshold signature
     * * `max_signers` - total number of signers in the group
     */
    constructor(threshold: number, max_signers: number);
    /**
     * Record a successful signing contribution for a peer.
     */
    record_success(id: number): void;
    /**
     * Record a timeout event for a peer in the given round.
     */
    record_timeout(id: number, round: bigint): void;
    /**
     * Register a peer by its 1-based signer index.
     */
    register_peer(id: number): void;
    /**
     * Export the full tracker state as a JSON object.
     */
    to_json(): any;
}

/**
 * Derive a BIP-341 P2TR Bitcoin address from a FROST group public key.
 *
 * * `pub_key_package_json` - JSON-serialized `PublicKeyPackage`
 * * `network` - one of "bitcoin", "mainnet", "testnet", "signet", "regtest"
 *
 * Returns the bech32m-encoded taproot address string.
 */
export function frost_derive_taproot_address(pub_key_package_json: string, network: string): string;

/**
 * Perform FROST DKG round 1 for a single participant.
 *
 * `identifier_index` is the 1-based signer index.
 * Returns a JS object: `{ secret_package: ..., package: ... }`
 */
export function frost_dkg_part1(identifier_index: number, max_signers: number, min_signers: number): any;

/**
 * Run FROST trusted-dealer key generation.
 *
 * Returns a JS object: `{ key_packages: { "1": ..., "2": ... }, public_key_package: ... }`
 */
export function frost_keygen_dealer(threshold: number, max_signers: number): any;

/**
 * Sign a message using one or more key packages (performs both FROST rounds locally).
 *
 * This is suitable for local/testing scenarios where one process holds
 * enough key packages to meet the threshold. Pass a JSON array of key
 * packages — at least `min_signers` are required.
 *
 * * `key_packages_json` - JSON array of serialized `KeyPackage` objects
 * * `pub_key_package_json` - JSON-serialized `PublicKeyPackage`
 * * `message` - raw message bytes to sign
 *
 * Returns the 64-byte Schnorr signature.
 */
export function frost_sign(key_packages_json: string, pub_key_package_json: string, message: Uint8Array): Uint8Array;

/**
 * Verify a FROST signature against the group public key.
 *
 * * `pub_key_package_json` - JSON-serialized `PublicKeyPackage`
 * * `message` - the original message bytes
 * * `signature` - the 64-byte Schnorr signature
 *
 * Returns `true` if the signature is valid.
 */
export function frost_verify(pub_key_package_json: string, message: Uint8Array, signature: Uint8Array): boolean;

/**
 * Initialize the panic hook for better error messages in WASM.
 * Call this once early in your application.
 */
export function init(): void;

/**
 * Parse a signal manifest from TOML and return a validated graph as JSON.
 *
 * * `manifest_toml` - the TOML source text of the signal manifest
 *
 * Returns a JS object representing the parsed manifest nodes.
 */
export function signal_parse_manifest(manifest_toml: string): any;

/**
 * Return the crate version (from Cargo.toml).
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmhealthtracker_free: (a: number, b: number) => void;
    readonly frost_derive_taproot_address: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly frost_dkg_part1: (a: number, b: number, c: number) => [number, number, number];
    readonly frost_keygen_dealer: (a: number, b: number) => [number, number, number];
    readonly frost_sign: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly frost_verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly signal_parse_manifest: (a: number, b: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly wasmhealthtracker_can_sign: (a: number) => number;
    readonly wasmhealthtracker_effective_group_size: (a: number) => number;
    readonly wasmhealthtracker_is_banned: (a: number, b: number) => [number, number, number];
    readonly wasmhealthtracker_new: (a: number, b: number) => [number, number, number];
    readonly wasmhealthtracker_record_success: (a: number, b: number) => [number, number];
    readonly wasmhealthtracker_record_timeout: (a: number, b: number, c: bigint) => [number, number];
    readonly wasmhealthtracker_register_peer: (a: number, b: number) => [number, number];
    readonly wasmhealthtracker_to_json: (a: number) => [number, number, number];
    readonly init: () => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
