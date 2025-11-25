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
 * Address type enum (@oyl/sdk compatibility)
 */
export enum AddressType {
  P2PKH = 'p2pkh',
  P2SH_P2WPKH = 'p2sh-p2wpkh',
  P2WPKH = 'p2wpkh',
  P2TR = 'p2tr',
}

/**
 * Asset type enum (@oyl/sdk compatibility)
 */
export enum AssetType {
  BRC20 = 'brc20',
  RUNES = 'runes',
  COLLECTIBLE = 'collectible',
  ALKANES = 'alkanes',
}

/**
 * Formatted UTXO with alkanes support (@oyl/sdk compatibility)
 */
export interface FormattedUtxo {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: any[];
  runes: any[];
  alkanes: Record<string, { value: string; name: string; symbol: string }>;
  indexed: boolean;
  confirmations: number;
}

/**
 * Account UTXO portfolio (@oyl/sdk compatibility)
 */
export interface AccountUtxoPortfolio {
  utxos: FormattedUtxo[];
  spendableUtxos: FormattedUtxo[];
  spendableTotalBalance: number;
}

/**
 * Spend strategy (@oyl/sdk compatibility)
 */
export interface SpendStrategy {
  addressOrder: string[];
  utxoSortGreatestToLeast: boolean;
  changeAddress: string;
}

/**
 * Account structure (@oyl/sdk compatibility)
 */
export interface Account {
  taproot?: {
    address: string;
    pubkey: string;
    pubKeyXOnly?: string;
    hdPath?: string;
  };
  nativeSegwit?: {
    address: string;
    pubkey: string;
    hdPath?: string;
  };
  nestedSegwit?: {
    address: string;
    pubkey: string;
    hdPath?: string;
  };
  legacy?: {
    address: string;
    pubkey: string;
    hdPath?: string;
  };
  spendStrategy: SpendStrategy;
  network: bitcoin.networks.Network;
  [key: string]: any;
}

/**
 * Signer interface (@oyl/sdk compatibility)
 */
export interface Signer {
  taprootKeyPair: any;
  segwitKeyPair: any;
  signAllInputs(params: { rawPsbtHex: string; finalize?: boolean }): Promise<{
    signedPsbt: string;
    signedHexPsbt: string;
  }>;
  signMessage?(message: string): Promise<string>;
}

/**
 * Provider interface (@oyl/sdk compatibility)
 */
export interface Provider {
  networkType: string;
  network: bitcoin.networks.Network;
  api: any;
  esplora: {
    getFeeEstimates(): Promise<Record<string, number>>;
    getTxInfo(txId: string): Promise<any>;
  };
  pushPsbt(params: { psbtBase64: string }): Promise<{ txId: string }>;
}

/**
 * Get offers params (@oyl/sdk compatibility)
 */
export interface GetOffersParams {
  ticker: string;
  limit?: number;
  sort_by?: string;
  order?: string;
  offset?: number;
}

/**
 * Get collection offers params (@oyl/sdk compatibility)
 */
export interface GetCollectionOffersParams {
  collectionId: string;
  limit?: number;
  sort_by?: string;
  order?: string;
  offset?: number;
}

/**
 * Swap BRC bid (@oyl/sdk compatibility)
 */
export interface SwapBrcBid {
  address: string;
  auctionId: string | string[];
  bidPrice: number | number[];
  pubKey: string;
  receiveAddress: string;
  feerate: number;
}

/**
 * Signed bid (@oyl/sdk compatibility)
 */
export interface SignedBid {
  psbtBid: string;
  auctionId: string;
  bidId: string;
}

/**
 * OKX bid (@oyl/sdk compatibility)
 */
export interface OkxBid {
  orderId: number;
  fromAddress: string;
  psbt: string;
}

/**
 * UTXO dust constant (@oyl/sdk compatibility)
 */
export const UTXO_DUST = 546;

/**
 * Network type for string-based operations
 */
export type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';

/**
 * OYL Transaction Error (@oyl/sdk compatibility)
 */
export class OylTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OylTransactionError';
  }
}

/**
 * Get address type from address string (@oyl/sdk compatibility)
 */
export function getAddressType(address: string): AddressType | undefined {
  if (!address) return undefined;

  // Taproot addresses
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return AddressType.P2TR;
  }

  // Native SegWit addresses
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return AddressType.P2WPKH;
  }

  // Nested SegWit addresses (P2SH-P2WPKH)
  if (address.startsWith('3') || address.startsWith('2')) {
    return AddressType.P2SH_P2WPKH;
  }

  // Legacy addresses (P2PKH)
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return AddressType.P2PKH;
  }

  return undefined;
}

/**
 * Assert hex buffer (@oyl/sdk compatibility)
 */
export function assertHex(buffer: Buffer): Buffer {
  return buffer.subarray(1, 33);
}

/**
 * Timeout utility (@oyl/sdk compatibility)
 */
export function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
