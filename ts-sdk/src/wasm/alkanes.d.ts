/**
 * Type declarations for alkanes WASM module
 */

declare const init: () => Promise<any>;
export default init;

export function get_alkane_balance(address: string, alkane_id: any): string;
export function get_alkane_bytecode(alkane_id: any, block_tag?: string): string;
export function simulate_alkane_call(params: string): string;
