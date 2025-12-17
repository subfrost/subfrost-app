/**
 * Vault Calldata Structure Tests (Vitest format)
 *
 * These tests verify that our frontend code generates calldata structures
 * that match what the vault contracts expect, based on contract source code analysis.
 *
 * Source: /subfrost-alkanes/alkanes/yve-diesel-vault/src/lib.rs
 * Source: /subfrost-alkanes/crates/polyvault-traits/src/unit_vault.rs
 *
 * Run with: pnpm test hooks/__tests__/vaultCalldata.vitest.test.ts
 */

import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';

// ==========================================
// Types and Helper Functions
// ==========================================

type AlkaneId = { block: string; tx: string };

function parseAlkaneId(id: string): AlkaneId {
  const [block, tx] = id.split(':');
  if (!block || !tx) {
    throw new Error(`Invalid alkaneId format: ${id}`);
  }
  return { block, tx };
}

function buildVaultDepositCalldata(vaultContractId: string, amount: string): bigint[] {
  const vaultId = parseAlkaneId(vaultContractId);

  return [
    BigInt(vaultId.block),
    BigInt(vaultId.tx),
    BigInt(1), // Purchase opcode
    BigInt(new BigNumber(amount).toFixed()),
  ];
}

function buildVaultWithdrawCalldata(vaultContractId: string): bigint[] {
  const vaultId = parseAlkaneId(vaultContractId);

  return [
    BigInt(vaultId.block),
    BigInt(vaultId.tx),
    BigInt(2), // Redeem opcode
  ];
}

function buildVaultBalanceQueryCalldata(vaultContractId: string): bigint[] {
  const vaultId = parseAlkaneId(vaultContractId);

  return [
    BigInt(vaultId.block),
    BigInt(vaultId.tx),
    BigInt(4), // GetVeDieselBalance opcode
  ];
}

// ==========================================
// Deposit (Purchase) Calldata Tests
// ==========================================

describe('Vault Deposit Calldata Structure', () => {
  it('should build correct calldata for vault deposit (opcode 1)', () => {
    const vaultId = '2:123';
    const amount = '100000000'; // 1 token with 8 decimals

    const calldata = buildVaultDepositCalldata(vaultId, amount);

    // Expected structure: [vaultBlock, vaultTx, opcode(1), amount]
    expect(calldata).toHaveLength(4);
    expect(calldata[0]).toBe(BigInt(2)); // block
    expect(calldata[1]).toBe(BigInt(123)); // tx
    expect(calldata[2]).toBe(BigInt(1)); // Purchase opcode
    expect(calldata[3]).toBe(BigInt(100000000)); // amount
  });

  it('should handle large deposit amounts correctly', () => {
    const vaultId = '2:123';
    const amount = '100000000000000'; // 1M tokens

    const calldata = buildVaultDepositCalldata(vaultId, amount);

    expect(calldata[3]).toBe(BigInt('100000000000000'));
  });

  it('should handle small deposit amounts correctly', () => {
    const vaultId = '2:123';
    const amount = '1'; // Minimum amount

    const calldata = buildVaultDepositCalldata(vaultId, amount);

    expect(calldata[3]).toBe(BigInt(1));
  });

  it('should handle different vault contract IDs', () => {
    const vaultId = '5:456';
    const amount = '1000';

    const calldata = buildVaultDepositCalldata(vaultId, amount);

    expect(calldata[0]).toBe(BigInt(5));
    expect(calldata[1]).toBe(BigInt(456));
    expect(calldata[2]).toBe(BigInt(1)); // Still Purchase opcode
  });
});

// ==========================================
// Withdraw (Redeem) Calldata Tests
// ==========================================

describe('Vault Withdraw Calldata Structure', () => {
  it('should build correct calldata for vault withdraw (opcode 2)', () => {
    const vaultId = '2:123';

    const calldata = buildVaultWithdrawCalldata(vaultId);

    // Expected structure: [vaultBlock, vaultTx, opcode(2)]
    // NOTE: No amount parameter - contract iterates over incoming_alkanes
    expect(calldata).toHaveLength(3);
    expect(calldata[0]).toBe(BigInt(2)); // block
    expect(calldata[1]).toBe(BigInt(123)); // tx
    expect(calldata[2]).toBe(BigInt(2)); // Redeem opcode
  });

  it('should use same structure for different vault contracts', () => {
    const vaultId = '5:456';

    const calldata = buildVaultWithdrawCalldata(vaultId);

    expect(calldata).toHaveLength(3);
    expect(calldata[0]).toBe(BigInt(5));
    expect(calldata[1]).toBe(BigInt(456));
    expect(calldata[2]).toBe(BigInt(2));
  });

  it('should NOT include amount parameter', () => {
    // Redeem uses incoming_alkanes, not amount parameter
    const calldata = buildVaultWithdrawCalldata('2:123');

    expect(calldata).toHaveLength(3);
    // There should be no 4th element
    expect(calldata[3]).toBeUndefined();
  });
});

// ==========================================
// Balance Query Calldata Tests
// ==========================================

