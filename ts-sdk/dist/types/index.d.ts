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
 * Network type extended to include oylnet
 */
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';
/**
 * Spend strategy for UTXO selection (compatible with @oyl/sdk)
 */
interface SpendStrategy {
    addressOrder: string[];
    utxoSortGreatestToLeast: boolean;
    changeAddress: string;
}
/**
 * Formatted UTXO (compatible with API response format)
 * Supports both camelCase (API) and snake_case naming conventions
 */
interface FormattedUtxo {
    txid?: string;
    txId?: string;
    vout?: number;
    outputIndex?: number;
    value?: number;
    satoshis?: number;
    scriptPubKey?: string;
    scriptPk?: string;
    address: string;
    addressType?: string;
    confirmations?: number;
    indexed?: boolean;
    inscriptions?: any[];
    runes?: any[];
    alkanes?: Record<string, {
        value: string | number;
        name?: string;
        symbol?: string;
    }>;
}
/**
 * Account UTXO portfolio (compatible with @oyl/sdk)
 */
interface AccountUtxoPortfolio {
    utxos: FormattedUtxo[];
    spendableUtxos: FormattedUtxo[];
    spendableTotalBalance: number;
    totalBalance: number;
}
/**
 * AMM swap parameters
 */
interface SwapParams {
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
interface LiquidityParams {
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
interface WrapParams {
    amount: string;
    feeRate: number;
    address?: string;
}
/**
 * Execute with wrap/unwrap parameters
 */
interface ExecuteWithWrapParams {
    operation: 'swap' | 'addLiquidity' | 'removeLiquidity';
    params: SwapParams | LiquidityParams;
    account: any;
    provider: any;
    signer: any;
}
/**
 * Asset type enumeration for swap operations
 */
declare enum AssetType {
    BRC20 = "brc20",
    RUNES = "runes",
    COLLECTIBLE = "collectible",
    ALKANES = "alkanes"
}
/**
 * Custom error class for OYL transactions
 */
declare class OylTransactionError extends Error {
    code?: string;
    details?: any;
    constructor(message: string, code?: string, details?: any);
}
/**
 * Swap/marketplace types (legacy OYL compatibility stubs)
 */
interface SwapBrcBid {
    address: string;
    auctionId: string;
    bidPrice: number;
    pubKey: string;
    receiveAddress: string;
    feerate: number;
}
interface SignedBid {
    psbtHex: string;
    auctionId: string;
    bidId: string;
}
interface OkxBid {
    orderId: string;
    psbtBase64: string;
}
interface GetOffersParams {
    ticker?: string;
    address?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    sort_by?: string;
    order?: string;
}
interface GetCollectionOffersParams {
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
interface Provider {
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
    pushPsbt?: (params: {
        psbtBase64: string;
    }) => Promise<any>;
}
/**
 * SwapSigner interface (legacy OYL compatibility for swap operations)
 */
interface SwapSigner {
    segwitKeyPair?: {
        privateKey?: Buffer;
        publicKey?: Buffer;
    };
    taprootKeyPair?: {
        privateKey?: Buffer;
        publicKey?: Buffer;
    };
    signAllInputs: (params: {
        rawPsbtHex: string;
        finalize?: boolean;
    }) => Promise<{
        signedPsbt: string;
        signedHexPsbt: string;
    }>;
}

export { type AccountUtxoPortfolio, type AddressBalance, type AddressInfo, type AlkaneBalance, type AlkaneCallParams, type AlkaneId, AssetType, type BlockInfo, type EncryptedKeystore, type ExecuteWithWrapParams, type ExportOptions, type FormattedUtxo, type GetCollectionOffersParams, type GetOffersParams, type HDPath, type ImportOptions, type Keystore, type KeystoreParams, type LiquidityParams, type Network, type NetworkType, type OkxBid, OylTransactionError, type Provider, type ProviderConfig, type PsbtOptions, type SignedBid, type SpendStrategy, type SwapBrcBid, type SwapParams, type SwapSigner, type TransactionResult, type TxInput, type TxOutput, type UTXO, type WalletConfig, type WrapParams };
