/* tslint:disable */
/* eslint-disable */
export function analyze_psbt(psbt_base64: string): string;
export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
/**
 * Wrap BTC to frBTC
 *
 * This function wraps BTC into frBTC by calling opcode 77 on the frBTC alkane {32, 0}.
 *
 * # Arguments
 * * `network` - Network name: "mainnet", "signet", "regtest", etc.
 * * `params_json` - JSON string containing WrapBtcParamsJs
 *
 * # Returns
 * Promise resolving to JSON string containing WrapBtcResultJs
 *
 * # Example (JavaScript)
 * ```js
 * const params = {
 *   amount: 100000, // 0.001 BTC in sats
 *   to_address: "bc1p...",
 *   fee_rate: 5.0
 * };
 * const result = await wrap_btc("mainnet", JSON.stringify(params));
 * const { reveal_txid } = JSON.parse(result);
 * ```
 */
export function wrap_btc(network: string, params_json: string): Promise<any>;
/**
 * Get the subfrost signer address for frBTC
 *
 * Derives the P2TR address that holds BTC backing frBTC by calling GET_SIGNER opcode (103)
 * on the frBTC contract at {32, 0}.
 *
 * # Arguments
 * * `network` - Network name: "mainnet", "signet", "regtest", etc.
 *
 * # Returns
 * Promise resolving to the subfrost signer address string (P2TR format)
 *
 * # Example (JavaScript)
 * ```js
 * const address = await get_subfrost_address("mainnet");
 * console.log(address); // "bc1p..."
 * ```
 */
export function get_subfrost_address(network: string): Promise<any>;
/**
 * Get pending unwraps from the alkanes indexer
 *
 * Queries the metashrew indexer for pending frBTC → BTC unwrap requests.
 *
 * # Arguments
 * * `network` - Network name: "mainnet", "signet", "regtest", etc.
 * * `confirmations` - Number of confirmations required before unwraps are returned
 *
 * # Returns
 * Promise resolving to JSON array of PendingUnwrapJs objects
 *
 * # Example (JavaScript)
 * ```js
 * const unwraps = JSON.parse(await get_pending_unwraps("mainnet", 6));
 * for (const u of unwraps) {
 *   console.log(`${u.txid}:${u.vout} - ${u.amount} sats`);
 * }
 * ```
 */
export function get_pending_unwraps(network: string, confirmations: bigint): Promise<any>;
/**
 * Get the total supply of frBTC
 *
 * Queries the alkanes indexer for the total frBTC supply.
 *
 * # Arguments
 * * `network` - Network name: "mainnet", "signet", "regtest", etc.
 *
 * # Returns
 * Promise resolving to total supply in satoshis as a string (to avoid JS number precision issues)
 *
 * # Example (JavaScript)
 * ```js
 * const totalSupply = await get_frbtc_total_supply("mainnet");
 * console.log(`Total frBTC: ${totalSupply} sats`);
 * ```
 */
