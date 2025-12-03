// Type declarations for dynamic WASM imports from public directory
declare module '/wasm/alkanes_web_sys.js' {
  export default function init(): Promise<any>;
  export class WebProvider {
    constructor(network: string, config?: any);
    sandshrew_rpc_url(): string;
    esplora_rpc_url(): string | undefined;
    bitcoin_rpc_url(): string;
    esploraGetBlocksTipHeight(): Promise<number>;
    alkanesBalance(address?: string | null): Promise<any>;
    alkanesSequence(block_tag?: string | null): Promise<any>;
    getSubfrostAddress(): Promise<string>;
    getFrbtcTotalSupply(): Promise<string>;
    bitcoindGenerateFuture(address: string): Promise<any>;
  }
  export function analyze_psbt(psbt_base64: string): string;
  export function get_subfrost_address(network: string): Promise<string>;
  export function get_frbtc_total_supply(network: string): Promise<string>;
  export function get_pending_unwraps(network: string, confirmations: bigint): Promise<string>;
  export function wrap_btc(network: string, params_json: string): Promise<string>;
  export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<string>;
  export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<string>;
}
