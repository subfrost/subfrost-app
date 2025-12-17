/**
 * Test WASM initialization in browser-like environment
 * 
 * This test simulates the browser environment where the WASM module
 * will be loaded and ensures proper initialization.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Alkanes WASM Initialization', () => {
  let wasmModule: any;
  let initFunction: any;

  beforeAll(async () => {
    // Simulate browser environment
    if (typeof window === 'undefined') {
      (global as any).window = {};
    }
  });

  it('should import WASM module', async () => {
    try {
      // Try to import the WASM module
      wasmModule = await import('@alkanes/ts-sdk/wasm');
      console.log('WASM module keys:', Object.keys(wasmModule));
      expect(wasmModule).toBeDefined();
    } catch (error) {
      console.error('Failed to import WASM:', error);
      throw error;
    }
  });

  it('should have default export', () => {
    expect(wasmModule.default).toBeDefined();
    console.log('Default export type:', typeof wasmModule.default);
    console.log('Default export:', wasmModule.default);
  });

  it('should initialize WASM', async () => {
    try {
      // Try different initialization methods
      if (typeof wasmModule.default === 'function') {
        console.log('Calling default as function...');
        await wasmModule.default();
      } else if (typeof wasmModule.default?.init === 'function') {
        console.log('Calling default.init()...');
        await wasmModule.default.init();
      } else if (typeof wasmModule.init === 'function') {
        console.log('Calling init()...');
        await wasmModule.init();
      } else {
        console.log('No obvious init function found');
        console.log('Available methods:', Object.keys(wasmModule));
      }
      
      console.log('WASM initialized successfully');
    } catch (error) {
      console.error('WASM initialization error:', error);
      throw error;
    }
  });

  it('should have WebProvider class', () => {
    expect(wasmModule.WebProvider).toBeDefined();
    console.log('WebProvider type:', typeof wasmModule.WebProvider);
  });

  it('should create WebProvider instance', async () => {
    try {
      const provider = new wasmModule.WebProvider(
        'https://signet.subfrost.io/v4/subfrost',
        'https://signet.subfrost.io/v4/subfrost'
      );
      
      expect(provider).toBeDefined();
      console.log('Provider created:', provider);
      console.log('Provider methods:', Object.keys(provider));
    } catch (error) {
      console.error('Failed to create provider:', error);
      throw error;
    }
  });
});
