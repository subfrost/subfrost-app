/**
 * Vault Full Coverage Tests
 *
 * Exercises every pure-function control flow path across the vault subsystem:
 *   - useVaultDeposit: protostone & input-requirement builders
 *   - useVaultWithdraw: protostone & input-requirement builders
 *   - useVaultStats: parseU128FromBytes, APY formula, share price
 *   - useVaultUnits: UTXO scanning, filtering, sorting, aggregation
 *   - useDxBtcVault: fetchDxBtcStats RPC response parsing
 *   - simulateCalldata: encodeLeb128, encodeSimulateCalldata
 *   - VaultDepositInterface helpers: token→vault mapping, formatting
 *   - Vault constants: config validation, opcode consistency
 *
 * Source contracts:
 *   /subfrost-alkanes/alkanes/yve-diesel-vault/src/lib.rs
 *   /subfrost-alkanes/crates/polyvault-traits/src/unit_vault.rs
 *
 * Run: pnpm vitest run hooks/__tests__/vaultFullCoverage.vitest.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';

// ---------------------------------------------------------------------------
// 1. useVaultDeposit — protostone & input requirement builders
// ---------------------------------------------------------------------------

import {
  buildVaultDepositProtostone,
  buildVaultDepositInputRequirements,
} from '@/hooks/useVaultDeposit';

describe('useVaultDeposit — buildVaultDepositProtostone', () => {
  it('produces correct format with default pointers', () => {
    const ps = buildVaultDepositProtostone({
      vaultContractId: '4:7937',
      amount: '100000000',
    });
    expect(ps).toBe('[4,7937,1,100000000]:v1:v1');
  });

  it('uses custom pointer and refund when supplied', () => {
    const ps = buildVaultDepositProtostone({
      vaultContractId: '4:256',
      amount: '500',
      pointer: 'v0',
      refund: 'v2',
    });
    expect(ps).toBe('[4,256,1,500]:v0:v2');
  });

  it('encodes opcode 1 (Purchase) from VAULT_OPCODES', () => {
    const ps = buildVaultDepositProtostone({
      vaultContractId: '2:0',
      amount: '1',
    });
    // Opcode position 2 (0-indexed) in the cellpack should be '1'
    const cellpack = ps.split(':')[0].replace('[', '').replace(']', '');
    const parts = cellpack.split(',');
    expect(parts[2]).toBe('1');
  });

  it('handles very large u128 amounts', () => {
    const maxU128 = '340282366920938463463374607431768211455';
    const ps = buildVaultDepositProtostone({
      vaultContractId: '4:7937',
      amount: maxU128,
    });
    expect(ps).toContain(maxU128);
  });

  it('handles zero amount', () => {
    const ps = buildVaultDepositProtostone({
      vaultContractId: '4:7937',
      amount: '0',
    });
    expect(ps).toBe('[4,7937,1,0]:v1:v1');
  });
});

describe('useVaultDeposit — buildVaultDepositInputRequirements', () => {
  it('builds block:tx:amount format from tokenId', () => {
    const req = buildVaultDepositInputRequirements({
      tokenId: '2:0',
      amount: '100000000',
    });
    expect(req).toBe('2:0:100000000');
  });

  it('preserves exact amount without rounding', () => {
    const req = buildVaultDepositInputRequirements({
      tokenId: '32:0',
      amount: '12345678901234567890',
    });
    expect(req).toBe('32:0:12345678901234567890');
  });

  it('handles frBTC token ID', () => {
    const req = buildVaultDepositInputRequirements({
      tokenId: '32:0',
      amount: '1',
    });
    expect(req).toBe('32:0:1');
  });
});

// ---------------------------------------------------------------------------
// 2. useVaultWithdraw — protostone & input requirement builders
// ---------------------------------------------------------------------------

import {
  buildVaultWithdrawProtostone,
  buildVaultWithdrawInputRequirements,
} from '@/hooks/useVaultWithdraw';

describe('useVaultWithdraw — buildVaultWithdrawProtostone', () => {
  it('produces correct format with default pointers', () => {
    const ps = buildVaultWithdrawProtostone({
      vaultContractId: '4:7937',
    });
    expect(ps).toBe('[4,7937,2]:v1:v1');
  });

  it('uses custom pointer and refund when supplied', () => {
    const ps = buildVaultWithdrawProtostone({
      vaultContractId: '4:256',
      pointer: 'v0',
      refund: 'v3',
    });
    expect(ps).toBe('[4,256,2]:v0:v3');
  });

  it('encodes opcode 2 (Redeem) — no amount parameter', () => {
    const ps = buildVaultWithdrawProtostone({
      vaultContractId: '2:123',
    });
    const cellpack = ps.split(':')[0].replace('[', '').replace(']', '');
    const parts = cellpack.split(',');
    // Should have exactly 3 elements: block, tx, opcode
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('2');
  });

  it('withdraw protostone never includes amount', () => {
    const ps = buildVaultWithdrawProtostone({
      vaultContractId: '4:7937',
    });
    const cellpack = ps.split(':')[0].replace('[', '').replace(']', '');
    const parts = cellpack.split(',');
    // Only block, tx, opcode — no 4th element
    expect(parts).toHaveLength(3);
  });
});

describe('useVaultWithdraw — buildVaultWithdrawInputRequirements', () => {
  it('builds block:tx:amount from vault unit ID', () => {
    const req = buildVaultWithdrawInputRequirements({
      vaultUnitId: '2:124',
      amount: '1',
    });
    expect(req).toBe('2:124:1');
  });

  it('handles multi-unit withdrawal amounts', () => {
    const req = buildVaultWithdrawInputRequirements({
      vaultUnitId: '4:8001',
      amount: '50000000',
    });
    expect(req).toBe('4:8001:50000000');
  });
});

// ---------------------------------------------------------------------------
// 3. useVaultStats — parseU128FromBytes edge cases & APY formula
// ---------------------------------------------------------------------------

import { parseU128FromBytes } from '@/hooks/useVaultStats';

describe('useVaultStats — parseU128FromBytes', () => {
  it('parses zero', () => {
    const bytes = new Array(16).fill(0);
    expect(parseU128FromBytes(bytes)).toBe('0');
  });

  it('parses 1000 from LE bytes', () => {
    // 1000 = 0x03E8 → LE: [0xe8, 0x03, 0, ...]
    const bytes = [0xe8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(parseU128FromBytes(bytes)).toBe('1000');
  });

  it('parses 1 BTC in sats (100_000_000)', () => {
    const val = BigInt(100_000_000);
    const bytes = new Array(16).fill(0);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Number((val >> BigInt(i * 8)) & 0xffn);
    }
    expect(parseU128FromBytes(bytes)).toBe('100000000');
  });

  it('parses large u128 near max', () => {
    // All 0xFF bytes = u128 max = 340282366920938463463374607431768211455
    const bytes = new Array(16).fill(0xff);
    const result = parseU128FromBytes(bytes);
    expect(result).toBe('340282366920938463463374607431768211455');
  });

  it('throws on insufficient bytes (< 16)', () => {
    expect(() => parseU128FromBytes([1, 2, 3])).toThrow('Insufficient bytes for u128');
    expect(() => parseU128FromBytes([])).toThrow('Insufficient bytes for u128');
    expect(() => parseU128FromBytes(new Array(15).fill(0))).toThrow('Insufficient bytes for u128');
  });

  it('ignores bytes beyond 16', () => {
    const bytes = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff];
    expect(parseU128FromBytes(bytes)).toBe('1');
  });

  it('handles power-of-two values', () => {
    // 2^64 = 18446744073709551616 → byte index 8 = 1, rest 0
    const bytes = new Array(16).fill(0);
    bytes[8] = 1;
    expect(parseU128FromBytes(bytes)).toBe('18446744073709551616');
  });
});

describe('useVaultStats — APY annualization formula', () => {
  // Replicate the formula from useVaultStats.ts lines 135-142
  function computeApy(sharePrice: string): string {
    const sp = new BigNumber(sharePrice);
    if (sp.isGreaterThan(1)) {
      const appreciation = sp.minus(1);
      const annualized = appreciation.times(365).div(30).times(100);
      return annualized.toFixed(2);
    }
    return '0.00';
  }

  it('returns 0.00 when share price is exactly 1', () => {
    expect(computeApy('1')).toBe('0.00');
  });

  it('returns 0.00 when share price is below 1', () => {
    expect(computeApy('0.95')).toBe('0.00');
  });

  it('computes correct APY for 2% appreciation', () => {
    // sharePrice = 1.02 → appreciation = 0.02 → annualized = 0.02 * (365/30) * 100 = 24.33
    const result = computeApy('1.02');
    expect(parseFloat(result)).toBeCloseTo(24.33, 1);
  });

  it('computes correct APY for 10% appreciation', () => {
    // sharePrice = 1.10 → appreciation = 0.10 → annualized = 0.10 * 12.1667 * 100 = 121.67
    const result = computeApy('1.10');
    expect(parseFloat(result)).toBeCloseTo(121.67, 0);
  });

  it('handles very small appreciation', () => {
    const result = computeApy('1.0001');
    expect(parseFloat(result)).toBeGreaterThan(0);
    expect(parseFloat(result)).toBeLessThan(2);
  });
});

describe('useVaultStats — share price calculation', () => {
  function calcSharePrice(tvl: string, totalSupply: string): string {
    if (totalSupply !== '0' && tvl !== '0') {
      return new BigNumber(tvl).dividedBy(new BigNumber(totalSupply)).toFixed(8);
    }
    return '1';
  }

  it('returns 1 when both are zero (no deposits)', () => {
    expect(calcSharePrice('0', '0')).toBe('1');
  });

  it('returns 1 when supply is zero but tvl is non-zero', () => {
    // Edge case — shouldn't happen but guard against division by zero
    expect(calcSharePrice('1000', '0')).toBe('1');
  });

  it('returns 1 when tvl is zero but supply is non-zero', () => {
    expect(calcSharePrice('0', '1000')).toBe('1');
  });

  it('computes 2.0 when tvl doubles supply', () => {
    expect(calcSharePrice('200000000', '100000000')).toBe('2.00000000');
  });

  it('handles fractional share prices', () => {
    const result = calcSharePrice('150000000', '100000000');
    expect(result).toBe('1.50000000');
  });
});

// ---------------------------------------------------------------------------
// 4. useVaultUnits — UTXO scanning, filtering, sorting, aggregation
// ---------------------------------------------------------------------------

describe('useVaultUnits — vault unit detection logic', () => {
  // Reimplements the core pure logic from useVaultUnits.ts queryFn
  // since the hook itself requires React context

  type MockUtxo = {
    alkanes?: Record<string, { value: string }>;
  };

  function extractVaultUnits(utxos: MockUtxo[], templateBlock: string) {
    const unitMap = new Map<string, { amount: bigint; count: number }>();

    for (const utxo of utxos) {
      if (utxo.alkanes && typeof utxo.alkanes === 'object') {
        for (const [alkaneId, alkaneEntry] of Object.entries(utxo.alkanes)) {
          const parts = alkaneId.split(':');
          if (parts.length !== 2) continue;
          const [block] = parts;

          if (block === templateBlock) {
            const existing = unitMap.get(alkaneId);
            if (existing) {
              existing.amount += BigInt(alkaneEntry.value);
              existing.count += 1;
            } else {
              unitMap.set(alkaneId, {
                amount: BigInt(alkaneEntry.value),
                count: 1,
              });
            }
          }
        }
      }
    }

    const vaultUnits: Array<{ alkaneId: string; amount: string; utxoCount: number }> = [];
    for (const [alkaneId, data] of unitMap.entries()) {
      vaultUnits.push({
        alkaneId,
        amount: data.amount.toString(),
        utxoCount: data.count,
      });
    }

    vaultUnits.sort((a, b) => {
      const aTx = parseInt(a.alkaneId.split(':')[1]);
      const bTx = parseInt(b.alkaneId.split(':')[1]);
      return bTx - aTx;
    });

    return vaultUnits;
  }

  it('returns empty for no UTXOs', () => {
    expect(extractVaultUnits([], '2')).toEqual([]);
  });

  it('returns empty for UTXOs without alkanes', () => {
    const utxos: MockUtxo[] = [{ alkanes: undefined }, {}];
    expect(extractVaultUnits(utxos, '2')).toEqual([]);
  });

  it('filters by template block — only matching block included', () => {
    const utxos: MockUtxo[] = [{
      alkanes: {
        '2:100': { value: '1000' },
        '3:50': { value: '500' },
        '2:101': { value: '2000' },
      },
    }];
    const result = extractVaultUnits(utxos, '2');
    expect(result).toHaveLength(2);
    expect(result.every(u => u.alkaneId.startsWith('2:'))).toBe(true);
  });

  it('aggregates amounts across multiple UTXOs for same alkane ID', () => {
    const utxos: MockUtxo[] = [
      { alkanes: { '2:100': { value: '500' } } },
      { alkanes: { '2:100': { value: '300' } } },
      { alkanes: { '2:100': { value: '200' } } },
    ];
    const result = extractVaultUnits(utxos, '2');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe('1000');
    expect(result[0].utxoCount).toBe(3);
  });

  it('sorts descending by tx index (most recent first)', () => {
    const utxos: MockUtxo[] = [{
      alkanes: {
        '2:50': { value: '100' },
        '2:200': { value: '100' },
        '2:100': { value: '100' },
      },
    }];
    const result = extractVaultUnits(utxos, '2');
    expect(result.map(u => u.alkaneId)).toEqual(['2:200', '2:100', '2:50']);
  });

  it('skips alkane IDs with malformed format', () => {
    const utxos: MockUtxo[] = [{
      alkanes: {
        'invalid': { value: '100' },
        '2:100': { value: '200' },
        '': { value: '300' },
        '2:101:extra': { value: '400' },
      },
    }];
    const result = extractVaultUnits(utxos, '2');
    // Only '2:100' is valid (2-part) and matches block '2'
    expect(result).toHaveLength(1);
    expect(result[0].alkaneId).toBe('2:100');
  });

  it('handles BigInt amounts correctly for large values', () => {
    const utxos: MockUtxo[] = [{
      alkanes: {
        '4:100': { value: '18446744073709551615' }, // u64 max
      },
    }];
    const result = extractVaultUnits(utxos, '4');
    expect(result[0].amount).toBe('18446744073709551615');
  });

  it('handles mixed vault and non-vault alkanes in same UTXO', () => {
    const utxos: MockUtxo[] = [{
      alkanes: {
        '4:7937': { value: '500' },   // vault unit
        '2:0': { value: '100000' },   // DIESEL (different block)
        '32:0': { value: '50000' },   // frBTC (different block)
        '4:8001': { value: '200' },   // another vault unit
      },
    }];
    const result = extractVaultUnits(utxos, '4');
    expect(result).toHaveLength(2);
    expect(result.map(u => u.alkaneId)).toEqual(['4:8001', '4:7937']);
  });
});

// ---------------------------------------------------------------------------
// 5. useDxBtcVault — fetchDxBtcStats parsing
// ---------------------------------------------------------------------------

describe('useDxBtcVault — response parsing', () => {
  // Tests the hex → BigInt parsing logic from fetchDxBtcStats

  function parseTotalSupplyFromResponse(data: any): string {
    const totalSupply = data?.result?.execution?.data
      ? BigInt('0x' + (data.result.execution.data.replace('0x', '').slice(0, 32) || '0'))
      : 0n;
    return totalSupply.toString();
  }

  it('parses total supply from valid hex response', () => {
    const data = {
      result: {
        execution: {
          data: '0x00000000000000000000000005f5e100', // 100_000_000 in hex (padded)
        },
      },
    };
    const result = parseTotalSupplyFromResponse(data);
    expect(BigInt(result)).toBe(BigInt('0x00000000000000000000000005f5e100'));
  });

  it('returns 0 for null execution data', () => {
    expect(parseTotalSupplyFromResponse({ result: { execution: {} } })).toBe('0');
    expect(parseTotalSupplyFromResponse({ result: {} })).toBe('0');
    expect(parseTotalSupplyFromResponse({})).toBe('0');
    expect(parseTotalSupplyFromResponse(null)).toBe('0');
  });

  it('strips 0x prefix before parsing', () => {
    const data = {
      result: {
        execution: {
          data: '0x0000000000000001',
        },
      },
    };
    const result = parseTotalSupplyFromResponse(data);
    expect(BigInt(result)).toBe(1n);
  });

  it('handles data without 0x prefix', () => {
    const data = {
      result: {
        execution: {
          data: '0000000000000064',
        },
      },
    };
    const result = parseTotalSupplyFromResponse(data);
    expect(BigInt(result)).toBe(100n);
  });
});

// ---------------------------------------------------------------------------
// 6. encodeSimulateCalldata & encodeLeb128
// ---------------------------------------------------------------------------

import { encodeLeb128, encodeSimulateCalldata } from '@/utils/simulateCalldata';

describe('encodeLeb128', () => {
  it('encodes 0 as single byte [0]', () => {
    expect(encodeLeb128(0)).toEqual([0]);
  });

  it('encodes small values (< 128) as single byte', () => {
    expect(encodeLeb128(1)).toEqual([1]);
    expect(encodeLeb128(4)).toEqual([4]);
    expect(encodeLeb128(127)).toEqual([127]);
  });

  it('encodes 128 as two bytes', () => {
    // 128 = 0b10000000 → LEB128: [0x80 | 0x00, 0x01] = [0x80, 0x01]
    // Actually: low 7 bits = 0 | 0x80 = 0x80, remaining = 1
    expect(encodeLeb128(128)).toEqual([0x80, 0x01]);
  });

  it('encodes 300 correctly', () => {
    // 300 = 0b100101100 → low 7 = 0101100 = 44 | 0x80 = 0xAC, high = 10 = 2
    expect(encodeLeb128(300)).toEqual([0xac, 0x02]);
  });

  it('encodes multi-byte values', () => {
    // 16384 = 2^14 → [0x80, 0x80, 0x01]
    expect(encodeLeb128(16384)).toEqual([0x80, 0x80, 0x01]);
  });

  it('encodes vault contract block/tx numbers', () => {
    // 7937 = 0x1F01 → LEB128
    const encoded = encodeLeb128(7937);
    // Verify roundtrip: decode and check
    let value = 0;
    let shift = 0;
    for (const byte of encoded) {
      value |= (byte & 0x7f) << shift;
      shift += 7;
    }
    expect(value).toBe(7937);
  });
});

describe('encodeSimulateCalldata', () => {
  it('encodes simple contract ID + opcode', () => {
    const result = encodeSimulateCalldata('4:7937', [1]);
    // Should be LEB128(4) + LEB128(7937) + LEB128(1)
    expect(result).toEqual([
      ...encodeLeb128(4),
      ...encodeLeb128(7937),
      ...encodeLeb128(1),
    ]);
  });

  it('encodes vault balance query (opcode 4)', () => {
    const result = encodeSimulateCalldata('4:7937', [4]);
    const expected = [...encodeLeb128(4), ...encodeLeb128(7937), ...encodeLeb128(4)];
    expect(result).toEqual(expected);
  });

  it('encodes TotalAssets query (opcode 11)', () => {
    const result = encodeSimulateCalldata('4:7020', [11]);
    const expected = [...encodeLeb128(4), ...encodeLeb128(7020), ...encodeLeb128(11)];
    expect(result).toEqual(expected);
  });

  it('encodes GetTotalSupply query (opcode 101)', () => {
    const result = encodeSimulateCalldata('4:7020', [101]);
    const expected = [...encodeLeb128(4), ...encodeLeb128(7020), ...encodeLeb128(101)];
    expect(result).toEqual(expected);
  });

  it('encodes multiple inputs', () => {
    const result = encodeSimulateCalldata('32:0', [103]);
    const expected = [...encodeLeb128(32), ...encodeLeb128(0), ...encodeLeb128(103)];
    expect(result).toEqual(expected);
  });

  it('encodes frBTC signer query', () => {
    // This is the actual calldata used in faucetFrbtc
    const result = encodeSimulateCalldata('32:0', [103]);
    expect(result.length).toBeGreaterThan(0);
    // First value should be LEB128(32)
    expect(result[0]).toBe(32);
  });

  it('handles contract IDs with large tx numbers', () => {
    const result = encodeSimulateCalldata('4:65498', [2, 4, 65498]);
    // Should not throw and should produce valid LEB128
    expect(result.length).toBeGreaterThan(3);
    // Roundtrip decode the first value
    let value = 0;
    let shift = 0;
    let i = 0;
    do {
      value |= (result[i] & 0x7f) << shift;
      shift += 7;
    } while (result[i++] & 0x80);
    expect(value).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 7. VaultDepositInterface helpers
// ---------------------------------------------------------------------------

import { AVAILABLE_VAULTS, type VaultConfig } from '@/app/vaults/constants';
import {
  getVaultForInputToken,
  isBtcBasedVault,
  formatVaultAmount,
  getInitialInputTokenForVault,
} from '@/app/vaults/components/VaultDepositInterface';

describe('VaultDepositInterface — getVaultForInputToken', () => {
  it('maps btc to dx-btc vault', () => {
    const vault = getVaultForInputToken('btc');
    expect(vault).not.toBeNull();
    expect(vault!.id).toBe('dx-btc');
  });

  it('maps frBTC (32:0) to dx-btc vault', () => {
    const vault = getVaultForInputToken('32:0');
    expect(vault).not.toBeNull();
    expect(vault!.id).toBe('dx-btc');
  });

  it('maps DIESEL (2:0) to FIRE protocol', () => {
    const vault = getVaultForInputToken('2:0');
    expect(vault).not.toBeNull();
    expect(vault!.id).toBe('ve-diesel');
  });

  it('returns null for unmapped token', () => {
    expect(getVaultForInputToken('999:999')).toBeNull();
    expect(getVaultForInputToken('unknown')).toBeNull();
  });
});

describe('VaultDepositInterface — isBtcBasedVault', () => {
  it('returns true for dxBTC output', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    expect(isBtcBasedVault(vault)).toBe(true);
  });

  it('returns true for yvfrBTC output', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'yv-frbtc')!;
    expect(isBtcBasedVault(vault)).toBe(true);
  });

  it('returns false for FIRE output', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 've-diesel')!;
    expect(isBtcBasedVault(vault)).toBe(false);
  });

  it('returns false for veORDI output', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 've-ordi')!;
    expect(isBtcBasedVault(vault)).toBe(false);
  });
});

describe('VaultDepositInterface — formatVaultAmount', () => {
  it('formats BTC-based vault to 8 decimals', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    expect(formatVaultAmount('1.5', vault)).toBe('1.50000000');
  });

  it('formats non-BTC vault to 2 decimals', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 've-diesel')!;
    expect(formatVaultAmount('1.5', vault)).toBe('1.50');
  });

  it('handles empty string input', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    expect(formatVaultAmount('', vault)).toBe('0.00000000');
  });

  it('handles NaN input', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 've-diesel')!;
    expect(formatVaultAmount('abc', vault)).toBe('0.00');
  });

  it('handles zero input', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    expect(formatVaultAmount('0', vault)).toBe('0.00000000');
  });
});

describe('VaultDepositInterface — getInitialInputTokenForVault', () => {
  it('returns BTC for dxBTC vault', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    const token = getInitialInputTokenForVault(vault);
    expect(token.symbol).toBe('BTC');
    expect(token.id).toBe('btc');
  });

  it('returns DIESEL for FIRE vault', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 've-diesel')!;
    const token = getInitialInputTokenForVault(vault);
    expect(token.symbol).toBe('DIESEL');
    expect(token.id).toBe('2:0');
  });

  it('returns frBTC for yvfrBTC vault', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'yv-frbtc')!;
    const token = getInitialInputTokenForVault(vault);
    expect(token.symbol).toBe('frBTC');
    expect(token.id).toBe('32:0');
  });

  it('falls back to vault tokenId for unmapped output', () => {
    const customVault: VaultConfig = {
      id: 'test',
      name: 'Test',
      description: 'Test',
      tokenId: '99:99',
      tokenSymbol: 'TEST',
      contractAddress: '4:9999',
      type: 'unit-vault',
      inputAsset: 'FOO',
      outputAsset: 'veFOO',
      hasBoost: false,
    };
    const token = getInitialInputTokenForVault(customVault);
    expect(token.id).toBe('99:99');
    expect(token.symbol).toBe('FOO');
  });
});

// ---------------------------------------------------------------------------
// 8. Vault constants validation & opcode consistency
// ---------------------------------------------------------------------------

import { VAULT_OPCODES } from '@/constants';

describe('VAULT_OPCODES — constant integrity', () => {
  it('Purchase is 1', () => expect(VAULT_OPCODES.Purchase).toBe('1'));
  it('Redeem is 2', () => expect(VAULT_OPCODES.Redeem).toBe('2'));
  it('ClaimAndRestake is 3', () => expect(VAULT_OPCODES.ClaimAndRestake).toBe('3'));
  it('GetVeDieselBalance is 4', () => expect(VAULT_OPCODES.GetVeDieselBalance).toBe('4'));
  it('ReceiveRewards is 5', () => expect(VAULT_OPCODES.ReceiveRewards).toBe('5'));
  it('ClaimAndDistributeRewards is 6', () => expect(VAULT_OPCODES.ClaimAndDistributeRewards).toBe('6'));
  it('Initialize is 0', () => expect(VAULT_OPCODES.Initialize).toBe('0'));

  it('all opcodes are string-encoded integers', () => {
    for (const [key, val] of Object.entries(VAULT_OPCODES)) {
      expect(typeof val).toBe('string');
      expect(Number.isInteger(Number(val))).toBe(true);
    }
  });

  it('no duplicate opcode values', () => {
    const values = Object.values(VAULT_OPCODES);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('AVAILABLE_VAULTS — config validation', () => {
  it('all vaults have required fields', () => {
    for (const vault of AVAILABLE_VAULTS) {
      expect(vault.id).toBeTruthy();
      expect(vault.name).toBeTruthy();
      expect(vault.description).toBeTruthy();
      expect(vault.tokenId).toBeTruthy();
      expect(vault.tokenSymbol).toBeTruthy();
      expect(vault.contractAddress).toBeTruthy();
      expect(['unit-vault', 'fire-protocol']).toContain(vault.type);
      expect(vault.inputAsset).toBeTruthy();
      expect(vault.outputAsset).toBeTruthy();
      expect(typeof vault.hasBoost).toBe('boolean');
    }
  });

  it('no duplicate vault IDs', () => {
    const ids = AVAILABLE_VAULTS.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contract addresses follow block:tx format for deployed vaults', () => {
    const deployed = AVAILABLE_VAULTS.filter(v => !v.contractAddress.startsWith('0x'));
    for (const vault of deployed) {
      const parts = vault.contractAddress.split(':');
      expect(parts).toHaveLength(2);
      expect(Number.isInteger(Number(parts[0]))).toBe(true);
      expect(Number.isInteger(Number(parts[1]))).toBe(true);
    }
  });

  it('boost vaults have boost token metadata', () => {
    const boosted = AVAILABLE_VAULTS.filter(v => v.hasBoost);
    for (const vault of boosted) {
      expect(vault.boostTokenSymbol).toBeTruthy();
      expect(vault.boostTokenName).toBeTruthy();
    }
  });

  it('apyHistory arrays have 30 entries when present', () => {
    const withHistory = AVAILABLE_VAULTS.filter(v => v.apyHistory);
    for (const vault of withHistory) {
      expect(vault.apyHistory).toHaveLength(30);
    }
  });

  it('risk levels are valid when present', () => {
    const withRisk = AVAILABLE_VAULTS.filter(v => v.riskLevel);
    for (const vault of withRisk) {
      expect(['low', 'medium', 'high', 'very-high']).toContain(vault.riskLevel);
    }
  });
});

describe('AVAILABLE_VAULTS — generateApyRandomWalk bounds', () => {
  it('dxBTC APY history stays within bounds', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'dx-btc')!;
    expect(vault.apyHistory).toBeDefined();
    for (const val of vault.apyHistory!) {
      expect(val).toBeGreaterThanOrEqual(2.1);
      expect(val).toBeLessThanOrEqual(6.2);
    }
  });

  it('vxFUEL APY history stays within bounds', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'vx-fuel')!;
    expect(vault.apyHistory).toBeDefined();
    for (const val of vault.apyHistory!) {
      expect(val).toBeGreaterThanOrEqual(5.0);
      expect(val).toBeLessThanOrEqual(12.0);
    }
  });

  it('vxBTCUSD APY history stays within bounds', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'vx-btcusd')!;
    expect(vault.apyHistory).toBeDefined();
    for (const val of vault.apyHistory!) {
      expect(val).toBeGreaterThanOrEqual(10.0);
      expect(val).toBeLessThanOrEqual(20.0);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Deposit → Withdraw round-trip consistency
// ---------------------------------------------------------------------------

describe('Vault round-trip — deposit and withdraw target same contract', () => {
  const vaultId = '4:7937';

  it('deposit protostone targets same contract as withdraw', () => {
    const depositPs = buildVaultDepositProtostone({ vaultContractId: vaultId, amount: '1000' });
    const withdrawPs = buildVaultWithdrawProtostone({ vaultContractId: vaultId });

    // Both should start with [4,7937,
    expect(depositPs.startsWith('[4,7937,')).toBe(true);
    expect(withdrawPs.startsWith('[4,7937,')).toBe(true);
  });

  it('deposit uses opcode 1, withdraw uses opcode 2', () => {
    const depositPs = buildVaultDepositProtostone({ vaultContractId: vaultId, amount: '1000' });
    const withdrawPs = buildVaultWithdrawProtostone({ vaultContractId: vaultId });

    const depositOpcode = depositPs.split(',')[2];
    const withdrawOpcode = withdrawPs.split(',')[2].split(']')[0];

    expect(depositOpcode).toBe(VAULT_OPCODES.Purchase);
    expect(withdrawOpcode).toBe(VAULT_OPCODES.Redeem);
  });

  it('deposit input requirements use token ID, withdraw use vault unit ID', () => {
    const depositReq = buildVaultDepositInputRequirements({ tokenId: '2:0', amount: '1000' });
    const withdrawReq = buildVaultWithdrawInputRequirements({ vaultUnitId: '2:124', amount: '1' });

    // Both should be block:tx:amount format
    expect(depositReq.split(':')).toHaveLength(3);
    expect(withdrawReq.split(':')).toHaveLength(3);

    // But different token IDs
    expect(depositReq.startsWith('2:0:')).toBe(true);
    expect(withdrawReq.startsWith('2:124:')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. encodeSimulateCalldata used by useVaultStats
// ---------------------------------------------------------------------------

describe('encodeSimulateCalldata — vault stat queries match useVaultStats usage', () => {
  it('GetVeDieselBalance calldata matches opcode 4', () => {
    const contractId = '4:7937';
    const calldata = encodeSimulateCalldata(contractId, [4]);
    // Decode first two values to verify contract targeting
    expect(calldata[0]).toBe(4); // block (single byte since < 128)
    // tx = 7937 is multi-byte LEB128
    expect(calldata.length).toBeGreaterThan(3);
  });

  it('TotalAssets calldata matches opcode 11', () => {
    const calldata = encodeSimulateCalldata('4:7020', [11]);
    expect(calldata[0]).toBe(4);
    // Last value should decode to 11
    const lastByte = calldata[calldata.length - 1];
    expect(lastByte).toBe(11); // 11 < 128 so single byte
  });

  it('GetTotalSupply calldata matches opcode 101', () => {
    const calldata = encodeSimulateCalldata('4:7020', [101]);
    expect(calldata[0]).toBe(4);
    // Last value should decode to 101
    const lastByte = calldata[calldata.length - 1];
    expect(lastByte).toBe(101); // 101 < 128 so single byte
  });
});

// ---------------------------------------------------------------------------
// 11. formatApyBadge from VaultListItem
// ---------------------------------------------------------------------------

import { formatApyBadge } from '@/app/vaults/components/VaultListItem';

describe('VaultListItem — formatApyBadge', () => {
  it('returns dash for undefined', () => {
    expect(formatApyBadge(undefined)).toBe('-');
  });

  it('returns dash for empty string', () => {
    expect(formatApyBadge('')).toBe('-');
  });

  it('rounds up with Math.ceil', () => {
    expect(formatApyBadge('4.2')).toBe('~5%');
    expect(formatApyBadge('3.1')).toBe('~4%');
    expect(formatApyBadge('21.0')).toBe('~21%');
  });

  it('handles integer APY', () => {
    expect(formatApyBadge('5')).toBe('~5%');
    expect(formatApyBadge('0')).toBe('~0%');
  });

  it('handles very small APY', () => {
    expect(formatApyBadge('0.01')).toBe('~1%');
  });

  it('handles large APY', () => {
    expect(formatApyBadge('150.7')).toBe('~151%');
  });
});

// ---------------------------------------------------------------------------
// 12. ApySparkline — pure SVG path generation logic
// ---------------------------------------------------------------------------

describe('ApySparkline — SVG path generation (pure math)', () => {
  // Replicates the pure calculation from ApySparkline.tsx
  function generateSparklinePath(data: number[], boostActive: boolean = false) {
    const chartData = boostActive ? data.map(v => v * 1.5) : data;
    const width = 180;
    const height = 48;
    const padding = { top: 4, right: 8, bottom: 4, left: 4 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const minY = Math.min(...chartData);
    const maxY = Math.max(...chartData);
    const range = maxY - minY;
    const isFlat = range === 0;

    const points = chartData.map((value, index) => {
      const x = padding.left + (index / (chartData.length - 1 || 1)) * chartWidth;
      const y = isFlat
        ? padding.top + chartHeight / 2
        : padding.top + chartHeight - ((value - minY) / range) * chartHeight;
      return { x, y };
    });

    const pathD = points.length > 0
      ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
      : '';

    return { points, pathD, chartData, isFlat };
  }

  it('generates correct number of points from data', () => {
    const data = [3.5, 3.6, 3.7, 3.8, 3.9];
    const { points } = generateSparklinePath(data);
    expect(points).toHaveLength(5);
  });

  it('first point starts at left padding', () => {
    const { points } = generateSparklinePath([1, 2, 3]);
    expect(points[0].x).toBe(4); // padding.left = 4
  });

  it('last point ends at right edge minus padding', () => {
    const { points } = generateSparklinePath([1, 2, 3]);
    // padding.left + chartWidth = 4 + 168 = 172
    expect(points[points.length - 1].x).toBe(172);
  });

  it('flat data centers the line vertically', () => {
    const { points, isFlat } = generateSparklinePath([5, 5, 5, 5]);
    expect(isFlat).toBe(true);
    // All Y values should be padding.top + chartHeight/2 = 4 + 20 = 24
    for (const p of points) {
      expect(p.y).toBe(24);
    }
  });

  it('highest value maps to top padding', () => {
    const { points } = generateSparklinePath([1, 5, 3]);
    // Max (5) should be at padding.top = 4
    expect(points[1].y).toBe(4);
  });

  it('lowest value maps to bottom (padding.top + chartHeight)', () => {
    const { points } = generateSparklinePath([1, 5, 3]);
    // Min (1) should be at padding.top + chartHeight = 4 + 40 = 44
    expect(points[0].y).toBe(44);
  });

  it('boost multiplies all data by 1.5x', () => {
    const data = [10, 20, 30];
    const { chartData } = generateSparklinePath(data, true);
    expect(chartData).toEqual([15, 30, 45]);
  });

  it('non-boost preserves original data', () => {
    const data = [10, 20, 30];
    const { chartData } = generateSparklinePath(data, false);
    expect(chartData).toEqual([10, 20, 30]);
  });

  it('generates valid SVG path string', () => {
    const { pathD } = generateSparklinePath([3.5, 3.7, 3.9]);
    expect(pathD).toMatch(/^M \d/);
    expect(pathD).toContain(' L ');
  });

  it('single data point produces M without L', () => {
    const { pathD } = generateSparklinePath([5]);
    expect(pathD).toMatch(/^M /);
    expect(pathD).not.toContain(' L ');
  });

  it('empty data produces empty path', () => {
    const { pathD } = generateSparklinePath([]);
    expect(pathD).toBe('');
  });

  it('30-day APY history produces smooth path', () => {
    const vault = AVAILABLE_VAULTS.find(v => v.id === 'yv-frbtc')!;
    const { points, pathD } = generateSparklinePath(vault.apyHistory!);
    expect(points).toHaveLength(30);
    expect(pathD.split(' L ').length).toBe(30); // 'M p1 L p2 L ... L p30' splits to 30
  });
});
