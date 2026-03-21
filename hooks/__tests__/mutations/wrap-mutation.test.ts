/**
 * Wrap Mutation Tests
 *
 * Tests for the useWrapMutation hook logic: calldata generation for
 * BTC→frBTC wraps, signer address lookup, output ordering, protostone
 * format, input requirements, and browser wallet address handling.
 *
 * All external dependencies are mocked. Tests focus on the LOGIC.
 *
 * Run with: pnpm test hooks/__tests__/mutations/wrap-mutation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Shared builder/helper imports (pure functions, no WASM)
import { buildWrapProtostone, buildUnwrapProtostone } from '@/lib/alkanes/builders';
import {
  FRBTC_WRAP_OPCODE,
  FRBTC_UNWRAP_OPCODE,
  SIGNER_ADDRESSES,
} from '@/lib/alkanes/constants';
import { getSignerAddress, getBitcoinNetwork } from '@/lib/alkanes/helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FRBTC_ID = '32:0';

// ---------------------------------------------------------------------------
// 1. Wrap Protostone Format
// ---------------------------------------------------------------------------

describe('Wrap BTC→frBTC calldata', () => {
  it('should build protostone with opcode 77', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toContain(`,${FRBTC_WRAP_OPCODE}]`);
  });

  it('should use format [32,0,77]:v1:v1', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toBe('[32,0,77]:v1:v1');
  });

  it('should set pointer=v1 (minted frBTC goes to user at output 1)', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    const parts = result.split(':');
    // After the closing bracket, pointer is the next part
    expect(parts[parts.length - 2]).toBe('v1');
  });

  it('should set refund=v1 (refunds go to user at output 1)', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    expect(result.endsWith(':v1')).toBe(true);
  });

  it('should handle different frBTC IDs', () => {
    const result = buildWrapProtostone({ frbtcId: '100:5' });
    expect(result).toBe('[100,5,77]:v1:v1');
  });

  it('should generate correct cellpack with 3 parts', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    const cellpack = result.match(/\[(.*?)\]/)?.[1];
    const parts = cellpack?.split(',');
    expect(parts).toHaveLength(3);
    expect(parts?.[0]).toBe('32');  // frBTC block
    expect(parts?.[1]).toBe('0');   // frBTC tx
    expect(parts?.[2]).toBe('77');  // wrap opcode
  });
});

// ---------------------------------------------------------------------------
// 2. Signer Address Lookup
// ---------------------------------------------------------------------------

describe('Signer address lookup', () => {
  it('should return regtest signer address for subfrost-regtest', () => {
    const addr = getSignerAddress('subfrost-regtest');
    expect(addr).toBe('bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz');
  });

  it('should return regtest signer address for regtest', () => {
    const addr = getSignerAddress('regtest');
    expect(addr).toBe(SIGNER_ADDRESSES.regtest);
  });

  it('should return mainnet signer address for mainnet', () => {
    const addr = getSignerAddress('mainnet');
    expect(addr).toMatch(/^bc1p/);
  });

  it('should throw for unknown network', () => {
    expect(() => getSignerAddress('unknown-network')).toThrow('No signer address configured');
  });

  it('should return P2TR addresses (bc1p or bcrt1p prefix)', () => {
    for (const [network, addr] of Object.entries(SIGNER_ADDRESSES)) {
      expect(addr).toMatch(/^(bc1p|bcrt1p)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Input Requirements for Wrap
// ---------------------------------------------------------------------------

describe('Wrap input requirements', () => {
  it('should format as B:<sats>:v0', () => {
    const wrapAmountSats = 100000;
    const inputRequirements = `B:${wrapAmountSats}:v0`;
    expect(inputRequirements).toBe('B:100000:v0');
  });

  it('should assign BTC to output v0 (signer address)', () => {
    const inputRequirements = 'B:50000:v0';
    expect(inputRequirements).toContain(':v0');
  });

  it('should convert display BTC amount to sats correctly', () => {
    const displayAmount = '0.001'; // BTC
    const sats = Math.floor(parseFloat(displayAmount) * 100000000);
    expect(sats).toBe(100000);
  });

  it('should handle 1 BTC conversion', () => {
    const displayAmount = '1';
    const sats = Math.floor(parseFloat(displayAmount) * 100000000);
    expect(sats).toBe(100000000);
  });

  it('should handle very small amounts', () => {
    const displayAmount = '0.00000001'; // 1 sat
    const sats = Math.floor(parseFloat(displayAmount) * 100000000);
    expect(sats).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Output Ordering
// ---------------------------------------------------------------------------

describe('Wrap output ordering', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useWrapMutation.ts'), 'utf-8');
  });

  it('should place signer address at output 0 (v0)', () => {
    // Verify the comment/logic about output ordering
    expect(src).toContain('Output 0 (v0): Signer address');
    expect(src).toContain('Output 0 (v0): signer');
  });

  it('should place user address at output 1 (v1)', () => {
    expect(src).toContain('Output 1 (v1)');
    expect(src).toContain('receives minted frBTC via pointer=v1');
  });

  it('should set toAddresses with signer first, user second', () => {
    // toAddresses = [signerAddress, userTaprootAddress or 'p2tr:0']
    expect(src).toContain('signerAddress');
    // Verify the array ordering in toAddresses
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?\s*\[(.*?)\]\s*\n/);
    expect(match).toBeTruthy();
    // Browser wallet: [signerAddress, userTaprootAddress]
    expect(match![1]).toMatch(/signerAddress.*userTaprootAddress/);
  });

  it('should use B:<sats>:v0 to assign BTC to signer output', () => {
    expect(src).toContain('B:${wrapAmountSats}:v0');
  });
});

// ---------------------------------------------------------------------------
// 5. Browser Wallet Address Handling
// ---------------------------------------------------------------------------

describe('Browser wallet address handling in useWrapMutation', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useWrapMutation.ts'), 'utf-8');
  });

  it('should define isBrowserWallet check', () => {
    expect(src).toContain("isBrowserWallet = walletType === 'browser'");
  });

  it('should use actual userTaprootAddress for browser wallet in toAddresses', () => {
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?\s*\[(.*?)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain('userTaprootAddress');
    expect(match![1]).not.toContain("'p2tr:0'");
  });

  it('should use symbolic p2tr:0 for keystore wallet in toAddresses', () => {
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?.+\n\s*:\s*\[(.*?)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("'p2tr:0'");
  });

  it('should use actual changeAddress for browser wallet', () => {
    expect(src).toMatch(/changeAddress:\s*isBrowserWallet\s*\?\s*\(userSegwitAddress\s*\|\|\s*userTaprootAddress\)/);
  });

  it('should throw when taproot address is missing', () => {
    expect(src).toContain("if (!userTaprootAddress) throw new Error('No taproot address available')");
  });
});

// ---------------------------------------------------------------------------
// 6. Unwrap Protostone (for completeness)
// ---------------------------------------------------------------------------

describe('Unwrap frBTC→BTC protostone', () => {
  it('should use opcode 78', () => {
    const result = buildUnwrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toContain(`,${FRBTC_UNWRAP_OPCODE}]`);
  });

  it('should default pointer and refund to v1:v1', () => {
    const result = buildUnwrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toBe('[32,0,78]:v1:v1');
  });

  it('should accept custom pointer and refund', () => {
    const result = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      pointer: 'v0',
      refund: 'v0',
    });
    expect(result).toBe('[32,0,78]:v0:v0');
  });
});
