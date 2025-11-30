let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
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

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
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

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

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

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

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

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}
/**
 * @param {string} psbt_base64
 * @returns {string}
 */
export function analyze_psbt(psbt_base64) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(psbt_base64, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.analyze_psbt(ptr0, len0);
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
 * @param {string} alkane_id_str
 * @param {string} wasm_hex
 * @param {string} cellpack_hex
 * @returns {Promise<any>}
 */
export function simulate_alkane_call(alkane_id_str, wasm_hex, cellpack_hex) {
    const ptr0 = passStringToWasm0(alkane_id_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(wasm_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(cellpack_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.simulate_alkane_call(ptr0, len0, ptr1, len1, ptr2, len2);
    return ret;
}

/**
 * @param {string} network
 * @param {number} block
 * @param {number} tx
 * @param {string} block_tag
 * @returns {Promise<any>}
 */
export function get_alkane_bytecode(network, block, tx, block_tag) {
    const ptr0 = passStringToWasm0(network, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(block_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.get_alkane_bytecode(ptr0, len0, block, tx, ptr1, len1);
    return ret;
}

/**
 * Asynchronously encrypts data using the Web Crypto API.
 * @param {string} mnemonic
 * @param {string} passphrase
 * @returns {Promise<any>}
 */
export function encryptMnemonic(mnemonic, passphrase) {
    const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(passphrase, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.encryptMnemonic(ptr0, len0, ptr1, len1);
    return ret;
}

function wasm_bindgen__convert__closures_____invoke__h5943629905d90057(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h5943629905d90057(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h95fdbac5e4c1bfb6(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h95fdbac5e4c1bfb6(arg0, arg1, arg2, arg3);
}

const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];

const KeystoreFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_keystore_free(ptr >>> 0, 1));
/**
 * Represents the entire JSON keystore, compatible with wasm-bindgen.
 */
export class Keystore {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        KeystoreFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_keystore_free(ptr, 0);
    }
    /**
     * @param {any} val
     */
    constructor(val) {
        const ret = wasm.keystore_from_js(val);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        KeystoreFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {any}
     */
    to_js() {
        const ret = wasm.keystore_to_js(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {string}
     */
    accountXpub() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.keystore_accountXpub(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {any}
     */
    hdPaths() {
        const ret = wasm.keystore_hdPaths(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    masterFingerprint() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.keystore_masterFingerprint(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} passphrase
     * @returns {Promise<any>}
     */
    decryptMnemonic(passphrase) {
        const ptr0 = passStringToWasm0(passphrase, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.keystore_decryptMnemonic(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) Keystore.prototype[Symbol.dispose] = Keystore.prototype.free;

const PbkdfParamsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pbkdfparams_free(ptr >>> 0, 1));
/**
 * Parameters for the PBKDF2/S2K key derivation function.
 */
export class PbkdfParams {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PbkdfParamsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pbkdfparams_free(ptr, 0);
    }
    /**
     * @param {any} val
     */
    constructor(val) {
        const ret = wasm.pbkdfparams_from_js(val);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        PbkdfParamsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {any}
     */
    to_js() {
        const ret = wasm.pbkdfparams_to_js(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) PbkdfParams.prototype[Symbol.dispose] = PbkdfParams.prototype.free;

const WebProviderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webprovider_free(ptr >>> 0, 1));
/**
 * Web-compatible provider implementation for browser environments
 *
 * The `WebProvider` is the main entry point for using deezel functionality in web browsers
 * and WASM environments. It implements all deezel-common traits using web-standard APIs,
 * providing complete Bitcoin wallet and Alkanes metaprotocol functionality.
 *
 * # Features
 *
 * - **Bitcoin Operations**: Full wallet functionality, transaction creation, and broadcasting
 * - **Alkanes Integration**: Smart contract execution, token operations, and AMM functionality
 * - **Web Standards**: Uses fetch API, localStorage, Web Crypto API, and console logging
 * - **Network Support**: Configurable for mainnet, testnet, signet, regtest, and custom networks
 * - **Privacy Features**: Rebar Labs Shield integration for private transaction broadcasting
 *
 * # Example
 *
 * ```rust,no_run
 * use deezel_web::WebProvider;
 * use alkanes_cli_common::*;
 *
 * async fn create_provider() -> Result<WebProvider> {
 *     let provider = WebProvider::new("mainnet".to_string()).await?;
 *
 *     provider.initialize().await?;
 *     Ok(provider)
 * }
 * ```
 */
export class WebProvider {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebProviderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webprovider_free(ptr, 0);
    }
    /**
     * Create a new WebProvider with given URLs
     * @param {string} sandshrew_rpc_url
     * @param {string | null} [esplora_rpc_url]
     */
    constructor(sandshrew_rpc_url, esplora_rpc_url) {
        const ptr0 = passStringToWasm0(sandshrew_rpc_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(esplora_rpc_url) ? 0 : passStringToWasm0(esplora_rpc_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_new_js(ptr0, len0, ptr1, len1);
        this.__wbg_ptr = ret >>> 0;
        WebProviderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get enriched wallet balances using the balances.lua script
     *
     * This uses the built-in balances.lua script with automatic hash-based caching.
     * Returns comprehensive balance data including spendable UTXOs, asset UTXOs, and pending.
     * @param {string} address
     * @param {string | null} [protocol_tag]
     * @returns {Promise<any>}
     */
    getEnrichedBalances(address, protocol_tag) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(protocol_tag) ? 0 : passStringToWasm0(protocol_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_getEnrichedBalances(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * Get all transactions for an address from Esplora
     * @param {string} address
     * @returns {Promise<any>}
     */
    getAddressTxs(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_getAddressTxs(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get raw transaction hex
     * @param {string} txid
     * @returns {Promise<any>}
     */
    getTransactionHex(txid) {
        const ptr0 = passStringToWasm0(txid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_getTransactionHex(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Trace alkanes execution for a protostone outpoint
     * @param {string} outpoint
     * @returns {Promise<any>}
     */
    traceOutpoint(outpoint) {
        const ptr0 = passStringToWasm0(outpoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_traceOutpoint(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get address UTXOs
     * @param {string} address
     * @returns {Promise<any>}
     */
    getAddressUtxos(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_getAddressUtxos(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Broadcast a raw transaction
     * @param {string} tx_hex
     * @returns {Promise<any>}
     */
    broadcastTransaction(tx_hex) {
        const ptr0 = passStringToWasm0(tx_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_broadcastTransaction(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get address transactions with complete runestone traces (CLI: esplora address-txs --runestone-trace)
     * @param {string} address
     * @param {boolean | null} [exclude_coinbase]
     * @returns {Promise<any>}
     */
    getAddressTxsWithTraces(address, exclude_coinbase) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_getAddressTxsWithTraces(this.__wbg_ptr, ptr0, len0, isLikeNone(exclude_coinbase) ? 0xFFFFFF : exclude_coinbase ? 1 : 0);
        return ret;
    }
    /**
     * @param {string} inscription_id
     * @returns {Promise<any>}
     */
    ordInscription(inscription_id) {
        const ptr0 = passStringToWasm0(inscription_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_ordInscription(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {number | null} [page]
     * @returns {Promise<any>}
     */
    ordInscriptions(page) {
        const ret = wasm.webprovider_ordInscriptions(this.__wbg_ptr, !isLikeNone(page), isLikeNone(page) ? 0 : page);
        return ret;
    }
    /**
     * @param {string} address
     * @returns {Promise<any>}
     */
    ordOutputs(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_ordOutputs(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} rune
     * @returns {Promise<any>}
     */
    ordRune(rune) {
        const ptr0 = passStringToWasm0(rune, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_ordRune(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Execute an alkanes smart contract
     * @param {string} params_json
     * @returns {Promise<any>}
     */
    alkanesExecute(params_json) {
        const ptr0 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesExecute(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Resume execution after user confirmation (for simple transactions)
     * @param {string} state_json
     * @param {string} params_json
     * @returns {Promise<any>}
     */
    alkanesResumeExecution(state_json, params_json) {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesResumeExecution(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * Resume execution after commit transaction confirmation
     * @param {string} state_json
     * @returns {Promise<any>}
     */
    alkanesResumeCommitExecution(state_json) {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesResumeCommitExecution(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Resume execution after reveal transaction confirmation
     * @param {string} state_json
     * @returns {Promise<any>}
     */
    alkanesResumeRevealExecution(state_json) {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesResumeRevealExecution(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Simulate an alkanes contract call (read-only)
     * @param {string} contract_id
     * @param {string} context_json
     * @param {string | null} [block_tag]
     * @returns {Promise<any>}
     */
    alkanesSimulate(contract_id, context_json, block_tag) {
        const ptr0 = passStringToWasm0(contract_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(block_tag) ? 0 : passStringToWasm0(block_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesSimulate(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        return ret;
    }
    /**
     * Get alkanes contract balance for an address
     * @param {string | null} [address]
     * @returns {Promise<any>}
     */
    alkanesBalance(address) {
        var ptr0 = isLikeNone(address) ? 0 : passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesBalance(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get alkanes contract bytecode
     * @param {string} alkane_id
     * @param {string | null} [block_tag]
     * @returns {Promise<any>}
     */
    alkanesBytecode(alkane_id, block_tag) {
        const ptr0 = passStringToWasm0(alkane_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(block_tag) ? 0 : passStringToWasm0(block_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesBytecode(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * Get all pools with details from an AMM factory (parallel optimized for browser)
     * @param {string} factory_id
     * @param {number | null} [chunk_size]
     * @param {number | null} [max_concurrent]
     * @returns {Promise<any>}
     */
    alkanesGetAllPoolsWithDetails(factory_id, chunk_size, max_concurrent) {
        const ptr0 = passStringToWasm0(factory_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesGetAllPoolsWithDetails(this.__wbg_ptr, ptr0, len0, !isLikeNone(chunk_size), isLikeNone(chunk_size) ? 0 : chunk_size, !isLikeNone(max_concurrent), isLikeNone(max_concurrent) ? 0 : max_concurrent);
        return ret;
    }
    /**
     * Get all pools from a factory (lightweight, IDs only)
     * @param {string} factory_id
     * @returns {Promise<any>}
     */
    alkanesGetAllPools(factory_id) {
        const ptr0 = passStringToWasm0(factory_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesGetAllPools(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} outpoint
     * @returns {Promise<any>}
     */
    alkanesTrace(outpoint) {
        const ptr0 = passStringToWasm0(outpoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesTrace(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} address
     * @param {string | null} [block_tag]
     * @param {number | null} [protocol_tag]
     * @returns {Promise<any>}
     */
    alkanesByAddress(address, block_tag, protocol_tag) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(block_tag) ? 0 : passStringToWasm0(block_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesByAddress(this.__wbg_ptr, ptr0, len0, ptr1, len1, !isLikeNone(protocol_tag), isLikeNone(protocol_tag) ? 0 : protocol_tag);
        return ret;
    }
    /**
     * @param {string} outpoint
     * @param {string | null} [block_tag]
     * @param {number | null} [protocol_tag]
     * @returns {Promise<any>}
     */
    alkanesByOutpoint(outpoint, block_tag, protocol_tag) {
        const ptr0 = passStringToWasm0(outpoint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(block_tag) ? 0 : passStringToWasm0(block_tag, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_alkanesByOutpoint(this.__wbg_ptr, ptr0, len0, ptr1, len1, !isLikeNone(protocol_tag), isLikeNone(protocol_tag) ? 0 : protocol_tag);
        return ret;
    }
    /**
     * @param {string} txid
     * @returns {Promise<any>}
     */
    esploraGetTx(txid) {
        const ptr0 = passStringToWasm0(txid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_esploraGetTx(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} txid
     * @returns {Promise<any>}
     */
    esploraGetTxStatus(txid) {
        const ptr0 = passStringToWasm0(txid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_esploraGetTxStatus(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} address
     * @returns {Promise<any>}
     */
    esploraGetAddressInfo(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_esploraGetAddressInfo(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    esploraGetBlocksTipHeight() {
        const ret = wasm.webprovider_esploraGetBlocksTipHeight(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    esploraGetBlocksTipHash() {
        const ret = wasm.webprovider_esploraGetBlocksTipHash(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    bitcoindGetBlockCount() {
        const ret = wasm.webprovider_bitcoindGetBlockCount(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} tx_hex
     * @returns {Promise<any>}
     */
    bitcoindSendRawTransaction(tx_hex) {
        const ptr0 = passStringToWasm0(tx_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_bitcoindSendRawTransaction(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    metashrewHeight() {
        const ret = wasm.webprovider_metashrewHeight(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number | null} [height]
     * @returns {Promise<any>}
     */
    metashrewStateRoot(height) {
        const ret = wasm.webprovider_metashrewStateRoot(this.__wbg_ptr, !isLikeNone(height), isLikeNone(height) ? 0 : height);
        return ret;
    }
    /**
     * @param {string} params_json
     * @returns {Promise<any>}
     */
    walletCreatePsbt(params_json) {
        const ptr0 = passStringToWasm0(params_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webprovider_walletCreatePsbt(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) WebProvider.prototype[Symbol.dispose] = WebProvider.prototype.free;

export function __wbg_Error_e83987f665cf5504(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_Number_bb48ca12f395cd08(arg0) {
    const ret = Number(arg0);
    return ret;
};

export function __wbg_String_8f0eb39a4a4c2f66(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg___wbindgen_bigint_get_as_i64_f3ebc5a755000afd(arg0, arg1) {
    const v = arg1;
    const ret = typeof(v) === 'bigint' ? v : undefined;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
};

export function __wbg___wbindgen_boolean_get_6d5a1ee65bab5f68(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
};

export function __wbg___wbindgen_debug_string_df47ffb5e35e6763(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg___wbindgen_in_bb933bd9e1b3bc0f(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
};

export function __wbg___wbindgen_is_bigint_cb320707dcd35f0b(arg0) {
    const ret = typeof(arg0) === 'bigint';
    return ret;
};

export function __wbg___wbindgen_is_function_ee8a6c5833c90377(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
};

export function __wbg___wbindgen_is_object_c818261d21f283a4(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

export function __wbg___wbindgen_is_string_fbb76cb2940daafd(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
};

export function __wbg___wbindgen_is_undefined_2d472862bd29a478(arg0) {
    const ret = arg0 === undefined;
    return ret;
};

export function __wbg___wbindgen_jsval_eq_6b13ab83478b1c50(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
};

export function __wbg___wbindgen_jsval_loose_eq_b664b38a2f582147(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
};

export function __wbg___wbindgen_number_get_a20bf9b85341449d(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
};

export function __wbg___wbindgen_string_get_e4f06c90489ad01b(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg___wbindgen_throw_b855445ff6a94295(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

export function __wbg__wbg_cb_unref_2454a539ea5790d9(arg0) {
    arg0._wbg_cb_unref();
};

export function __wbg_arrayBuffer_b375eccb84b4ddf3() { return handleError(function (arg0) {
    const ret = arg0.arrayBuffer();
    return ret;
}, arguments) };

export function __wbg_call_525440f72fbfc0ea() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_call_e762c39fa8ea36bf() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments) };

export function __wbg_crypto_574e78ad8b13b65f(arg0) {
    const ret = arg0.crypto;
    return ret;
};

export function __wbg_crypto_f5dce82c355d159f() { return handleError(function (arg0) {
    const ret = arg0.crypto;
    return ret;
}, arguments) };

export function __wbg_debug_f4b0c59db649db48(arg0) {
    console.debug(arg0);
};

export function __wbg_decrypt_0452782895e3c2f1() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    const ret = arg0.decrypt(arg1, arg2, getArrayU8FromWasm0(arg3, arg4));
    return ret;
}, arguments) };

export function __wbg_deriveBits_28ff8a809aa473ec() { return handleError(function (arg0, arg1, arg2, arg3) {
    const ret = arg0.deriveBits(arg1, arg2, arg3 >>> 0);
    return ret;
}, arguments) };

export function __wbg_done_2042aa2670fb1db1(arg0) {
    const ret = arg0.done;
    return ret;
};

export function __wbg_encrypt_36464dd547f58e9c() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    const ret = arg0.encrypt(arg1, arg2, getArrayU8FromWasm0(arg3, arg4));
    return ret;
}, arguments) };

export function __wbg_entries_e171b586f8f6bdbf(arg0) {
    const ret = Object.entries(arg0);
    return ret;
};

export function __wbg_error_a7f8fbb0523dae15(arg0) {
    console.error(arg0);
};

export function __wbg_fetch_0c645bcbfc592368(arg0, arg1) {
    const ret = arg0.fetch(arg1);
    return ret;
};

export function __wbg_fromCodePoint_a1c5bb992dc05846() { return handleError(function (arg0) {
    const ret = String.fromCodePoint(arg0 >>> 0);
    return ret;
}, arguments) };

export function __wbg_from_a4ad7cbddd0d7135(arg0) {
    const ret = Array.from(arg0);
    return ret;
};

export function __wbg_getItem_89f57d6acc51a876() { return handleError(function (arg0, arg1, arg2, arg3) {
    const ret = arg1.getItem(getStringFromWasm0(arg2, arg3));
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}, arguments) };

export function __wbg_getRandomValues_6357e7b583eb49cc() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getRandomValues(getArrayU8FromWasm0(arg1, arg2));
    return ret;
}, arguments) };

export function __wbg_getRandomValues_b8f5dbd5f3995a9e() { return handleError(function (arg0, arg1) {
    arg0.getRandomValues(arg1);
}, arguments) };

export function __wbg_get_7bed016f185add81(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
};

export function __wbg_get_efcb449f58ec27c2() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments) };

export function __wbg_get_with_ref_key_1dc361bd10053bfe(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
};

export function __wbg_importKey_2be19189a1451235() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    const ret = arg0.importKey(getStringFromWasm0(arg1, arg2), arg3, arg4, arg5 !== 0, arg6);
    return ret;
}, arguments) };

export function __wbg_info_e674a11f4f50cc0c(arg0) {
    console.info(arg0);
};

export function __wbg_instanceof_ArrayBuffer_70beb1189ca63b38(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_CryptoKey_9fbbefded7590b8c(arg0) {
    let result;
    try {
        result = arg0 instanceof CryptoKey;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Response_f4f3e87e07f3135c(arg0) {
    let result;
    try {
        result = arg0 instanceof Response;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Uint8Array_20c8e73002f7af98(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_instanceof_Window_4846dbb3de56c84c(arg0) {
    let result;
    try {
        result = arg0 instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_isSafeInteger_d216eda7911dde36(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
};

export function __wbg_iterator_e5822695327a3c39() {
    const ret = Symbol.iterator;
    return ret;
};

export function __wbg_key_38d01a092280ffc6() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg1.key(arg2 >>> 0);
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}, arguments) };

export function __wbg_length_69bca3cb64fc8748(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_length_7534a213da0a65cd() { return handleError(function (arg0) {
    const ret = arg0.length;
    return ret;
}, arguments) };

export function __wbg_length_cdd215e10d9dd507(arg0) {
    const ret = arg0.length;
    return ret;
};

export function __wbg_localStorage_3034501cd2b3da3f() { return handleError(function (arg0) {
    const ret = arg0.localStorage;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments) };

export function __wbg_msCrypto_a61aeb35a24c1329(arg0) {
    const ret = arg0.msCrypto;
    return ret;
};

export function __wbg_new_0_f9740686d739025c() {
    const ret = new Date();
    return ret;
};

export function __wbg_new_1acc0b6eea89d040() {
    const ret = new Object();
    return ret;
};

export function __wbg_new_3c3d849046688a66(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return wasm_bindgen__convert__closures_____invoke__h95fdbac5e4c1bfb6(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = state0.b = 0;
    }
};

export function __wbg_new_5a79be3ab53b8aa5(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
};

export function __wbg_new_68651c719dcda04e() {
    const ret = new Map();
    return ret;
};

export function __wbg_new_9edf9838a2def39c() { return handleError(function () {
    const ret = new Headers();
    return ret;
}, arguments) };

export function __wbg_new_e17d9f43105b08be() {
    const ret = new Array();
    return ret;
};

export function __wbg_new_no_args_ee98eee5275000a4(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
};

export function __wbg_new_with_length_01aa0dc35aa13543(arg0) {
    const ret = new Uint8Array(arg0 >>> 0);
    return ret;
};

export function __wbg_new_with_str_and_init_0ae7728b6ec367b1() { return handleError(function (arg0, arg1, arg2) {
    const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
    return ret;
}, arguments) };

export function __wbg_next_020810e0ae8ebcb0() { return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
}, arguments) };

export function __wbg_next_2c826fe5dfec6b6a(arg0) {
    const ret = arg0.next;
    return ret;
};

export function __wbg_node_905d3e251edff8a2(arg0) {
    const ret = arg0.node;
    return ret;
};

export function __wbg_now_793306c526e2e3b6() {
    const ret = Date.now();
    return ret;
};

export function __wbg_of_035271b9e67a3bd9(arg0) {
    const ret = Array.of(arg0);
    return ret;
};

export function __wbg_ok_5749966cb2b8535e(arg0) {
    const ret = arg0.ok;
    return ret;
};

export function __wbg_performance_e8315b5ae987e93f(arg0) {
    const ret = arg0.performance;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_process_dc0fbacc7c1c06f7(arg0) {
    const ret = arg0.process;
    return ret;
};

export function __wbg_prototypesetcall_2a6620b6922694b2(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
};

export function __wbg_queueMicrotask_34d692c25c47d05b(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
};

export function __wbg_queueMicrotask_9d76cacb20c84d58(arg0) {
    queueMicrotask(arg0);
};

export function __wbg_randomFillSync_ac0988aba3254290() { return handleError(function (arg0, arg1) {
    arg0.randomFillSync(arg1);
}, arguments) };

export function __wbg_removeItem_0e1e70f1687b5304() { return handleError(function (arg0, arg1, arg2) {
    arg0.removeItem(getStringFromWasm0(arg1, arg2));
}, arguments) };

export function __wbg_require_60cc747a6bc5215a() { return handleError(function () {
    const ret = module.require;
    return ret;
}, arguments) };

export function __wbg_resolve_caf97c30b83f7053(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
};

export function __wbg_setItem_64dfb54d7b20d84c() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.setItem(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
}, arguments) };

export function __wbg_setTimeout_780ac15e3df4c663() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.setTimeout(arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_set_3f1d0b984ed272ed(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
};

export function __wbg_set_8b342d8cd9d2a02c() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
    arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
}, arguments) };

export function __wbg_set_907fb406c34a251d(arg0, arg1, arg2) {
    const ret = arg0.set(arg1, arg2);
    return ret;
};

export function __wbg_set_9e6516df7b7d0f19(arg0, arg1, arg2) {
    arg0.set(getArrayU8FromWasm0(arg1, arg2));
};

export function __wbg_set_body_3c365989753d61f4(arg0, arg1) {
    arg0.body = arg1;
};

export function __wbg_set_c213c871859d6500(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
};

export function __wbg_set_c2abbebe8b9ebee1() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
    return ret;
}, arguments) };

export function __wbg_set_headers_6926da238cd32ee4(arg0, arg1) {
    arg0.headers = arg1;
};

export function __wbg_set_method_c02d8cbbe204ac2d(arg0, arg1, arg2) {
    arg0.method = getStringFromWasm0(arg1, arg2);
};

export function __wbg_set_mode_52ef73cfa79639cb(arg0, arg1) {
    arg0.mode = __wbindgen_enum_RequestMode[arg1];
};

export function __wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e() {
    const ret = typeof global === 'undefined' ? null : global;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac() {
    const ret = typeof globalThis === 'undefined' ? null : globalThis;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_static_accessor_SELF_6fdf4b64710cc91b() {
    const ret = typeof self === 'undefined' ? null : self;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2() {
    const ret = typeof window === 'undefined' ? null : window;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
};

export function __wbg_statusText_f84c3ce029ec4040(arg0, arg1) {
    const ret = arg1.statusText;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
};

export function __wbg_status_de7eed5a7a5bfd5d(arg0) {
    const ret = arg0.status;
    return ret;
};

export function __wbg_subarray_480600f3d6a9f26c(arg0, arg1, arg2) {
    const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
    return ret;
};

export function __wbg_subtle_a158c8cba320b8ed(arg0) {
    const ret = arg0.subtle;
    return ret;
};

export function __wbg_text_dc33c15c17bdfb52() { return handleError(function (arg0) {
    const ret = arg0.text();
    return ret;
}, arguments) };

export function __wbg_then_4f46f6544e6b4a28(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
};

export function __wbg_then_70d05cf780a18d77(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
};

export function __wbg_toISOString_48d92f5754d01b49(arg0) {
    const ret = arg0.toISOString();
    return ret;
};

export function __wbg_value_692627309814bb8c(arg0) {
    const ret = arg0.value;
    return ret;
};

export function __wbg_versions_c01dfd4722a88165(arg0) {
    const ret = arg0.versions;
    return ret;
};

export function __wbg_warn_1d74dddbe2fd1dbb(arg0) {
    console.warn(arg0);
};

export function __wbindgen_cast_2241b6af4c4b2941(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_cast_4625c577ab2ec9ee(arg0) {
    // Cast intrinsic for `U64 -> Externref`.
    const ret = BigInt.asUintN(64, arg0);
    return ret;
};

export function __wbindgen_cast_9ae0607507abb057(arg0) {
    // Cast intrinsic for `I64 -> Externref`.
    const ret = arg0;
    return ret;
};

export function __wbindgen_cast_af4c559eab0c66a3(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { dtor_idx: 1963, function: Function { arguments: [Externref], shim_idx: 1964, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h3ba04b4139aaae95, wasm_bindgen__convert__closures_____invoke__h5943629905d90057);
    return ret;
};

export function __wbindgen_cast_cb9088102bce6b30(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
    const ret = getArrayU8FromWasm0(arg0, arg1);
    return ret;
};

export function __wbindgen_cast_d6cd19b81560fd6e(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return ret;
};

export function __wbindgen_cast_e7b45dd881f38ce3(arg0, arg1) {
    // Cast intrinsic for `U128 -> Externref`.
    const ret = (BigInt.asUintN(64, arg0) | (BigInt.asUintN(64, arg1) << BigInt(64)));
    return ret;
};

export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

