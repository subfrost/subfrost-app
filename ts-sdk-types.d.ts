// Type declarations for @alkanes/ts-sdk
// This is a temporary workaround until proper type generation is fixed

declare module '@alkanes/ts-sdk' {
  import * as bitcoin from 'bitcoinjs-lib';
  
  // Wallet exports
  export class AlkanesWallet {
    constructor(config: any);
    deriveAddress(addressType: AddressType, change: number, index: number): {
      address: string;
      publicKey: string;
      path: string;
    };
    signPsbt(psbtBase64: string): Promise<string>;
    signMessage(message: string, index?: number): Promise<string>;
  }
  
  export enum AddressType {
    P2PKH = 'p2pkh',
    P2WPKH = 'p2wpkh',
    P2TR = 'p2tr',
    P2SH_P2WPKH = 'p2sh-p2wpkh',
  }
  
  export function createWallet(keystore: any): AlkanesWallet;
  export function createWalletFromMnemonic(mnemonic: string, network?: string): AlkanesWallet;
  
  // Keystore exports
  export class KeystoreManager {
    constructor();
    encrypt(mnemonic: string, password: string): Promise<any>;
    decrypt(encryptedKeystore: any, password: string): Promise<string>;
    validateMnemonic(mnemonic: string): boolean;
    createKeystore(mnemonic: string, options?: any): any;
    exportKeystore(keystore: any, password: string, options?: any): Promise<any>;
  }
  
  export function createKeystore(password: string, options?: string | { network?: string }): Promise<{
    keystore: any;
    mnemonic: string;
  }>;
  
  export function unlockKeystore(encryptedKeystore: any, password: string): Promise<any>;
  
  // Provider exports
  export class AlkanesProvider {
    constructor(config: any);
    getBalance(address: string): Promise<number>;
    getUtxos(address: string): Promise<any[]>;
    broadcastTx(txHex: string): Promise<string>;
  }
  
  export function createProvider(config: any, wasmModule?: any): AlkanesProvider;
  
  // Other exports
  export const VERSION: string;
  export function initSDK(wasmModule?: any): Promise<any>;
  export default function getAlkanesSDK(): Promise<any>;
}
