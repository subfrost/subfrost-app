/* @ts-self-types="./qubitcoin_web_sys.d.ts" */

/**
 * In-process JSON-RPC server for devnet testing.
 *
 * Handles the full alkanes RPC protocol (btc_*, alkanes_*, metashrew_*,
 * esplora_*, sandshrew_multicall, etc.) against an in-memory chain and
 * secondary indexers. No network, no disk.
 */
export class DevnetServer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DevnetServerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_devnetserver_free(ptr, 0);
    }
    /**
     * Add a tertiary indexer WASM module.
     *
     * * `label` — unique name for this tertiary indexer (e.g., "quspo", "qusprey").
     * * `wasm_bytes` — compiled tertiary indexer WASM module bytes.
     *
     * Tertiary indexers run after all secondary indexers and can read their state.
     * @param {string} label
     * @param {Uint8Array} wasm_bytes
     */
    addTertiary(label, wasm_bytes) {
        const ptr0 = passStringToWasm0(label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(wasm_bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.devnetserver_addTertiary(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Process a JSON-RPC request string and return the JSON-RPC response string.
     *
     * All methods — including lua_evalsaved, sandshrew_balances, alkanes_*,
     * esplora_*, etc. — flow through the alkanes-rpc-core RpcDispatcher.
     * Lua scripts are handled by the dispatcher's built-in shims that map
     * known script hashes to their Rust equivalents.
     * @param {string} request_json
     * @returns {string}
     */
    handleRpc(request_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.devnetserver_handleRpc(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Current chain height.
     * @returns {number}
     */
    get height() {
        const ret = wasm.devnetserver_height(this.__wbg_ptr);
        return ret;
    }
    /**
     * Current alkanes indexer height.
     * @returns {number}
     */
    get indexerHeight() {
        const ret = wasm.devnetserver_indexerHeight(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Mine a block with extra outputs in the coinbase transaction.
     *
     * `extra_outputs_hex`: hex-encoded concatenated Bitcoin TxOut entries.
     * Each TxOut is serialized as: [8-byte LE value] + [varint script_len] + [script bytes]
     *
     * This is metaprotocol-agnostic — the caller constructs the raw outputs.
     * @param {string} extra_outputs_hex
     */
    mineBlockWithCoinbaseOutputs(extra_outputs_hex) {
        const ptr0 = passStringToWasm0(extra_outputs_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.devnetserver_mineBlockWithCoinbaseOutputs(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Mine `count` empty blocks and auto-index through all indexers.
     * @param {number} count
     */
    mineBlocks(count) {
        const ret = wasm.devnetserver_mineBlocks(this.__wbg_ptr, count);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Create a new devnet server.
     *
     * * `secret_key` — 32-byte key for the coinbase recipient.
     * * `alkanes_wasm` — compiled alkanes indexer WASM module bytes.
     * * `esplora_wasm` — (optional) compiled esplora indexer WASM bytes.
     *   Pass `undefined` or empty `Uint8Array` to skip.
     * @param {Uint8Array} secret_key
     * @param {Uint8Array} alkanes_wasm
     * @param {Uint8Array | null} [esplora_wasm]
     */
    constructor(secret_key, alkanes_wasm, esplora_wasm) {
        const ptr0 = passArray8ToWasm0(secret_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(alkanes_wasm, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.devnetserver_new(ptr0, len0, ptr1, len1, isLikeNone(esplora_wasm) ? 0 : addToExternrefTable0(esplora_wasm));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        DevnetServerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Tip block hash as hex.
     * @returns {string}
     */
    get tipHashHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.devnetserver_tipHashHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) DevnetServer.prototype[Symbol.dispose] = DevnetServer.prototype.free;

/**
 * An in-process Qubitcoin regtest chain.
 *
 * This is the WASM equivalent of running a local qubitcoind in regtest mode.
 * The entire blockchain lives in memory — no disk, no network.
 */
export class QubitcoinDevnet {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QubitcoinDevnetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_qubitcoindevnet_free(ptr, 0);
    }
    /**
     * Build a P2PKH script from a 20-byte pubkey hash.
     * @param {Uint8Array} pubkey_hash
     * @returns {Uint8Array}
     */
    static buildP2pkhScript(pubkey_hash) {
        const ptr0 = passArray8ToWasm0(pubkey_hash, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_buildP2pkhScript(ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Coinbase public key (33-byte compressed).
     * @returns {Uint8Array}
     */
    get coinbasePubkey() {
        const ret = wasm.qubitcoindevnet_coinbasePubkey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Create a simple transaction spending a UTXO.
     *
     * * `txid` — 32-byte txid of the UTXO to spend.
     * * `vout` — output index within that transaction.
     * * `value_sat` — amount in satoshis to send to `dest_script`.
     * * `dest_script` — the locking script for the recipient output.
     *
     * Returns the serialized transaction, or throws if insufficient funds.
     * Change (minus 1000-sat fee) goes back to the coinbase address.
     * @param {Uint8Array} txid
     * @param {number} vout
     * @param {number} value_sat
     * @param {Uint8Array} dest_script
     * @returns {Uint8Array}
     */
    createTransaction(txid, vout, value_sat, dest_script) {
        const ptr0 = passArray8ToWasm0(txid, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(dest_script, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_createTransaction(this.__wbg_ptr, ptr0, len0, vout, value_sat, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Get a block by height in Bitcoin wire format, or `null` if not found.
     * @param {number} height
     * @returns {any}
     */
    getBlock(height) {
        const ret = wasm.qubitcoindevnet_getBlock(this.__wbg_ptr, height);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Get the block hash at a given height as hex, or `null`.
     * @param {number} height
     * @returns {any}
     */
    getBlockHash(height) {
        const ret = wasm.qubitcoindevnet_getBlockHash(this.__wbg_ptr, height);
        return ret;
    }
    /**
     * Find the first spendable (mature, unspent) coinbase output.
     *
     * Returns a JS object `{ txid: Uint8Array, vout: number, valueSat: number }`
     * or `null` if no mature coinbase is available.
     * @returns {any}
     */
    getSpendableOutput() {
        const ret = wasm.qubitcoindevnet_getSpendableOutput(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Get a UTXO's value in satoshis, or `null` if it doesn't exist.
     * @param {Uint8Array} txid
     * @param {number} vout
     * @returns {any}
     */
    getUtxoValue(txid, vout) {
        const ptr0 = passArray8ToWasm0(txid, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_getUtxoValue(this.__wbg_ptr, ptr0, len0, vout);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Check whether a UTXO exists.
     * @param {Uint8Array} txid
     * @param {number} vout
     * @returns {boolean}
     */
    hasUtxo(txid, vout) {
        const ptr0 = passArray8ToWasm0(txid, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_hasUtxo(this.__wbg_ptr, ptr0, len0, vout);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Compute Hash160 (RIPEMD160(SHA256(data))) — used for P2PKH address derivation.
     * @param {Uint8Array} data
     * @returns {Uint8Array}
     */
    static hash160(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_hash160(ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Current chain height (0 = genesis only).
     * @returns {number}
     */
    get height() {
        const ret = wasm.qubitcoindevnet_height(this.__wbg_ptr);
        return ret;
    }
    /**
     * Number of mature (spendable) coinbase outputs.
     * @returns {number}
     */
    get matureCoinbaseCount() {
        const ret = wasm.qubitcoindevnet_matureCoinbaseCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Mine a single empty block. Returns the block in Bitcoin wire format.
     * @returns {Uint8Array}
     */
    mineBlock() {
        const ret = wasm.qubitcoindevnet_mineBlock(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Mine a block containing the given transactions (each in wire format).
     *
     * `raw_txs` is an array of `Uint8Array`, each a serialized transaction.
     * @param {Array<any>} raw_txs
     * @returns {Uint8Array}
     */
    mineBlockWithTxs(raw_txs) {
        const ret = wasm.qubitcoindevnet_mineBlockWithTxs(this.__wbg_ptr, raw_txs);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Mine `count` empty blocks. Returns the final block in wire format.
     * @param {number} count
     * @returns {Uint8Array}
     */
    mineBlocks(count) {
        const ret = wasm.qubitcoindevnet_mineBlocks(this.__wbg_ptr, count);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Create a new devnet chain from a 32-byte private key.
     *
     * The key is used as the coinbase recipient for all mined blocks.
     * The chain starts at height 0 with a genesis block already mined.
     * @param {Uint8Array} secret_key
     */
    constructor(secret_key) {
        const ptr0 = passArray8ToWasm0(secret_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        QubitcoinDevnetFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Derive the compressed public key (33 bytes) from a 32-byte secret key.
     * @param {Uint8Array} secret_key
     * @returns {Uint8Array}
     */
    static pubkeyFromSecret(secret_key) {
        const ptr0 = passArray8ToWasm0(secret_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.qubitcoindevnet_pubkeyFromSecret(ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Tip block hash as a 32-byte array.
     * @returns {Uint8Array}
     */
    get tipHash() {
        const ret = wasm.qubitcoindevnet_tipHash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Tip block hash as a hex string.
     * @returns {string}
     */
    get tipHashHex() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.qubitcoindevnet_tipHashHex(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Number of UTXOs in the in-memory cache.
     * @returns {number}
     */
    get utxoCount() {
        const ret = wasm.qubitcoindevnet_utxoCount(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) QubitcoinDevnet.prototype[Symbol.dispose] = QubitcoinDevnet.prototype.free;

/**
 * A secondary indexer instance running in the browser.
 *
 * Wraps a compiled WASM indexer module and its in-memory storage.
 */
export class SecondaryIndexer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SecondaryIndexerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_secondaryindexer_free(ptr, 0);
    }
    /**
     * Call a named view function on the indexer.
     *
     * `height` is the block height context for the view call.
     * Returns the raw result bytes.
     * @param {string} fn_name
     * @param {number} height
     * @param {Uint8Array} input
     * @returns {Uint8Array}
     */
    callView(fn_name, height, input) {
        const ptr0 = passStringToWasm0(fn_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(input, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.secondaryindexer_callView(this.__wbg_ptr, ptr0, len0, height, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Current indexer tip height.
     * @returns {number}
     */
    get height() {
        const ret = wasm.secondaryindexer_height(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Load and compile a WASM indexer module from bytes.
     * @param {Uint8Array} wasm_bytes
     */
    constructor(wasm_bytes) {
        const ptr0 = passArray8ToWasm0(wasm_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.secondaryindexer_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        SecondaryIndexerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Feed a block to the indexer for processing.
     *
     * `block_data` is the raw block bytes (Bitcoin wire format).
     * The indexer's `_start()` is invoked and resulting state changes are
     * flushed to the in-memory store.
     * @param {Uint8Array} block_data
     */
    processBlock(block_data) {
        const ptr0 = passArray8ToWasm0(block_data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.secondaryindexer_processBlock(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Roll back the indexer state to a previous height.
     *
     * Deletes all entries recorded above `target_height`.
     * @param {number} target_height
     * @returns {number}
     */
    rollbackTo(target_height) {
        const ret = wasm.secondaryindexer_rollbackTo(this.__wbg_ptr, target_height);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Compute the sparse Merkle tree state root at the current height.
     * @returns {Uint8Array}
     */
    stateRoot() {
        const ret = wasm.secondaryindexer_stateRoot(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) SecondaryIndexer.prototype[Symbol.dispose] = SecondaryIndexer.prototype.free;

/**
 * Initialize the WASM module.
 */
export function init() {
    wasm.init();
}

/**
 * Returns the library version.
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
        __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_buffer_eb2779983eb67380: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_call_e133b57c9155d22c: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_error_8d9a8e04cd1d3588: function(arg0) {
            console.error(arg0);
        },
        __wbg_exports_166644897be74f9d: function(arg0) {
            const ret = arg0.exports;
            return ret;
        },
        __wbg_get_3ef1eba1850ade27: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_a8ee5c45dabc1b3b: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_index_87179971b8d350e4: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_instanceof_Memory_c492b7d1a51b453d: function(arg0) {
            let result;
            try {
                result = arg0 instanceof WebAssembly.Memory;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_length_b3416cf66a5452c8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_ea16607d7b61445b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_log_524eedafa26daa59: function(arg0) {
            console.log(arg0);
        },
        __wbg_new_592b75079b91788e: function() { return handleError(function (arg0, arg1) {
            const ret = new WebAssembly.Instance(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_new_5f486cdf45a04d78: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_a9fd9e2ed6d139ae: function() { return handleError(function (arg0) {
            const ret = new WebAssembly.Module(arg0);
            return ret;
        }, arguments); },
        __wbg_new_ab79df5bd7c26067: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_22da9388ac046e50: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_set_7eaa4f96924fd6b3: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_e80615d7a9a43981: function(arg0, arg1, arg2) {
            arg0.set(arg1, arg2 >>> 0);
        },
        __wbg_warn_69424c2d92a2fa73: function(arg0) {
            console.warn(arg0);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 105, function: Function { arguments: [I32, I32, I32], shim_idx: 106, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h4df537ce3f6d9b14, wasm_bindgen__convert__closures_____invoke__h0da45516b2a2d52e);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 105, function: Function { arguments: [I32, I32], shim_idx: 108, ret: I32, inner_ret: Some(I32) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h4df537ce3f6d9b14, wasm_bindgen__convert__closures_____invoke__h4d29db096795f4bd);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [I32, I32, I32, I32], shim_idx: 134, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__h0392fa6e70d338dd);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [I32, I32], shim_idx: 138, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__h32be19cb842777f1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [I32], shim_idx: 140, ret: I32, inner_ret: Some(I32) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__h5c017f23b7be8bcc);
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [I32], shim_idx: 142, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__h59afab167f29500e);
            return ret;
        },
        __wbindgen_cast_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [], shim_idx: 136, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__h1c4fbeb50e499e3e);
            return ret;
        },
        __wbindgen_cast_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 133, function: Function { arguments: [], shim_idx: 144, ret: I32, inner_ret: Some(I32) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h508fc11bfb430f62, wasm_bindgen__convert__closures_____invoke__he48afe516605f102);
            return ret;
        },
        __wbindgen_cast_0000000000000009: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_000000000000000a: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
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
        "./qubitcoin_web_sys_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h1c4fbeb50e499e3e(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__h1c4fbeb50e499e3e(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__he48afe516605f102(arg0, arg1) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__he48afe516605f102(arg0, arg1);
    return ret;
}

function wasm_bindgen__convert__closures_____invoke__h59afab167f29500e(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h59afab167f29500e(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h5c017f23b7be8bcc(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h5c017f23b7be8bcc(arg0, arg1, arg2);
    return ret;
}

function wasm_bindgen__convert__closures_____invoke__h32be19cb842777f1(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h32be19cb842777f1(arg0, arg1, arg2, arg3);
}

function wasm_bindgen__convert__closures_____invoke__h4d29db096795f4bd(arg0, arg1, arg2, arg3) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h4d29db096795f4bd(arg0, arg1, arg2, arg3);
    return ret;
}

function wasm_bindgen__convert__closures_____invoke__h0da45516b2a2d52e(arg0, arg1, arg2, arg3, arg4) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0da45516b2a2d52e(arg0, arg1, arg2, arg3, arg4);
}

function wasm_bindgen__convert__closures_____invoke__h0392fa6e70d338dd(arg0, arg1, arg2, arg3, arg4, arg5) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0392fa6e70d338dd(arg0, arg1, arg2, arg3, arg4, arg5);
}

const DevnetServerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_devnetserver_free(ptr >>> 0, 1));
const QubitcoinDevnetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_qubitcoindevnet_free(ptr >>> 0, 1));
const SecondaryIndexerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_secondaryindexer_free(ptr >>> 0, 1));

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

function makeClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        try {
            return f(state.a, state.b, ...args);
        } finally {
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
        module_or_path = new URL('qubitcoin_web_sys_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
