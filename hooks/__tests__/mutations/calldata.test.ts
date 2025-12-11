/**
 * Mutation Calldata Tests
 *
 * Tests for the protostone and input requirement building functions
 * used in swap, wrap, and unwrap mutations.
 *
 * Run with: pnpm test hooks/__tests__/mutations/calldata.test.ts
 */

import { describe, it, expect } from 'vitest';

// ==========================================
// Protostone Building Functions (extracted from mutation hooks)
// ==========================================

/**
 * Build protostone string for AMM swap operations
 * Format: [factory_block,factory_tx,opcode,path_len,...path_tokens,amount,limit,deadline]:pointer:refund
 */
function buildSwapProtostone(params: {
  factoryId: string;
  opcode: string;
  tokenPath: string[];
  amount: string;
  limit: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const { factoryId, opcode, tokenPath, amount, limit, deadline, pointer = 'v1', refund = 'v1' } = params;
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // Build cellpack: [factory_block, factory_tx, opcode, path_len, ...path_tokens, amount, limit, deadline]
  const pathTokens = tokenPath.flatMap(token => token.split(':'));
  const cellpack = [
    factoryBlock,
    factoryTx,
    opcode,
    tokenPath.length.toString(),
    ...pathTokens,
    amount,
    limit,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for alkanes execute
 * Format: "B:amount" for bitcoin, "block:tx:amount" for alkanes
 */
function buildInputRequirements(params: {
  bitcoinAmount?: string;
  alkaneInputs?: Array<{ alkaneId: string; amount: string }>;
}): string {
  const parts: string[] = [];

  if (params.bitcoinAmount && params.bitcoinAmount !== '0') {
    parts.push(`B:${params.bitcoinAmount}`);
  }

  if (params.alkaneInputs) {
    for (const input of params.alkaneInputs) {
      const [block, tx] = input.alkaneId.split(':');
      parts.push(`${block}:${tx}:${input.amount}`);
    }
  }

  return parts.join(',');
}

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// frBTC unwrap opcode (exchange frBTC for BTC)
const FRBTC_UNWRAP_OPCODE = 78;

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(77)]:pointer:refund
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build protostone string for frBTC -> BTC unwrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(78)]:pointer:refund
 */
function buildUnwrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(78)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_UNWRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build protostone for vault deposit (Purchase opcode 1)
 */
function buildVaultDepositProtostone(params: {
  vaultId: string;
  amount: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultId, amount, pointer = 'v0', refund = 'v0' } = params;
  const [vaultBlock, vaultTx] = vaultId.split(':');

  // Build cellpack: [vault_block, vault_tx, opcode(1), amount]
  const cellpack = [vaultBlock, vaultTx, '1', amount].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build protostone for vault withdraw (Redeem opcode 2)
 */
function buildVaultWithdrawProtostone(params: {
  vaultId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultId, pointer = 'v0', refund = 'v0' } = params;
  const [vaultBlock, vaultTx] = vaultId.split(':');

  // Build cellpack: [vault_block, vault_tx, opcode(2)]
  // NOTE: No amount parameter - contract uses incoming_alkanes
  const cellpack = [vaultBlock, vaultTx, '2'].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

// ==========================================
// Swap Protostone Tests
// ==========================================

describe('buildSwapProtostone', () => {
  const FACTORY_ID = '4:65522';

  describe('basic structure', () => {
    it('should build correct protostone for simple 2-token path', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1', // SwapExactTokensForTokens
        tokenPath: ['32:0', '2:0'],
        amount: '100000000',
        limit: '99000000',
        deadline: '1000000',
      });

      // Format: [factory_block,factory_tx,opcode,path_len,...path_tokens,amount,limit,deadline]:pointer:refund
      expect(protostone).toBe('[4,65522,1,2,32,0,2,0,100000000,99000000,1000000]:v1:v1');
    });

    it('should build correct protostone for 3-token bridge path', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: ['32:0', '100:0', '2:0'], // frBTC -> BUSD -> DIESEL
        amount: '100000000',
        limit: '99000000',
        deadline: '1000000',
      });

      expect(protostone).toBe('[4,65522,1,3,32,0,100,0,2,0,100000000,99000000,1000000]:v1:v1');
    });

    it('should use custom pointer and refund', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: ['32:0', '2:0'],
        amount: '100000000',
        limit: '99000000',
        deadline: '1000000',
        pointer: 'v0',
        refund: 'v2',
      });

      expect(protostone).toContain(':v0:v2');
    });
  });

  describe('opcode handling', () => {
    it('should handle SwapExactTokensForTokens opcode (1)', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: ['32:0', '2:0'],
        amount: '100',
        limit: '90',
        deadline: '1000',
      });

      expect(protostone).toContain(',1,'); // opcode 1
    });

    it('should handle SwapTokensForExactTokens opcode (2)', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '2',
        tokenPath: ['32:0', '2:0'],
        amount: '100',
        limit: '110',
        deadline: '1000',
      });

      expect(protostone).toContain(',2,'); // opcode 2
    });
  });

  describe('token path flattening', () => {
    it('should correctly flatten token path to block,tx pairs', () => {
      const protostone = buildSwapProtostone({
        factoryId: '4:65522',
        opcode: '1',
        tokenPath: ['1:2', '3:4', '5:6'],
        amount: '100',
        limit: '90',
        deadline: '1000',
      });

      // Path should be: 3 (length), 1,2, 3,4, 5,6
      expect(protostone).toContain(',3,1,2,3,4,5,6,');
    });
  });

  describe('amount and limit encoding', () => {
    it('should encode large amounts correctly', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: ['32:0', '2:0'],
        amount: '21000000000000000', // 210M BTC in sats (hypothetical)
        limit: '20000000000000000',
        deadline: '1000000',
      });

      expect(protostone).toContain('21000000000000000');
      expect(protostone).toContain('20000000000000000');
    });

    it('should encode zero amounts', () => {
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: ['32:0', '2:0'],
        amount: '0',
        limit: '0',
        deadline: '1000000',
      });

      expect(protostone).toContain(',0,0,');
    });
  });
});

