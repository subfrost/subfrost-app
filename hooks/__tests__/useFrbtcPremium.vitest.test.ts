/**
 * useFrbtcPremium Hook Tests
 *
 * Tests the u128 byte parsing function used to decode premium values
 * from the frBTC contract simulation response.
 *
 * Run with: pnpm test hooks/__tests__/useFrbtcPremium.vitest.test.ts
 */

import { describe, it, expect } from 'vitest';

// ==========================================
// parseU128FromBytes Implementation (extracted from hook)
// ==========================================

/**
 * Parse u128 from little-endian bytes
 * This is the core parsing function from useFrbtcPremium
 */
function parseU128FromBytes(data: number[] | Uint8Array): bigint {
  if (!data || data.length === 0) {
    throw new Error('No data to parse');
  }

  const bytes = new Uint8Array(data);
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }

  // Parse as little-endian u128
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(bytes[i]) << BigInt(i * 8);
  }

  return result;
}

/**
 * Convert premium to fee per thousand
 * Premium 100,000,000 = 100%, so divide by 100,000 to get per-1000
 */
function premiumToFeePerThousand(premium: bigint): number {
  return Number(premium) / 100_000;
}

// ==========================================
// parseU128FromBytes Tests
// ==========================================

describe('parseU128FromBytes', () => {
  describe('basic parsing', () => {
    it('should parse zero value correctly', () => {
      const bytes = new Uint8Array(16).fill(0);
      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(0));
    });

    it('should parse small value (100,000 = 0.1% fee)', () => {
      // 100,000 in hex is 0x186A0
      // Little-endian: [A0, 86, 01, 00, ...]
      const bytes = new Uint8Array(16).fill(0);
      bytes[0] = 0xa0;
      bytes[1] = 0x86;
      bytes[2] = 0x01;

      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(100_000));
    });

    it('should parse medium value (200,000 = 0.2% fee)', () => {
      // 200,000 in hex is 0x30D40
      // Little-endian: [40, 0D, 03, 00, ...]
      const bytes = new Uint8Array(16).fill(0);
      bytes[0] = 0x40;
      bytes[1] = 0x0d;
      bytes[2] = 0x03;

      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(200_000));
    });

    it('should parse maximum value (100,000,000 = 100% fee)', () => {
      // 100,000,000 in hex is 0x5F5E100
      // Little-endian: [00, E1, F5, 05, ...]
      const bytes = new Uint8Array(16).fill(0);
      bytes[0] = 0x00;
      bytes[1] = 0xe1;
      bytes[2] = 0xf5;
      bytes[3] = 0x05;

      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(100_000_000));
    });
  });

  describe('edge cases', () => {
    it('should accept array input', () => {
      const arr = new Array(16).fill(0);
      arr[0] = 0xa0;
      arr[1] = 0x86;
      arr[2] = 0x01;

      const result = parseU128FromBytes(arr);

      expect(result).toBe(BigInt(100_000));
    });

    it('should handle Uint8Array larger than 16 bytes (uses first 16)', () => {
      const bytes = new Uint8Array(32);
      bytes[0] = 0xa0;
      bytes[1] = 0x86;
      bytes[2] = 0x01;
      // Bytes 16-31 should be ignored
      bytes[16] = 0xff;

      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(100_000));
    });

    it('should parse maximum u128 value', () => {
      // Max u128 = 2^128 - 1 = all bytes 0xFF
      const bytes = new Uint8Array(16).fill(0xff);

      const result = parseU128FromBytes(bytes);

      // 2^128 - 1 = 340282366920938463463374607431768211455
      expect(result).toBe(BigInt('340282366920938463463374607431768211455'));
    });

    it('should parse single byte value', () => {
      const bytes = new Uint8Array(16).fill(0);
      bytes[0] = 42;

      const result = parseU128FromBytes(bytes);

      expect(result).toBe(BigInt(42));
    });
  });

  describe('error handling', () => {
    it('should throw error for empty data', () => {
      expect(() => parseU128FromBytes([])).toThrow('No data to parse');
    });

    it('should throw error for null/undefined data', () => {
      expect(() => parseU128FromBytes(null as any)).toThrow('No data to parse');
      expect(() => parseU128FromBytes(undefined as any)).toThrow('No data to parse');
    });

    it('should throw error for insufficient bytes (< 16)', () => {
      const bytes = new Uint8Array(8);
      expect(() => parseU128FromBytes(bytes)).toThrow('Insufficient bytes for u128: 8 < 16');
    });

    it('should throw error for 15 bytes', () => {
      const bytes = new Uint8Array(15);
      expect(() => parseU128FromBytes(bytes)).toThrow('Insufficient bytes for u128: 15 < 16');
    });
  });
});

