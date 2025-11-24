/**
 * Provider integration for Alkanes SDK
 *
 * Compatible with @oyl/sdk Provider interface.
 * Integrates with alkanes-web-sys WASM backend for alkanes-specific functionality.
 */

import init from "../wasm/alkanes"; // Default export for WASM initialization
let wasmInitialized = false; // Flag to ensure WASM initializes only once
let wasm: any; // To store the initialized WASM module exports

import * as bitcoin from 'bitcoinjs-lib';
import {
  ProviderConfig,
  NetworkType,
  TransactionResult,
  BlockInfo,
  UTXO,
  AddressBalance,
  AlkaneBalance,
  AlkaneCallParams,
  AlkaneId,
} from '../types';

/**
 * RPC client for Bitcoin Core / Sandshrew
 */
export class BitcoinRpcClient {
  constructor(private url: string) {}

  async call(method: string, params: any[] = []): Promise<any> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }
    return json.result;
  }

  async getBlockCount(): Promise<number> {
    return this.call('getblockcount');
  }

  async getBlockHash(height: number): Promise<string> {
    return this.call('getblockhash', [height]);
  }

  async getBlock(hash: string): Promise<any> {
    return this.call('getblock', [hash, 2]); // Verbosity 2 for full tx data
  }

  async sendRawTransaction(hex: string): Promise<string> {
    return this.call('sendrawtransaction', [hex]);
  }

  async getTransaction(txid: string): Promise<any> {
    return this.call('getrawtransaction', [txid, true]);
  }

  async testMempoolAccept(txHex: string[]): Promise<any[]> {
    return this.call('testmempoolaccept', [txHex]);
  }

  async getMempoolEntry(txid: string): Promise<any> {
    return this.call('getmempoolentry', [txid]);
  }
}

/**
 * Esplora API client
 */
export class EsploraClient {
  constructor(private baseUrl: string) {}

