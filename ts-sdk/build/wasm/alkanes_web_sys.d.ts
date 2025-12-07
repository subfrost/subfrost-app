/* tslint:disable */
/* eslint-disable */
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
export function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
export function analyze_psbt(psbt_base64: string): string;
export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
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
  luaEvalScript(script: string): Promise<any>;
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
