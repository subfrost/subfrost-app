/**
 * Tests for lib/alkanes/constants.ts — shared constants.
 *
 * Verifies constants match the documented opcode and address values.
 * Pure assertions, no dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
  FACTORY_SWAP_OPCODE,
  FRBTC_WRAP_OPCODE,
  FRBTC_UNWRAP_OPCODE,
  POOL_OPCODES,
  SIGNER_ADDRESSES,
} from '../constants';

describe('Factory opcodes', () => {
  it('swap opcode is 13 (SwapExactTokensForTokens)', () => {
    expect(FACTORY_SWAP_OPCODE).toBe(13);
  });
});

describe('frBTC opcodes', () => {
  it('wrap opcode is 77', () => {
    expect(FRBTC_WRAP_OPCODE).toBe(77);
  });

  it('unwrap opcode is 78', () => {
    expect(FRBTC_UNWRAP_OPCODE).toBe(78);
  });
});

describe('Pool opcodes', () => {
  it('has correct opcode values', () => {
    expect(POOL_OPCODES.Init).toBe(0);
    expect(POOL_OPCODES.AddLiquidity).toBe(1);
    expect(POOL_OPCODES.RemoveLiquidity).toBe(2);
    expect(POOL_OPCODES.Swap).toBe(3);
    expect(POOL_OPCODES.SimulateSwap).toBe(4);
  });
});

describe('Signer addresses', () => {
  it('mainnet address starts with bc1p (P2TR)', () => {
    expect(SIGNER_ADDRESSES.mainnet).toMatch(/^bc1p/);
  });

  it('regtest address starts with bcrt1p (P2TR)', () => {
    expect(SIGNER_ADDRESSES.regtest).toMatch(/^bcrt1p/);
  });

  it('subfrost-regtest uses same address as regtest', () => {
    expect(SIGNER_ADDRESSES['subfrost-regtest']).toBe(SIGNER_ADDRESSES.regtest);
  });

  it('regtest signer matches known address', () => {
    expect(SIGNER_ADDRESSES.regtest).toBe(
      'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz'
    );
  });
});
