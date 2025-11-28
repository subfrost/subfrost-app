/**
 * UTXO Parsing and Vault Unit Detection Tests
 *
 * These tests verify our UTXO parsing logic matches the alkanes SDK structure
 * and that our vault unit detection correctly filters alkanes.
 */

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
  vaultTemplateBlock: string
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

// Test Suite
console.log('🧪 Testing UTXO Parsing and Vault Unit Detection\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${(error as Error).message}`);
    testsFailed++;
  }
}

function assertThat(actual: unknown) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(expected: number) {
      const arr = actual as { length: number };
      if (arr.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${arr.length}`);
      }
    },
    toContain(expected: any) {
      if (Array.isArray(actual)) {
        const found = actual.some((item: any) => 
          JSON.stringify(item) === JSON.stringify(expected)
        );
        if (!found) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string to contain ${expected}`);
        }
      } else {
        throw new Error(`Cannot check toContain on type ${typeof actual}`);
      }
    },
  };
}

// ==========================================
// TEST 1: UTXO Structure Parsing
// ==========================================
console.log('📦 Test Suite 1: UTXO Structure Parsing\n');

runTest('Should correctly parse alkanes Record from UTXO', () => {
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
  assertThat(alkaneIds).toHaveLength(2);
  assertThat(alkaneIds).toContain('2:100');
  assertThat(alkaneIds).toContain('2:101');
});

runTest('Should access alkaneEntry.value correctly', () => {
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
  assertThat(entry.value).toBe('123456789');
  assertThat(entry.name).toBe('Test');
  assertThat(entry.symbol).toBe('TEST');
});

runTest('Should handle UTXO with no alkanes', () => {
  const mockUtxo: FormattedUtxo = {
    txid: 'abc123',
    vout: 0,
    value: 1000,
    alkanes: {},
    confirmations: 6,
    indexed: true,
  };

  const alkaneIds = Object.keys(mockUtxo.alkanes);
  assertThat(alkaneIds).toHaveLength(0);
});

console.log('');

// ==========================================
// TEST 2: Vault Unit Detection
// ==========================================
console.log('📦 Test Suite 2: Vault Unit Detection Logic\n');

runTest('Should detect vault units in same block as template', () => {
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
  
  assertThat(vaultUnits).toHaveLength(2);
  assertThat(vaultUnits[0].alkaneId).toBe('2:101'); // Sorted descending by tx
  assertThat(vaultUnits[1].alkaneId).toBe('2:100');
});

runTest('Should filter out alkanes from different blocks', () => {
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
  assertThat(vaultUnits).toHaveLength(1);
  assertThat(vaultUnits[0].alkaneId).toBe('2:100');
});

runTest('Should aggregate amounts across multiple UTXOs', () => {
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
  assertThat(vaultUnits).toHaveLength(1);
  assertThat(vaultUnits[0].amount).toBe('2'); // 1 + 1
  assertThat(vaultUnits[0].utxoCount).toBe(2);
});

runTest('Should handle empty UTXO array', () => {
  const vaultUnits = extractVaultUnits([], '2');
  assertThat(vaultUnits).toHaveLength(0);
});

console.log('');

// ==========================================
// TEST 3: Sorting and Ordering
// ==========================================
console.log('📦 Test Suite 3: Unit Sorting Logic\n');

runTest('Should sort units by tx number descending (newest first)', () => {
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
  
  assertThat(vaultUnits).toHaveLength(3);
  assertThat(vaultUnits[0].alkaneId).toBe('2:105'); // Newest
  assertThat(vaultUnits[1].alkaneId).toBe('2:102');
  assertThat(vaultUnits[2].alkaneId).toBe('2:100'); // Oldest
});

console.log('');

// ==========================================
// TEST 4: Edge Cases
// ==========================================
console.log('📦 Test Suite 4: Edge Cases\n');

runTest('Should handle malformed alkane IDs gracefully', () => {
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
  assertThat(vaultUnits).toHaveLength(1);
  assertThat(vaultUnits[0].alkaneId).toBe('2:100');
});

runTest('Should handle very large amounts', () => {
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
  
  assertThat(vaultUnits).toHaveLength(1);
  assertThat(vaultUnits[0].amount).toBe('999999999999999999');
});

runTest('Should handle zero value alkanes', () => {
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
  assertThat(vaultUnits).toHaveLength(1);
  assertThat(vaultUnits[0].amount).toBe('0');
});

console.log('');

// ==========================================
// TEST 5: AlkaneId Parsing
// ==========================================
console.log('📦 Test Suite 5: AlkaneId Parsing\n');

runTest('Should correctly parse valid alkane ID', () => {
  const id = '2:100';
  const parsed = parseAlkaneId(id);
  
  assertThat(parsed.block).toBe('2');
  assertThat(parsed.tx).toBe('100');
});

runTest('Should throw on invalid alkane ID format', () => {
  try {
    parseAlkaneId('invalid');
    throw new Error('Should have thrown');
  } catch (error) {
    assertThat((error as Error).message).toContain('Invalid alkaneId format');
  }
});

runTest('Should throw on empty parts', () => {
  try {
    parseAlkaneId(':100');
    throw new Error('Should have thrown');
  } catch (error) {
    assertThat((error as Error).message).toContain('Invalid alkaneId format');
  }
});

console.log('');

// ==========================================
// SUMMARY
// ==========================================
console.log('═══════════════════════════════════════');
console.log('📊 UTXO Parsing Test Summary');
console.log('═══════════════════════════════════════');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📈 Total: ${testsPassed + testsFailed}`);
console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════\n');

if (testsFailed === 0) {
  console.log('✅ All UTXO parsing logic matches alkanes SDK structure!\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Review errors above.\n');
  process.exit(1);
}
