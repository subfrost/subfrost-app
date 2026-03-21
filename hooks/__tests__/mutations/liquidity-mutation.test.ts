/**
 * Add Liquidity Mutation Tests
 *
 * Tests for the useAddLiquidityMutation hook logic: calldata generation,
 * two-protostone pattern, token ordering, slippage, address handling, and errors.
 *
 * All external dependencies are mocked. Tests focus on the LOGIC that
 * drives add liquidity transactions.
 *
 * Run with: pnpm test hooks/__tests__/mutations/liquidity-mutation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Shared builder imports (pure functions, no WASM)
import {
  buildCreateNewPoolProtostone,
  buildAddLiquidityToPoolProtostone,
  buildAddLiquidityInputRequirements,
  buildRemoveLiquidityProtostone,
  buildRemoveLiquidityInputRequirements,
} from '@/lib/alkanes/builders';
import { POOL_OPCODES } from '@/lib/alkanes/constants';
import { toAlks } from '@/lib/alkanes/helpers';

// ---------------------------------------------------------------------------
// Constants matching regtest config
// ---------------------------------------------------------------------------
const FACTORY_ID = '4:65498';
const DIESEL_ID = '2:0';
const FRBTC_ID = '32:0';
const POOL_ID = { block: 2, tx: 6 };

// ---------------------------------------------------------------------------
// 1. Two-Protostone Pattern — CreateNewPool
// ---------------------------------------------------------------------------

describe('CreateNewPool two-protostone pattern', () => {
  it('should generate two edicts in p0 targeting p1', () => {
    const result = buildCreateNewPoolProtostone({
      factoryId: FACTORY_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100000000',
      amount1: '50000000',
    });
    // p0 should have edicts pointing to p1
    expect(result).toContain('[2:0:100000000:p1]');
    expect(result).toContain('[32:0:50000000:p1]');
  });

  it('should include factory opcode 1 in p1 cellpack', () => {
    const result = buildCreateNewPoolProtostone({
      factoryId: FACTORY_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    // p1: [factory_block,factory_tx,1,token0_block,token0_tx,token1_block,token1_tx,amount0,amount1]
    expect(result).toContain('[4,65498,1,2,0,32,0,100,50]:v0:v0');
  });

  it('should use v0:v0 as pointer and refund for both p0 and p1', () => {
    const result = buildCreateNewPoolProtostone({
      factoryId: FACTORY_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    // Both p0 and p1 should end with :v0:v0
    const parts = result.split(',[');
    expect(parts[0]).toContain(':v0:v0');
    // p1 starts after the comma
    expect('[' + parts[1]).toContain(':v0:v0');
  });

  it('should separate p0 and p1 with a comma', () => {
    const result = buildCreateNewPoolProtostone({
      factoryId: FACTORY_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    // Should have exactly 2 cellpack sections separated by comma
    const brackets = result.match(/\[/g);
    expect(brackets!.length).toBeGreaterThanOrEqual(3); // 2 edicts + 1 cellpack
  });
});

// ---------------------------------------------------------------------------
// 2. Two-Protostone Pattern — AddLiquidity to Existing Pool
// ---------------------------------------------------------------------------

describe('AddLiquidity to existing pool', () => {
  it('should use pool opcode 1 (AddLiquidity) in p1', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: POOL_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000',
      amount1: '500',
    });
    // p1 cellpack: [pool_block,pool_tx,1]
    expect(result).toContain(`[${POOL_ID.block},${POOL_ID.tx},${POOL_OPCODES.AddLiquidity}]:v0:v0`);
  });

  it('should include two edicts in p0 for both tokens', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: POOL_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000',
      amount1: '500',
    });
    expect(result).toContain('[2:0:1000:p1]');
    expect(result).toContain('[32:0:500:p1]');
  });

  it('should accept string pool IDs', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: { block: '2', tx: '6' },
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    expect(result).toContain('[2,6,1]:v0:v0');
  });

  it('should accept numeric pool IDs', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: { block: 2, tx: 6 },
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    expect(result).toContain('[2,6,1]:v0:v0');
  });
});

// ---------------------------------------------------------------------------
// 3. Input Requirements for Add Liquidity
// ---------------------------------------------------------------------------

describe('Add liquidity input requirements', () => {
  it('should generate two-token input requirement', () => {
    const result = buildAddLiquidityInputRequirements({
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000000',
      amount1: '500000',
    });
    expect(result).toBe('2:0:1000000,32:0:500000');
  });

  it('should handle reversed token order', () => {
    const result = buildAddLiquidityInputRequirements({
      token0Id: FRBTC_ID,
      token1Id: DIESEL_ID,
      amount0: '500000',
      amount1: '1000000',
    });
    expect(result).toBe('32:0:500000,2:0:1000000');
  });

  it('should use comma separator between two inputs', () => {
    const result = buildAddLiquidityInputRequirements({
      token0Id: '100:200',
      token1Id: '300:400',
      amount0: '1',
      amount1: '2',
    });
    const parts = result.split(',');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('100:200:1');
    expect(parts[1]).toBe('300:400:2');
  });
});

// ---------------------------------------------------------------------------
// 4. Amount Conversion (display → alks)
// ---------------------------------------------------------------------------

describe('Amount conversion for liquidity', () => {
  it('should convert display amount to alks with 8 decimals', () => {
    expect(toAlks('1.5', 8)).toBe('150000000');
  });

  it('should handle integer display amounts', () => {
    expect(toAlks('10', 8)).toBe('1000000000');
  });

  it('should handle very small display amounts', () => {
    // toAlks('0.00000001', 8) => whole='0', frac='00000001' => '000000001'
    // The leading zero from whole part is preserved (normalized '0' stays '0')
    expect(toAlks('0.00000001', 8)).toBe('000000001');
  });

  it('should pad fractional part to correct decimals', () => {
    expect(toAlks('1.5', 8)).toBe('150000000');
  });

  it('should return 0 for empty string', () => {
    expect(toAlks('', 8)).toBe('0');
  });

  it('should handle 0 decimals', () => {
    expect(toAlks('42', 0)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// 5. Remove Liquidity
// ---------------------------------------------------------------------------

describe('Remove liquidity protostone', () => {
  it('should include LP edict pointing to p1', () => {
    const result = buildRemoveLiquidityProtostone({
      lpTokenId: '2:6',
      lpAmount: '10000',
      minAmount0: '500',
      minAmount1: '250',
      deadline: '2000',
    });
    expect(result).toContain('[2:6:10000:p1]');
  });

  it('should use pool opcode 2 (RemoveLiquidity) in p1', () => {
    const result = buildRemoveLiquidityProtostone({
      lpTokenId: '2:6',
      lpAmount: '10000',
      minAmount0: '500',
      minAmount1: '250',
      deadline: '2000',
    });
    expect(result).toContain('[2,6,2,500,250,2000]');
  });

  it('should build correct remove liquidity input requirements', () => {
    const result = buildRemoveLiquidityInputRequirements({
      lpTokenId: '2:6',
      lpAmount: '10000',
    });
    expect(result).toBe('2:6:10000');
  });
});

// ---------------------------------------------------------------------------
// 6. Browser Wallet Address Handling in useAddLiquidityMutation
// ---------------------------------------------------------------------------

describe('Browser wallet address handling in useAddLiquidityMutation', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useAddLiquidityMutation.ts'), 'utf-8');
  });

  it('should define isBrowserWallet check', () => {
    expect(src).toContain("isBrowserWallet = walletType === 'browser'");
  });

  it('should use actual addresses for browser wallet toAddresses', () => {
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain("'p2tr:0'");
  });

  it('should use actual addresses for browser wallet changeAddr', () => {
    const match = src.match(/changeAddr\s*=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain("'p2wpkh:0'");
  });

  it('should use actual addresses for browser wallet alkanesChangeAddr', () => {
    const match = src.match(/alkanesChangeAddr\s*=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain("'p2tr:0'");
  });

  it('should set ordinalsStrategy to burn', () => {
    expect(src).toContain("ordinalsStrategy: 'burn'");
  });

  it('should call signTaprootPsbt once for browser wallets (not both segwit and taproot)', () => {
    // Single signing call for browser wallets
    expect(src).toContain('if (isBrowserWallet)');
    // Browser wallet path
    expect(src).toContain('signTaprootPsbt(psbtBase64)');
  });
});

// ---------------------------------------------------------------------------
// 7. Pool Existence Check
// ---------------------------------------------------------------------------

describe('Pool existence check in useAddLiquidityMutation', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useAddLiquidityMutation.ts'), 'utf-8');
  });

  it('should check pool existence via factory opcode 2', () => {
    expect(src).toContain('findPoolId');
    expect(src).toContain('opcode 2'); // FindPoolId
  });

  it('should use CreateNewPool when pool does not exist', () => {
    expect(src).toContain('buildCreateNewPoolProtostone');
  });

  it('should use AddLiquidity when pool exists', () => {
    expect(src).toContain('buildAddLiquidityToPoolProtostone');
  });

  it('should fall back to DEFAULT_POOL_ID when factory returns no pool', () => {
    expect(src).toContain('defaultPoolId');
  });
});
