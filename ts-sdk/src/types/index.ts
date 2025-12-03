/**
 * Core type definitions for @alkanes/ts-sdk
 */

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Bitcoin network types
 */
export type NetworkType = 'mainnet' | 'testnet' | 'signet' | 'regtest';

/**
 * HD wallet derivation path configuration
 */
export interface HDPath {
  purpose: number;
  coinType: number;
  account: number;
  change: number;
  index: number;
}

/**
 * Keystore encryption parameters (compatible with ethers.js style)
 */
export interface KeystoreParams {
  salt: string;
  nonce?: string;
  iterations: number;
  algorithm?: string;
}

/**
 * Encrypted keystore JSON structure (ethers.js compatible)
 */
export interface EncryptedKeystore {
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
export interface Keystore {
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
export interface WalletConfig {
  network: NetworkType;
  derivationPath?: string;
  account?: number;
}

/**
 * Address information
 */
export interface AddressInfo {
  address: string;
  path: string;
  publicKey: string;
  index: number;
}

/**
 * Transaction input
 */
export interface TxInput {
  txid: string;
  vout: number;
  value: number;
  address: string;
}

/**
 * Transaction output
 */
export interface TxOutput {
  address: string;
  value: number;
}

/**
 * PSBT build options
 */
export interface PsbtOptions {
  inputs: TxInput[];
  outputs: TxOutput[];
  feeRate?: number;
  network?: bitcoin.networks.Network;
}

/**
 * Alkane token ID
 */
export interface AlkaneId {
  block: number;
  tx: number;
}

/**
 * Alkane balance information
 */
export interface AlkaneBalance {
  id: AlkaneId;
  amount: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

/**
 * Alkane call parameters
 */
export interface AlkaneCallParams {
  alkaneId: AlkaneId;
  method: string;
  args: any[];
  value?: number;
}

/**
 * Provider configuration for @oyl/sdk compatibility
 */
export interface ProviderConfig {
  url: string;
  projectId?: string;
  network: bitcoin.networks.Network;
  networkType: NetworkType;
  version?: string;
}

/**
 * Transaction result
 */
export interface TransactionResult {
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
export interface BlockInfo {
  hash: string;
  height: number;
  timestamp: number;
  txCount: number;
}

/**
 * UTXO information
 */
export interface UTXO {
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
export interface AddressBalance {
  address: string;
  confirmed: number;
  unconfirmed: number;
  utxos: UTXO[];
}

/**
 * Export options
 */
export interface ExportOptions {
  format?: 'json' | 'string';
  pretty?: boolean;
}

/**
 * Import options
 */
export interface ImportOptions {
  validate?: boolean;
  network?: NetworkType;
}

/**
 * Network type extended to include oylnet
 */
export type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';

/**
 * Spend strategy for UTXO selection (compatible with @oyl/sdk)
 */
export interface SpendStrategy {
  addressOrder: string[];
  utxoSortGreatestToLeast: boolean;
  changeAddress: string;
}

/**
 * Formatted UTXO (compatible with API response format)
 * Supports both camelCase (API) and snake_case naming conventions
 */
export interface FormattedUtxo {
  // Transaction ID - support both conventions
  txid?: string;
  txId?: string;
  // Output index - support both conventions
  vout?: number;
  outputIndex?: number;
  // Value in satoshis - support both conventions
  value?: number;
  satoshis?: number;
  // Script public key - support both conventions
  scriptPubKey?: string;
  scriptPk?: string;
  // Address
  address: string;
  addressType?: string;
  // Confirmation status
  confirmations?: number;
  indexed?: boolean;
  // Inscriptions and tokens
  inscriptions?: any[];
  runes?: any[];
  alkanes?: Record<string, { value: string | number; name?: string; symbol?: string }>;
}

/**
 * Account UTXO portfolio (compatible with @oyl/sdk)
 */
export interface AccountUtxoPortfolio {
  utxos: FormattedUtxo[];
  spendableUtxos: FormattedUtxo[];
  spendableTotalBalance: number;
  totalBalance: number;
}

/**
 * AMM swap parameters
 */
export interface SwapParams {
  sellCurrency: string;
  buyCurrency: string;
  direction: 'sell' | 'buy';
  sellAmount: string;
  buyAmount: string;
  maxSlippage: number;
  feeRate: number;
  tokenPath?: string[];
  deadlineBlocks?: number;
}

/**
 * AMM liquidity parameters
 */
export interface LiquidityParams {
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  feeRate: number;
  slippage?: number;
}

/**
 * Wrap/Unwrap BTC parameters
 */
export interface WrapParams {
  amount: string;
  feeRate: number;
  address?: string;
}

/**
 * Execute with wrap/unwrap parameters
 */
export interface ExecuteWithWrapParams {
  operation: 'swap' | 'addLiquidity' | 'removeLiquidity';
  params: SwapParams | LiquidityParams;
  account: any;
  provider: any;
  signer: any;
}

/**
 * Asset type enumeration for swap operations
 */
export enum AssetType {
  BRC20 = 'brc20',
  RUNES = 'runes',
  COLLECTIBLE = 'collectible',
  ALKANES = 'alkanes',
}

/**
 * Custom error class for OYL transactions
 */
export class OylTransactionError extends Error {
  public code?: string;
  public details?: any;

