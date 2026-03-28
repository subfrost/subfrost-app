/**
 * Cross-chain bridge quote and protostone builder tests.
 *
 * Covers ETH and ZEC bridge flows:
 * - ETH <-> BTC via frETH synth pool
 * - ZEC <-> BTC via frZEC synth pool
 * - Decimal conversion correctness (18->8->8)
 * - Fee calculation accuracy
 * - Protostone encoding for burn/bridge and deposit intents
 */
import { describe, it, expect } from 'vitest';
import {
  quoteEthToBtc,
  quoteBtcToEth,
  quoteZecToBtc,
  quoteBtcToZec,
  ETH_TO_FRETH_FACTOR,
  ZEC_TO_FRZEC_FACTOR,
} from '../quoteEngine';
import type { SynthPoolReserves, BridgeFees } from '../quoteEngine';
import {
  buildBurnAndBridgeEthProtostone,
  buildEthDepositIntentProtostone,
  buildBurnAndBridgeZecProtostone,
  buildZecDepositIntentProtostone,
  validateProtostone,
} from '../protostoneBuilder';

// ── Shared test fixtures ──

// ETH/BTC synth pool: ~16 ETH and ~1 BTC at ~$100k BTC / ~$3.5k ETH ratio
const ETH_BTC_RESERVES: SynthPoolReserves = {
  frbtcReserve: 100_000_000n,             // 1 frBTC (8 dec)
  frusdReserve: 16_00_000_000n,           // 16 frETH (8 dec)
  feePerMille: 4,                          // 0.4%
};

// ZEC/BTC synth pool: ~2500 ZEC and ~1 BTC at ~$100k BTC / ~$40 ZEC
const ZEC_BTC_RESERVES: SynthPoolReserves = {
  frbtcReserve: 100_000_000n,             // 1 frBTC (8 dec)
  frusdReserve: 250_000_000_000n,         // 2500 frZEC (8 dec)
  feePerMille: 4,
};

const DEFAULT_FEES: BridgeFees = {
  protocolFeeBps: 10,       // 0.1%
  wrapFeePerMille: 5,       // 0.5%
};

// ── ETH <-> BTC Quote Tests ──