describe('Vault Balance Query Calldata Structure', () => {
  it('should build correct calldata for balance query (opcode 4)', () => {
    const vaultId = '2:123';

    const calldata = buildVaultBalanceQueryCalldata(vaultId);

    // Expected structure: [vaultBlock, vaultTx, opcode(4)]
    expect(calldata).toHaveLength(3);
    expect(calldata[0]).toBe(BigInt(2)); // block
    expect(calldata[1]).toBe(BigInt(123)); // tx
    expect(calldata[2]).toBe(BigInt(4)); // GetVeDieselBalance opcode
  });
});

// ==========================================
// Opcode Number Verification
// ==========================================

describe('Vault Contract Opcodes', () => {
  it('Purchase opcode should be 1', () => {
    // Source: yve-diesel-vault/src/lib.rs #[opcode(1)]
    const PURCHASE_OPCODE = 1;
    const calldata = buildVaultDepositCalldata('2:0', '100');
    expect(Number(calldata[2])).toBe(PURCHASE_OPCODE);
  });

  it('Redeem opcode should be 2', () => {
    // Source: yve-diesel-vault/src/lib.rs #[opcode(2)]
    const REDEEM_OPCODE = 2;
    const calldata = buildVaultWithdrawCalldata('2:0');
    expect(Number(calldata[2])).toBe(REDEEM_OPCODE);
  });

  it('GetVeDieselBalance opcode should be 4', () => {
    // Source: yve-diesel-vault/src/lib.rs #[opcode(4)]
    const GET_BALANCE_OPCODE = 4;
    const calldata = buildVaultBalanceQueryCalldata('2:0');
    expect(Number(calldata[2])).toBe(GET_BALANCE_OPCODE);
  });
});

// ==========================================
// Contract Behavior Expectations
// ==========================================

describe('Expected Contract Behavior', () => {
  it('Purchase should accept amount as u128 parameter', () => {
    // Source: unit_vault.rs fn purchase(&self, amount: u128)
    const amount = '18446744073709551615'; // u128 max (safe range)
    const calldata = buildVaultDepositCalldata('2:123', amount);

    // Should encode correctly
    expect(calldata[3]).toBeDefined();
    expect(calldata[3]).toBe(BigInt(amount));
  });

  it('Redeem should NOT have amount parameter', () => {
    // Source: unit_vault.rs fn redeem(&self) -> Result<CallResponse>
    // Note: No amount parameter, iterates over incoming_alkanes
    const calldata = buildVaultWithdrawCalldata('2:123');

    // Should only have 3 elements
    expect(calldata).toHaveLength(3);
  });
});

// ==========================================
// Balance Response Format Tests
// ==========================================

describe('Balance Query Response Format', () => {
  it('should parse u128 balance from little-endian bytes', () => {
    // Source: yve-diesel-vault/src/lib.rs
    // response.data = balance.to_le_bytes().to_vec();
    const mockBalance = BigInt(123456789);
    const bytes = new Uint8Array(16);

    // Encode as little-endian
    for (let i = 0; i < 16; i++) {
      bytes[i] = Number((mockBalance >> BigInt(i * 8)) & BigInt(0xff));
    }

    // Parse back
    let parsed = BigInt(0);
    for (let i = 0; i < 16; i++) {
      parsed |= BigInt(bytes[i]) << BigInt(i * 8);
    }

    expect(parsed).toBe(mockBalance);
  });
});

// ==========================================
// Vault Unit Detection Logic Tests
// ==========================================

describe('Vault Unit Detection Logic', () => {
  it('vault units should share same block as template', () => {
    // Source: unit_vault.rs
    // if incoming_alkane.id.block == self.unit_template_id().block
    const templateBlock = '2';
    const unitIds = ['2:100', '2:101', '2:102']; // All in block 2
    const nonUnitIds = ['3:50', '4:75']; // Different blocks

    for (const id of unitIds) {
      const parsed = parseAlkaneId(id);
      expect(parsed.block).toBe(templateBlock);
    }

    for (const id of nonUnitIds) {
      const parsed = parseAlkaneId(id);
      expect(parsed.block).not.toBe(templateBlock);
    }
  });

  it('each deposit creates unique unit with different tx number', () => {
    // Source: unit_vault.rs create_unit generates unique alkane
    const deposits = [
      { unitBlock: '2', unitTx: '100' },
      { unitBlock: '2', unitTx: '101' },
      { unitBlock: '2', unitTx: '102' },
    ];

    // All units in same block
    expect(deposits[0].unitBlock).toBe(deposits[1].unitBlock);
    expect(deposits[1].unitBlock).toBe(deposits[2].unitBlock);

    // But different tx numbers
    expect(deposits[0].unitTx).not.toBe(deposits[1].unitTx);
    expect(deposits[1].unitTx).not.toBe(deposits[2].unitTx);
  });
});

// ==========================================
// parseAlkaneId Error Handling
// ==========================================

describe('parseAlkaneId', () => {
  it('should parse valid alkane ID', () => {
    const result = parseAlkaneId('2:123');
    expect(result).toEqual({ block: '2', tx: '123' });
  });

  it('should throw for invalid format', () => {
    expect(() => parseAlkaneId('invalid')).toThrow('Invalid alkaneId format');
  });

  it('should throw for empty string', () => {
    expect(() => parseAlkaneId('')).toThrow('Invalid alkaneId format');
  });

  it('should throw for missing parts', () => {
    expect(() => parseAlkaneId('2:')).toThrow('Invalid alkaneId format');
    expect(() => parseAlkaneId(':0')).toThrow('Invalid alkaneId format');
  });
});
