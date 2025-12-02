import * as bitcoin from 'bitcoinjs-lib';

/**
 * Core type definitions for @alkanes/ts-sdk
 */

/**
 * Bitcoin network types
 */
type NetworkType = 'mainnet' | 'testnet' | 'signet' | 'regtest';
/**
 * HD wallet derivation path configuration
 */
interface HDPath {
    purpose: number;
    coinType: number;
    account: number;
    change: number;
    index: number;
}
/**
 * Keystore encryption parameters (compatible with ethers.js style)
 */
interface KeystoreParams {
    salt: string;
    nonce?: string;
    iterations: number;
    algorithm?: string;
}
/**
 * Encrypted keystore JSON structure (ethers.js compatible)
 */
interface EncryptedKeystore {
    encrypted_mnemonic: string;
    master_fingerprint: string;
    created_at: number;
    version: string;
    pbkdf2_params: KeystoreParams;
    account_xpub: string;
    hd_paths: Record<string, string>;
}
/**
 * Decrypted keystore object (in-memory only)
 */
interface Keystore {
    mnemonic: string;
    masterFingerprint: string;
    accountXpub: string;
    hdPaths: Record<string, HDPath>;
    network: NetworkType;
    createdAt: number;
}
/**
 * Wallet configuration
 */
interface WalletConfig {
    network: NetworkType;
    derivationPath?: string;
    account?: number;
}
/**
 * Address information
 */
interface AddressInfo {
    address: string;
    path: string;
    publicKey: string;
    index: number;
}
/**
 * Transaction input
 */
interface TxInput {
    txid: string;
    vout: number;
    value: number;
    address: string;
}
/**
 * Transaction output
 */
interface TxOutput {
    address: string;
    value: number;
}
/**
 * PSBT build options
 */
interface PsbtOptions {
    inputs: TxInput[];
    outputs: TxOutput[];
    feeRate?: number;
    network?: bitcoin.networks.Network;
}
/**
 * Alkane token ID
 */
interface AlkaneId {
    block: number;
    tx: number;
}
/**
 * Alkane balance information
 */
interface AlkaneBalance {
    id: AlkaneId;
    amount: string;
    name?: string;
    symbol?: string;
    decimals?: number;
}
/**
 * Alkane call parameters
 */
interface AlkaneCallParams {
    alkaneId: AlkaneId;
    method: string;
    args: any[];
    value?: number;
}
/**
 * Provider configuration for @oyl/sdk compatibility
 */
interface ProviderConfig {
    url: string;
    projectId?: string;
    network: bitcoin.networks.Network;
    networkType: NetworkType;
    version?: string;
}
/**
 * Transaction result
 */
interface TransactionResult {
    txId: string;
    rawTx: string;
    size: number;
    weight: number;
    fee: number;
    satsPerVByte: string;
}
/**
 * Block information
 */
interface BlockInfo {
    hash: string;
    height: number;
    timestamp: number;
    txCount: number;
}
/**
 * UTXO information
 */
interface UTXO {
    txid: string;
    vout: number;
    value: number;
    status: {
        confirmed: boolean;
        block_height?: number;
        block_hash?: string;
        block_time?: number;
    };
}
/**
 * Address balance
 */
interface AddressBalance {
    address: string;
    confirmed: number;
    unconfirmed: number;
    utxos: UTXO[];
}
/**
 * Export options
 */
interface ExportOptions {
    format?: 'json' | 'string';
    pretty?: boolean;
}
/**
 * Import options
 */
interface ImportOptions {
    validate?: boolean;
    network?: NetworkType;
}

/**
 * Provider integration for Alkanes SDK
 *
 * Compatible with @oyl/sdk Provider interface.
 * Integrates with alkanes-web-sys WASM backend for alkanes-specific functionality.
 */

/**
 * RPC client for Bitcoin Core / Sandshrew
 */
declare class BitcoinRpcClient {
    private url;
    constructor(url: string);
    call(method: string, params?: any[]): Promise<any>;
    getBlockCount(): Promise<number>;
    getBlockHash(height: number): Promise<string>;
    getBlock(hash: string): Promise<any>;
    sendRawTransaction(hex: string): Promise<string>;
    getTransaction(txid: string): Promise<any>;
    testMempoolAccept(txHex: string[]): Promise<any[]>;
    getMempoolEntry(txid: string): Promise<any>;
}
/**
 * Esplora API client
 */
declare class EsploraClient {
    private baseUrl;
    constructor(baseUrl: string);
    getAddressInfo(address: string): Promise<any>;
    getAddressUtxos(address: string): Promise<UTXO[]>;
    getAddressBalance(address: string): Promise<AddressBalance>;
    getTxInfo(txid: string): Promise<any>;
    broadcastTx(txHex: string): Promise<string>;
}
/**
 * Alkanes RPC client (integrates with WASM)
 */