describe('ETH <-> BTC Quotes', () => {
  describe('quoteEthToBtc', () => {
    it('should compute a valid quote for 1 ETH', () => {
      const oneEthWei = 1_000_000_000_000_000_000n; // 10^18
      const quote = quoteEthToBtc(oneEthWei, ETH_BTC_RESERVES, DEFAULT_FEES);

      expect(quote.finalOutput).toBeGreaterThan(0n);
      expect(quote.priceImpact).toBeGreaterThan(0);
      expect(quote.estimatedTimeMinutes).toBe(20);
    });

    it('should apply 0.1% protocol fee on ETH input', () => {
      const tenEthWei = 10_000_000_000_000_000_000n; // 10 ETH
      const quote = quoteEthToBtc(tenEthWei, ETH_BTC_RESERVES, DEFAULT_FEES);

      // 10 ETH * 10/10000 = 0.01 ETH
      const expectedFee = 10_000_000_000_000_000n; // 0.01 ETH in wei
      expect(quote.protocolFee).toBe(expectedFee);
      expect(quote.netInputAfterFee).toBe(tenEthWei - expectedFee);
    });

    it('should convert ETH 18-dec to frETH 8-dec', () => {
      const oneEthWei = 1_000_000_000_000_000_000n;
      const quote = quoteEthToBtc(oneEthWei, ETH_BTC_RESERVES, DEFAULT_FEES);

      // After 0.1% fee: 0.999 ETH in wei = 999_000_000_000_000_000
      // Divided by 10^10 = 99_900_000 frETH units (8 dec)
      const expectedFrEth = (oneEthWei - oneEthWei / 1000n) / ETH_TO_FRETH_FACTOR;
      expect(quote.frUsdAmount).toBe(expectedFrEth);
    });

    it('should apply unwrap fee on BTC output', () => {
      const oneEthWei = 1_000_000_000_000_000_000n;
      const quote = quoteEthToBtc(oneEthWei, ETH_BTC_RESERVES, DEFAULT_FEES);

      const expectedWrapFee = (quote.synthPoolOutput * 5n) / 1000n;
      expect(quote.finalOutput).toBe(quote.synthPoolOutput - expectedWrapFee);
    });

    it('should return zero output for zero input', () => {
      const quote = quoteEthToBtc(0n, ETH_BTC_RESERVES, DEFAULT_FEES);
      expect(quote.finalOutput).toBe(0n);
      expect(quote.protocolFee).toBe(0n);
    });

    it('should have fee breakdown strings', () => {
      const oneEthWei = 1_000_000_000_000_000_000n;
      const quote = quoteEthToBtc(oneEthWei, ETH_BTC_RESERVES, DEFAULT_FEES);
      expect(quote.feeBreakdown.protocolFee).toContain('ETH');
      expect(quote.feeBreakdown.wrapFee).toContain('BTC');
      expect(quote.feeBreakdown.synthPoolFee).toContain('%');
    });
  });

  describe('quoteBtcToEth', () => {
    it('should compute a valid quote for 0.1 BTC', () => {
      const btcSats = 10_000_000n; // 0.1 BTC
      const quote = quoteBtcToEth(btcSats, ETH_BTC_RESERVES, DEFAULT_FEES);

      expect(quote.finalOutput).toBeGreaterThan(0n);
      expect(quote.priceImpact).toBeGreaterThan(0);
      expect(quote.estimatedTimeMinutes).toBe(25);
    });

    it('should apply wrap fee on BTC input', () => {
      const btcSats = 100_000_000n; // 1 BTC
      const quote = quoteBtcToEth(btcSats, ETH_BTC_RESERVES, DEFAULT_FEES);

      const expectedWrapFee = (btcSats * 5n) / 1000n; // 0.5%
      expect(quote.netInputAfterFee).toBe(btcSats - expectedWrapFee);
    });

    it('should convert frETH 8-dec to ETH 18-dec', () => {
      const btcSats = 10_000_000n; // 0.1 BTC
      const quote = quoteBtcToEth(btcSats, ETH_BTC_RESERVES, DEFAULT_FEES);

      // Output should be in wei (18-dec scale) minus protocol fee
      // frETH (8 dec) * 10^10 = ETH (18 dec)
      expect(quote.finalOutput).toBeGreaterThan(10n ** 15n); // at least 0.001 ETH
    });

    it('should apply protocol fee on ETH output', () => {
      const btcSats = 10_000_000n;
      const quote = quoteBtcToEth(btcSats, ETH_BTC_RESERVES, DEFAULT_FEES);

      // finalOutput = (frethOut * 10^10) - protocol_fee
      // protocol_fee = ethWei * 10 / 10000
      const ethWei = quote.synthPoolOutput * ETH_TO_FRETH_FACTOR;
      const expectedFee = (ethWei * 10n) / 10000n;
      expect(quote.protocolFee).toBe(expectedFee);
      expect(quote.finalOutput).toBe(ethWei - expectedFee);
    });
  });
});

// ── ZEC <-> BTC Quote Tests ──

