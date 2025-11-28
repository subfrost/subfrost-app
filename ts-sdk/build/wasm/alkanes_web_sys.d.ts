/* tslint:disable */
/* eslint-disable */
/**
 * Asynchronously encrypts data using the Web Crypto API.
 */
export function encryptMnemonic(mnemonic: string, passphrase: string): Promise<any>;
export function analyze_psbt(psbt_base64: string): string;
export function simulate_alkane_call(alkane_id_str: string, wasm_hex: string, cellpack_hex: string): Promise<any>;
export function get_alkane_bytecode(network: string, block: number, tx: number, block_tag: string): Promise<any>;
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
