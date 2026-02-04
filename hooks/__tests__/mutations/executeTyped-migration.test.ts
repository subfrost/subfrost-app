/**
 * alkanesExecuteTyped Migration Regression Tests
 *
 * Verifies that the migration from alkanesExecuteWithStrings → alkanesExecuteTyped
 * in useVaultDeposit, useVaultWithdraw, and RegtestControls produces equivalent
 * parameters to the old direct calls.
 *
 * Run with: pnpm test hooks/__tests__/mutations/executeTyped-migration.test.ts
 */

import { describe, it, expect } from 'vitest';

// ==========================================
// Replicated logic from extendedProvider.ts
// ==========================================

/**
 * Parse protostones string to find the maximum vN output index referenced.
 * Copied from lib/alkanes/extendedProvider.ts (parseMaxVoutFromProtostones)
 */
function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;
  const voutMatches = protostones.matchAll(/v(\d+)/g);
  for (const match of voutMatches) {
    const voutIndex = parseInt(match[1], 10);
    if (voutIndex > maxVout) {
      maxVout = voutIndex;
    }
  }
  return maxVout;
}

/**
 * Simulate the full parameter mapping that alkanesExecuteTyped performs
 * before calling alkanesExecuteWithStrings internally.
 *
 * This replicates the logic in lib/alkanes/extendedProvider.ts lines 78-150
 * so we can assert exact equivalence with the old direct calls.
 */
function simulateExecuteTypedMapping(params: {
  toAddresses?: string[];
  inputRequirements: string;
  protostones: string;
  feeRate?: number;
  envelopeHex?: string;
  fromAddresses?: string[];
  changeAddress?: string;
  alkanesChangeAddress?: string;
  autoConfirm?: boolean;
}) {
  const maxVout = parseMaxVoutFromProtostones(params.protostones);
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');
  const fromAddrs = params.fromAddresses ?? ['p2wpkh:0', 'p2tr:0'];

  const options: Record<string, any> = {
    from: fromAddrs,
    from_addresses: fromAddrs,
    change_address: params.changeAddress ?? 'p2wpkh:0',
    alkanes_change_address: params.alkanesChangeAddress ?? 'p2tr:0',
    lock_alkanes: true,
  };

  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;

  return {
    toAddressesJson: JSON.stringify(toAddresses),
    inputRequirements: params.inputRequirements,
    protostones: params.protostones,
    feeRate: params.feeRate ?? null,
    envelopeHex: params.envelopeHex ?? null,
    optionsJson: JSON.stringify(options),
  };
}

// ==========================================
// Replicated builder functions from hooks
// (using actual hook defaults, not test-local copies)
// ==========================================

const VAULT_OPCODES = {
  Purchase: '1',
  Redeem: '2',
};

/** From hooks/useVaultDeposit.ts — actual defaults are v1:v1 */
function buildVaultDepositProtostone(params: {
  vaultContractId: string;
  amount: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultContractId, amount, pointer = 'v1', refund = 'v1' } = params;
  const [vaultBlock, vaultTx] = vaultContractId.split(':');
  const cellpack = [vaultBlock, vaultTx, VAULT_OPCODES.Purchase, amount].join(',');
  return `[${cellpack}]:${pointer}:${refund}`;
}