// ==========================================
// Input Requirements Tests
// ==========================================

describe('buildInputRequirements', () => {
  describe('bitcoin inputs', () => {
    it('should build correct BTC-only input', () => {
      const inputs = buildInputRequirements({
        bitcoinAmount: '100000000',
      });

      expect(inputs).toBe('B:100000000');
    });

    it('should ignore zero bitcoin amount', () => {
      const inputs = buildInputRequirements({
        bitcoinAmount: '0',
      });

      expect(inputs).toBe('');
    });

    it('should ignore undefined bitcoin amount', () => {
      const inputs = buildInputRequirements({});

      expect(inputs).toBe('');
    });
  });

  describe('alkane inputs', () => {
    it('should build correct single alkane input', () => {
      const inputs = buildInputRequirements({
        alkaneInputs: [{ alkaneId: '32:0', amount: '100000000' }],
      });

      expect(inputs).toBe('32:0:100000000');
    });

    it('should build correct multiple alkane inputs', () => {
      const inputs = buildInputRequirements({
        alkaneInputs: [
          { alkaneId: '32:0', amount: '100000000' },
          { alkaneId: '2:0', amount: '50000000' },
        ],
      });

      expect(inputs).toBe('32:0:100000000,2:0:50000000');
    });
  });

  describe('mixed inputs', () => {
    it('should build correct BTC + alkane inputs', () => {
      const inputs = buildInputRequirements({
        bitcoinAmount: '100000000',
        alkaneInputs: [{ alkaneId: '32:0', amount: '50000000' }],
      });

      expect(inputs).toBe('B:100000000,32:0:50000000');
    });

    it('should build correct BTC + multiple alkane inputs', () => {
      const inputs = buildInputRequirements({
        bitcoinAmount: '100000000',
        alkaneInputs: [
          { alkaneId: '32:0', amount: '50000000' },
          { alkaneId: '2:0', amount: '25000000' },
        ],
      });

      expect(inputs).toBe('B:100000000,32:0:50000000,2:0:25000000');
    });
  });
});

// ==========================================
// Wrap Protostone Tests
// ==========================================