describe('ZEC <-> BTC Quotes', () => {
  describe('quoteZecToBtc', () => {
    it('should compute a valid quote for 100 ZEC', () => {
      const zecZatoshi = 100_00_000_000n; // 100 ZEC (8 dec)
      const quote = quoteZecToBtc(zecZatoshi, ZEC_BTC_RESERVES, DEFAULT_FEES);

      expect(quote.finalOutput).toBeGreaterThan(0n);
      expect(quote.estimatedTimeMinutes).toBe(30);
    });

    it('should apply 0.1% protocol fee on ZEC input', () => {
      const zecZatoshi = 1000_00_000_000n; // 1000 ZEC
      const quote = quoteZecToBtc(zecZatoshi, ZEC_BTC_RESERVES, DEFAULT_FEES);

      const expectedFee = zecZatoshi / 1000n; // 0.1% = 1/1000
      expect(quote.protocolFee).toBe(expectedFee);
    });

    it('should be 1:1 ZEC to frZEC conversion', () => {
      const zecZatoshi = 100_00_000_000n;
      const quote = quoteZecToBtc(zecZatoshi, ZEC_BTC_RESERVES, DEFAULT_FEES);

      // After fee, frZEC amount should equal net ZEC (both 8-dec)
      expect(quote.frUsdAmount).toBe(quote.netInputAfterFee / ZEC_TO_FRZEC_FACTOR);
    });

    it('should apply unwrap fee on BTC output', () => {
      const zecZatoshi = 100_00_000_000n;
      const quote = quoteZecToBtc(zecZatoshi, ZEC_BTC_RESERVES, DEFAULT_FEES);

      const expectedWrapFee = (quote.synthPoolOutput * 5n) / 1000n;
      expect(quote.finalOutput).toBe(quote.synthPoolOutput - expectedWrapFee);
    });

    it('should return zero output for zero input', () => {
      const quote = quoteZecToBtc(0n, ZEC_BTC_RESERVES, DEFAULT_FEES);
      expect(quote.finalOutput).toBe(0n);
    });
  });

  describe('quoteBtcToZec', () => {
    it('should compute a valid quote for 0.01 BTC', () => {
      const btcSats = 1_000_000n; // 0.01 BTC
      const quote = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, DEFAULT_FEES);

      expect(quote.finalOutput).toBeGreaterThan(0n);
      expect(quote.estimatedTimeMinutes).toBe(30);
    });

    it('should apply wrap fee on BTC input', () => {
      const btcSats = 100_000_000n; // 1 BTC
      const quote = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, DEFAULT_FEES);

      const expectedWrapFee = (btcSats * 5n) / 1000n;
      expect(quote.netInputAfterFee).toBe(btcSats - expectedWrapFee);
    });

    it('should have 1:1 frZEC to ZEC conversion', () => {
      const btcSats = 10_000_000n; // 0.1 BTC
      const quote = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, DEFAULT_FEES);

      // frZEC and ZEC are both 8-dec, so synthPoolOutput * 1 = zecAmount before fee
      const zecBeforeFee = quote.synthPoolOutput * ZEC_TO_FRZEC_FACTOR;
      const expectedFee = (zecBeforeFee * 10n) / 10000n;
      expect(quote.finalOutput).toBe(zecBeforeFee - expectedFee);
    });

    it('should apply protocol fee on ZEC output', () => {
      const btcSats = 10_000_000n;
      const quote = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, DEFAULT_FEES);

      const zecAmount = quote.synthPoolOutput * ZEC_TO_FRZEC_FACTOR;
      const expectedFee = (zecAmount * 10n) / 10000n;
      expect(quote.protocolFee).toBe(expectedFee);
    });
  });
});

// ── Decimal Conversion Tests ──

describe('Decimal Conversions', () => {
  it('ETH 18-dec -> frETH 8-dec: division by 10^10', () => {
    // 1.5 ETH in wei
    const ethWei = 1_500_000_000_000_000_000n;
    const freth = ethWei / ETH_TO_FRETH_FACTOR;
    expect(freth).toBe(1_50_000_000n); // 1.5 in 8-dec
  });

  it('frETH 8-dec -> ETH 18-dec: multiplication by 10^10', () => {
    const freth = 1_50_000_000n; // 1.5 frETH
    const ethWei = freth * ETH_TO_FRETH_FACTOR;
    expect(ethWei).toBe(1_500_000_000_000_000_000n);
  });

  it('ZEC 8-dec -> frZEC 8-dec: 1:1 identity', () => {
    const zec = 42_00_000_000n; // 42 ZEC
    const frzec = zec / ZEC_TO_FRZEC_FACTOR;
    expect(frzec).toBe(zec);
  });

  it('very small ETH amount should truncate to zero frETH', () => {
    // 1 wei = 1 unit in 18-dec
    // 1 / 10^10 = 0 in integer division
    const oneWei = 1n;
    const freth = oneWei / ETH_TO_FRETH_FACTOR;
    expect(freth).toBe(0n);
  });

  it('minimum representable ETH -> frETH is 10^10 wei', () => {
    const minRepresentable = ETH_TO_FRETH_FACTOR; // 10^10 wei = 1 frETH unit
    const freth = minRepresentable / ETH_TO_FRETH_FACTOR;
    expect(freth).toBe(1n);
  });
});

// ── Fee Calculation Accuracy ──

