/**
 * Debug test for WASM wallet methods
 * Goal: Understand why walletLoadMnemonic throws "unreachable" and walletCreate hangs
 */

import { describe, it, expect, beforeAll } from 'vitest';

const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('WASM Wallet Debug', () => {
  let wasm: typeof import('@alkanes/ts-sdk/wasm');
  let WebProvider: typeof import('@alkanes/ts-sdk/wasm').WebProvider;

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    WebProvider = wasm.WebProvider;
  });

  it('should check what global objects are available', () => {
    console.log('[Debug] typeof window:', typeof globalThis.window);
    console.log('[Debug] typeof crypto:', typeof globalThis.crypto);
    console.log('[Debug] typeof crypto.subtle:', typeof globalThis.crypto?.subtle);
    console.log('[Debug] typeof crypto.getRandomValues:', typeof globalThis.crypto?.getRandomValues);
    console.log('[Debug] typeof fetch:', typeof globalThis.fetch);
    console.log('[Debug] typeof localStorage:', typeof (globalThis as any).localStorage);
    console.log('[Debug] typeof indexedDB:', typeof (globalThis as any).indexedDB);
  });

  it('should test walletLoadMnemonic with detailed error capture', async () => {
    const provider = new WebProvider('regtest', REGTEST_CONFIG);

    console.log('[Debug] Provider created');
    console.log('[Debug] walletIsLoaded before:', provider.walletIsLoaded());

    try {
      console.log('[Debug] Calling walletLoadMnemonic...');
      provider.walletLoadMnemonic(TEST_MNEMONIC, '');
      console.log('[Debug] walletLoadMnemonic returned successfully');
      console.log('[Debug] walletIsLoaded after:', provider.walletIsLoaded());
    } catch (error: any) {
      console.log('[Debug] walletLoadMnemonic threw error');
      console.log('[Debug] Error type:', error?.constructor?.name);
      console.log('[Debug] Error message:', error?.message);
      console.log('[Debug] Error stack:', error?.stack?.slice(0, 1000));

      // Check if it's a WASM RuntimeError
      if (error instanceof WebAssembly.RuntimeError) {
        console.log('[Debug] This is a WebAssembly.RuntimeError - likely a panic in Rust code');
      }

      throw error;
    }
  });

  it('should test walletCreate with timeout', async () => {
    const provider = new WebProvider('regtest', REGTEST_CONFIG);

    console.log('[Debug] Testing walletCreate with 5 second timeout...');

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('walletCreate timed out after 5 seconds')), 5000);
    });

    try {
      const result = await Promise.race([
        provider.walletCreate(TEST_MNEMONIC, ''),
        timeoutPromise
      ]);
      console.log('[Debug] walletCreate returned:', result);
    } catch (error: any) {
      console.log('[Debug] walletCreate error:', error.message);
      if (error.message.includes('timed out')) {
        console.log('[Debug] walletCreate is hanging - likely waiting for browser APIs');
      }
      throw error;
    }
  }, 10000);

  it('should test if crypto.subtle is properly available', async () => {
    // The WASM code likely uses Web Crypto API
    console.log('[Debug] Testing crypto.subtle availability...');

    if (!globalThis.crypto?.subtle) {
      console.log('[Debug] crypto.subtle is NOT available - this could cause issues');
      return;
    }

    // Test basic crypto operation
    try {
      const key = await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      console.log('[Debug] crypto.subtle.generateKey works:', !!key);
    } catch (e: any) {
      console.log('[Debug] crypto.subtle.generateKey failed:', e.message);
    }
  });

  it('should check if the WASM module exports wallet functions', async () => {
    // Check what's actually exported from the WASM module
    const wasmModule = await import('@alkanes/ts-sdk/wasm');

    console.log('[Debug] WASM module exports:', Object.keys(wasmModule));

    // Check WebProvider prototype
    const provider = new WebProvider('regtest', REGTEST_CONFIG);
    const protoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(provider));
    const walletMethods = protoMethods.filter(m => m.toLowerCase().includes('wallet'));
    console.log('[Debug] WebProvider wallet methods:', walletMethods);
  });
});