  async getAddressInfo(address: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/address/${address}`);
    return response.json();
  }

  async getAddressUtxos(address: string): Promise<UTXO[]> {
    const response = await fetch(`${this.baseUrl}/address/${address}/utxo`);
    return response.json();
  }

  async getAddressBalance(address: string): Promise<AddressBalance> {
    const [info, utxos] = await Promise.all([
      this.getAddressInfo(address),
      this.getAddressUtxos(address),
    ]);

    return {
      address,
      confirmed: info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum,
      unconfirmed: info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum,
      utxos,
    };
  }

  async getTxInfo(txid: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/tx/${txid}`);
    return response.json();
  }

  async broadcastTx(txHex: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tx`, {
      method: 'POST',
      body: txHex,
    });
    return response.text();
  }
}

/**
 * Alkanes RPC client (integrates with WASM)
 */
export class AlkanesRpcClient {
  constructor(
    private metashrewUrl: string,
    private sandshrewUrl?: string,
  ) {}

  async getAlkaneBalance(address: string, alkaneId: AlkaneId): Promise<AlkaneBalance> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; } // Ensure WASM is initialized
    const result = wasm.get_alkane_balance(address, alkaneId);
    return JSON.parse(result);
  }

  async getAlkaneBytecode(alkaneId: AlkaneId, blockTag?: string): Promise<string> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; } // Ensure WASM is initialized
    const result = wasm.get_alkane_bytecode(alkaneId, blockTag);
    return result;
  }

  async simulateAlkaneCall(params: AlkaneCallParams): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; } // Ensure WASM is initialized
    const result = wasm.simulate_alkane_call(JSON.stringify(params));
    return JSON.parse(result);
  }

  // Raw WASM function wrappers
  async multiSimulate(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.multisimluate(data);
    // TODO: Implement proper data retrieval from WASM memory
    return resultPtr; // Placeholder
  }

  async simulateRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.simulate(data);
    return resultPtr; // Placeholder
  }

  async sequence(): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.sequence();
    return resultPtr; // Placeholder
  }

  async metaRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.meta(data);
    return resultPtr; // Placeholder
  }

  async runesByAddressRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.runesbyaddress(data);
    return resultPtr; // Placeholder
  }

  async unwrap(): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.unwrap();
    return resultPtr; // Placeholder
  }

  async runesByOutpointRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.runesbyoutpoint(data);
    return resultPtr; // Placeholder
  }

  async spendablesByAddressRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.spendablesbyaddress(data);
    return resultPtr; // Placeholder
  }

  async protorunesByAddressRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.protorunesbyaddress(data);
    return resultPtr; // Placeholder
  }

  async getBlockRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.getblock(data);
    return resultPtr; // Placeholder
  }

  async protorunesByHeightRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.protorunesbyheight(data);
    return resultPtr; // Placeholder
  }

  async alkanesIdToOutpointRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.alkanes_id_to_outpoint(data);
    return resultPtr; // Placeholder
  }

  async traceBlockRaw(height: number): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.traceblock(height);
    return resultPtr; // Placeholder
  }

  async traceRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.trace(data);
    return resultPtr; // Placeholder
  }

  async getBytecodeRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.getbytecode(data);
    return resultPtr; // Placeholder
  }

  // protorunesbyoutpoint is a duplicate of runesbyoutpoint in the d.ts, will treat it as a separate function if needed later
  // For now, I'll add a placeholder to indicate its presence.
  async protorunesByOutpointRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.protorunesbyoutpoint(data);
    return resultPtr; // Placeholder
  }

  async runesByHeightRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.runesbyheight(data);
    return resultPtr; // Placeholder
  }

  async getInventoryRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.getinventory(data);
    return resultPtr; // Placeholder
  }

  async getStorageAtRaw(data: Uint8Array): Promise<any> {
    if (!wasmInitialized) { wasm = await init(); wasmInitialized = true; }
    const resultPtr = wasm.getstorageat(data);
    return resultPtr; // Placeholder
  }
}

/**
 * Main Alkanes Provider (compatible with @oyl/sdk)
 */
export class AlkanesProvider {
  public bitcoin: BitcoinRpcClient;
  public esplora: EsploraClient;
  public alkanes: AlkanesRpcClient;
  public network: bitcoin.networks.Network;
  public networkType: NetworkType;
  public url: string;

  constructor(config: ProviderConfig) {
    this.network = config.network;
    this.networkType = config.networkType;
    this.url = config.url;

    const masterUrl = config.projectId ?
      `${config.url}/${config.version || 'v1'}/${config.projectId}` :
      config.url;

    this.bitcoin = new BitcoinRpcClient(masterUrl);
    this.esplora = new EsploraClient(masterUrl);
    this.alkanes = new AlkanesRpcClient(
      masterUrl,
      undefined,
    );
  }

  /**
   * Push a PSBT to the network (compatible with @oyl/sdk)
   */
  async pushPsbt({ psbtHex, psbtBase64 }: {
    psbtHex?: string;
    psbtBase64?: string;
  }): Promise<TransactionResult> {
    if (!psbtHex && !psbtBase64) {
      throw new Error('Please supply psbt in either base64 or hex format');
    }

    if (psbtHex && psbtBase64) {
      throw new Error('Please select one format of psbt to broadcast');
    }

    let psbt: bitcoin.Psbt;
    if (psbtHex) {
      psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network });
    } else {
      psbt = bitcoin.Psbt.fromBase64(psbtBase64!, { network: this.network });
    }

    let extractedTx: bitcoin.Transaction;
    try {
      extractedTx = psbt.extractTransaction();
    } catch (error) {
      throw new Error(`Transaction could not be extracted due to invalid Psbt. ${error}`);
    }

    const txId = extractedTx.getId();
    const rawTx = extractedTx.toHex();

    // Test mempool acceptance
    const [result] = await this.bitcoin.testMempoolAccept([rawTx]);
    if (!result.allowed) {
      throw new Error(`Mempool rejected tx due to ${result['reject-reason']}`);
    }

    // Broadcast
    await this.bitcoin.sendRawTransaction(rawTx);

    // Get transaction info
    try {
      const mempoolEntry = await this.bitcoin.getMempoolEntry(txId);
      const fee = mempoolEntry.fees['base'] * 10 ** 8;

      return {
        txId,
        rawTx,
        size: mempoolEntry.vsize,
        weight: mempoolEntry.weight,
        fee,
        satsPerVByte: (fee / (mempoolEntry.weight / 4)).toFixed(2),
      };
    } catch (error) {
      // Fallback to esplora
      await new Promise(resolve => setTimeout(resolve, 1000));
      const tx = await this.esplora.getTxInfo(txId);

      return {
        txId,
        rawTx,
        size: tx.size,
        weight: tx.weight,
        fee: tx.fee,
        satsPerVByte: (tx.fee / (tx.weight / 4)).toFixed(2),
      };
    }
  }

  /**
   * Get block information
   */
  async getBlockInfo(hashOrHeight: string | number): Promise<BlockInfo> {
    const hash = typeof hashOrHeight === 'number' ?
      await this.bitcoin.getBlockHash(hashOrHeight) :
      hashOrHeight;

    const block = await this.bitcoin.getBlock(hash);

    return {
      hash: block.hash,
      height: block.height,
      timestamp: block.time,
      txCount: block.tx.length,
    };
  }

  /**
   * Get address balance
   */
  async getBalance(address: string): Promise<AddressBalance> {
    return this.esplora.getAddressBalance(address);
  }

  /**
   * Get alkane balance for address
   */
  async getAlkaneBalance(address: string, alkaneId: AlkaneId): Promise<AlkaneBalance> {
    return this.alkanes.getAlkaneBalance(address, alkaneId);
  }

  /**
   * Simulate alkane contract call
   */
  async simulateAlkaneCall(params: AlkaneCallParams): Promise<any> {
    return this.alkanes.simulateAlkaneCall(params);
  }
}

/**
 * Create an Alkanes provider instance
 *
 * @param config - Provider configuration
 * @returns AlkanesProvider instance compatible with @oyl/sdk
 */
export function createProvider(
  config: ProviderConfig,
): AlkanesProvider {
  return new AlkanesProvider(config);
}