declare class AlkanesRpcClient {
    private metashrewUrl;
    private sandshrewUrl?;
    constructor(metashrewUrl: string, sandshrewUrl?: string | undefined);
    getAlkaneBalance(address: string, alkaneId: AlkaneId): Promise<AlkaneBalance>;
    getAlkaneBytecode(alkaneId: AlkaneId, blockTag?: string): Promise<string>;
    simulateAlkaneCall(params: AlkaneCallParams): Promise<any>;
    multiSimulate(data: Uint8Array): Promise<any>;
    simulateRaw(data: Uint8Array): Promise<any>;
    sequence(): Promise<any>;
    metaRaw(data: Uint8Array): Promise<any>;
    runesByAddressRaw(data: Uint8Array): Promise<any>;
    unwrap(): Promise<any>;
    runesByOutpointRaw(data: Uint8Array): Promise<any>;
    spendablesByAddressRaw(data: Uint8Array): Promise<any>;
    protorunesByAddressRaw(data: Uint8Array): Promise<any>;
    getBlockRaw(data: Uint8Array): Promise<any>;
    protorunesByHeightRaw(data: Uint8Array): Promise<any>;
    alkanesIdToOutpointRaw(data: Uint8Array): Promise<any>;
    traceBlockRaw(height: number): Promise<any>;
    traceRaw(data: Uint8Array): Promise<any>;
    getBytecodeRaw(data: Uint8Array): Promise<any>;
    protorunesByOutpointRaw(data: Uint8Array): Promise<any>;
    runesByHeightRaw(data: Uint8Array): Promise<any>;
    getInventoryRaw(data: Uint8Array): Promise<any>;
    getStorageAtRaw(data: Uint8Array): Promise<any>;
}
/**
 * Main Alkanes Provider (compatible with @oyl/sdk)
 */
declare class AlkanesProvider {
    bitcoin: BitcoinRpcClient;
    esplora: EsploraClient;
    alkanes: AlkanesRpcClient;
    network: bitcoin.networks.Network;
    networkType: NetworkType;
    url: string;
    constructor(config: ProviderConfig);
    /**
     * Push a PSBT to the network (compatible with @oyl/sdk)
     */
    pushPsbt({ psbtHex, psbtBase64 }: {
        psbtHex?: string;
        psbtBase64?: string;
    }): Promise<TransactionResult>;
    /**
     * Get block information
     */
    getBlockInfo(hashOrHeight: string | number): Promise<BlockInfo>;
    /**
     * Get address balance
     */
    getBalance(address: string): Promise<AddressBalance>;
    /**
     * Get alkane balance for address
     */
    getAlkaneBalance(address: string, alkaneId: AlkaneId): Promise<AlkaneBalance>;
    /**
     * Simulate alkane contract call
     */
    simulateAlkaneCall(params: AlkaneCallParams): Promise<any>;
}
/**
 * Create an Alkanes provider instance
 *
 * @param config - Provider configuration
 * @returns AlkanesProvider instance compatible with @oyl/sdk
 */
declare function createProvider(config: ProviderConfig): AlkanesProvider;

/**
 * Wallet management for Alkanes SDK
 *
 * Provides Bitcoin wallet functionality with HD derivation,
 * address generation, and PSBT signing.
 */

/**
 * Address type enumeration
 */
declare enum AddressType {
    P2PKH = "p2pkh",// Legacy
    P2SH = "p2sh",// Script hash
    P2WPKH = "p2wpkh",// Native SegWit
    P2TR = "p2tr"
}
/**
 * Wallet class for managing Bitcoin addresses and transactions
 */
declare class AlkanesWallet {
    private root;
    private network;
    private keystore;
    private accountNode;
    constructor(keystore: Keystore);
    /**
     * Get master fingerprint
     */
    getMasterFingerprint(): string;
    /**
     * Get account extended public key
     */
    getAccountXpub(): string;
    /**
     * Get mnemonic (use with caution!)
     */
    getMnemonic(): string;
    /**
     * Derive address at specific index
     *
     * @param type - Address type (p2wpkh, p2tr, etc.)
     * @param index - Derivation index
     * @param change - Change address (0 = receiving, 1 = change)
     * @returns Address information
     */
    deriveAddress(type?: AddressType, index?: number, change?: number): AddressInfo;
    /**
     * Get receiving address at index
     */
    getReceivingAddress(index?: number, type?: AddressType): string;
    /**
     * Get change address at index
     */
    getChangeAddress(index?: number, type?: AddressType): string;
    /**
     * Get multiple addresses in a range
     */
    getAddresses(startIndex?: number, count?: number, type?: AddressType): AddressInfo[];
    /**
     * Sign a message with address at specific index
     *
     * @param message - Message to sign
     * @param index - Address index
     * @returns Signature in base64
     */
    signMessage(message: string, index?: number): string;
    /**
     * Create and sign a PSBT
     *
     * @param options - PSBT build options
     * @returns Signed PSBT in base64
     */
    createPsbt(options: PsbtOptions): Promise<string>;
    /**
     * Sign an existing PSBT
     *
     * @param psbtBase64 - PSBT in base64 format
     * @returns Signed PSBT in base64
     */
    signPsbt(psbtBase64: string): string;
    /**
     * Extract transaction from finalized PSBT
     */
    extractTransaction(psbtBase64: string): string;
    /**
     * Get WIF (Wallet Import Format) for specific index
     * Use with caution! This exposes the private key.
     */
    getPrivateKeyWIF(index?: number): string;
    private getNetwork;
}
/**
 * Create a wallet from a keystore
 */
