/**
 * Protostone Builder Tests
 */
import { describe, it, expect } from 'vitest';
import {
  buildAmmSwapProtostone,
  buildSynthPoolSwapProtostone,
  buildAddLiquidityProtostone,
  buildMintFrusdProtostone,
  buildBurnAndBridgeProtostone,
  buildBridgeToBtcProtostone,
  buildLimitOrderProtostone,
  validateProtostone,
} from '../protostoneBuilder';

describe('Protostone Builder', () => {
  describe('AMM Swap', () => {
    it('should build factory opcode 13 protostone', () => {
      const ps = buildAmmSwapProtostone('4:65498', ['2:0', '32:0'], '1000000', '900000', 99999);
      expect(ps).toBe('[4,65498,13,2,2,0,32,0,1000000,900000,99999]:v0:v0');
    });

    it('should handle 3-hop path', () => {
      const ps = buildAmmSwapProtostone('4:65498', ['2:0', '4:8201', '32:0'], '500', '400', 10000);
      expect(ps).toContain(',3,'); // path length = 3
      expect(ps).toContain('2,0,4,8201,32,0');
    });
  });

  describe('Synth Pool Swap', () => {
    it('should build pool opcode 3 protostone', () => {
      const ps = buildSynthPoolSwapProtostone('4:8202', '900000', 99999);
      expect(ps).toBe('[4,8202,3,900000,99999]:v0:v0');
    });
  });

  describe('Add Liquidity', () => {
    it('should build pool opcode 1 protostone', () => {
      const ps = buildAddLiquidityProtostone('2:6');
      expect(ps).toBe('[2,6,1]:v0:v0');
    });
  });

  describe('Mint frUSD', () => {
    it('should build frUSD opcode 1 protostone', () => {
      const ps = buildMintFrusdProtostone('4:8201', '999000000000000000000');
      expect(ps).toBe('[4,8201,1,999000000000000000000]:v0:v0');
    });
  });

  describe('BurnAndBridge', () => {
    it('should encode EVM address in two u128 parts', () => {
      const ps = buildBurnAndBridgeProtostone('4:8201', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(ps).toContain('[4,8201,5,');
      expect(ps).toContain(':v0:v0');
      // Should have two big numbers (hi and lo parts of address)
      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      expect(parts?.length).toBe(5); // block, tx, opcode, hi, lo
    });

    it('should reject invalid address length', () => {
      expect(() => buildBurnAndBridgeProtostone('4:8201', '0x1234')).toThrow('Invalid EVM address');
    });

    it('should handle lowercase and uppercase addresses', () => {
      const lower = buildBurnAndBridgeProtostone('4:8201', '0xabcdef1234567890abcdef1234567890abcdef12');
      const upper = buildBurnAndBridgeProtostone('4:8201', '0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
      expect(lower).toBe(upper);
    });
  });

  describe('Bridge to BTC', () => {
    it('should build synth pool swap protostone', () => {
      const ps = buildBridgeToBtcProtostone('4:8202', '999000000000000000000', '90000000', 99999);
      expect(ps).toBe('[4,8202,3,90000000,99999]:v0:v0');
    });
  });

  describe('Limit Order', () => {
    it('should build carbine controller opcode 20 protostone', () => {
      const ps = buildLimitOrderProtostone('4:70000', '2:0', '32:0', 0, '99500', '1000');
      expect(ps).toBe('[4,70000,20,2,0,32,0,0,99500,1000]:v0:v0');
    });

    it('should handle sell side', () => {
      const ps = buildLimitOrderProtostone('4:70000', '2:0', '32:0', 1, '100500', '500');
      expect(ps).toContain(',1,100500,500');
    });
  });

  describe('Validation', () => {
    it('should accept valid protostone', () => {
      expect(validateProtostone('[4,8201,1,1000]:v0:v0')).toBeNull();
    });

    it('should accept protostone with p-pointer', () => {
      expect(validateProtostone('[4,8201,1]:p0:v0')).toBeNull();
    });

    it('should reject missing bracket', () => {
      expect(validateProtostone('4,8201,1]:v0:v0')).not.toBeNull();
    });

    it('should reject missing pointer', () => {
      expect(validateProtostone('[4,8201,1]')).not.toBeNull();
    });

    it('should reject invalid pointer format', () => {
      expect(validateProtostone('[4,8201,1]:abc:v0')).not.toBeNull();
    });
  });
});
