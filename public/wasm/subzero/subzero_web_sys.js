/**
 * Bridge coordinator that delegates I/O to JavaScript callbacks via JsFuture.
 *
 * Usage from JS/TS:
 * ```js
 * const coordinator = new WasmBridgeCoordinator(
 *   async (chain, fromBlock) => JSON.stringify(events),  // poll_fn
 *   async (chain) => currentHeight,                       // height_fn
 *   async (scheme, sighashHex) => signatureHex,          // sign_fn
 *   async (chain, txHex) => JSON.stringify(broadcastResult), // broadcast_fn
 * );
 *
 * const result = await coordinator.run_round();
 * console.log(JSON.parse(result));  // RoundResult
 * ```
 */
export class WasmBridgeCoordinator {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmBridgeCoordinator.prototype);
        obj.__wbg_ptr = ptr;
        WasmBridgeCoordinatorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmBridgeCoordinatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmbridgecoordinator_free(ptr, 0);
    }
    /**
     * Get the current chain height via `height_fn`. Useful for JS to check
     * chain tips without running a full round.
     * @param {string} chain
     * @returns {Promise<bigint>}
     */
    chain_height(chain) {
        const ptr0 = passStringToWasm0(chain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbridgecoordinator_chain_height(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get the block cursor for a chain (e.g. "btc", "evm", "zec").
     * @param {string} chain
     * @returns {bigint}
     */
    cursor(chain) {
        const ptr0 = passStringToWasm0(chain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbridgecoordinator_cursor(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return BigInt.asUintN(64, ret[0]);
    }
    /**
     * Create a new bridge coordinator with JS callback functions.
     *
     * # Arguments
     * * `poll_fn` — `(chain: string, fromBlock: number) => Promise<string>` returning JSON
     *   array of `ChainEvent` objects
     * * `height_fn` — `(chain: string) => Promise<number>` returning current block height
     * * `sign_fn` — `(scheme: string, sighash_hex: string) => Promise<string>` returning
     *   hex-encoded signature bytes
     * * `broadcast_fn` — `(chain: string, tx_hex: string) => Promise<string>` returning JSON
     *   `BroadcastResult`
     * @param {Function} poll_fn
     * @param {Function} height_fn
     * @param {Function} sign_fn
     * @param {Function} broadcast_fn
     */
    constructor(poll_fn, height_fn, sign_fn, broadcast_fn) {
        const ret = wasm.wasmbridgecoordinator_new(poll_fn, height_fn, sign_fn, broadcast_fn);
        this.__wbg_ptr = ret >>> 0;
        WasmBridgeCoordinatorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Create a coordinator that only polls the specified chains.
     *
     * `chains_json` is a JSON array of chain strings, e.g. `["btc", "evm"]`.
     * @param {Function} poll_fn
     * @param {Function} height_fn
     * @param {Function} sign_fn
     * @param {Function} broadcast_fn
     * @param {string} chains_json
     * @returns {WasmBridgeCoordinator}
     */
    static newWithChains(poll_fn, height_fn, sign_fn, broadcast_fn, chains_json) {
        const ptr0 = passStringToWasm0(chains_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbridgecoordinator_newWithChains(poll_fn, height_fn, sign_fn, broadcast_fn, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmBridgeCoordinator.__wrap(ret[0]);
    }
    /**
     * Get the number of pending (in-flight) operations.
     * @returns {number}
     */
    pending_count() {
        const ret = wasm.wasmbridgecoordinator_pending_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get the current completed round count.
     * @returns {bigint}
     */
    rounds() {
        const ret = wasm.wasmbridgecoordinator_rounds(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Run one coordinator round:
     * 1. Poll all chains for new events via `poll_fn`
     * 2. Build signing requests from deposit/burn events
     * 3. Sign each request via `sign_fn`
     * 4. Broadcast signed txs via `broadcast_fn`
     *
     * Returns a JSON string containing the `RoundResult`.
     * @returns {Promise<any>}
     */
    run_round() {
        const ret = wasm.wasmbridgecoordinator_run_round(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmBridgeCoordinator.prototype[Symbol.dispose] = WasmBridgeCoordinator.prototype.free;

/**
 * WASM adapter wrapping a JS broadcast callback for chain transactions.
 *
 * Construct from JS:
 * ```js
 * const broadcaster = new WasmChainBroadcaster(
 *   async (chain, txHex) => JSON.stringify({ chain, tx_id, success }),
 * );
 * const result = await broadcaster.broadcast("btc", "0200000001...");
 * ```
 */
export class WasmChainBroadcaster {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmChainBroadcasterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmchainbroadcaster_free(ptr, 0);
    }
    /**
     * Broadcast a raw transaction to the given chain.
     * Returns a JSON string containing the BroadcastResult.
     * @param {string} chain
     * @param {string} tx_hex
     * @returns {Promise<any>}
     */
    broadcast(chain, tx_hex) {
        const ptr0 = passStringToWasm0(chain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(tx_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmchainbroadcaster_broadcast(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {Function} broadcast_fn
     */
    constructor(broadcast_fn) {
        const ret = wasm.wasmchainbroadcaster_new(broadcast_fn);
        this.__wbg_ptr = ret >>> 0;
        WasmChainBroadcasterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmChainBroadcaster.prototype[Symbol.dispose] = WasmChainBroadcaster.prototype.free;

/**
 * WASM adapter wrapping a JS polling callback for chain observation.
 *
 * Construct from JS:
 * ```js
 * const observer = new WasmChainObserver(
 *   async (chain, fromBlock) => JSON.stringify(events),
 *   async (chain) => currentHeight,
 * );
 * const events = await observer.poll_events("btc", 0);
 * ```
 */
export class WasmChainObserver {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmChainObserverFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmchainobserver_free(ptr, 0);
    }
    /**
     * Get the current chain height.
     * @param {string} chain
     * @returns {Promise<bigint>}
     */
    chain_height(chain) {
        const ptr0 = passStringToWasm0(chain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmchainobserver_chain_height(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {Function} poll_fn
     * @param {Function} height_fn
     */
    constructor(poll_fn, height_fn) {
        const ret = wasm.wasmchainobserver_new(poll_fn, height_fn);
        this.__wbg_ptr = ret >>> 0;
        WasmChainObserverFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Poll for events on the given chain from the given block.
     * Returns a JSON string containing an array of ChainEvent objects.
     * @param {string} chain
     * @param {bigint} from_block
     * @returns {Promise<any>}
     */
    poll_events(chain, from_block) {
        const ptr0 = passStringToWasm0(chain, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmchainobserver_poll_events(this.__wbg_ptr, ptr0, len0, from_block);
        return ret;
    }
}
if (Symbol.dispose) WasmChainObserver.prototype[Symbol.dispose] = WasmChainObserver.prototype.free;

/**
 * WASM-accessible wrapper around the peer health tracker.
 */
export class WasmHealthTracker {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmHealthTrackerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmhealthtracker_free(ptr, 0);
    }
    /**
     * Whether the group has enough active signers to produce a signature.
     * @returns {boolean}
     */
    can_sign() {
        const ret = wasm.wasmhealthtracker_can_sign(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Number of currently active (online + not-banned) signers.
     * @returns {number}
     */
    effective_group_size() {
        const ret = wasm.wasmhealthtracker_effective_group_size(this.__wbg_ptr);
        return ret;
    }
    /**
     * Check whether a peer is banned (score < 0).
     * @param {number} id
     * @returns {boolean}
     */
    is_banned(id) {
        const ret = wasm.wasmhealthtracker_is_banned(this.__wbg_ptr, id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Create a new health tracker.
     *
     * * `threshold` - minimum signers required for a threshold signature
     * * `max_signers` - total number of signers in the group
     * @param {number} threshold
     * @param {number} max_signers
     */
    constructor(threshold, max_signers) {
        const ret = wasm.wasmhealthtracker_new(threshold, max_signers);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        WasmHealthTrackerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Record a successful signing contribution for a peer.
     * @param {number} id
     */
    record_success(id) {
        const ret = wasm.wasmhealthtracker_record_success(this.__wbg_ptr, id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Record a timeout event for a peer in the given round.
     * @param {number} id
     * @param {bigint} round
     */
    record_timeout(id, round) {
        const ret = wasm.wasmhealthtracker_record_timeout(this.__wbg_ptr, id, round);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Register a peer by its 1-based signer index.
     * @param {number} id
     */
    register_peer(id) {
        const ret = wasm.wasmhealthtracker_register_peer(this.__wbg_ptr, id);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Export the full tracker state as a JSON object.
     * @returns {any}
     */
    to_json() {
        const ret = wasm.wasmhealthtracker_to_json(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) WasmHealthTracker.prototype[Symbol.dispose] = WasmHealthTracker.prototype.free;

/**
 * WASM adapter wrapping a JS signing callback for threshold signatures.
 *
 * Construct from JS:
 * ```js
 * const signer = new WasmThresholdSigner(
 *   async (scheme, sighashHex) => signatureHex,
 * );
 * const sigHex = await signer.sign("frost_schnorr", "abcd1234...");
 * ```
 */
export class WasmThresholdSigner {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmThresholdSignerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmthresholdsigner_free(ptr, 0);
    }
    /**
     * @param {Function} sign_fn
     */
    constructor(sign_fn) {
        const ret = wasm.wasmthresholdsigner_new(sign_fn);
        this.__wbg_ptr = ret >>> 0;
        WasmThresholdSignerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Sign a sighash using the given scheme.
     * Returns hex-encoded signature bytes.
     * @param {string} scheme
     * @param {string} sighash_hex
     * @returns {Promise<string>}
     */
    sign(scheme, sighash_hex) {
        const ptr0 = passStringToWasm0(scheme, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(sighash_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmthresholdsigner_sign(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
}
if (Symbol.dispose) WasmThresholdSigner.prototype[Symbol.dispose] = WasmThresholdSigner.prototype.free;

/**
 * Process frBTC aggregate unwrap requests with fee premium.
 *
 * * `unwrap_requests_json` - JSON array of `[{ id, amount_sats, destination }]`
 * * `utxos_json` - JSON array of `[{ txid, vout, value_sats, script_pubkey }]`
 * * `premium_bps` - Fee premium in basis points (e.g., 10 = 0.1%)
 * * `max_batch_size` - Maximum unwraps per batch (0 = unlimited)
 *
 * Returns a JS object with aggregated tx data, sighash, and premium info.
 * @param {string} unwrap_requests_json
 * @param {string} utxos_json
 * @param {bigint} premium_bps
 * @param {number} max_batch_size
 * @returns {any}
 */
export function frbtc_aggregate_unwrap_process(unwrap_requests_json, utxos_json, premium_bps, max_batch_size) {
    const ptr0 = passStringToWasm0(unwrap_requests_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(utxos_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.frbtc_aggregate_unwrap_process(ptr0, len0, ptr1, len1, premium_bps, max_batch_size);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Process frBTC unwrap requests: builds a PSBT and extracts the sighash.
 *
 * * `unwrap_requests_json` - JSON array of `[{ id, amount_sats, destination }]`
 * * `utxos_json` - JSON array of `[{ txid, vout, value_sats, script_pubkey }]`
 *
 * Returns a JS object: `{ psbt: Uint8Array, sighash: Uint8Array, request_ids: string[], metadata: {...} }`
 * @param {string} unwrap_requests_json
 * @param {string} utxos_json
 * @returns {any}
 */
export function frbtc_unwrap_process(unwrap_requests_json, utxos_json) {
    const ptr0 = passStringToWasm0(unwrap_requests_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(utxos_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.frbtc_unwrap_process(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Derive a BIP-341 P2TR Bitcoin address from a FROST group public key.
 *
 * * `pub_key_package_json` - JSON-serialized `PublicKeyPackage`
 * * `network` - one of "bitcoin", "mainnet", "testnet", "signet", "regtest"
 *
 * Returns the bech32m-encoded taproot address string.
 * @param {string} pub_key_package_json
 * @param {string} network
 * @returns {string}
 */
export function frost_derive_taproot_address(pub_key_package_json, network) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(pub_key_package_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.frost_derive_taproot_address(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Perform FROST DKG round 1 for a single participant.
 *
 * `identifier_index` is the 1-based signer index.
 * Returns a JS object: `{ secret_package: ..., package: ... }`
 * @param {number} identifier_index
 * @param {number} max_signers
 * @param {number} min_signers
 * @returns {any}
 */
export function frost_dkg_part1(identifier_index, max_signers, min_signers) {
    const ret = wasm.frost_dkg_part1(identifier_index, max_signers, min_signers);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Run FROST trusted-dealer key generation.
 *
 * Returns a JS object: `{ key_packages: { "1": ..., "2": ... }, public_key_package: ... }`
 * @param {number} threshold
 * @param {number} max_signers
 * @returns {any}
 */
export function frost_keygen_dealer(threshold, max_signers) {
    const ret = wasm.frost_keygen_dealer(threshold, max_signers);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

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
 * @param {string} key_packages_json
 * @param {string} pub_key_package_json
 * @param {Uint8Array} message
 * @returns {Uint8Array}
 */
export function frost_sign(key_packages_json, pub_key_package_json, message) {
    const ptr0 = passStringToWasm0(key_packages_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(pub_key_package_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.frost_sign(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}

/**
 * Verify a FROST signature against the group public key.
 *
 * * `pub_key_package_json` - JSON-serialized `PublicKeyPackage`
 * * `message` - the original message bytes
 * * `signature` - the 64-byte Schnorr signature
 *
 * Returns `true` if the signature is valid.
 * @param {string} pub_key_package_json
 * @param {Uint8Array} message
 * @param {Uint8Array} signature
 * @returns {boolean}
 */
export function frost_verify(pub_key_package_json, message, signature) {
    const ptr0 = passStringToWasm0(pub_key_package_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(signature, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.frost_verify(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] !== 0;
}

/**
 * Initialize the panic hook for better error messages in WASM.
 * Call this once early in your application.
 */
export function init() {
    wasm.init();
}

/**
 * Parse a signal manifest from TOML and return a validated graph as JSON.
 *
 * * `manifest_toml` - the TOML source text of the signal manifest
 *
 * Returns a JS object representing the parsed manifest nodes.
 * @param {string} manifest_toml
 * @returns {any}
 */
export function signal_parse_manifest(manifest_toml) {
    const ptr0 = passStringToWasm0(manifest_toml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.signal_parse_manifest(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return the crate version (from Cargo.toml).
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_395e606bd0ee4427: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_call_2d781c1f4d5c0ef8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_dcc2662fa17a72cf: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_49d5571bd3f0c4d4: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_a70fbab9066b301f: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_ab79df5bd7c26067: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_typed_aaaeaf29cf802876: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h91a3c2bcebc2bb5d(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = state0.b = 0;
            }
        },
        __wbg_new_with_length_825018a1616e9e55: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_queueMicrotask_0c399741342fb10f: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a082d78ce798393e: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_ae8d83246e5bcc12: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_set_282384002438957f: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bf7251625df30a02: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_f207c857566db248: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_a068d24e39478a8a: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_then_098abe61755d12f6: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_then_9e335f6dd892bc11: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 441, function: Function { arguments: [Externref], shim_idx: 442, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h3418e084d19f754e, wasm_bindgen__convert__closures_____invoke__h8159fc120fb7843a);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./subzero_web_sys_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h8159fc120fb7843a(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h8159fc120fb7843a(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h91a3c2bcebc2bb5d(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h91a3c2bcebc2bb5d(arg0, arg1, arg2, arg3);
}

const WasmBridgeCoordinatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmbridgecoordinator_free(ptr >>> 0, 1));
const WasmChainBroadcasterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmchainbroadcaster_free(ptr >>> 0, 1));
const WasmChainObserverFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmchainobserver_free(ptr >>> 0, 1));
const WasmHealthTrackerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmhealthtracker_free(ptr >>> 0, 1));
const WasmThresholdSignerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmthresholdsigner_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('subzero_web_sys_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
