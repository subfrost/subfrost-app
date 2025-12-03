import * as bitcoin from 'bitcoinjs-lib';
import { UTXO, AddressBalance, AlkaneId, AlkaneBalance, AlkaneCallParams, NetworkType, ProviderConfig, TransactionResult, BlockInfo } from '../types/index.mjs';

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

export { AlkanesProvider, AlkanesRpcClient, BitcoinRpcClient, EsploraClient, createProvider };