describe('Fee Accuracy', () => {
  it('protocol fee rounds down for small amounts', () => {
    // 99 zatoshi * 10 / 10000 = 0 (rounds down)
    const quote = quoteZecToBtc(99n, ZEC_BTC_RESERVES, DEFAULT_FEES);
    expect(quote.protocolFee).toBe(0n);
    expect(quote.netInputAfterFee).toBe(99n);
  });

  it('custom fees are respected', () => {
    const customFees: BridgeFees = {
      protocolFeeBps: 50,     // 0.5%
      wrapFeePerMille: 10,    // 1.0%
    };
    const btcSats = 100_000_000n;
    const quote = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, customFees);

    // Wrap fee: 100M * 10/1000 = 1M sats
    const expectedWrapFee = 1_000_000n;
    expect(quote.netInputAfterFee).toBe(btcSats - expectedWrapFee);
  });

  it('zero-fee bridge should yield more output', () => {
    const btcSats = 10_000_000n;
    const noFees: BridgeFees = { protocolFeeBps: 0, wrapFeePerMille: 0 };

    const withFees = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, DEFAULT_FEES);
    const withoutFees = quoteBtcToZec(btcSats, ZEC_BTC_RESERVES, noFees);

    expect(withoutFees.finalOutput).toBeGreaterThan(withFees.finalOutput);
  });
});

// ── Edge Cases ──

describe('Edge Cases', () => {
  it('very small ETH input yields zero BTC (sub-dust)', () => {
    // 100 wei -> after fee, divided by 10^10 = 0 frETH -> 0 everything
    const quote = quoteEthToBtc(100n, ETH_BTC_RESERVES, DEFAULT_FEES);
    expect(quote.finalOutput).toBe(0n);
  });

  it('empty reserves return zero output', () => {
    const emptyReserves: SynthPoolReserves = {
      frbtcReserve: 0n,
      frusdReserve: 0n,
      feePerMille: 4,
    };
    const quote = quoteEthToBtc(1_000_000_000_000_000_000n, emptyReserves, DEFAULT_FEES);
    expect(quote.finalOutput).toBe(0n);
    expect(quote.synthPoolOutput).toBe(0n);
  });

  it('very large ZEC trade has high price impact', () => {
    // Trade 1000 ZEC against a pool with 2500 ZEC reserve
    const largeZec = 1000_00_000_000n;
    const quote = quoteZecToBtc(largeZec, ZEC_BTC_RESERVES, DEFAULT_FEES);
    expect(quote.priceImpact).toBeGreaterThan(10); // >10% impact
  });
});

// ── ETH Protostone Builder Tests ──

describe('ETH Bridge Protostones', () => {
  describe('buildBurnAndBridgeEthProtostone', () => {
    it('should encode ETH address as hi/lo u128 pair', () => {
      const ps = buildBurnAndBridgeEthProtostone(
        '4:8301',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      );
      expect(ps).toContain('[4,8301,5,');
      expect(ps).toContain(':v0:v0');

      // Should have block, tx, opcode, hi, lo = 5 parts
      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      expect(parts?.length).toBe(5);
    });

    it('should produce same output for mixed-case addresses', () => {
      const lower = buildBurnAndBridgeEthProtostone(
        '4:8301',
        '0xabcdef1234567890abcdef1234567890abcdef12',
      );
      const upper = buildBurnAndBridgeEthProtostone(
        '4:8301',
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      );
      expect(lower).toBe(upper);
    });

    it('should reject invalid address length', () => {
      expect(() =>
        buildBurnAndBridgeEthProtostone('4:8301', '0x1234'),
      ).toThrow('Invalid ETH address');
    });

    it('should include calldata when provided', () => {
      const ps = buildBurnAndBridgeEthProtostone(
        '4:8301',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '0xdeadbeef',
      );
      // Should have: block, tx, opcode, hi, lo, cdLen, cdChunks...
      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      expect(parts!.length).toBeGreaterThan(5);
      // cdLen should be 4 bytes
      expect(parts![5]).toBe('4');
    });

    it('should reject odd-length calldata', () => {
      expect(() =>
        buildBurnAndBridgeEthProtostone(
          '4:8301',
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          '0xabc', // 3 hex chars = odd
        ),
      ).toThrow('even-length hex');
    });

    it('should produce valid protostone format', () => {
      const ps = buildBurnAndBridgeEthProtostone(
        '4:8301',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      );
      expect(validateProtostone(ps)).toBeNull();
    });
  });

  describe('buildEthDepositIntentProtostone', () => {
    it('should encode BTC scriptPubKey for frETH mint target', () => {
      // P2TR scriptPubKey (34 bytes)
      const script = '5120' + 'a'.repeat(64); // OP_1 + 32-byte pubkey
      const ps = buildEthDepositIntentProtostone('4:8301', script);

      expect(ps).toContain('[4,8301,6,'); // opcode 6 = DepositIntent
      expect(ps).toContain(':v0:v0');

      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      // block, tx, opcode, scriptLen, chunk1, chunk2, chunk3
      expect(parts![3]).toBe('34'); // 34-byte P2TR script
    });

    it('should reject empty scriptPubKey', () => {
      expect(() =>
        buildEthDepositIntentProtostone('4:8301', ''),
      ).toThrow('Invalid scriptPubKey');
    });

    it('should reject odd-length scriptPubKey', () => {
      expect(() =>
        buildEthDepositIntentProtostone('4:8301', 'abc'),
      ).toThrow('Invalid scriptPubKey');
    });

    it('should produce valid protostone format', () => {
      const script = '5120' + 'a'.repeat(64);
      const ps = buildEthDepositIntentProtostone('4:8301', script);
      expect(validateProtostone(ps)).toBeNull();
    });
  });
});

