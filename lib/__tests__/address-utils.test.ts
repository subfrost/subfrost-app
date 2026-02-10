/**
 * Unit tests for lib/address-utils.ts
 *
 * Tests addressToSymbolic conversion and getAddressConfig routing logic
 * for single-address and dual-address wallet modes.
 */
import { describe, it, expect } from 'vitest';
import { addressToSymbolic, getAddressConfig } from '../address-utils';

describe('addressToSymbolic', () => {
  it('maps mainnet taproot (bc1p) to p2tr:0', () => {
    expect(addressToSymbolic('bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nljwv5fsxph6rj0sysspqqa9q69')).toBe('p2tr:0');
  });

  it('maps mainnet segwit (bc1q) to p2wpkh:0', () => {
    expect(addressToSymbolic('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe('p2wpkh:0');
  });

  it('maps testnet taproot (tb1p) to p2tr:0', () => {
    expect(addressToSymbolic('tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut')).toBe('p2tr:0');
  });

  it('maps testnet segwit (tb1q) to p2wpkh:0', () => {
    expect(addressToSymbolic('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe('p2wpkh:0');
  });

  it('maps regtest taproot (bcrt1p) to p2tr:0', () => {
    expect(addressToSymbolic('bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz')).toBe('p2tr:0');
  });

  it('maps regtest segwit (bcrt1q) to p2wpkh:0', () => {
    expect(addressToSymbolic('bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x')).toBe('p2wpkh:0');
  });

  it('passes through P2SH addresses (starts with 3)', () => {
    expect(addressToSymbolic('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
  });

  it('passes through P2PKH addresses (starts with 1)', () => {
    expect(addressToSymbolic('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });

  it('is case-insensitive for prefix matching', () => {
    expect(addressToSymbolic('BC1Ptest')).toBe('p2tr:0');
    expect(addressToSymbolic('BC1Qtest')).toBe('p2wpkh:0');
  });
});

describe('getAddressConfig', () => {
  const TAPROOT = 'bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nljwv5fsxph6rj0sysspqqa9q69';
  const SEGWIT = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

  describe('browser wallet — dual-address (OYL, Xverse)', () => {
    it('returns both from addresses and standard symbolic change', () => {
      const cfg = getAddressConfig({
        walletType: 'browser',
        taprootAddress: TAPROOT,
        segwitAddress: SEGWIT,
      });

      expect(cfg.fromAddresses).toEqual([SEGWIT, TAPROOT]);
      expect(cfg.changeAddress).toBe('p2wpkh:0');
      expect(cfg.alkanesChangeAddress).toBe('p2tr:0');
      expect(cfg.isSingleAddressMode).toBe(false);
    });
  });

  describe('browser wallet — single-address taproot (OKX, Unisat)', () => {
    it('uses taproot for all addresses when only taproot provided', () => {
      const cfg = getAddressConfig({
        walletType: 'browser',
        taprootAddress: TAPROOT,
        segwitAddress: undefined,
      });

      expect(cfg.fromAddresses).toEqual([TAPROOT]);
      expect(cfg.changeAddress).toBe('p2tr:0');
      expect(cfg.alkanesChangeAddress).toBe('p2tr:0');
      expect(cfg.isSingleAddressMode).toBe(true);
    });

    it('treats same address for both as single-address', () => {
      const cfg = getAddressConfig({
        walletType: 'browser',
        taprootAddress: TAPROOT,
        segwitAddress: TAPROOT, // same address
      });

      expect(cfg.isSingleAddressMode).toBe(true);
      expect(cfg.fromAddresses).toEqual([TAPROOT]);
    });
  });

  describe('browser wallet — single-address segwit', () => {
    it('uses segwit for all addresses when only segwit provided', () => {
      const cfg = getAddressConfig({
        walletType: 'browser',
        taprootAddress: undefined,
        segwitAddress: SEGWIT,
      });

      expect(cfg.fromAddresses).toEqual([SEGWIT]);
      expect(cfg.changeAddress).toBe('p2wpkh:0');
      expect(cfg.alkanesChangeAddress).toBe('p2wpkh:0');
      expect(cfg.isSingleAddressMode).toBe(true);
    });
  });

  describe('browser wallet — no addresses (fallback)', () => {
    it('returns empty from addresses with taproot defaults', () => {
      const cfg = getAddressConfig({
        walletType: 'browser',
        taprootAddress: undefined,
        segwitAddress: undefined,
      });

      expect(cfg.fromAddresses).toEqual([]);
      expect(cfg.changeAddress).toBe('p2tr:0');
      expect(cfg.alkanesChangeAddress).toBe('p2tr:0');
      expect(cfg.isSingleAddressMode).toBe(true);
    });
  });

  describe('keystore wallet — dual-address', () => {
    it('uses symbolic addresses for everything', () => {
      const cfg = getAddressConfig({
        walletType: 'keystore',
        taprootAddress: TAPROOT,
        segwitAddress: SEGWIT,
      });

      expect(cfg.fromAddresses).toEqual(['p2wpkh:0', 'p2tr:0']);
      expect(cfg.changeAddress).toBe('p2wpkh:0');
      expect(cfg.alkanesChangeAddress).toBe('p2tr:0');
      expect(cfg.isSingleAddressMode).toBe(false);
    });
  });

  describe('keystore wallet — single-address', () => {
    it('uses p2tr:0 when only taproot', () => {
      const cfg = getAddressConfig({
        walletType: 'keystore',
        taprootAddress: TAPROOT,
        segwitAddress: undefined,
      });

      expect(cfg.fromAddresses).toEqual(['p2tr:0']);
      expect(cfg.changeAddress).toBe('p2tr:0');
      expect(cfg.alkanesChangeAddress).toBe('p2tr:0');
      expect(cfg.isSingleAddressMode).toBe(true);
    });

    it('uses p2wpkh:0 when only segwit', () => {
      const cfg = getAddressConfig({
        walletType: 'keystore',
        taprootAddress: undefined,
        segwitAddress: SEGWIT,
      });

      expect(cfg.fromAddresses).toEqual(['p2wpkh:0']);
      expect(cfg.changeAddress).toBe('p2wpkh:0');
      expect(cfg.alkanesChangeAddress).toBe('p2wpkh:0');
      expect(cfg.isSingleAddressMode).toBe(true);
    });
  });

  describe('null walletType (not yet connected)', () => {
    it('falls through to keystore path', () => {
      const cfg = getAddressConfig({
        walletType: null,
        taprootAddress: TAPROOT,
        segwitAddress: SEGWIT,
      });

      // null walletType is not 'browser', so falls to keystore path
      expect(cfg.fromAddresses).toEqual(['p2wpkh:0', 'p2tr:0']);
      expect(cfg.isSingleAddressMode).toBe(false);
    });
  });
});
