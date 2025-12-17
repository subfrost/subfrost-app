/* tslint:disable */
/* eslint-disable */
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
export function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
export function analyze_psbt(psbt_base64: string, network_str: string): string;
export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
/**
 * Analyze a transaction's runestone to extract Protostones
 *
 * This function takes a raw transaction hex string, decodes it, and extracts
 * all Protostones from the transaction's OP_RETURN output.
 *
 * # Arguments
 *
 * * `tx_hex` - Hexadecimal string of the raw transaction (with or without "0x" prefix)
 *
 * # Returns
 *
 * A JSON string containing:
 * - `protostone_count`: Number of Protostones found
 * - `protostones`: Array of Protostone objects with their details
 *
 * # Example
 *
 * ```javascript
 * const result = analyze_runestone(txHex);
 * const data = JSON.parse(result);
 * console.log(`Found ${data.protostone_count} Protostones`);
 * ```
 */
export function analyze_runestone(tx_hex: string): string;
export interface PoolWithDetails {
    pool_id_block: number;
    pool_id_tx: number;
    details: PoolDetails | null;
}

export interface BatchPoolsResponse {
    pool_count: number;
    pools: PoolWithDetails[];
}

/**
 * Represents the entire JSON keystore, compatible with wasm-bindgen.
 */
export class Keystore {
  free(): void;
  [Symbol.dispose](): void;
  constructor(val: any);
  to_js(): any;
  accountXpub(): string;
  hdPaths(): any;
  masterFingerprint(): string;
  decryptMnemonic(passphrase: string): Promise<any>;
}
/**
 * Parameters for the PBKDF2/S2K key derivation function.
 */
export class PbkdfParams {
  free(): void;
  [Symbol.dispose](): void;
  constructor(val: any);
  to_js(): any;
}
/**
 * WASM-exported BrowserWalletProvider that can be created from JavaScript
 */
