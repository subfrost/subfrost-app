/**
 * Tests for lib/alkanes/builders.ts — protostone & input requirement builders.
 *
 * These are pure functions with zero external dependencies. No WASM, no network.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSwapProtostone,
  buildSwapInputRequirements,
  buildWrapProtostone,
  buildUnwrapProtostone,
  buildUnwrapInputRequirements,
  buildWrapSwapProtostone,
  buildSwapUnwrapProtostone,
  buildTransferProtostone,
  buildTransferInputRequirements,
  buildCreateNewPoolProtostone,
  buildAddLiquidityToPoolProtostone,
  buildAddLiquidityInputRequirements,
  buildRemoveLiquidityProtostone,
  buildRemoveLiquidityInputRequirements,
} from '../builders';

// Use the same IDs as the app's regtest config
const FACTORY_ID = '4:65498';
const DIESEL_ID = '2:0';
const FRBTC_ID = '32:0';
const POOL_ID = '2:6';

describe('buildSwapProtostone', () => {
  it('builds correct cellpack for DIESEL→frBTC swap', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '1000000',
      minOutput: '500000',
      deadline: '2000',
    });
    // Factory opcode 13, path_len=2, sell=2:0, buy=32:0
    expect(result).toBe('[4,65498,13,2,2,0,32,0,1000000,500000,2000]:v0:v0');
  });

  it('builds correct cellpack for frBTC→DIESEL swap', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: FRBTC_ID,
      buyTokenId: DIESEL_ID,
      sellAmount: '500000',
      minOutput: '900000',
      deadline: '1500',
    });
    expect(result).toBe('[4,65498,13,2,32,0,2,0,500000,900000,1500]:v0:v0');
  });

  it('uses custom pointer and refund when specified', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '100',
      minOutput: '50',
      deadline: '100',
      pointer: 'p2',
      refund: 'v1',
    });
    expect(result).toContain(':p2:v1');
  });

  it('defaults pointer=v0 and refund=v0', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '100',
      minOutput: '50',
      deadline: '100',
    });
    expect(result.endsWith(':v0:v0')).toBe(true);
  });

  it('always uses path_len=2 (no multi-hop)', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '1',
      minOutput: '1',
      deadline: '1',
    });
    // Opcode 13 followed by path_len 2
    expect(result).toContain(',13,2,');
  });
});

describe('buildSwapInputRequirements', () => {
  it('builds alkane input requirement', () => {
    const result = buildSwapInputRequirements({
      alkaneInputs: [{ alkaneId: DIESEL_ID, amount: '1000000' }],
    });
    expect(result).toBe('2:0:1000000');
  });

  it('builds BTC input requirement', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '50000',
    });
    expect(result).toBe('B:50000');
  });

  it('builds combined BTC + alkane requirements', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '10000',
      alkaneInputs: [{ alkaneId: DIESEL_ID, amount: '500' }],
    });
    expect(result).toBe('B:10000,2:0:500');
  });

  it('skips BTC when amount is 0', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '0',
      alkaneInputs: [{ alkaneId: FRBTC_ID, amount: '100' }],
    });
    expect(result).toBe('32:0:100');
  });

  it('handles multiple alkane inputs', () => {
    const result = buildSwapInputRequirements({
      alkaneInputs: [
        { alkaneId: DIESEL_ID, amount: '100' },
        { alkaneId: FRBTC_ID, amount: '200' },
      ],
    });
    expect(result).toBe('2:0:100,32:0:200');
  });
});

describe('buildWrapProtostone', () => {
  it('builds wrap protostone with opcode 77', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toBe('[32,0,77]:v1:v1');
  });

  it('pointer=v1 (user receives frBTC at output 1)', () => {
    const result = buildWrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toContain(':v1:v1');
  });
});

describe('buildUnwrapProtostone', () => {
  it('builds unwrap protostone with opcode 78', () => {
    const result = buildUnwrapProtostone({ frbtcId: FRBTC_ID });
    expect(result).toBe('[32,0,78]:v1:v1');
  });

  it('uses custom pointer and refund', () => {
    const result = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      pointer: 'v0',
      refund: 'v0',
    });
    expect(result).toBe('[32,0,78]:v0:v0');
  });
});

describe('buildUnwrapInputRequirements', () => {
  it('builds frBTC input requirement', () => {
    const result = buildUnwrapInputRequirements({
      frbtcId: FRBTC_ID,
      amount: '500000',
    });
    expect(result).toBe('32:0:500000');
  });
});

describe('buildWrapSwapProtostone (deprecated — kept for reference)', () => {
  it('builds chained wrap+swap with two protostones', () => {
    const result = buildWrapSwapProtostone({
      frbtcId: FRBTC_ID,
      factoryId: FACTORY_ID,
      buyTokenId: DIESEL_ID,
      frbtcAmount: '100000',
      minOutput: '50000',
      deadline: '2000',
    });
    // p0: wrap with pointer=p1
    expect(result).toContain('[32,0,77]:p1:v0');
    // p1: swap with factory opcode 13
    expect(result).toContain('[4,65498,13,2,32,0,2,0,100000,50000,2000]:v0:v0');
    // Two protostones in result
    const bracketCount = (result.match(/\[/g) || []).length;
    expect(bracketCount).toBeGreaterThanOrEqual(2);
  });
});

describe('buildSwapUnwrapProtostone', () => {
  it('builds chained swap+unwrap with two cellpack protostones', () => {
    const result = buildSwapUnwrapProtostone({
      sellTokenId: DIESEL_ID,
      sellAmount: '1000000',
      frbtcId: FRBTC_ID,
      factoryId: FACTORY_ID,
      minFrbtcOutput: '50000',
      deadline: '2000',
    });
    // p1: swap, pointer=p2 (chains to unwrap)
    expect(result).toContain('[4,65498,13,2,2,0,32,0,1000000,50000,2000]:p2:v0');
    // p2: unwrap
    expect(result).toContain('[32,0,78]:v0:v0');
  });
});

describe('buildTransferProtostone', () => {
  it('builds edict protostone for alkane transfer', () => {
    const result = buildTransferProtostone({
      alkaneId: DIESEL_ID,
      amount: '5000000',
    });
    // Edict sends amount to v1 (recipient), pointer=v0 (sender change)
    expect(result).toBe('[2:0:5000000:v1]:v0:v0');
  });

  it('works with large token IDs', () => {
    const result = buildTransferProtostone({
      alkaneId: '4:65498',
      amount: '1',
    });
    expect(result).toBe('[4:65498:1:v1]:v0:v0');
  });
});

describe('buildTransferInputRequirements', () => {
  it('builds input requirement for alkane transfer', () => {
    const result = buildTransferInputRequirements({
      alkaneId: DIESEL_ID,
      amount: '5000000',
    });
    expect(result).toBe('2:0:5000000');
  });
});

describe('buildCreateNewPoolProtostone', () => {
  it('builds two-protostone pattern with two edicts + factory opcode 1', () => {
    const result = buildCreateNewPoolProtostone({
      factoryId: FACTORY_ID,
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000000',
      amount1: '500000',
    });

    // p0: two edicts targeting p1
    expect(result).toContain('[2:0:1000000:p1]');
    expect(result).toContain('[32:0:500000:p1]');
    // p0 pointer and refund
    expect(result).toContain(':v0:v0,');

    // p1: factory cellpack with opcode 1 (CreateNewPool)
    expect(result).toContain('[4,65498,1,2,0,32,0,1000000,500000]:v0:v0');
  });
});

describe('buildAddLiquidityToPoolProtostone', () => {
  it('builds two-protostone pattern with pool opcode 1', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: { block: 2, tx: 6 },
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000',
      amount1: '500',
    });

    // p0: two edicts
    expect(result).toContain('[2:0:1000:p1]');
    expect(result).toContain('[32:0:500:p1]');

    // p1: pool cellpack with opcode 1 (AddLiquidity)
    expect(result).toContain('[2,6,1]:v0:v0');
  });

  it('handles string pool IDs', () => {
    const result = buildAddLiquidityToPoolProtostone({
      poolId: { block: '2', tx: '6' },
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '100',
      amount1: '50',
    });
    expect(result).toContain('[2,6,1]:v0:v0');
  });
});

describe('buildAddLiquidityInputRequirements', () => {
  it('builds two-token input requirement', () => {
    const result = buildAddLiquidityInputRequirements({
      token0Id: DIESEL_ID,
      token1Id: FRBTC_ID,
      amount0: '1000',
      amount1: '500',
    });
    expect(result).toBe('2:0:1000,32:0:500');
  });
});

describe('buildRemoveLiquidityProtostone', () => {
  it('builds LP edict + pool opcode 2', () => {
    const result = buildRemoveLiquidityProtostone({
      lpTokenId: POOL_ID,
      lpAmount: '10000',
      minAmount0: '500',
      minAmount1: '250',
      deadline: '2000',
    });

    // p0: LP edict targeting p1
    expect(result).toContain('[2:6:10000:p1]');

    // p1: pool cellpack with opcode 2 (RemoveLiquidity), min amounts, deadline
    expect(result).toContain('[2,6,2,500,250,2000]:v0:v0');
  });

  it('propagates custom pointer and refund to both p0 and p1', () => {
    const result = buildRemoveLiquidityProtostone({
      lpTokenId: POOL_ID,
      lpAmount: '100',
      minAmount0: '10',
      minAmount1: '5',
      deadline: '1000',
      pointer: 'v1',
      refund: 'v1',
    });
    // Both p0 and p1 should use v1
    const parts = result.split(',[');
    expect(parts[0]).toContain(':v1:v1');
    expect(parts[1]).toContain(':v1:v1');
  });

  it('defaults pointer and refund to v0', () => {
    const result = buildRemoveLiquidityProtostone({
      lpTokenId: POOL_ID,
      lpAmount: '100',
      minAmount0: '10',
      minAmount1: '5',
      deadline: '1000',
    });
    expect(result).toContain(':v0:v0');
  });
});

describe('buildRemoveLiquidityInputRequirements', () => {
  it('builds LP token input requirement', () => {
    const result = buildRemoveLiquidityInputRequirements({
      lpTokenId: POOL_ID,
      lpAmount: '10000',
    });
    expect(result).toBe('2:6:10000');
  });
});

// Cross-cutting concerns
describe('builder consistency', () => {
  it('all protostones use bracket format [cellpack]:pointer:refund', () => {
    const protostones = [
      buildSwapProtostone({
        factoryId: FACTORY_ID, sellTokenId: DIESEL_ID, buyTokenId: FRBTC_ID,
        sellAmount: '100', minOutput: '50', deadline: '100',
      }),
      buildWrapProtostone({ frbtcId: FRBTC_ID }),
      buildUnwrapProtostone({ frbtcId: FRBTC_ID }),
      buildTransferProtostone({ alkaneId: DIESEL_ID, amount: '100' }),
    ];

    for (const ps of protostones) {
      // Should start with [ and contain ]:
      expect(ps).toMatch(/^\[.+\]:(v\d+|p\d+):(v\d+|p\d+)$/);
    }
  });

  it('multi-protostone builders produce comma-separated protostones', () => {
    const multiProtostones = [
      buildCreateNewPoolProtostone({
        factoryId: FACTORY_ID, token0Id: DIESEL_ID, token1Id: FRBTC_ID,
        amount0: '100', amount1: '50',
      }),
      buildAddLiquidityToPoolProtostone({
        poolId: { block: 2, tx: 6 }, token0Id: DIESEL_ID, token1Id: FRBTC_ID,
        amount0: '100', amount1: '50',
      }),
      buildRemoveLiquidityProtostone({
        lpTokenId: POOL_ID, lpAmount: '100', minAmount0: '10',
        minAmount1: '5', deadline: '1000',
      }),
      buildSwapUnwrapProtostone({
        sellTokenId: DIESEL_ID, sellAmount: '100', frbtcId: FRBTC_ID,
        factoryId: FACTORY_ID, minFrbtcOutput: '50', deadline: '100',
      }),
    ];

    for (const ps of multiProtostones) {
      // Should contain at least 2 bracketed sections
      const brackets = ps.match(/\[/g);
      expect(brackets!.length).toBeGreaterThanOrEqual(2);
    }
  });
});
