/**
 * Wire-format pin for the metashrew_view protorunesbyoutpoint path.
 *
 * The encoded bytes must match what `~/alkanes-rs/crates/alkanes-cli-common/
 * src/provider.rs:2944 get_protorunes_by_outpoint` emits — same indexer
 * surface, same expected response decoding. If the wire format ever drifts
 * silently, this test trips before any wallet read fails in production.
 */
import { describe, expect, it } from 'vitest';
import {
  encodeOutpointWithProtocol,
  decodeOutpointResponse,
} from '../protorunesByOutpointMV';

describe('encodeOutpointWithProtocol', () => {
  it('emits the exact wire bytes the Rust provider builds', () => {
    // bitcoin::Txid display order (BE); indexer wants LE — verify by
    // reconstructing the expected hex byte-by-byte to avoid string-reversal
    // mistakes (the previous fixture had off-by-one chars on each end).
    const txid = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const vout = 1;
    const hex = encodeOutpointWithProtocol(txid, vout, 1n);
    const txidLE = txid.match(/.{2}/g)!.reverse().join('');
    // 0x0a 0x20 <txid LE>  field 1 wire 2 len 32 + txid
    // 0x10 0x01              field 2 wire 0 vout=1
    // 0x1a 0x04 <Uint128>    field 3 wire 2 len 4
    //   0x08 0x01            field 1 (lo) wire 0 = 1
    //   0x10 0x00            field 2 (hi) wire 0 = 0
    expect(hex).toBe(`0x0a20${txidLE}10011a0408011000`);
  });

  it('throws on txid that is not 32 bytes', () => {
    expect(() => encodeOutpointWithProtocol('abcd', 0, 1n)).toThrow(/32 bytes/);
  });

  it('handles vout values larger than 127 (multi-byte varint)', () => {
    const txid = 'aa'.repeat(32);
    const hex = encodeOutpointWithProtocol(txid, 300, 1n);
    // 300 = 0xac 0x02 in varint
    expect(hex).toContain('10ac02');
  });

  it('handles protocol_tag > 2^64 (Uint128 high bits)', () => {
    const txid = 'aa'.repeat(32);
    const big = (1n << 70n); // requires hi=64, lo=0
    const hex = encodeOutpointWithProtocol(txid, 0, big);
    // hi = 1n << 6n = 64 → varint 0x40
    // lo = 0          → varint 0x00
    expect(hex).toContain('080010');
  });
});