export class WasmBrowserWalletProvider {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new BrowserWalletProvider from a JavaScript wallet adapter
   *
   * @param adapter - A JavaScript object implementing the JsWalletAdapter interface
   * @param network - Network string ("mainnet", "testnet", "signet", "regtest")
   * @returns Promise<WasmBrowserWalletProvider>
   */
  constructor(adapter: JsWalletAdapter, network: string);
  /**
   * Get the connected wallet address
   */
  getAddress(): string | undefined;
  /**
   * Get the wallet public key
   */
  getPublicKey(): Promise<string>;
  /**
   * Sign a PSBT (hex encoded)
   */
  signPsbt(psbt_hex: string, options: any): Promise<string>;
  /**
   * Sign a message
   */
  signMessage(message: string, address?: string | null): Promise<string>;
  /**
   * Broadcast a transaction
   */
  broadcastTransaction(tx_hex: string): Promise<string>;
  /**
   * Get balance
   */
  getBalance(): Promise<any>;
  /**
   * Get UTXOs
   */
  getUtxos(include_frozen: boolean): Promise<any>;
  /**
   * Get enriched UTXOs with asset information
   */
  getEnrichedUtxos(): Promise<any>;
  /**
   * Get all balances (BTC + alkanes)
   */
  getAllBalances(): Promise<any>;
  /**
   * Get wallet info
   */
  getWalletInfo(): any;
  /**
   * Get connection status
   */
  getConnectionStatus(): string;
  /**
   * Get current network
   */
  getNetwork(): string;
  /**
   * Disconnect from the wallet
   */
  disconnect(): Promise<void>;
}
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
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new WebProvider from provider name and optional config overrides
   * 
   * # Arguments
   * * `provider` - Network provider: "mainnet", "signet", "subfrost-regtest", "regtest"
   * * `config` - Optional JS object with RpcConfig fields to override defaults
   *
   * # Example (JavaScript)
   * ```js
   * // Simple - uses all defaults for signet
   * const provider = new WebProvider("signet");
   * 
   * // With overrides
   * const provider = new WebProvider("signet", {
   *   bitcoin_rpc_url: "https://custom-rpc.example.com",
   *   esplora_url: "https://custom-esplora.example.com"
   * });
   * ```
   */
  constructor(provider: string, config?: any | null);
  sandshrew_rpc_url(): string;
  esplora_rpc_url(): string | undefined;
  bitcoin_rpc_url(): string;
  brc20_prog_rpc_url(): string;
  /**
   * Get enriched wallet balances using the balances.lua script
   * 
   * This uses the built-in balances.lua script with automatic hash-based caching.
   * Returns comprehensive balance data including spendable UTXOs, asset UTXOs, and pending.
   */
  getEnrichedBalances(address: string, protocol_tag?: string | null): Promise<any>;
  /**
   * Get all transactions for an address from Esplora
   */
  getAddressTxs(address: string): Promise<any>;
  /**
   * Get raw transaction hex
   */
  getTransactionHex(txid: string): Promise<any>;
  /**
   * Trace alkanes execution for a protostone outpoint
   */
  traceOutpoint(outpoint: string): Promise<any>;
  /**
   * Get address UTXOs
   */
  getAddressUtxos(address: string): Promise<any>;
  /**
   * Broadcast a raw transaction
   */
  broadcastTransaction(tx_hex: string): Promise<any>;
  /**
   * Get address transactions with complete runestone traces (CLI: esplora address-txs --runestone-trace)
   */
  getAddressTxsWithTraces(address: string, exclude_coinbase?: boolean | null): Promise<any>;
  ordInscription(inscription_id: string): Promise<any>;
  ordInscriptions(page?: number | null): Promise<any>;
  ordOutputs(address: string): Promise<any>;
  ordRune(rune: string): Promise<any>;
  /**
   * Execute an alkanes smart contract
   */
  alkanesExecute(params_json: string): Promise<any>;
  /**
   * Execute an alkanes smart contract using CLI-style string parameters
   * This is the recommended method for executing alkanes contracts as it supports
   * the same parameter format as alkanes-cli.
   *
   * # Parameters
   * - `to_addresses`: JSON array of recipient addresses
   * - `input_requirements`: String format like "B:10000" or "2:0:1000" (alkane block:tx:amount)
   * - `protostones`: String format like "[32,0,77]:v0:v0" (cellpack:pointer:refund)
   * - `fee_rate`: Optional fee rate in sat/vB
   * - `envelope_hex`: Optional envelope data as hex string
   * - `options_json`: Optional JSON with additional options (trace_enabled, mine_enabled, auto_confirm, raw_output)
   */
  alkanesExecuteWithStrings(to_addresses_json: string, input_requirements: string, protostones: string, fee_rate?: number | null, envelope_hex?: string | null, options_json?: string | null): Promise<any>;
  /**
   * Resume execution after user confirmation (for simple transactions)
   */
  alkanesResumeExecution(state_json: string, params_json: string): Promise<any>;
  /**
   * Resume execution after commit transaction confirmation
   */
  alkanesResumeCommitExecution(state_json: string): Promise<any>;
  /**
   * Resume execution after reveal transaction confirmation
   */
  alkanesResumeRevealExecution(state_json: string): Promise<any>;
  /**
   * Simulate an alkanes contract call (read-only)
   */
  alkanesSimulate(contract_id: string, context_json: string, block_tag?: string | null): Promise<any>;
  /**
   * Get alkanes contract balance for an address
   */
  alkanesBalance(address?: string | null): Promise<any>;
  /**
   * Get alkanes contract bytecode
   */
  alkanesBytecode(alkane_id: string, block_tag?: string | null): Promise<any>;
  /**
   * Get all pools with details from an AMM factory (parallel optimized for browser)
   */
  alkanesGetAllPoolsWithDetails(factory_id: string, chunk_size?: number | null, max_concurrent?: number | null): Promise<any>;
  /**
   * Get all pools from a factory (lightweight, IDs only)
   */
  alkanesGetAllPools(factory_id: string): Promise<any>;
  /**
   * Get pool details including reserves using simulation
   */
  ammGetPoolDetails(pool_id: string): Promise<any>;
  alkanesTrace(outpoint: string): Promise<any>;
  traceProtostones(txid: string): Promise<any>;
  traceBlock(height: number): Promise<any>;
  alkanesByAddress(address: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  alkanesByOutpoint(outpoint: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  esploraGetTx(txid: string): Promise<any>;
  esploraGetTxStatus(txid: string): Promise<any>;
  esploraGetAddressInfo(address: string): Promise<any>;
  esploraGetBlocksTipHeight(): Promise<any>;
  esploraGetBlocksTipHash(): Promise<any>;
  esploraGetAddressUtxo(address: string): Promise<any>;
  esploraGetAddressTxs(address: string): Promise<any>;
  esploraGetFeeEstimates(): Promise<any>;
  esploraBroadcastTx(tx_hex: string): Promise<any>;
  esploraGetTxHex(txid: string): Promise<any>;
  bitcoindGetBlockCount(): Promise<any>;
  bitcoindSendRawTransaction(tx_hex: string): Promise<any>;
  bitcoindGenerateToAddress(nblocks: number, address: string): Promise<any>;
  bitcoindGenerateFuture(address: string): Promise<any>;
  bitcoindGetBlockchainInfo(): Promise<any>;
  bitcoindGetNetworkInfo(): Promise<any>;
  bitcoindGetRawTransaction(txid: string, block_hash?: string | null): Promise<any>;
  bitcoindGetBlock(hash: string, raw: boolean): Promise<any>;
  bitcoindGetBlockHash(height: number): Promise<any>;
  bitcoindGetBlockHeader(hash: string): Promise<any>;
  bitcoindGetBlockStats(hash: string): Promise<any>;
  bitcoindGetMempoolInfo(): Promise<any>;
  bitcoindEstimateSmartFee(target: number): Promise<any>;
  bitcoindGetChainTips(): Promise<any>;
  alkanesView(contract_id: string, view_fn: string, params?: Uint8Array | null, block_tag?: string | null): Promise<any>;
  alkanesInspect(target: string, config: any): Promise<any>;
  alkanesPendingUnwraps(block_tag?: string | null): Promise<any>;
  brc20progCall(to: string, data: string, block?: string | null): Promise<any>;
  brc20progGetBalance(address: string, block?: string | null): Promise<any>;
  brc20progGetCode(address: string): Promise<any>;
  brc20progGetTransactionCount(address: string, block?: string | null): Promise<any>;
  brc20progBlockNumber(): Promise<any>;
  brc20progChainId(): Promise<any>;
  brc20progGetTransactionReceipt(tx_hash: string): Promise<any>;
  brc20progGetTransactionByHash(tx_hash: string): Promise<any>;
  brc20progGetBlockByNumber(block: string, full_tx: boolean): Promise<any>;
  brc20progEstimateGas(to: string, data: string, block?: string | null): Promise<any>;
  brc20progGetLogs(filter: any): Promise<any>;
  brc20progWeb3ClientVersion(): Promise<any>;
  metashrewHeight(): Promise<any>;
  metashrewStateRoot(height?: number | null): Promise<any>;
  metashrewGetBlockHash(height: number): Promise<any>;
  /**
   * Generic metashrew_view call
   *
   * Calls the metashrew_view RPC method with the given view function, payload, and block tag.
   * This is the low-level method for calling any metashrew view function.
   *
   * # Arguments
   * * `view_fn` - The view function name (e.g., "simulate", "protorunesbyaddress")
   * * `payload` - The hex-encoded payload (with or without 0x prefix)
   * * `block_tag` - The block tag ("latest" or a block height as string)
   *
   * # Returns
   * The hex-encoded response string from the view function
   */
  metashrewView(view_fn: string, payload: string, block_tag: string): Promise<any>;
  luaEvalScript(script: string): Promise<any>;
  /**
   * Execute a Lua script with arguments, using scripthash caching
   *
   * This method first tries to use the cached scripthash version (lua_evalsaved),
   * and falls back to the full script (lua_evalscript) if the hash isn't cached.
   * This is the recommended way to execute Lua scripts for better performance.
   *
   * # Arguments
   * * `script` - The Lua script content
   * * `args` - JSON-serialized array of arguments to pass to the script
   */
  luaEval(script: string, args: any): Promise<any>;
  ordList(outpoint: string): Promise<any>;
  ordFind(sat: number): Promise<any>;
  runestoneDecodeTx(txid: string): Promise<any>;
  runestoneAnalyzeTx(txid: string): Promise<any>;
  protorunesDecodeTx(txid: string): Promise<any>;
  protorunesAnalyzeTx(txid: string): Promise<any>;
  /**
   * Create a new wallet with an optional mnemonic phrase
   * If no mnemonic is provided, a new one will be generated
   * Returns wallet info including address and mnemonic
   *
   * Note: This sets the keystore on self synchronously so walletIsLoaded() returns true immediately
   */
  walletCreate(mnemonic?: string | null, passphrase?: string | null): any;
  /**
   * Load an existing wallet from storage
   */
  walletLoad(passphrase?: string | null): Promise<any>;
  /**
   * Get the wallet's primary address
   */
  walletGetAddress(): Promise<any>;
  /**
   * Get the wallet's BTC balance
   * Returns { confirmed: number, pending: number }
   */
  walletGetBalance(addresses?: string[] | null): Promise<any>;
  /**
   * Load a wallet from mnemonic for signing transactions
   * This must be called before walletSend or other signing operations
   */
  walletLoadMnemonic(mnemonic_str: string, passphrase?: string | null): void;
  /**
   * Check if wallet is loaded (has keystore for signing)
   */
  walletIsLoaded(): boolean;
  /**
   * Send BTC to an address
   * params: { address: string, amount: number (satoshis), fee_rate?: number }
   * Wallet must be loaded first via walletLoadMnemonic
   */
  walletSend(params_json: string): Promise<any>;
  /**
   * Get UTXOs for the wallet
   */
  walletGetUtxos(addresses?: string[] | null): Promise<any>;
  /**
   * Get transaction history for an address
   */
  walletGetHistory(address?: string | null): Promise<any>;
  walletCreatePsbt(params_json: string): Promise<any>;
  walletExport(): Promise<any>;
  walletBackup(): Promise<any>;
  dataApiGetPoolHistory(pool_id: string, category?: string | null, limit?: bigint | null, offset?: bigint | null): Promise<any>;
  dataApiGetPools(factory_id: string): Promise<any>;
  dataApiGetAlkanesByAddress(address: string): Promise<any>;
  dataApiGetAddressBalances(address: string, include_outpoints: boolean): Promise<any>;
  dataApiGetAllHistory(pool_id: string, limit?: bigint | null, offset?: bigint | null): Promise<any>;
  dataApiGetSwapHistory(pool_id: string, limit?: bigint | null, offset?: bigint | null): Promise<any>;
  dataApiGetMintHistory(pool_id: string, limit?: bigint | null, offset?: bigint | null): Promise<any>;
  dataApiGetBurnHistory(pool_id: string, limit?: bigint | null, offset?: bigint | null): Promise<any>;
  dataApiGetTrades(pool: string, start_time?: number | null, end_time?: number | null, limit?: bigint | null): Promise<any>;
  dataApiGetCandles(pool: string, interval: string, start_time?: number | null, end_time?: number | null, limit?: bigint | null): Promise<any>;
  dataApiGetReserves(pool: string): Promise<any>;
  dataApiGetHolders(alkane: string, page: bigint, limit: bigint): Promise<any>;
  dataApiGetHoldersCount(alkane: string): Promise<any>;
  dataApiGetKeys(alkane: string, prefix: string | null | undefined, limit: bigint): Promise<any>;
  dataApiGetBitcoinPrice(): Promise<any>;
  dataApiGetBitcoinMarketChart(days: string): Promise<any>;
  /**
   * Reflect alkane token metadata by querying standard opcodes
   *
   * This method queries the alkane contract with standard opcodes to retrieve
   * token metadata like name, symbol, total supply, cap, minted, and value per mint.
   *
   * # Arguments
   * * `alkane_id` - The alkane ID in "block:tx" format (e.g., "2:1234")
   *
   * # Returns
   * An AlkaneReflection object with all available metadata
   */
  alkanesReflect(alkane_id: string): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_webprovider_free: (a: number, b: number) => void;
  readonly webprovider_new_js: (a: number, b: number, c: number) => [number, number, number];
  readonly webprovider_sandshrew_rpc_url: (a: number) => [number, number];
  readonly webprovider_esplora_rpc_url: (a: number) => [number, number];
  readonly webprovider_bitcoin_rpc_url: (a: number) => [number, number];
  readonly webprovider_brc20_prog_rpc_url: (a: number) => [number, number];
  readonly webprovider_getEnrichedBalances: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_getAddressTxs: (a: number, b: number, c: number) => any;
  readonly webprovider_getTransactionHex: (a: number, b: number, c: number) => any;
  readonly webprovider_traceOutpoint: (a: number, b: number, c: number) => any;
  readonly webprovider_getAddressUtxos: (a: number, b: number, c: number) => any;
  readonly webprovider_broadcastTransaction: (a: number, b: number, c: number) => any;
  readonly webprovider_getAddressTxsWithTraces: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_ordInscription: (a: number, b: number, c: number) => any;
  readonly webprovider_ordInscriptions: (a: number, b: number, c: number) => any;
  readonly webprovider_ordOutputs: (a: number, b: number, c: number) => any;
  readonly webprovider_ordRune: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesExecute: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesExecuteWithStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => any;
  readonly webprovider_alkanesResumeExecution: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_alkanesResumeCommitExecution: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesResumeRevealExecution: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesSimulate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesBalance: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesBytecode: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_alkanesGetAllPoolsWithDetails: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesGetAllPools: (a: number, b: number, c: number) => any;
  readonly webprovider_ammGetPoolDetails: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesTrace: (a: number, b: number, c: number) => any;
  readonly webprovider_traceProtostones: (a: number, b: number, c: number) => any;
  readonly webprovider_traceBlock: (a: number, b: number) => any;
  readonly webprovider_alkanesByAddress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesByOutpoint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_esploraGetTx: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxStatus: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetAddressInfo: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlocksTipHeight: (a: number) => any;
  readonly webprovider_esploraGetBlocksTipHash: (a: number) => any;
  readonly webprovider_esploraGetAddressUtxo: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetAddressTxs: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetFeeEstimates: (a: number) => any;
  readonly webprovider_esploraBroadcastTx: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxHex: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGetBlockCount: (a: number) => any;
  readonly webprovider_bitcoindSendRawTransaction: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGenerateToAddress: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_bitcoindGenerateFuture: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGetBlockchainInfo: (a: number) => any;
  readonly webprovider_bitcoindGetNetworkInfo: (a: number) => any;
  readonly webprovider_bitcoindGetRawTransaction: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_bitcoindGetBlock: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_bitcoindGetBlockHash: (a: number, b: number) => any;
  readonly webprovider_bitcoindGetBlockHeader: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGetBlockStats: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGetMempoolInfo: (a: number) => any;
  readonly webprovider_bitcoindEstimateSmartFee: (a: number, b: number) => any;
  readonly webprovider_bitcoindGetChainTips: (a: number) => any;
  readonly webprovider_alkanesView: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
  readonly webprovider_alkanesInspect: (a: number, b: number, c: number, d: any) => any;
  readonly webprovider_alkanesPendingUnwraps: (a: number, b: number, c: number) => any;
  readonly webprovider_brc20progCall: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_brc20progGetBalance: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_brc20progGetCode: (a: number, b: number, c: number) => any;
  readonly webprovider_brc20progGetTransactionCount: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_brc20progBlockNumber: (a: number) => any;
  readonly webprovider_brc20progChainId: (a: number) => any;
  readonly webprovider_brc20progGetTransactionReceipt: (a: number, b: number, c: number) => any;
  readonly webprovider_brc20progGetTransactionByHash: (a: number, b: number, c: number) => any;
  readonly webprovider_brc20progGetBlockByNumber: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_brc20progEstimateGas: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_brc20progGetLogs: (a: number, b: any) => any;
  readonly webprovider_brc20progWeb3ClientVersion: (a: number) => any;
  readonly webprovider_metashrewHeight: (a: number) => any;
  readonly webprovider_metashrewStateRoot: (a: number, b: number, c: number) => any;
  readonly webprovider_metashrewGetBlockHash: (a: number, b: number) => any;
  readonly webprovider_metashrewView: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_luaEvalScript: (a: number, b: number, c: number) => any;
  readonly webprovider_luaEval: (a: number, b: number, c: number, d: any) => any;
  readonly webprovider_ordList: (a: number, b: number, c: number) => any;
  readonly webprovider_ordFind: (a: number, b: number) => any;
  readonly webprovider_runestoneDecodeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_runestoneAnalyzeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_protorunesDecodeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_protorunesAnalyzeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_walletCreate: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly webprovider_walletLoad: (a: number, b: number, c: number) => any;
  readonly webprovider_walletGetAddress: (a: number) => any;
  readonly webprovider_walletGetBalance: (a: number, b: number, c: number) => any;
  readonly webprovider_walletLoadMnemonic: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly webprovider_walletIsLoaded: (a: number) => number;
  readonly webprovider_walletSend: (a: number, b: number, c: number) => any;
  readonly webprovider_walletGetUtxos: (a: number, b: number, c: number) => any;
  readonly webprovider_walletGetHistory: (a: number, b: number, c: number) => any;
  readonly webprovider_walletCreatePsbt: (a: number, b: number, c: number) => any;
  readonly webprovider_walletExport: (a: number) => any;
  readonly webprovider_walletBackup: (a: number) => any;
  readonly webprovider_dataApiGetPoolHistory: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: bigint) => any;
  readonly webprovider_dataApiGetPools: (a: number, b: number, c: number) => any;
  readonly webprovider_dataApiGetAlkanesByAddress: (a: number, b: number, c: number) => any;
  readonly webprovider_dataApiGetAddressBalances: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_dataApiGetAllHistory: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: bigint) => any;
  readonly webprovider_dataApiGetSwapHistory: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: bigint) => any;
  readonly webprovider_dataApiGetMintHistory: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: bigint) => any;
  readonly webprovider_dataApiGetBurnHistory: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: bigint) => any;
  readonly webprovider_dataApiGetTrades: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint) => any;
  readonly webprovider_dataApiGetCandles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: bigint) => any;
  readonly webprovider_dataApiGetReserves: (a: number, b: number, c: number) => any;
  readonly webprovider_dataApiGetHolders: (a: number, b: number, c: number, d: bigint, e: bigint) => any;
  readonly webprovider_dataApiGetHoldersCount: (a: number, b: number, c: number) => any;
  readonly webprovider_dataApiGetKeys: (a: number, b: number, c: number, d: number, e: number, f: bigint) => any;
  readonly webprovider_dataApiGetBitcoinPrice: (a: number) => any;
  readonly webprovider_dataApiGetBitcoinMarketChart: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesReflect: (a: number, b: number, c: number) => any;
  readonly __wbg_wasmbrowserwalletprovider_free: (a: number, b: number) => void;
  readonly wasmbrowserwalletprovider_new: (a: any, b: number, c: number) => any;
  readonly wasmbrowserwalletprovider_getAddress: (a: number) => [number, number];
  readonly wasmbrowserwalletprovider_getPublicKey: (a: number) => any;
  readonly wasmbrowserwalletprovider_signPsbt: (a: number, b: number, c: number, d: any) => any;
  readonly wasmbrowserwalletprovider_signMessage: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly wasmbrowserwalletprovider_broadcastTransaction: (a: number, b: number, c: number) => any;
  readonly wasmbrowserwalletprovider_getBalance: (a: number) => any;
  readonly wasmbrowserwalletprovider_getUtxos: (a: number, b: number) => any;
  readonly wasmbrowserwalletprovider_getEnrichedUtxos: (a: number) => any;
  readonly wasmbrowserwalletprovider_getAllBalances: (a: number) => any;
  readonly wasmbrowserwalletprovider_getWalletInfo: (a: number) => any;
  readonly wasmbrowserwalletprovider_getConnectionStatus: (a: number) => [number, number];
  readonly wasmbrowserwalletprovider_getNetwork: (a: number) => [number, number];
  readonly wasmbrowserwalletprovider_disconnect: (a: number) => any;
  readonly __wbg_keystore_free: (a: number, b: number) => void;
  readonly __wbg_pbkdfparams_free: (a: number, b: number) => void;
  readonly pbkdfparams_from_js: (a: any) => [number, number, number];
  readonly pbkdfparams_to_js: (a: number) => [number, number, number];
  readonly keystore_from_js: (a: any) => [number, number, number];
  readonly keystore_to_js: (a: number) => [number, number, number];
  readonly keystore_accountXpub: (a: number) => [number, number];
  readonly keystore_hdPaths: (a: number) => any;
  readonly keystore_masterFingerprint: (a: number) => [number, number];
  readonly keystore_decryptMnemonic: (a: number, b: number, c: number) => any;
  readonly encryptMnemonic: (a: number, b: number, c: number, d: number) => any;
  readonly analyze_psbt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly simulate_alkane_call: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly get_alkane_bytecode: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly analyze_runestone: (a: number, b: number) => [number, number, number, number];
  readonly rustsecp256k1_v0_9_2_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_9_2_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_9_2_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_9_2_default_error_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h4a94c7d4879bc9ea: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__hda0b27b5b04387b3: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h53c04da2837a08e3: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
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
