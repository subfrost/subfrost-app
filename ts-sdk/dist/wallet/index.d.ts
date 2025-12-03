import { Keystore, AddressInfo, PsbtOptions, NetworkType } from '../types/index.js';
import 'bitcoinjs-lib';

/**
 * Wallet management for Alkanes SDK
 *
 * Provides Bitcoin wallet functionality with HD derivation,
 * address generation, and PSBT signing.
 */

/**
 * Address type enumeration
 */
declare enum AddressType {
    P2PKH = "p2pkh",// Legacy
    P2SH = "p2sh",// Script hash
    P2WPKH = "p2wpkh",// Native SegWit
    P2TR = "p2tr"
}
/**
 * Wallet class for managing Bitcoin addresses and transactions
 */
declare class AlkanesWallet {
    private root;
    private network;
    private keystore;
    private accountNode;
    constructor(keystore: Keystore);
    /**
     * Get master fingerprint
     */
    getMasterFingerprint(): string;
    /**
     * Get account extended public key
     */
    getAccountXpub(): string;
    /**
     * Get mnemonic (use with caution!)
     */
    getMnemonic(): string;
    /**
     * Derive address at specific index
     *
     * @param type - Address type (p2wpkh, p2tr, etc.)
     * @param index - Derivation index
     * @param change - Change address (0 = receiving, 1 = change)
     * @returns Address information
     */
    deriveAddress(type?: AddressType, index?: number, change?: number): AddressInfo;
    /**
     * Get receiving address at index
     */
    getReceivingAddress(index?: number, type?: AddressType): string;
    /**
     * Get change address at index
     */
    getChangeAddress(index?: number, type?: AddressType): string;
    /**
     * Get multiple addresses in a range
     */
    getAddresses(startIndex?: number, count?: number, type?: AddressType): AddressInfo[];
    /**
     * Sign a message with address at specific index
     *
     * @param message - Message to sign
     * @param index - Address index
     * @returns Signature in base64
     */
    signMessage(message: string, index?: number): string;
    /**
     * Create and sign a PSBT
     *
     * @param options - PSBT build options
     * @returns Signed PSBT in base64
     */
    createPsbt(options: PsbtOptions): Promise<string>;
    /**
     * Sign an existing PSBT
     *
     * @param psbtBase64 - PSBT in base64 format
     * @returns Signed PSBT in base64
     */
    signPsbt(psbtBase64: string): string;
    /**
     * Extract transaction from finalized PSBT
     */
    extractTransaction(psbtBase64: string): string;
    /**
     * Get WIF (Wallet Import Format) for specific index
     * Use with caution! This exposes the private key.
     */
    getPrivateKeyWIF(index?: number): string;
    private getNetwork;
}
/**
 * Create a wallet from a keystore
 */
declare function createWallet(keystore: Keystore): AlkanesWallet;
/**
 * Create a wallet from a mnemonic
 */
declare function createWalletFromMnemonic(mnemonic: string, network?: NetworkType): AlkanesWallet;

export { AddressType, AlkanesWallet, createWallet, createWalletFromMnemonic };