describe('decodeOutpointResponse', () => {
  it('returns empty balance_sheet on empty hex', () => {
    expect(decodeOutpointResponse('')).toEqual({
      balance_sheet: { cached: { balances: [] } },
    });
    expect(decodeOutpointResponse('0x')).toEqual({
      balance_sheet: { cached: { balances: [] } },
    });
  });

  it('parses a value-only output (no balance sheet)', () => {
    // Output { value: 546 }
    const hex = '0a0408a204';
    const decoded = decodeOutpointResponse(hex);
    expect(decoded.output).toEqual({ value: 546 });
    expect(decoded.balance_sheet?.cached?.balances).toEqual([]);
  });

  it('parses balance sheet entries with rune id + balance', () => {
    // BalanceSheet { entries: [ BalanceSheetItem { rune: Rune { rune_id: { height: 2, txindex: 0 } }, balance: 1_000_000_000 } ] }
    //
    // Inner-most:
    //   RuneId.height = Uint128{lo=2}     → 0x08 0x02 (2 bytes)
    //   RuneId.txindex = Uint128{lo=0}    → 0x08 0x00 (2 bytes)
    //
    //   RuneId = field1 (height, len=2) + field2 (txindex, len=2):
    //     0x0a 0x02 0x08 0x02 0x12 0x02 0x08 0x00  (8 bytes)
    //
    //   Rune.rune_id = field1, len=8:
    //     0x0a 0x08 <8 RuneId bytes>  (10 bytes total)
    //
    //   BalanceSheetItem.rune = field1, len=10:
    //     0x0a 0x0a <10 Rune bytes>  (12 bytes total)
    //   BalanceSheetItem.balance = field2, len=variant
    //     balance = Uint128{lo=1_000_000_000}
    //       0x08 0xc0 0x96 0xb1 0x02 (1B in varint = 5 bytes)
    //     wrapper: 0x12 0x05 <5 bytes>  (7 bytes)
    //   BalanceSheetItem total = 19 bytes
    //
    //   BalanceSheet.entries = field1, len=19:
    //     0x0a 0x13 <19 bytes>
    //   OutpointResponse.balances = field2, len=21:
    //     0x12 0x15 <21 bytes>
    //
    // RuneId inner (8 bytes):    "0a0208021202080" + "0" wait let me do bytes:
    //   0a 02 08 02            (height field1, len2, varint 2)
    //   12 02 08 00            (txindex field2, len2, varint 0)
    //
    // Rune (10 bytes):  0a 08 <8>
    //   0a 08 0a 02 08 02 12 02 08 00
    //
    // Balance Uint128 (5 bytes): 08 c0 96 b1 02
    //
    // BalanceSheetItem (19 bytes):
    //   0a 0a <10 Rune bytes> 12 05 <5 balance bytes>
    //   0a 0a 0a 08 0a 02 08 02 12 02 08 00 12 05 08 c0 96 b1 02
    //
    // BalanceSheet (21 bytes):
    //   0a 13 <19 BalanceSheetItem bytes>
    //
    // OutpointResponse:
    //   12 15 <21 BalanceSheet bytes>
    // 100_000_000 in varint = 0x80 0xc2 0xd7 0x2f (4 bytes) — small enough
    // to fit cleanly in this hand-rolled wire example.
    const hex =
      '12150a130a0a0a080a0208021202080012050880c2d72f'
        .replace(/\s+/g, '');
    const decoded = decodeOutpointResponse(hex);
    expect(decoded.output).toBeUndefined(); // no Output field in this fixture
    const balances = decoded.balance_sheet?.cached?.balances ?? [];
    expect(balances).toHaveLength(1);
    // amount is decimal STRING (mobile services.rs JSON shape) so 10^18-scale
    // DIESEL totals don't round-trip-corrupt through Number coercion.
    expect(balances[0]).toEqual({ block: 2, tx: 0, amount: '100000000' });
  });

  it('preserves precision on > 2^53 amounts (DIESEL-scale)', () => {
    // Hand-roll a BalanceSheet with an amount that overflows Number.MAX_SAFE_INTEGER.
    // Amount = 10^18 = 1000000000000000000 = 0x0de0b6b3a7640000.
    // As varint (LE 7-bit groups): bytes for 1e18:
    //   1000000000000000000 → varint encoding 8 bytes:
    //     0x80 0x80 0x90 0xbf 0xc2 0xd7 0x2f → let me recompute
    // Easier: bypass the manual hex and round-trip via encode → decode using a
    // larger amount, then assert the string form survives.
    //
    // Instead, just assert the parseUint128 helper handles hi+lo composition.
    // We pick balance = 2^65 = 36893488147419103232 → lo=0, hi=2
    //   Uint128 wire:
    //     lo varint 0 → 08 00 (2 bytes)
    //     hi varint 2 → 10 02 (2 bytes)
    //   = 4-byte body
    //   Wrap: 12 04 08 00 10 02  (6 bytes, but it's "field 2" of a BalanceSheetItem)
    // RuneId height=2, txindex=0 → 0a 02 08 02 12 02 08 00 (8 bytes)
    // Rune wrapping: 0a 08 <8> (10 bytes)
    // BalanceSheetItem: rune(field1)=10b + balance(field2)=6b
    //   0a 0a <10 Rune bytes> 12 04 08 00 10 02  → 18 bytes
    // BalanceSheet: 0a 12 <18 BalanceSheetItem bytes>  → 20 bytes
    // OutpointResponse: 12 14 <20 BalanceSheet bytes>
    const hex = '12140a120a0a0a080a020802120208001204080010 02'.replace(/\s+/g, '');
    const decoded = decodeOutpointResponse(hex);
    const balances = decoded.balance_sheet?.cached?.balances ?? [];
    expect(balances).toHaveLength(1);
    expect(balances[0].block).toBe(2);
    expect(balances[0].tx).toBe(0);
    expect(balances[0].amount).toBe((1n << 65n).toString());
    expect(BigInt(balances[0].amount)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  });
});
