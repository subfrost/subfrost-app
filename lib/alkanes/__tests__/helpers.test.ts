/**
 * Tests for lib/alkanes/helpers.ts — shared utility functions.
 *
 * Covers: uint8ArrayToBase64, getBitcoinNetwork, getSignerAddress,
 * parseMaxVoutFromProtostones, toAlks, extractPsbtBase64.
 *
 * Pure functions with minimal dependencies (only bitcoinjs-lib for network objects).
 *
 * Run with: pnpm test lib/alkanes/__tests__/helpers.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import {
  uint8ArrayToBase64,
  getBitcoinNetwork,
  getSignerAddress,
  parseMaxVoutFromProtostones,
  toAlks,
  extractPsbtBase64,
} from '../helpers';

// ---------------------------------------------------------------------------
// 1. uint8ArrayToBase64
// ---------------------------------------------------------------------------

describe('uint8ArrayToBase64', () => {
  it('should convert empty array to empty base64', () => {
    const result = uint8ArrayToBase64(new Uint8Array([]));
    expect(result).toBe('');
  });

  it('should convert single byte', () => {
    const result = uint8ArrayToBase64(new Uint8Array([65])); // 'A'
    expect(result).toBe('QQ==');
  });

  it('should convert "Hello" to base64', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    const result = uint8ArrayToBase64(bytes);
    expect(result).toBe('SGVsbG8=');
  });

  it('should handle binary data (non-printable)', () => {
    const bytes = new Uint8Array([0, 1, 255, 128, 64]);
    const result = uint8ArrayToBase64(bytes);
    // Decode back to verify roundtrip
    const decoded = Buffer.from(result, 'base64');
    expect(Array.from(decoded)).toEqual([0, 1, 255, 128, 64]);
  });

  it('should match Buffer.toString(base64) for same input', () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const ours = uint8ArrayToBase64(data);
    const theirs = Buffer.from(data).toString('base64');
    expect(ours).toBe(theirs);
  });
});

// ---------------------------------------------------------------------------
// 2. getBitcoinNetwork
// ---------------------------------------------------------------------------

describe('getBitcoinNetwork', () => {
  it('should return mainnet for "mainnet"', () => {
    const net = getBitcoinNetwork('mainnet');
    expect(net).toBe(bitcoin.networks.bitcoin);
    expect(net.bech32).toBe('bc');
  });

  it('should return testnet for "testnet"', () => {
    const net = getBitcoinNetwork('testnet');
    expect(net).toBe(bitcoin.networks.testnet);
    expect(net.bech32).toBe('tb');
  });

  it('should return testnet for "signet"', () => {
    const net = getBitcoinNetwork('signet');
    expect(net).toBe(bitcoin.networks.testnet);
  });

  it('should return regtest for "regtest"', () => {
    const net = getBitcoinNetwork('regtest');
    expect(net).toBe(bitcoin.networks.regtest);
    expect(net.bech32).toBe('bcrt');
  });

  it('should return regtest for "subfrost-regtest"', () => {
    const net = getBitcoinNetwork('subfrost-regtest');
    expect(net).toBe(bitcoin.networks.regtest);
  });

  it('should return regtest for "regtest-local"', () => {
    const net = getBitcoinNetwork('regtest-local');
    expect(net).toBe(bitcoin.networks.regtest);
  });

  it('should return regtest for "oylnet"', () => {
    const net = getBitcoinNetwork('oylnet');
    expect(net).toBe(bitcoin.networks.regtest);
  });

  it('should default to mainnet for unrecognized network', () => {
    const net = getBitcoinNetwork('something-unknown');
    expect(net).toBe(bitcoin.networks.bitcoin);
  });
});

// ---------------------------------------------------------------------------
// 3. getSignerAddress
// ---------------------------------------------------------------------------

describe('getSignerAddress', () => {
  it('should return P2TR address for mainnet', () => {
    const addr = getSignerAddress('mainnet');
    expect(addr).toMatch(/^bc1p/);
  });

  it('should return P2TR address for regtest', () => {
    const addr = getSignerAddress('regtest');
    expect(addr).toMatch(/^bcrt1p/);
  });

  it('should return same address for subfrost-regtest and regtest', () => {
    expect(getSignerAddress('subfrost-regtest')).toBe(getSignerAddress('regtest'));
  });

  it('should throw for unknown network', () => {
    expect(() => getSignerAddress('not-a-real-network')).toThrow('No signer address configured');
  });

  it('should throw with network name in error message', () => {
    expect(() => getSignerAddress('foobar')).toThrow('foobar');
  });
});

// ---------------------------------------------------------------------------
// 4. parseMaxVoutFromProtostones
// ---------------------------------------------------------------------------

describe('parseMaxVoutFromProtostones', () => {
  it('should return 0 for no vout references', () => {
    expect(parseMaxVoutFromProtostones('[1,2,3]')).toBe(0);
  });

  it('should find v0', () => {
    expect(parseMaxVoutFromProtostones('[1,2,3]:v0:v0')).toBe(0);
  });

  it('should find v1', () => {
    expect(parseMaxVoutFromProtostones('[32,0,77]:v1:v1')).toBe(1);
  });

  it('should find maximum across multiple references', () => {
    expect(parseMaxVoutFromProtostones('[1]:v0:v2,[2]:v1:v3')).toBe(3);
  });

  it('should handle single-digit vout', () => {
    expect(parseMaxVoutFromProtostones('[1]:v5:v0')).toBe(5);
  });

  it('should handle multi-digit vout', () => {
    expect(parseMaxVoutFromProtostones('[1]:v12:v0')).toBe(12);
  });

  it('should ignore p references (protostone pointers, not vouts)', () => {
    // p1, p2 are protostone references, not vout references
    // The regex matches v\d+ so pN shouldn't match
    expect(parseMaxVoutFromProtostones('[1]:p1:v0')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. toAlks
// ---------------------------------------------------------------------------

describe('toAlks', () => {
  it('should convert 1 with 8 decimals', () => {
    expect(toAlks('1', 8)).toBe('100000000');
  });

  it('should convert 0.5 with 8 decimals', () => {
    // toAlks concatenates whole='0' + frac='50000000' = '050000000'
    // The regex /^0+(\d)/ doesn't match single '0' (needs 0+digit after)
    // so the leading zero is preserved. This is fine because parseInt/BigInt
    // handles leading zeros correctly downstream.
    expect(toAlks('0.5', 8)).toBe('050000000');
  });

  it('should convert 0.00000001 with 8 decimals', () => {
    // whole='0', frac='00000001' => '000000001'
    expect(toAlks('0.00000001', 8)).toBe('000000001');
  });

  it('should handle no decimal part', () => {
    expect(toAlks('42', 8)).toBe('4200000000');
  });

  it('should return "0" for empty string', () => {
    expect(toAlks('', 8)).toBe('0');
  });

  it('should handle 0 decimals', () => {
    expect(toAlks('42', 0)).toBe('42');
  });

  it('should truncate excess fractional digits', () => {
    // 1.123456789 with 8 decimals should truncate to 1.12345678
    expect(toAlks('1.123456789', 8)).toBe('112345678');
  });

  it('should handle leading zeros in whole part', () => {
    // 01.5 should normalize to 1.5
    expect(toAlks('01.5', 8)).toBe('150000000');
  });

  it('should pad short fractional part', () => {
    // 1.5 with 8 decimals => pad to 1.50000000 => 150000000
    expect(toAlks('1.5', 8)).toBe('150000000');
  });

  it('should handle whole number "0"', () => {
    expect(toAlks('0', 8)).toBe('000000000');
  });

  it('should handle different decimal counts', () => {
    expect(toAlks('1', 6)).toBe('1000000');
    expect(toAlks('1', 2)).toBe('100');
    expect(toAlks('1', 18)).toBe('1000000000000000000');
  });
});

// ---------------------------------------------------------------------------
// 6. extractPsbtBase64
// ---------------------------------------------------------------------------

describe('extractPsbtBase64', () => {
  it('should return string input directly', () => {
    const base64 = 'SGVsbG8=';
    expect(extractPsbtBase64(base64)).toBe(base64);
  });

  it('should convert Uint8Array to base64', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    const result = extractPsbtBase64(bytes);
    expect(result).toBe('SGVsbG8=');
  });

  it('should convert numeric-keyed object to base64', () => {
    const obj: Record<number, number> = { 0: 72, 1: 101, 2: 108, 3: 108, 4: 111 };
    const result = extractPsbtBase64(obj);
    expect(result).toBe('SGVsbG8=');
  });

  it('should throw for null input', () => {
    expect(() => extractPsbtBase64(null)).toThrow('Unexpected PSBT format');
  });

  it('should throw for number input', () => {
    expect(() => extractPsbtBase64(42 as any)).toThrow('Unexpected PSBT format');
  });

  it('should handle empty Uint8Array', () => {
    const result = extractPsbtBase64(new Uint8Array([]));
    expect(result).toBe('');
  });

  it('should handle sparse numeric-keyed object', () => {
    // Keys are 0, 2, 5 — sorted should be [0, 2, 5]
    const obj = { 0: 65, 2: 66, 5: 67 } as unknown as Record<number, number>;
    const result = extractPsbtBase64(obj);
    // Should contain 3 bytes: 65 (A), 66 (B), 67 (C)
    const decoded = Buffer.from(result, 'base64');
    expect(decoded[0]).toBe(65);
    expect(decoded[1]).toBe(66);
    expect(decoded[2]).toBe(67);
  });
});