// ── ZEC Protostone Builder Tests ──

describe('ZEC Bridge Protostones', () => {
  describe('buildBurnAndBridgeZecProtostone', () => {
    // Known ZEC mainnet t1 address for testing.
    // t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU is a well-known address.
    // We use a synthetic address that decodes to known bytes.

    it('should encode ZEC t-address hash160 and prefix', () => {
      // t1 address starts with [0x1c, 0xb8] prefix
      // We need a valid base58check-encoded string. Build one from known data.
      // For testing, we verify the structure: [block,tx,5,hi,lo,prefix0,prefix1]
      const ps = buildBurnAndBridgeZecProtostone(
        '4:8401',
        't1VpYDWpaXGCfAzMwQMg9cVnjuMQ4MCbqWK', // known valid mainnet t1
      );
      expect(ps).toContain('[4,8401,5,');
      expect(ps).toContain(':v0:v0');

      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      // block, tx, opcode, hi, lo, prefix0, prefix1 = 7 parts
      expect(parts?.length).toBe(7);
      // Prefix bytes for mainnet t1: 0x1c=28, 0xb8=184
      expect(parts![5]).toBe('28');
      expect(parts![6]).toBe('184');
    });

    it('should reject non-t-address', () => {
      expect(() =>
        buildBurnAndBridgeZecProtostone('4:8401', 'zs1abcdef...'),
      ).toThrow('Invalid ZEC t-address');
    });

    it('should reject addresses not starting with t', () => {
      expect(() =>
        buildBurnAndBridgeZecProtostone('4:8401', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
      ).toThrow('Invalid ZEC t-address');
    });

    it('should produce valid protostone format', () => {
      const ps = buildBurnAndBridgeZecProtostone(
        '4:8401',
        't1VpYDWpaXGCfAzMwQMg9cVnjuMQ4MCbqWK',
      );
      expect(validateProtostone(ps)).toBeNull();
    });
  });

  describe('buildZecDepositIntentProtostone', () => {
    it('should encode BTC scriptPubKey for frZEC mint target', () => {
      const script = '0014' + 'b'.repeat(40); // P2WPKH (22 bytes)
      const ps = buildZecDepositIntentProtostone('4:8401', script);

      expect(ps).toContain('[4,8401,6,');
      const cellpack = ps.match(/\[([^\]]+)\]/)?.[1];
      const parts = cellpack?.split(',');
      expect(parts![3]).toBe('22'); // 22-byte P2WPKH script
    });

    it('should produce valid protostone format', () => {
      const script = '0014' + 'b'.repeat(40);
      const ps = buildZecDepositIntentProtostone('4:8401', script);
      expect(validateProtostone(ps)).toBeNull();
    });
  });
});