declare function createWallet(keystore: Keystore): AlkanesWallet;
/**
 * Create a wallet from a mnemonic
 */
declare function createWalletFromMnemonic(mnemonic: string, network?: NetworkType): AlkanesWallet;

/**
 * Keystore management for Alkanes SDK
 *
 * Provides ethers.js-style keystore encryption/decryption with password protection.
 */

/**
 * Standard BIP44 derivation paths
 */
declare const DERIVATION_PATHS: {
    readonly BIP44: "m/44'/0'/0'/0";
    readonly BIP49: "m/49'/0'/0'/0";
    readonly BIP84: "m/84'/0'/0'/0";
    readonly BIP86: "m/86'/0'/0'/0";
};
/**
 * Keystore manager class
 *
 * Manages wallet mnemonics with encryption compatible with ethers.js format.
 * Uses pure JS implementation for cryptographic operations.
 */
declare class KeystoreManager {
    constructor();
    /**
     * Generate a new mnemonic phrase
     *
     * @param wordCount - Number of words (12, 15, 18, 21, or 24)
     * @returns BIP39 mnemonic phrase
     */
    generateMnemonic(wordCount?: 12 | 15 | 18 | 21 | 24): string;
    /**
     * Validate a mnemonic phrase
     *
     * @param mnemonic - BIP39 mnemonic to validate
     * @returns true if valid
     */
    validateMnemonic(mnemonic: string): boolean;
    /**
     * Create a new keystore from mnemonic
     *
     * @param mnemonic - BIP39 mnemonic phrase
     * @param config - Wallet configuration
     * @returns Decrypted keystore object
     */
    createKeystore(mnemonic: string, config: WalletConfig): Keystore;
    /**
     * Export keystore to encrypted JSON (ethers.js compatible)
     *
     * @param keystore - Decrypted keystore object
     * @param password - Encryption password
     * @param options - Export options
     * @returns Encrypted keystore JSON
     */
    exportKeystore(keystore: Keystore, password: string, options?: ExportOptions): Promise<string | EncryptedKeystore>;
    /**
     * Import keystore from encrypted JSON (ethers.js compatible)
     *
     * @param json - Encrypted keystore JSON string or object
     * @param password - Decryption password
     * @param options - Import options
     * @returns Decrypted keystore object
     */
    importKeystore(json: string | EncryptedKeystore, password: string, options?: ImportOptions): Promise<Keystore>;
    /**
     * Pure JS encryption implementation (fallback)
     */
    private exportKeystoreJS;
    /**
     * Pure JS decryption implementation (fallback)
     */
    private importKeystoreJS;
    private getNetwork;
    private parsePath;
    private serializeHdPaths;
    private deserializeHdPaths;
    private isValidEncryptedKeystore;
    private getCrypto;
    private bufferToHex;
    private hexToBuffer;
}
/**
 * Convenience function to create a new keystore
 */
declare function createKeystore(password: string, config?: WalletConfig, wordCount?: 12 | 15 | 18 | 21 | 24): Promise<{
    keystore: string;
    mnemonic: string;
}>;
/**
 * Convenience function to unlock an encrypted keystore
 */
declare function unlockKeystore(keystoreJson: string, password: string): Promise<Keystore>;

declare function wrapBtc({ utxos, account, // This will be the address to send change to, and to derive key from
provider, signer, // This is an AlkanesWallet instance
feeRate, wrapAmount, }: {
    utxos: UTXO[];
    account: string;
    provider: AlkanesProvider;
    signer: AlkanesWallet;
    feeRate: number;
    wrapAmount: number;
}): Promise<TransactionResult>;

/**
 * Utility functions for Alkanes SDK
 */

/**
 * Convert network type string to bitcoinjs-lib network object
 */
declare function getNetwork(networkType: NetworkType): bitcoin.networks.Network;
/**
 * Validate Bitcoin address for a specific network
 */
