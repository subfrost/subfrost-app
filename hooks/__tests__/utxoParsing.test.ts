/**
 * UTXO Parsing and Vault Unit Detection Tests
 *
 * These tests verify our UTXO parsing logic matches the alkanes SDK structure
 * and that our vault unit detection correctly filters alkanes.
 */

import { describe, it, expect } from 'vitest';

// Mock FormattedUtxo structure based on SDK
type AlkaneReadableId = string; // e.g., "2:0"

type AlkanesUtxoEntry = {
  value: string;
  name: string;
  symbol: string;
};

type FormattedUtxo = {
  txid: string;
  vout: number;
  value: number;
  alkanes: Record<AlkaneReadableId, AlkanesUtxoEntry>;
  confirmations: number;
  indexed: boolean;
};

// Simulate our frontend logic
function parseAlkaneId(id: string): { block: string; tx: string } {
  const [block, tx] = id.split(':');
  if (!block || !tx) throw new Error(`Invalid alkaneId format ${id}`);
  return { block, tx };
}

function extractVaultUnits(
  utxos: FormattedUtxo[],
  vaultTemplateBlock: string,
): Array<{ alkaneId: string; amount: string; utxoCount: number }> {
  const unitMap = new Map<string, { amount: bigint; count: number }>();

  for (const utxo of utxos) {
    if (utxo.alkanes && typeof utxo.alkanes === 'object') {
      for (const [alkaneId, alkaneEntry] of Object.entries(utxo.alkanes)) {
        const alkaneIdParts = alkaneId.split(':');
        if (alkaneIdParts.length !== 2) continue;

        const [blockStr] = alkaneIdParts;

        if (blockStr === vaultTemplateBlock) {
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

  // Sort by tx number (most recent first)
  vaultUnits.sort((a, b) => {
    const aTx = parseInt(a.alkaneId.split(':')[1]);
    const bTx = parseInt(b.alkaneId.split(':')[1]);
    return bTx - aTx;
  });

  return vaultUnits;
}

describe('UTXO Structure Parsing', () => {
  it('Should correctly parse alkanes Record from UTXO', () => {
    const mockUtxo: FormattedUtxo = {
      txid: 'abc123',
      vout: 0,
      value: 1000,
      alkanes: {
        '2:100': { value: '1', name: 'Unit #100', symbol: 'UNIT' },
        '2:101': { value: '1', name: 'Unit #101', symbol: 'UNIT' },
      },
      confirmations: 6,
      indexed: true,
    };

    const alkaneIds = Object.keys(mockUtxo.alkanes);
    expect(alkaneIds).toHaveLength(2);
    expect(alkaneIds).toContain('2:100');
    expect(alkaneIds).toContain('2:101');
  });

  it('Should access alkaneEntry.value correctly', () => {
    const mockUtxo: FormattedUtxo = {
      txid: 'abc123',
      vout: 0,
      value: 1000,
      alkanes: {
        '2:100': { value: '123456789', name: 'Test', symbol: 'TEST' },
      },
      confirmations: 6,
      indexed: true,
    };

    const entry = mockUtxo.alkanes['2:100'];
    expect(entry.value).toBe('123456789');
    expect(entry.name).toBe('Test');
    expect(entry.symbol).toBe('TEST');
  });

  it('Should handle UTXO with no alkanes', () => {
    const mockUtxo: FormattedUtxo = {
      txid: 'abc123',
      vout: 0,
      value: 1000,
      alkanes: {},
      confirmations: 6,
      indexed: true,
    };

    const alkaneIds = Object.keys(mockUtxo.alkanes);
    expect(alkaneIds).toHaveLength(0);
  });
});

describe('Vault Unit Detection Logic', () => {
  it('Should detect vault units in same block as template', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Unit', symbol: 'UNIT' },
          '2:101': { value: '1', name: 'Unit', symbol: 'UNIT' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    expect(vaultUnits).toHaveLength(2);
    expect(vaultUnits[0].alkaneId).toBe('2:101'); // Sorted descending by tx
    expect(vaultUnits[1].alkaneId).toBe('2:100');
  });

  it('Should filter out alkanes from different blocks', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Vault Unit', symbol: 'UNIT' },
          '3:50': { value: '1000000', name: 'DIESEL', symbol: 'DIESEL' },
          '4:0': { value: '5000000', name: 'Other Token', symbol: 'OTHER' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    // Should only include block 2 alkanes
    expect(vaultUnits).toHaveLength(1);
    expect(vaultUnits[0].alkaneId).toBe('2:100');
  });

  it('Should aggregate amounts across multiple UTXOs', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Unit', symbol: 'UNIT' },
        },
        confirmations: 6,
        indexed: true,
      },
      {
        txid: 'tx2',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Unit', symbol: 'UNIT' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    // Same unit in 2 UTXOs should aggregate
    expect(vaultUnits).toHaveLength(1);
    expect(vaultUnits[0].amount).toBe('2'); // 1 + 1
    expect(vaultUnits[0].utxoCount).toBe(2);
  });

  it('Should handle empty UTXO array', () => {
    const vaultUnits = extractVaultUnits([], '2');
    expect(vaultUnits).toHaveLength(0);
  });
});

describe('Unit Sorting Logic', () => {
  it('Should sort units by tx number descending (newest first)', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Unit', symbol: 'UNIT' },
          '2:105': { value: '1', name: 'Unit', symbol: 'UNIT' },
          '2:102': { value: '1', name: 'Unit', symbol: 'UNIT' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    expect(vaultUnits).toHaveLength(3);
    expect(vaultUnits[0].alkaneId).toBe('2:105'); // Newest
    expect(vaultUnits[1].alkaneId).toBe('2:102');
    expect(vaultUnits[2].alkaneId).toBe('2:100'); // Oldest
  });
});

describe('Edge Cases', () => {
  it('Should handle malformed alkane IDs gracefully', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '1', name: 'Valid', symbol: 'VALID' },
          'invalid': { value: '1', name: 'Invalid', symbol: 'INV' },
          '2': { value: '1', name: 'No TX', symbol: 'NO' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    // Should only include valid format
    expect(vaultUnits).toHaveLength(1);
    expect(vaultUnits[0].alkaneId).toBe('2:100');
  });

  it('Should handle very large amounts', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '999999999999999999', name: 'Large', symbol: 'LARGE' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    expect(vaultUnits).toHaveLength(1);
    expect(vaultUnits[0].amount).toBe('999999999999999999');
  });

  it('Should handle zero value alkanes', () => {
    const mockUtxos: FormattedUtxo[] = [
      {
        txid: 'tx1',
        vout: 0,
        value: 1000,
        alkanes: {
          '2:100': { value: '0', name: 'Zero', symbol: 'ZERO' },
        },
        confirmations: 6,
        indexed: true,
      },
    ];

    const vaultUnits = extractVaultUnits(mockUtxos, '2');

    // Should still detect it (value validation happens elsewhere)
    expect(vaultUnits).toHaveLength(1);
    expect(vaultUnits[0].amount).toBe('0');
  });
});

describe('AlkaneId Parsing', () => {
  it('Should correctly parse valid alkane ID', () => {
    const id = '2:100';
    const parsed = parseAlkaneId(id);

    expect(parsed.block).toBe('2');
    expect(parsed.tx).toBe('100');
  });

  it('Should throw on invalid alkane ID format', () => {
    expect(() => parseAlkaneId('invalid')).toThrow('Invalid alkaneId format');
  });

  it('Should throw on empty parts', () => {
    expect(() => parseAlkaneId(':100')).toThrow('Invalid alkaneId format');
  });
});