export function get_frbtc_total_supply(network: string): Promise<any>;
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
export function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
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
  alkanesTrace(outpoint: string): Promise<any>;
  alkanesByAddress(address: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  alkanesByOutpoint(outpoint: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  esploraGetTx(txid: string): Promise<any>;
  esploraGetTxStatus(txid: string): Promise<any>;
  esploraGetAddressInfo(address: string): Promise<any>;
  esploraGetBlocksTipHeight(): Promise<any>;
  esploraGetBlocksTipHash(): Promise<any>;
  esploraGetAddressUtxo(address: string): Promise<any>;
  esploraGetAddressTxs(address: string): Promise<any>;
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
  walletCreatePsbt(params_json: string): Promise<any>;
  walletExport(): Promise<any>;
  walletBackup(): Promise<any>;
  /**
   * Wrap BTC to frBTC - returns base64-encoded PSBT for signing
   *
   * # Arguments
   * * `amount` - Amount in satoshis to wrap
   * * `address` - Optional source address (uses wallet if not provided)
   * * `fee_rate` - Optional fee rate in sat/vB
   *
   * # Returns
   * Promise resolving to base64-encoded PSBT
   */
  wrapBtc(amount: number, address?: string | null, fee_rate?: number | null): Promise<any>;
  /**
   * Unwrap frBTC to BTC - returns base64-encoded PSBT for signing
   *
   * # Arguments
   * * `amount` - Amount in satoshis to unwrap
   * * `address` - Optional source address (uses wallet if not provided)
   *
   * # Returns
   * Promise resolving to base64-encoded PSBT
   */
  unwrapBtc(amount: number, address?: string | null): Promise<any>;
  /**
   * Send BTC from one wallet to another - returns base64-encoded PSBT for signing
   *
   * # Arguments
   * * `to_address` - Destination Bitcoin address
   * * `amount` - Amount in satoshis to send
   * * `from_address` - Optional source address (uses wallet if not provided)
   * * `fee_rate` - Optional fee rate in sat/vB
   * * `send_all` - If true, sends entire balance (ignores amount)
   *
   * # Returns
   * Promise resolving to base64-encoded PSBT
   *
   * # Example (JavaScript)
   * ```js
   * const provider = new WebProvider("signet");
   * const psbt = await provider.sendBtc(
   *   "tb1p...",  // destination address
   *   100000,     // amount in sats
   *   "tb1q...",  // optional: source address
   *   5.0,        // optional: fee rate
   *   false       // optional: send all
   * );
   * // psbt is base64-encoded, ready for signing
   * ```
   */
  sendBtc(to_address: string, amount: number, from_address?: string | null, fee_rate?: number | null, send_all?: boolean | null): Promise<any>;
  /**
   * Get the subfrost signer address for frBTC
   *
   * # Returns
   * Promise resolving to the subfrost signer address string (P2TR format)
   */
  getSubfrostAddress(): Promise<any>;
  /**
   * Get the total supply of frBTC
   *
   * # Returns
   * Promise resolving to total supply in satoshis as a string
   */
  getFrbtcTotalSupply(): Promise<any>;
  /**
   * Get blocks starting from a height
   */
  esploraGetBlocks(start_height?: bigint | null): Promise<any>;
  /**
   * Get block by height
   */
  esploraGetBlockByHeight(height: bigint): Promise<any>;
  /**
   * Get block by hash
   */
  esploraGetBlock(hash: string): Promise<any>;
  /**
   * Get block status
   */
  esploraGetBlockStatus(hash: string): Promise<any>;
  /**
   * Get block transaction IDs
   */
  esploraGetBlockTxids(hash: string): Promise<any>;
  /**
   * Get block header
   */
  esploraGetBlockHeader(hash: string): Promise<any>;
  /**
   * Get raw block
   */
  esploraGetBlockRaw(hash: string): Promise<any>;
  /**
   * Get block txid by index
   */
  esploraGetBlockTxid(hash: string, index: number): Promise<any>;
  /**
   * Get block transactions
   */
  esploraGetBlockTxs(hash: string, start_index?: number | null): Promise<any>;
  /**
   * Get address transactions with pagination (chain)
   */
  esploraGetAddressTxsChain(address: string, last_seen_txid?: string | null): Promise<any>;
  /**
   * Get address mempool transactions
   */
  esploraGetAddressTxsMempool(address: string): Promise<any>;
  /**
   * Get raw transaction
   */
  esploraGetTxRaw(txid: string): Promise<any>;
  /**
   * Get transaction merkle proof
   */
  esploraGetTxMerkleProof(txid: string): Promise<any>;
  /**
   * Get transaction outspend
   */
  esploraGetTxOutspend(txid: string, index: number): Promise<any>;
  /**
   * Get all transaction outspends
   */
  esploraGetTxOutspends(txid: string): Promise<any>;
  /**
   * Get mempool info
   */
  esploraGetMempool(): Promise<any>;
  /**
   * Get mempool transaction IDs
   */
  esploraGetMempoolTxids(): Promise<any>;
  /**
   * Get recent mempool transactions
   */
  esploraGetMempoolRecent(): Promise<any>;
  /**
   * Get fee estimates
   */
  esploraGetFeeEstimates(): Promise<any>;
  /**
   * Get alkanes block by height
   */
  alkanesGetBlock(height: bigint): Promise<any>;
  /**
   * Get alkanes sequence
   */
  alkanesSequence(block_tag?: string | null): Promise<any>;
  /**
   * Get spendables by address
   */
  alkanesSpendablesByAddress(address: string): Promise<any>;
  /**
   * Trace alkanes block
   */
  alkanesTraceBlock(height: bigint): Promise<any>;
  /**
   * Get alkane storage
   */
  alkanesGetStorage(contract_id: string, key: string, block_tag?: string | null): Promise<any>;
  /**
   * Get pool details by ID using view call with opcode 999
   */
  alkanesPoolDetails(pool_block: bigint, pool_tx: bigint): Promise<any>;
  /**
   * Get inscriptions in a block
   */
  ordInscriptionsInBlock(block_hash: string): Promise<any>;
  /**
   * Get ord address info
   */
  ordAddressInfo(address: string): Promise<any>;
  /**
   * Get ord block info
   */
  ordBlockInfo(query: string): Promise<any>;
  /**
   * Get ord block count
   */
  ordBlockCount(): Promise<any>;
  /**
   * Get inscription children
   */
  ordChildren(inscription_id: string, page?: number | null): Promise<any>;
  /**
   * Get inscription content
   */
  ordContent(inscription_id: string): Promise<any>;
  /**
   * Get inscription parents
   */
  ordParents(inscription_id: string, page?: number | null): Promise<any>;
  /**
   * Get all runes
   */
  ordRunes(page?: number | null): Promise<any>;
  /**
   * Get transaction info from ord
   */
  ordTxInfo(txid: string): Promise<any>;
  /**
   * Decode raw transaction
   */
  bitcoindDecodeRawTransaction(tx_hex: string): Promise<any>;
  /**
   * Get raw mempool
   */
  bitcoindGetRawMempool(): Promise<any>;
  /**
   * Get transaction output
   */
  bitcoindGetTxOut(txid: string, vout: number, include_mempool: boolean): Promise<any>;
}