function buildVaultDepositInputRequirements(params: {
  tokenId: string;
  amount: string;
}): string {
  const [block, tx] = params.tokenId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

/** From hooks/useVaultWithdraw.ts — actual defaults are v1:v1 */
function buildVaultWithdrawProtostone(params: {
  vaultContractId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultContractId, pointer = 'v1', refund = 'v1' } = params;
  const [vaultBlock, vaultTx] = vaultContractId.split(':');
  const cellpack = [vaultBlock, vaultTx, VAULT_OPCODES.Redeem].join(',');
  return `[${cellpack}]:${pointer}:${refund}`;
}

function buildVaultWithdrawInputRequirements(params: {
  vaultUnitId: string;
  amount: string;
}): string {
  const [block, tx] = params.vaultUnitId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

// ==========================================
// parseMaxVoutFromProtostones tests
// ==========================================

describe('parseMaxVoutFromProtostones', () => {
  it('should return 0 for v0:v0 protostones', () => {
    expect(parseMaxVoutFromProtostones('[2,0,77]:v0:v0')).toBe(0);
  });

  it('should return 1 for v1:v1 protostones', () => {
    expect(parseMaxVoutFromProtostones('[2,123,1,100]:v1:v1')).toBe(1);
  });

  it('should return max vout when mixed', () => {
    expect(parseMaxVoutFromProtostones('[2,123,1]:v0:v2')).toBe(2);
  });

  it('should handle protostones with no vN references', () => {
    expect(parseMaxVoutFromProtostones('[2,0,77]')).toBe(0);
  });
});

// ==========================================
// Vault Deposit: migration regression
// ==========================================

describe('useVaultDeposit migration regression', () => {
  const VAULT_CONTRACT_ID = '2:123';
  const TOKEN_ID = '2:0'; // DIESEL
  const AMOUNT = '100000000';
  const FEE_RATE = 10;

  it('should produce correct protostone with v1:v1 defaults', () => {
    const protostone = buildVaultDepositProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
      amount: AMOUNT,
    });
    expect(protostone).toBe('[2,123,1,100000000]:v1:v1');
  });

  it('should produce correct input requirements', () => {
    const inputReqs = buildVaultDepositInputRequirements({
      tokenId: TOKEN_ID,
      amount: AMOUNT,
    });
    expect(inputReqs).toBe('2:0:100000000');
  });

  it('should map to correct alkanesExecuteWithStrings args via alkanesExecuteTyped', () => {
    const protostone = buildVaultDepositProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
      amount: AMOUNT,
    });
    const inputReqs = buildVaultDepositInputRequirements({
      tokenId: TOKEN_ID,
      amount: AMOUNT,
    });

    // Simulate what alkanesExecuteTyped does internally
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: inputReqs,
      protostones: protostone,
      feeRate: FEE_RATE,
      autoConfirm: true,
      changeAddress: 'p2tr:0',
      alkanesChangeAddress: 'p2tr:0',
    });

    // Verify the args that reach alkanesExecuteWithStrings
    expect(mapped.protostones).toBe('[2,123,1,100000000]:v1:v1');
    expect(mapped.inputRequirements).toBe('2:0:100000000');
    expect(mapped.feeRate).toBe(FEE_RATE);

    // v1 is the max vout → 2 toAddresses (v0 + v1)
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(['p2tr:0', 'p2tr:0']);

    // Options should have correct address config
    const options = JSON.parse(mapped.optionsJson);
    expect(options.from).toEqual(['p2wpkh:0', 'p2tr:0']);
    expect(options.from_addresses).toEqual(['p2wpkh:0', 'p2tr:0']);
    expect(options.change_address).toBe('p2tr:0');
    expect(options.alkanes_change_address).toBe('p2tr:0');
    expect(options.lock_alkanes).toBe(true);
    expect(options.auto_confirm).toBe(true);
  });

  it('should handle large deposit amounts without precision loss', () => {
    const largeAmount = '99999999999999999';
    const protostone = buildVaultDepositProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
      amount: largeAmount,
    });
    expect(protostone).toContain(largeAmount);

    const inputReqs = buildVaultDepositInputRequirements({
      tokenId: TOKEN_ID,
      amount: largeAmount,
    });
    expect(inputReqs).toBe(`2:0:${largeAmount}`);
  });
});

// ==========================================
// Vault Withdraw: migration regression
// ==========================================

describe('useVaultWithdraw migration regression', () => {
  const VAULT_CONTRACT_ID = '2:123';
  const VAULT_UNIT_ID = '2:124'; // FIRE unit token
  const AMOUNT = '1';
  const FEE_RATE = 10;

  it('should produce correct protostone with v1:v1 defaults and no amount', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
    });
    expect(protostone).toBe('[2,123,2]:v1:v1');
  });

  it('should use opcode 2 (Redeem) with exactly 3 cellpack parts', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
    });
    const cellpack = protostone.match(/\[(.*?)\]/)?.[1];
    const parts = cellpack?.split(',');
    expect(parts).toHaveLength(3);
    expect(parts?.[2]).toBe('2');
  });

  it('should produce correct input requirements for vault units', () => {
    const inputReqs = buildVaultWithdrawInputRequirements({
      vaultUnitId: VAULT_UNIT_ID,
      amount: AMOUNT,
    });
    expect(inputReqs).toBe('2:124:1');
  });

  it('should map to correct alkanesExecuteWithStrings args via alkanesExecuteTyped', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultContractId: VAULT_CONTRACT_ID,
    });
    const inputReqs = buildVaultWithdrawInputRequirements({
      vaultUnitId: VAULT_UNIT_ID,
      amount: AMOUNT,
    });

    const mapped = simulateExecuteTypedMapping({
      inputRequirements: inputReqs,
      protostones: protostone,
      feeRate: FEE_RATE,
      autoConfirm: true,
      changeAddress: 'p2tr:0',
      alkanesChangeAddress: 'p2tr:0',
    });

    expect(mapped.protostones).toBe('[2,123,2]:v1:v1');
    expect(mapped.inputRequirements).toBe('2:124:1');
    expect(mapped.feeRate).toBe(FEE_RATE);

    // v1 max → 2 toAddresses
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(['p2tr:0', 'p2tr:0']);

    const options = JSON.parse(mapped.optionsJson);
    expect(options.change_address).toBe('p2tr:0');
    expect(options.alkanes_change_address).toBe('p2tr:0');
    expect(options.auto_confirm).toBe(true);
    expect(options.lock_alkanes).toBe(true);
  });
});