  constructor(message: string, code?: string, details?: any) {
    super(message);
    this.name = 'OylTransactionError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, OylTransactionError.prototype);
  }
}

/**
 * Swap/marketplace types (legacy OYL compatibility stubs)
 */
export interface SwapBrcBid {
  address: string;
  auctionId: string;
  bidPrice: number;
  pubKey: string;
  receiveAddress: string;
  feerate: number;
}

export interface SignedBid {
  psbtHex: string;
  auctionId: string;
  bidId: string;
}

export interface OkxBid {
  orderId: string;
  psbtBase64: string;
}

export interface GetOffersParams {
  ticker?: string;
  address?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  sort_by?: string;
  order?: string;
}

export interface GetCollectionOffersParams {
  collectionId?: string;
  address?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  sort_by?: string;
  order?: string;
}

/**
 * Provider interface (legacy OYL compatibility)
 */
export interface Provider {
  network?: any;
  networkType?: string;
  api?: {
    initSwapBid?: (params: any) => Promise<any>;
    initRuneSwapBid?: (params: any) => Promise<any>;
    initCollectionSwapBid?: (params: any) => Promise<any>;
    submitSignedBid?: (params: any) => Promise<any>;
    submitSignedRuneBid?: (params: any) => Promise<any>;
    submitSignedCollectionBid?: (params: any) => Promise<any>;
    getListingPsbt?: (params: any) => Promise<any>;
    submitListingPsbt?: (params: any) => Promise<any>;
    getSellerPsbt?: (params: any) => Promise<any>;
    submitBuyerPsbt?: (params: any) => Promise<any>;
    getOrdinalsWalletNftOfferPsbt?: (params: any) => Promise<any>;
    getOrdinalsWalletRuneOfferPsbt?: (params: any) => Promise<any>;
    submitOrdinalsWalletBid?: (params: any) => Promise<any>;
    submitOrdinalsWalletRuneBid?: (params: any) => Promise<any>;
  };
  esplora?: {
    getFeeEstimates?: () => Promise<Record<string, number>>;
    getTxInfo?: (txId: string) => Promise<any>;
  };
  pushPsbt?: (params: { psbtBase64: string }) => Promise<any>;
}

/**
 * SwapSigner interface (legacy OYL compatibility for swap operations)
 */
export interface SwapSigner {
  segwitKeyPair?: {
    privateKey?: Buffer;
    publicKey?: Buffer;
  };
  taprootKeyPair?: {
    privateKey?: Buffer;
    publicKey?: Buffer;
  };
  signAllInputs: (params: { rawPsbtHex: string; finalize?: boolean }) => Promise<{
    signedPsbt: string;
    signedHexPsbt: string;
  }>;
}
