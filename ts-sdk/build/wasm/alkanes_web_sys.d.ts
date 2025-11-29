/* tslint:disable */
/* eslint-disable */
export function analyze_psbt(psbt_base64: string): string;
export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
export function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
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
   * Create a new WebProvider with given URLs
   */
  constructor(sandshrew_rpc_url: string, esplora_rpc_url?: string | null);
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
  alkanesTrace(outpoint: string): Promise<any>;
  alkanesByAddress(address: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  alkanesByOutpoint(outpoint: string, block_tag?: string | null, protocol_tag?: number | null): Promise<any>;
  esploraGetTx(txid: string): Promise<any>;
  esploraGetTxStatus(txid: string): Promise<any>;
  esploraGetAddressInfo(address: string): Promise<any>;
  esploraGetBlocksTipHeight(): Promise<any>;
  esploraGetBlocksTipHash(): Promise<any>;
  bitcoindGetBlockCount(): Promise<any>;
  bitcoindSendRawTransaction(tx_hex: string): Promise<any>;
  metashrewHeight(): Promise<any>;
  metashrewStateRoot(height?: number | null): Promise<any>;
  walletCreatePsbt(params_json: string): Promise<any>;
}
