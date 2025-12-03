import { WalletConfig, Keystore as Keystore$1, ExportOptions, EncryptedKeystore, ImportOptions } from '../types/index.mjs';
import 'bitcoinjs-lib';

/* tslint:disable */
/* eslint-disable */
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
declare function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
declare function analyze_psbt(psbt_base64: string): string;
declare function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
declare function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
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
declare function wrap_btc(network: string, params_json: string): Promise<any>;
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
declare function get_subfrost_address(network: string): Promise<any>;
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
declare function get_pending_unwraps(network: string, confirmations: bigint): Promise<any>;
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
declare function get_frbtc_total_supply(network: string): Promise<any>;
/**
 * Represents the entire JSON keystore, compatible with wasm-bindgen.
 */
declare class Keystore {
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
declare class PbkdfParams {
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
declare class WebProvider {
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

type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

interface InitOutput {
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
  readonly webprovider_alkanesResumeExecution: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_alkanesResumeCommitExecution: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesResumeRevealExecution: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesSimulate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesBalance: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesBytecode: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_alkanesTrace: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesByAddress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesByOutpoint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_esploraGetTx: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxStatus: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetAddressInfo: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlocksTipHeight: (a: number) => any;
  readonly webprovider_esploraGetBlocksTipHash: (a: number) => any;
  readonly webprovider_esploraGetAddressUtxo: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetAddressTxs: (a: number, b: number, c: number) => any;
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
  readonly webprovider_luaEvalScript: (a: number, b: number, c: number) => any;
  readonly webprovider_ordList: (a: number, b: number, c: number) => any;
  readonly webprovider_ordFind: (a: number, b: number) => any;
  readonly webprovider_runestoneDecodeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_runestoneAnalyzeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_protorunesDecodeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_protorunesAnalyzeTx: (a: number, b: number, c: number) => any;
  readonly webprovider_walletCreatePsbt: (a: number, b: number, c: number) => any;
  readonly webprovider_walletExport: (a: number) => any;
  readonly webprovider_walletBackup: (a: number) => any;
  readonly webprovider_wrapBtc: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_unwrapBtc: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_sendBtc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
  readonly webprovider_getSubfrostAddress: (a: number) => any;
  readonly webprovider_getFrbtcTotalSupply: (a: number) => any;
  readonly webprovider_esploraGetBlocks: (a: number, b: number, c: bigint) => any;
  readonly webprovider_esploraGetBlockByHeight: (a: number, b: bigint) => any;
  readonly webprovider_esploraGetBlock: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlockStatus: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlockTxids: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlockHeader: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlockRaw: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetBlockTxid: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_esploraGetBlockTxs: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_esploraGetAddressTxsChain: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webprovider_esploraGetAddressTxsMempool: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxRaw: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxMerkleProof: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetTxOutspend: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_esploraGetTxOutspends: (a: number, b: number, c: number) => any;
  readonly webprovider_esploraGetMempool: (a: number) => any;
  readonly webprovider_esploraGetMempoolTxids: (a: number) => any;
  readonly webprovider_esploraGetMempoolRecent: (a: number) => any;
  readonly webprovider_esploraGetFeeEstimates: (a: number) => any;
  readonly webprovider_alkanesGetBlock: (a: number, b: bigint) => any;
  readonly webprovider_alkanesSequence: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesSpendablesByAddress: (a: number, b: number, c: number) => any;
  readonly webprovider_alkanesTraceBlock: (a: number, b: bigint) => any;
  readonly webprovider_alkanesGetStorage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webprovider_alkanesPoolDetails: (a: number, b: bigint, c: bigint) => any;
  readonly webprovider_ordInscriptionsInBlock: (a: number, b: number, c: number) => any;
  readonly webprovider_ordAddressInfo: (a: number, b: number, c: number) => any;
  readonly webprovider_ordBlockInfo: (a: number, b: number, c: number) => any;
  readonly webprovider_ordBlockCount: (a: number) => any;
  readonly webprovider_ordChildren: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_ordContent: (a: number, b: number, c: number) => any;
  readonly webprovider_ordParents: (a: number, b: number, c: number, d: number) => any;
  readonly webprovider_ordRunes: (a: number, b: number) => any;
  readonly webprovider_ordTxInfo: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindDecodeRawTransaction: (a: number, b: number, c: number) => any;
  readonly webprovider_bitcoindGetRawMempool: (a: number) => any;
  readonly webprovider_bitcoindGetTxOut: (a: number, b: number, c: number, d: number, e: number) => any;
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
  readonly analyze_psbt: (a: number, b: number) => [number, number, number, number];
  readonly simulate_alkane_call: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly get_alkane_bytecode: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly wrap_btc: (a: number, b: number, c: number, d: number) => any;
  readonly get_subfrost_address: (a: number, b: number) => any;
  readonly get_pending_unwraps: (a: number, b: number, c: bigint) => any;
  readonly get_frbtc_total_supply: (a: number, b: number) => any;
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

type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
declare function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
declare function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

type AlkanesWasm_InitInput = InitInput;
type AlkanesWasm_InitOutput = InitOutput;
type AlkanesWasm_Keystore = Keystore;
declare const AlkanesWasm_Keystore: typeof Keystore;
type AlkanesWasm_PbkdfParams = PbkdfParams;
declare const AlkanesWasm_PbkdfParams: typeof PbkdfParams;
type AlkanesWasm_SyncInitInput = SyncInitInput;
type AlkanesWasm_WebProvider = WebProvider;
declare const AlkanesWasm_WebProvider: typeof WebProvider;
declare const AlkanesWasm_analyze_psbt: typeof analyze_psbt;
declare const AlkanesWasm_encryptMnemonic: typeof encryptMnemonic;
declare const AlkanesWasm_get_alkane_bytecode: typeof get_alkane_bytecode;
declare const AlkanesWasm_get_frbtc_total_supply: typeof get_frbtc_total_supply;
declare const AlkanesWasm_get_pending_unwraps: typeof get_pending_unwraps;
declare const AlkanesWasm_get_subfrost_address: typeof get_subfrost_address;
declare const AlkanesWasm_initSync: typeof initSync;
declare const AlkanesWasm_simulate_alkane_call: typeof simulate_alkane_call;
declare const AlkanesWasm_wrap_btc: typeof wrap_btc;
declare namespace AlkanesWasm {
  export { type AlkanesWasm_InitInput as InitInput, type AlkanesWasm_InitOutput as InitOutput, AlkanesWasm_Keystore as Keystore, AlkanesWasm_PbkdfParams as PbkdfParams, type AlkanesWasm_SyncInitInput as SyncInitInput, AlkanesWasm_WebProvider as WebProvider, AlkanesWasm_analyze_psbt as analyze_psbt, __wbg_init as default, AlkanesWasm_encryptMnemonic as encryptMnemonic, AlkanesWasm_get_alkane_bytecode as get_alkane_bytecode, AlkanesWasm_get_frbtc_total_supply as get_frbtc_total_supply, AlkanesWasm_get_pending_unwraps as get_pending_unwraps, AlkanesWasm_get_subfrost_address as get_subfrost_address, AlkanesWasm_initSync as initSync, AlkanesWasm_simulate_alkane_call as simulate_alkane_call, AlkanesWasm_wrap_btc as wrap_btc };
}

/**
 * Keystore management for Alkanes SDK
 *
 * Provides ethers.js-style keystore encryption/decryption with password protection.
 * Compatible with the WASM keystore implementation in alkanes-web-sys.
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
 * Can be used standalone or integrated with WASM backend.
 */
declare class KeystoreManager {
    private wasm?;
    constructor(wasmModule?: typeof AlkanesWasm);
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
    createKeystore(mnemonic: string, config: WalletConfig): Keystore$1;
    /**
     * Export keystore to encrypted JSON (ethers.js compatible)
     *
     * @param keystore - Decrypted keystore object
     * @param password - Encryption password
     * @param options - Export options
     * @returns Encrypted keystore JSON
     */
    exportKeystore(keystore: Keystore$1, password: string, options?: ExportOptions): Promise<string | EncryptedKeystore>;
    /**
     * Import keystore from encrypted JSON (ethers.js compatible)
     *
     * @param json - Encrypted keystore JSON string or object
     * @param password - Decryption password
     * @param options - Import options
     * @returns Decrypted keystore object
     */
    importKeystore(json: string | EncryptedKeystore, password: string, options?: ImportOptions): Promise<Keystore$1>;
    /**
     * Export using WASM backend (delegates to alkanes-web-sys)
     * Note: Currently falls back to JS implementation as WASM Keystore
     * uses a different API (decryptMnemonic instead of encrypt/decrypt)
     */
    private exportKeystoreWasm;
    /**
     * Import using WASM backend (delegates to alkanes-web-sys)
     * Note: Uses the WASM Keystore.decryptMnemonic() API
     */
    private importKeystoreWasm;
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
declare function unlockKeystore(keystoreJson: string, password: string): Promise<Keystore$1>;

export { DERIVATION_PATHS, KeystoreManager, createKeystore, unlockKeystore };
