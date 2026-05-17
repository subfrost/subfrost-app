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

  it('parses real mainnet response — DIESEL + METHANE + frBTC on one dust outpoint', () => {
    // Captured wire from app.subfrost.io /api/rpc proxy on 2026-05-17:
    //   metashrew_view protorunesbyoutpoint against outpoint
    //   8c0c67a612dff64a4b305a9a73b798751d1eb6b9f94908f7ed8a107aa2c632e5:0
    //
    // This is the fixture that catches the field-1/field-2 inversion bug
    // that took down the LP balance display on prod for every user. The
    // hand-rolled fixtures below this one use synthetic bytes; this one
    // is the real wire format the indexer returns, so any future swap of
    // field numbers in OutpointResponse breaks this test immediately.
    const hex =
      '0a6e0a240a1a0a060a0208021200120644494553454c18012a0644494553454c' +
      '120608c7bd92dd010a250a1a0a080a0208021202081012074d455448414e4518' +
      '012a03434834120708f8f3e0edd6050a1f0a180a060a02082012001205667242' +
      '544318012a056672425443120308f96712220a20e532c6a27a108aedf70849f9' +
      'b9b61e1d7598b7739a5a304b4af6df12a6670c8c1a270a2251207ab57455a9be' +
      '2f87f4d3dfc3ddf2ac2a3ebc0163159f36130f7ceb9e527fa2c310a2042002';
    const decoded = decodeOutpointResponse(hex);
    const balances = decoded.balance_sheet?.cached?.balances ?? [];

    // DIESEL = (2:0), METHANE = (2:16), frBTC = (32:0). Same wallet that
    // showed "Balance: 0" on the broken LP UI — these three balances must
    // be non-empty here or we've reintroduced the inversion bug.
    const byId = new Map(balances.map(b => [`${b.block}:${b.tx}`, b.amount]));
    expect(byId.get('2:0')).toBeDefined();   // DIESEL
    expect(byId.get('2:16')).toBeDefined();  // METHANE
    expect(byId.get('32:0')).toBeDefined();  // frBTC
    expect(BigInt(byId.get('2:0')!)).toBeGreaterThan(0n);
    expect(BigInt(byId.get('2:16')!)).toBeGreaterThan(0n);
    expect(BigInt(byId.get('32:0')!)).toBeGreaterThan(0n);
    // Output (value at field 3) — dust outpoint, 546 sats.
    expect(decoded.output?.value).toBe(546);
  });

  it('parses a value-only output (no balance sheet) — Output.value at field 2', () => {
    // OutpointResponse with only the Output field (field 3) set.
    // Output { bytes script = 1; uint64 value = 2; } — value is field 2.
    //   field 3 wire 2 tag (outer): (3 << 3) | 2 = 0x1a
    //   Output body: 10 a2 04  (field 2 varint, value 546)
    //   outer len = 3
    const hex = '1a0310a204';
    const decoded = decodeOutpointResponse(hex);
    expect(decoded.output).toEqual({ value: 546 });
    expect(decoded.balance_sheet?.cached?.balances).toEqual([]);
  });

  it('parses a hand-crafted BalanceSheet at field 1 — 100M of (2:0)', () => {
    // OutpointResponse {
    //   balances = BalanceSheet {                              ← field 1
    //     entries: [ BalanceSheetItem {
    //       rune = Rune { rune_id = RuneId { height=2, txindex=0 } },
    //       balance = Uint128 { lo = 100_000_000 }
    //     } ]
    //   }
    // }
    //
    // Inner build:
    //   RuneId.height = Uint128{lo=2}  → 08 02 (2 bytes)
    //     wrap as field 1, wire 2:     0a 02 08 02 (4 bytes)
    //   RuneId.txindex = Uint128{lo=0} → 08 00 (2 bytes)
    //     wrap as field 2, wire 2:     12 02 08 00 (4 bytes)
    //   RuneId total = 8 bytes
    //   Rune.rune_id = field 1, wire 2, len 8:
    //     0a 08 <8>  → 10 bytes
    //   BalanceSheetItem.rune = field 1, wire 2, len 10:
    //     0a 0a <10>
    //   BalanceSheetItem.balance = field 2, wire 2:
    //     Uint128 { lo = 100_000_000 } → 08 80 c2 d7 2f (5 bytes)
    //     wrap: 12 05 <5> (7 bytes)
    //   BalanceSheetItem total = 12 + 7 = 19 bytes
    //   BalanceSheet.entries = field 1, wire 2, len 19:
    //     0a 13 <19>  → 21 bytes
    //   OutpointResponse.balances = field 1 (NOT field 2), wire 2, len 21:
    //     0a 15 <21>
    const hex =
      '0a150a130a0a0a080a0208021202080012050880c2d72f'
        .replace(/\s+/g, '');
    const decoded = decodeOutpointResponse(hex);
    expect(decoded.output).toBeUndefined(); // no field-3 Output in this fixture
    const balances = decoded.balance_sheet?.cached?.balances ?? [];
    expect(balances).toHaveLength(1);
    expect(balances[0]).toEqual({ block: 2, tx: 0, amount: '100000000' });
  });

  it('preserves precision on > 2^53 amounts (DIESEL-scale) at field 1', () => {
    // OutpointResponse { balances = BalanceSheet { entries: [{
    //   rune = RuneId{ height=2, txindex=0 },
    //   balance = Uint128 { lo=0, hi=2 }   // = 2^65, exceeds Number.MAX_SAFE_INTEGER
    // }] } }
    //
    // Build:
    //   Uint128 { lo=0, hi=2 } → 08 00 10 02 (4 bytes)
    //   balance wrap (field 2 wire 2 len 4): 12 04 08 00 10 02 (6 bytes)
    //   RuneId same as previous test (8 bytes)
    //   Rune wrap: 0a 08 <8> (10 bytes)
    //   BalanceSheetItem.rune wrap: 0a 0a <10> (12 bytes)
    //   BalanceSheetItem total = 12 + 6 = 18 bytes
    //   BalanceSheet.entries wrap: 0a 12 <18> (20 bytes)
    //   OutpointResponse.balances (field 1, wire 2, len 20): 0a 14 <20>
    const hex = '0a140a120a0a0a080a02080212020800120408001002'.replace(/\s+/g, '');
    const decoded = decodeOutpointResponse(hex);
    const balances = decoded.balance_sheet?.cached?.balances ?? [];
    expect(balances).toHaveLength(1);
    expect(balances[0].block).toBe(2);
    expect(balances[0].tx).toBe(0);
    expect(balances[0].amount).toBe((1n << 65n).toString());
    expect(BigInt(balances[0].amount)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  });
});