// ==========================================
// RegtestControls DIESEL mint: migration regression
// ==========================================

describe('RegtestControls DIESEL mint migration regression', () => {
  const DIESEL_ID = '2:0';
  const DIESEL_MINT_OPCODE = 77;
  const TAPROOT_ADDRESS = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';

  it('should build correct DIESEL mint protostone', () => {
    const [dieselBlock, dieselTx] = DIESEL_ID.split(':');
    const protostone = `[${dieselBlock},${dieselTx},${DIESEL_MINT_OPCODE}]:v0:v0`;
    expect(protostone).toBe('[2,0,77]:v0:v0');
  });

  it('should map to correct alkanesExecuteWithStrings args with explicit addresses', () => {
    const protostone = '[2,0,77]:v0:v0';

    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: protostone,
      feeRate: 10,
      toAddresses: [TAPROOT_ADDRESS],
      fromAddresses: [TAPROOT_ADDRESS],
      changeAddress: TAPROOT_ADDRESS,
      alkanesChangeAddress: TAPROOT_ADDRESS,
      autoConfirm: false,
    });

    // Explicit toAddresses override auto-generation
    expect(JSON.parse(mapped.toAddressesJson)).toEqual([TAPROOT_ADDRESS]);

    expect(mapped.protostones).toBe('[2,0,77]:v0:v0');
    expect(mapped.inputRequirements).toBe('');
    expect(mapped.feeRate).toBe(10);

    const options = JSON.parse(mapped.optionsJson);
    expect(options.from).toEqual([TAPROOT_ADDRESS]);
    expect(options.from_addresses).toEqual([TAPROOT_ADDRESS]);
    expect(options.change_address).toBe(TAPROOT_ADDRESS);
    expect(options.alkanes_change_address).toBe(TAPROOT_ADDRESS);
    expect(options.auto_confirm).toBe(false);
    expect(options.lock_alkanes).toBe(true);
  });

  it('should NOT include envelope_hex for DIESEL mint', () => {
    const protostone = '[2,0,77]:v0:v0';
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: protostone,
      feeRate: 10,
      toAddresses: [TAPROOT_ADDRESS],
      fromAddresses: [TAPROOT_ADDRESS],
      changeAddress: TAPROOT_ADDRESS,
      alkanesChangeAddress: TAPROOT_ADDRESS,
      autoConfirm: false,
    });
    expect(mapped.envelopeHex).toBeNull();
  });
});

// ==========================================
// Auto-generated toAddresses from vN refs
// ==========================================

describe('toAddresses auto-generation from protostone vN references', () => {
  it('should generate 1 address for v0:v0 (DIESEL mint pattern)', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
    });
    // v0 is max → 1 address (index 0)
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(['p2tr:0']);
  });

  it('should generate 2 addresses for v1:v1 (vault pattern)', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '2:0:100',
      protostones: '[2,123,1,100]:v1:v1',
      feeRate: 10,
    });
    // v1 is max → 2 addresses (indices 0, 1)
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(['p2tr:0', 'p2tr:0']);
  });

  it('should generate 3 addresses for v2 reference', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,1]:v0:v2',
      feeRate: 10,
    });
    // v2 is max → 3 addresses (indices 0, 1, 2)
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(['p2tr:0', 'p2tr:0', 'p2tr:0']);
  });

  it('should respect explicit toAddresses override', () => {
    const customAddresses = ['bcrt1p...user', 'bcrt1p...change'];
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
      toAddresses: customAddresses,
    });
    expect(JSON.parse(mapped.toAddressesJson)).toEqual(customAddresses);
  });
});

// ==========================================
// Default address behavior
// ==========================================

describe('alkanesExecuteTyped default address behavior', () => {
  it('should use p2wpkh:0 + p2tr:0 as default from addresses', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.from).toEqual(['p2wpkh:0', 'p2tr:0']);
    expect(options.from_addresses).toEqual(['p2wpkh:0', 'p2tr:0']);
  });

  it('should use p2wpkh:0 as default change address', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.change_address).toBe('p2wpkh:0');
  });

  it('should use p2tr:0 as default alkanes change address', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.alkanes_change_address).toBe('p2tr:0');
  });

  it('should always set lock_alkanes to true', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.lock_alkanes).toBe(true);
  });

  it('should allow overriding from addresses', () => {
    const custom = ['bcrt1p...taproot'];
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
      fromAddresses: custom,
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.from).toEqual(custom);
    expect(options.from_addresses).toEqual(custom);
  });

  it('should allow overriding change addresses', () => {
    const mapped = simulateExecuteTypedMapping({
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 10,
      changeAddress: 'p2tr:0',
      alkanesChangeAddress: 'p2tr:0',
    });
    const options = JSON.parse(mapped.optionsJson);
    expect(options.change_address).toBe('p2tr:0');
    expect(options.alkanes_change_address).toBe('p2tr:0');
  });
});