describe('buildWrapProtostone', () => {
  const FRBTC_ID = '32:0';

  it('should build correct wrap protostone with default pointers', () => {
    const protostone = buildWrapProtostone({
      frbtcId: FRBTC_ID,
    });

    expect(protostone).toBe('[32,0,77]:v0:v0');
  });

  it('should build correct wrap protostone with custom pointers', () => {
    const protostone = buildWrapProtostone({
      frbtcId: FRBTC_ID,
      pointer: 'v1',
      refund: 'v2',
    });

    expect(protostone).toBe('[32,0,77]:v1:v2');
  });

  it('should use opcode 77 for wrap', () => {
    const protostone = buildWrapProtostone({
      frbtcId: FRBTC_ID,
    });

    expect(protostone).toContain(',77]');
  });

  it('should handle different frBTC IDs', () => {
    const protostone = buildWrapProtostone({
      frbtcId: '100:5',
    });

    expect(protostone).toBe('[100,5,77]:v0:v0');
  });
});

// ==========================================
// Unwrap Protostone Tests
// ==========================================

describe('buildUnwrapProtostone', () => {
  const FRBTC_ID = '32:0';

  it('should build correct unwrap protostone with default pointers', () => {
    const protostone = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
    });

    expect(protostone).toBe('[32,0,78]:v0:v0');
  });

  it('should build correct unwrap protostone with custom pointers', () => {
    const protostone = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      pointer: 'v1',
      refund: 'v2',
    });

    expect(protostone).toBe('[32,0,78]:v1:v2');
  });

  it('should use opcode 78 for unwrap', () => {
    const protostone = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
    });

    expect(protostone).toContain(',78]');
  });
});

// ==========================================
// Vault Deposit Protostone Tests
// ==========================================

describe('buildVaultDepositProtostone', () => {
  const VAULT_ID = '2:123';

  it('should build correct deposit protostone', () => {
    const protostone = buildVaultDepositProtostone({
      vaultId: VAULT_ID,
      amount: '100000000',
    });

    expect(protostone).toBe('[2,123,1,100000000]:v0:v0');
  });

  it('should use opcode 1 for deposit (Purchase)', () => {
    const protostone = buildVaultDepositProtostone({
      vaultId: VAULT_ID,
      amount: '100000000',
    });

    expect(protostone).toContain(',1,'); // Purchase opcode
  });

  it('should include amount parameter', () => {
    const protostone = buildVaultDepositProtostone({
      vaultId: VAULT_ID,
      amount: '500000000',
    });

    expect(protostone).toContain('500000000');
  });

  it('should handle custom pointers', () => {
    const protostone = buildVaultDepositProtostone({
      vaultId: VAULT_ID,
      amount: '100000000',
      pointer: 'v1',
      refund: 'v2',
    });

    expect(protostone).toBe('[2,123,1,100000000]:v1:v2');
  });
});

// ==========================================
// Vault Withdraw Protostone Tests
// ==========================================

describe('buildVaultWithdrawProtostone', () => {
  const VAULT_ID = '2:123';

  it('should build correct withdraw protostone', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultId: VAULT_ID,
    });

    expect(protostone).toBe('[2,123,2]:v0:v0');
  });

  it('should use opcode 2 for withdraw (Redeem)', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultId: VAULT_ID,
    });

    expect(protostone).toContain(',2]'); // Redeem opcode
  });

  it('should NOT include amount parameter', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultId: VAULT_ID,
    });

    // Should only have 3 parts in cellpack: vault_block, vault_tx, opcode
    const cellpack = protostone.match(/\[(.*?)\]/)?.[1];
    const parts = cellpack?.split(',');
    expect(parts).toHaveLength(3);
  });

  it('should handle custom pointers', () => {
    const protostone = buildVaultWithdrawProtostone({
      vaultId: VAULT_ID,
      pointer: 'v1',
      refund: 'v2',
    });

    expect(protostone).toBe('[2,123,2]:v1:v2');
  });
});

// ==========================================
// Integration: Complete Transaction Building
// ==========================================

