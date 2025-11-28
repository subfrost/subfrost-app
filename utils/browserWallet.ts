/**
 * Browser Wallet Integration
 * Connects to browser extension wallets using alkanes-web-sys WASM bindings
 */

import type { BrowserWalletInfo } from '@/constants/wallets';

// This will be available once the WASM module is loaded
// The actual implementation is in alkanes-web-sys wallet_provider.rs
interface WASMWalletConnector {
  detect_wallets(): Promise<BrowserWalletInfo[]>;
  connect_wallet(walletInfo: BrowserWalletInfo): Promise<{
    address: string;
    publicKey: string;
    network: string;
  }>;
  disconnect_wallet(): Promise<void>;
  sign_psbt(psbtHex: string): Promise<string>;
  sign_message(message: string, address: string): Promise<string>;
  get_accounts(): Promise<string[]>;
}

// Global reference to WASM wallet connector
let wasmWalletConnector: WASMWalletConnector | null = null;

/**
 * Initialize the WASM wallet connector
 * Should be called after WASM module is loaded
 */
export async function initBrowserWalletConnector(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // The WASM module should expose WalletConnector
    // For now, we'll create a stub that will work once WASM bindings are added
    console.log('Browser wallet connector initializing...');
    
    // TODO: Once WASM bindings are exposed, use them here:
    // const wasm = await import('@alkanes/ts-sdk/wasm');
    // wasmWalletConnector = new wasm.WalletConnector();
    
  } catch (error) {
    console.error('Failed to initialize browser wallet connector:', error);
  }
}

/**
 * Detect available browser extension wallets
 */
export async function detectBrowserWallets(): Promise<BrowserWalletInfo[]> {
  // Fallback to manual detection if WASM not available
  const { BROWSER_WALLETS, isWalletInstalled } = await import('@/constants/wallets');
  return BROWSER_WALLETS.filter(isWalletInstalled);
}

/**
 * Connect to a browser extension wallet
 */
export async function connectBrowserWallet(walletInfo: BrowserWalletInfo): Promise<{
  address: string;
  publicKey?: string;
  network?: string;
}> {
  if (typeof window === 'undefined') {
    throw new Error('Browser wallet connection only available in browser');
  }

  // Get the wallet object from window
  const walletObj = (window as any)[walletInfo.injectionKey];
  
  if (!walletObj) {
    throw new Error(`${walletInfo.name} is not installed or not accessible`);
  }

  try {
    // Request accounts - standard method across most Bitcoin wallets
    let accounts: string[] = [];
    
    if (typeof walletObj.requestAccounts === 'function') {
      accounts = await walletObj.requestAccounts();
    } else if (typeof walletObj.getAccounts === 'function') {
      accounts = await walletObj.getAccounts();
    } else if (typeof walletObj.connect === 'function') {
      const result = await walletObj.connect();
      accounts = Array.isArray(result) ? result : [result];
    } else {
      throw new Error(`${walletInfo.name} does not support standard connection methods`);
    }

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned from wallet');
    }

    const address = accounts[0];
    
    // Try to get public key if available
    let publicKey: string | undefined;
    try {
      if (typeof walletObj.getPublicKey === 'function') {
        publicKey = await walletObj.getPublicKey();
      }
    } catch {
      // Public key not available - that's okay
    }

    // Try to get network if available
    let network: string | undefined;
    try {
      if (typeof walletObj.getNetwork === 'function') {
        network = await walletObj.getNetwork();
      }
    } catch {
      // Network not available - that's okay
    }

    return {
      address,
      publicKey,
      network,
    };
  } catch (error) {
    throw new Error(`Failed to connect to ${walletInfo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sign a PSBT with the connected browser wallet
 */
export async function signPsbtWithBrowserWallet(
  walletInfo: BrowserWalletInfo,
  psbtHex: string,
  options?: { autoFinalized?: boolean }
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Browser wallet only available in browser');
  }

  const walletObj = (window as any)[walletInfo.injectionKey];
  
  if (!walletObj) {
    throw new Error(`${walletInfo.name} is not accessible`);
  }

  if (typeof walletObj.signPsbt !== 'function') {
    throw new Error(`${walletInfo.name} does not support PSBT signing`);
  }

  try {
    const signedPsbt = await walletObj.signPsbt(psbtHex, options);
    return signedPsbt;
  } catch (error) {
    throw new Error(`Failed to sign PSBT: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sign a message with the connected browser wallet
 */
export async function signMessageWithBrowserWallet(
  walletInfo: BrowserWalletInfo,
  message: string,
  address: string
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Browser wallet only available in browser');
  }

  const walletObj = (window as any)[walletInfo.injectionKey];
  
  if (!walletObj) {
    throw new Error(`${walletInfo.name} is not accessible`);
  }

  if (typeof walletObj.signMessage !== 'function') {
    throw new Error(`${walletInfo.name} does not support message signing`);
  }

  try {
    const signature = await walletObj.signMessage(message, address);
    return signature;
  } catch (error) {
    throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Disconnect from browser wallet
 */
export async function disconnectBrowserWallet(walletInfo: BrowserWalletInfo): Promise<void> {
  if (typeof window === 'undefined') return;

  const walletObj = (window as any)[walletInfo.injectionKey];
  
  if (walletObj && typeof walletObj.disconnect === 'function') {
    try {
      await walletObj.disconnect();
    } catch {
      // Disconnect not supported or failed - that's okay
    }
  }
}

/**
 * Get accounts from browser wallet
 */
export async function getBrowserWalletAccounts(walletInfo: BrowserWalletInfo): Promise<string[]> {
  if (typeof window === 'undefined') {
    return [];
  }

  const walletObj = (window as any)[walletInfo.injectionKey];
  
  if (!walletObj) {
    return [];
  }

  try {
    if (typeof walletObj.getAccounts === 'function') {
      return await walletObj.getAccounts();
    }
  } catch {
    // Failed to get accounts
  }

  return [];
}