declare function validateAddress(address: string, network?: bitcoin.networks.Network): boolean;
/**
 * Convert satoshis to BTC
 */
declare function satoshisToBTC(satoshis: number): number;
/**
 * Convert BTC to satoshis
 */
declare function btcToSatoshis(btc: number): number;
/**
 * Format AlkaneId as string
 */
declare function formatAlkaneId(id: AlkaneId): string;
/**
 * Parse AlkaneId from string
 */
declare function parseAlkaneId(idString: string): AlkaneId;
/**
 * Wait for a specific amount of time
 */
declare function delay(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
declare function retry<T>(fn: () => Promise<T>, maxAttempts?: number, delayMs?: number): Promise<T>;
/**
 * Calculate transaction fee for given size and fee rate
 */
declare function calculateFee(vsize: number, feeRate: number): number;
/**
 * Estimate transaction vsize
 */
declare function estimateTxSize(inputCount: number, outputCount: number, inputType?: 'legacy' | 'segwit' | 'taproot'): number;
/**
 * Convert hex string to Uint8Array
 */
declare function hexToBytes(hex: string): Uint8Array;
/**
 * Convert Uint8Array to hex string
 */
declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Reverse byte order (for block hashes, txids, etc.)
 */
declare function reverseBytes(bytes: Uint8Array): Uint8Array;
/**
 * Convert little-endian hex to big-endian
 */
declare function reversedHex(hex: string): string;
/**
 * Check if running in browser
 */
declare function isBrowser(): boolean;
/**
 * Check if running in Node.js
 */
declare function isNode(): boolean;
/**
 * Safe JSON parse with error handling
 */
declare function safeJsonParse<T>(json: string, defaultValue?: T): T | null;
/**
 * Format timestamp to readable date
 */
declare function formatTimestamp(timestamp: number): string;
/**
 * Calculate transaction weight
 */
declare function calculateWeight(baseSize: number, witnessSize: number): number;
/**
 * Convert weight to vsize
 */
declare function weightToVsize(weight: number): number;

/* tslint:disable */
/* eslint-disable */

type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

interface InitOutput {
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

type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
declare function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
declare function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;

declare const VERSION = "0.1.0";

/**
 * Initialize the SDK with WASM module
 *
 * @example
 * ```typescript
 * import init, * as wasm from '@alkanes/ts-sdk/wasm/alkanes';
 * import { initSDK } from '@alkanes/ts-sdk';
 *
 * await init();
 * const sdk = initSDK(wasm);
 * ```
 */
declare function initSDK(wasm: InitOutput): Promise<{
    KeystoreManager: typeof KeystoreManager;
    AlkanesWallet: typeof AlkanesWallet;
    AlkanesProvider: typeof AlkanesProvider;
    createKeystore: typeof createKeystore;
    unlockKeystore: typeof unlockKeystore;
    createWallet: typeof createWallet;
    createWalletFromMnemonic: typeof createWalletFromMnemonic;
    createProvider: (config: any) => AlkanesProvider;
    version: string;
    wasm: InitOutput;
}>;
declare function getAlkanesSDK(): Promise<{
    KeystoreManager: typeof KeystoreManager;
    AlkanesWallet: typeof AlkanesWallet;
    AlkanesProvider: typeof AlkanesProvider;
    createKeystore: typeof createKeystore;
    unlockKeystore: typeof unlockKeystore;
    createWallet: typeof createWallet;
    createWalletFromMnemonic: typeof createWalletFromMnemonic;
    createProvider: typeof createProvider;
    initSDK: typeof initSDK;
    VERSION: string;
}>;

export { type AddressBalance, type AddressInfo, AddressType, type AlkaneBalance, type AlkaneCallParams, type AlkaneId, AlkanesProvider, AlkanesRpcClient, AlkanesWallet, BitcoinRpcClient, type BlockInfo, DERIVATION_PATHS, type EncryptedKeystore, EsploraClient, type ExportOptions, type HDPath, type ImportOptions, type Keystore, KeystoreManager, type KeystoreParams, type NetworkType, type ProviderConfig, type PsbtOptions, type TransactionResult, type TxInput, type TxOutput, type UTXO, VERSION, type WalletConfig, btcToSatoshis, bytesToHex, calculateFee, calculateWeight, createKeystore, createProvider, createWallet, createWalletFromMnemonic, getAlkanesSDK as default, delay, estimateTxSize, formatAlkaneId, formatTimestamp, getNetwork, hexToBytes, __wbg_init as init, initSDK, initSync, isBrowser, isNode, parseAlkaneId, retry, reverseBytes, reversedHex, safeJsonParse, satoshisToBTC, unlockKeystore, validateAddress, weightToVsize, wrapBtc };