describe('Integration: Transaction Building', () => {
  describe('BTC -> DIESEL swap transaction', () => {
    it('should build complete swap transaction data', () => {
      const FACTORY_ID = '4:65522';
      const FRBTC_ID = '32:0';
      const DIESEL_ID = '2:0';
      const SELL_AMOUNT = '100000000'; // 1 BTC
      const MIN_RECEIVED = '99000000';
      const DEADLINE = '1000000';

      // Build protostone
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1', // SwapExactTokensForTokens
        tokenPath: [FRBTC_ID, DIESEL_ID],
        amount: SELL_AMOUNT,
        limit: MIN_RECEIVED,
        deadline: DEADLINE,
      });

      // Build input requirements (BTC input for wrap + swap)
      const inputRequirements = buildInputRequirements({
        bitcoinAmount: SELL_AMOUNT,
      });

      expect(protostone).toBe('[4,65522,1,2,32,0,2,0,100000000,99000000,1000000]:v1:v1');
      expect(inputRequirements).toBe('B:100000000');
    });
  });

  describe('DIESEL -> BTC swap transaction', () => {
    it('should build complete swap transaction data', () => {
      const FACTORY_ID = '4:65522';
      const FRBTC_ID = '32:0';
      const DIESEL_ID = '2:0';
      const SELL_AMOUNT = '100000000';
      const MIN_RECEIVED = '99000000';
      const DEADLINE = '1000000';

      // Build protostone
      const protostone = buildSwapProtostone({
        factoryId: FACTORY_ID,
        opcode: '1',
        tokenPath: [DIESEL_ID, FRBTC_ID],
        amount: SELL_AMOUNT,
        limit: MIN_RECEIVED,
        deadline: DEADLINE,
      });

      // Build input requirements (DIESEL alkane input)
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{ alkaneId: DIESEL_ID, amount: SELL_AMOUNT }],
      });

      expect(protostone).toBe('[4,65522,1,2,2,0,32,0,100000000,99000000,1000000]:v1:v1');
      expect(inputRequirements).toBe('2:0:100000000');
    });
  });

  describe('BTC wrap transaction', () => {
    it('should build complete wrap transaction data', () => {
      const FRBTC_ID = '32:0';
      const WRAP_AMOUNT = '100000000'; // 1 BTC

      // Build protostone
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ID,
      });

      // Build input requirements
      const inputRequirements = buildInputRequirements({
        bitcoinAmount: WRAP_AMOUNT,
      });

      expect(protostone).toBe('[32,0,77]:v0:v0');
      expect(inputRequirements).toBe('B:100000000');
    });
  });

  describe('frBTC unwrap transaction', () => {
    it('should build complete unwrap transaction data', () => {
      const FRBTC_ID = '32:0';
      const UNWRAP_AMOUNT = '100000000'; // 1 frBTC

      // Build protostone
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ID,
      });

      // Build input requirements
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{ alkaneId: FRBTC_ID, amount: UNWRAP_AMOUNT }],
      });

      expect(protostone).toBe('[32,0,78]:v0:v0');
      expect(inputRequirements).toBe('32:0:100000000');
    });
  });

  describe('Vault deposit transaction', () => {
    it('should build complete vault deposit transaction data', () => {
      const VAULT_ID = '2:123';
      const FRBTC_ID = '32:0';
      const DEPOSIT_AMOUNT = '100000000';

      // Build protostone
      const protostone = buildVaultDepositProtostone({
        vaultId: VAULT_ID,
        amount: DEPOSIT_AMOUNT,
      });

      // Build input requirements (frBTC to deposit)
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{ alkaneId: FRBTC_ID, amount: DEPOSIT_AMOUNT }],
      });

      expect(protostone).toBe('[2,123,1,100000000]:v0:v0');
      expect(inputRequirements).toBe('32:0:100000000');
    });
  });

  describe('Vault withdraw transaction', () => {
    it('should build complete vault withdraw transaction data', () => {
      const VAULT_ID = '2:123';
      const UNIT_ID = '2:150'; // veDiesel unit
      const UNIT_AMOUNT = '100000000';

      // Build protostone
      const protostone = buildVaultWithdrawProtostone({
        vaultId: VAULT_ID,
      });

      // Build input requirements (vault units to redeem)
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{ alkaneId: UNIT_ID, amount: UNIT_AMOUNT }],
      });

      expect(protostone).toBe('[2,123,2]:v0:v0');
      expect(inputRequirements).toBe('2:150:100000000');
    });
  });
});