// ==========================================
// premiumToFeePerThousand Tests
// ==========================================

describe('premiumToFeePerThousand', () => {
  it('should convert 100,000 to 1 per thousand (0.1%)', () => {
    const fee = premiumToFeePerThousand(BigInt(100_000));
    expect(fee).toBe(1);
  });

  it('should convert 200,000 to 2 per thousand (0.2%)', () => {
    const fee = premiumToFeePerThousand(BigInt(200_000));
    expect(fee).toBe(2);
  });

  it('should convert 1,000,000 to 10 per thousand (1%)', () => {
    const fee = premiumToFeePerThousand(BigInt(1_000_000));
    expect(fee).toBe(10);
  });

  it('should convert 100,000,000 to 1000 per thousand (100%)', () => {
    const fee = premiumToFeePerThousand(BigInt(100_000_000));
    expect(fee).toBe(1000);
  });

  it('should convert 0 to 0', () => {
    const fee = premiumToFeePerThousand(BigInt(0));
    expect(fee).toBe(0);
  });

  it('should handle fractional values', () => {
    // 50,000 = 0.05% = 0.5 per thousand
    const fee = premiumToFeePerThousand(BigInt(50_000));
    expect(fee).toBe(0.5);
  });
});

// ==========================================
// Integration: Full Premium Flow
// ==========================================

describe('Integration: Premium parsing flow', () => {
  it('should correctly parse and convert a typical premium response', () => {
    // Simulate a 0.2% fee response from the contract
    // 200,000 premium = 2 per thousand = 0.2%
    const bytes = new Uint8Array(16).fill(0);
    bytes[0] = 0x40;
    bytes[1] = 0x0d;
    bytes[2] = 0x03;

    const premium = parseU128FromBytes(bytes);
    const feePerThousand = premiumToFeePerThousand(premium);

    expect(premium).toBe(BigInt(200_000));
    expect(feePerThousand).toBe(2);

    // Verify this fee works correctly with amounts
    const btcAmount = BigInt(100_000_000); // 1 BTC
    const afterFee = (btcAmount * BigInt(1000 - feePerThousand)) / 1000n;
    expect(afterFee).toBe(BigInt(99_800_000)); // 0.998 BTC (0.2% fee)
  });

  it('should handle the default fallback premium value', () => {
    // Default fallback is 100,000 (0.1% = 1 per thousand)
    const bytes = new Uint8Array(16).fill(0);
    bytes[0] = 0xa0;
    bytes[1] = 0x86;
    bytes[2] = 0x01;

    const premium = parseU128FromBytes(bytes);
    const feePerThousand = premiumToFeePerThousand(premium);

    expect(premium).toBe(BigInt(100_000));
    expect(feePerThousand).toBe(1);

    // 1 BTC with 0.1% fee = 0.999 BTC
    const btcAmount = BigInt(100_000_000);
    const afterFee = (btcAmount * BigInt(1000 - feePerThousand)) / 1000n;
    expect(afterFee).toBe(BigInt(99_900_000));
  });
});

// ==========================================
// Little-Endian Encoding Verification
// ==========================================

describe('Little-endian encoding verification', () => {
  /**
   * Helper to encode a bigint as little-endian u128 bytes
   */
  function encodeU128ToBytes(value: bigint): Uint8Array {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
    }
    return bytes;
  }

  it('should round-trip encode/decode correctly', () => {
    const testValues = [
      BigInt(0),
      BigInt(1),
      BigInt(100_000),
      BigInt(200_000),
      BigInt(100_000_000),
      BigInt('340282366920938463463374607431768211455'), // max u128
    ];

    for (const original of testValues) {
      const encoded = encodeU128ToBytes(original);
      const decoded = parseU128FromBytes(encoded);
      expect(decoded).toBe(original);
    }
  });

  it('should match expected byte patterns', () => {
    // 256 in little-endian = [0x00, 0x01, 0x00, ...]
    const bytes256 = encodeU128ToBytes(BigInt(256));
    expect(bytes256[0]).toBe(0x00);
    expect(bytes256[1]).toBe(0x01);

    // 65536 in little-endian = [0x00, 0x00, 0x01, 0x00, ...]
    const bytes65536 = encodeU128ToBytes(BigInt(65536));
    expect(bytes65536[0]).toBe(0x00);
    expect(bytes65536[1]).toBe(0x00);
    expect(bytes65536[2]).toBe(0x01);
  });
});
