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
  buildTransferProtostone,
  buildTransferInputRequirements,
  buildCreateNewPoolProtostone,
  buildFactoryAddLiquidityProtostones,
  buildAddLiquidityInputRequirements,
  buildFactoryBurnProtostone,
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
  // The cellpack MUST carry [block, tx, 78, dustVout, amount]. Omitting the
  // last two args caused the 2026-04-29 "dust limit underflow" regression
  // (real-world tx a95597ad...). See useUnwrapMutation.ts header comment.
  it('builds unwrap protostone with opcode 78 + dustVout + amount', () => {
    const result = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      dustVout: 2,
      amount: '500000',
    });
    expect(result).toBe('[32,0,78,2,500000]:v1:v0');
  });

  it('uses custom pointer and refund', () => {
    const result = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      dustVout: 2,
      amount: '500000',
      pointer: 'v0',
      refund: 'v0',
    });
    expect(result).toBe('[32,0,78,2,500000]:v0:v0');
  });

  it('threads dustVout through the cellpack (matches CLI canonical layout)', () => {
    const result = buildUnwrapProtostone({
      frbtcId: FRBTC_ID,
      dustVout: 3,
      amount: '1000',
    });
    // Position 4 in the cellpack is dustVout (after block, tx, opcode, then this).
    expect(result).toContain(',78,3,1000]');
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

describe('buildFactoryAddLiquidityProtostones', () => {
  it('builds single-protostone factory opcode 11 with full Uniswap params', () => {
    const result = buildFactoryAddLiquidityProtostones({
      factoryId: '4:65498',
      tokenA: DIESEL_ID,
      tokenB: FRBTC_ID,
      amountADesired: '1000',
      amountBDesired: '500',
      amountAMin: '995',
      amountBMin: '498',
      deadline: '12345',
    });

    // Single protostone: cellpack with factory opcode 11 + tokens + amounts + min + deadline
    expect(result).toBe('[4,65498,11,2,0,32,0,1000,500,995,498,12345]:v0:v0');
    // No comma-separated multiple protostones, no edict syntax
    expect(result).not.toContain(':p1]');
    expect(result).not.toMatch(/],\[/);
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

describe('buildFactoryBurnProtostone', () => {
  it('builds single-protostone factory opcode 12 with full Uniswap params', () => {
    const result = buildFactoryBurnProtostone({
      factoryId: '4:65498',
      tokenA: DIESEL_ID,
      tokenB: FRBTC_ID,
      liquidity: '10000',
      amountAMin: '500',
      amountBMin: '250',
      deadline: '2000',
    });
    // [factory_block,factory_tx,12,ta_b,ta_t,tb_b,tb_t,liq,a_min,b_min,deadline]
    expect(result).toBe('[4,65498,12,2,0,32,0,10000,500,250,2000]:v0:v0');
    expect(result).not.toContain(':p1]');
    expect(result).not.toMatch(/],\[/);
  });

  it('propagates custom pointer and refund', () => {
    const result = buildFactoryBurnProtostone({
      factoryId: '4:65498',
      tokenA: DIESEL_ID,
      tokenB: FRBTC_ID,
      liquidity: '100',
      amountAMin: '10',
      amountBMin: '5',
      deadline: '1000',
      pointer: 'v1',
      refund: 'v1',
    });
    expect(result).toContain(':v1:v1');
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
      buildUnwrapProtostone({ frbtcId: FRBTC_ID, dustVout: 2, amount: '500000' }),
      buildTransferProtostone({ alkaneId: DIESEL_ID, amount: '100' }),
    ];

    for (const ps of protostones) {
      // Should start with [ and contain ]:
      expect(ps).toMatch(/^\[.+\]:(v\d+|p\d+):(v\d+|p\d+)$/);
    }
  });

  it('multi-protostone builders produce comma-separated protostones', () => {
    // Only chained-protostone builders go here. Factory router calls
    // (AddLiquidity opcode 11, Burn opcode 12) are deliberately
    // single-protostone — input alkanes auto-allocate to the cellpack and
    // the factory reads token_a / token_b from cellpack params. They're
    // covered by the single-protostone test above.
    const multiProtostones = [
      buildCreateNewPoolProtostone({
        factoryId: FACTORY_ID, token0Id: DIESEL_ID, token1Id: FRBTC_ID,
        amount0: '100', amount1: '50',
      }),
    ];

    for (const ps of multiProtostones) {
      // Should contain at least 2 bracketed sections
      const brackets = ps.match(/\[/g);
      expect(brackets!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('factory router builders (AddLiquidity, Burn) are single-protostone', () => {
    const singleFactoryRouter = [
      buildFactoryAddLiquidityProtostones({
        factoryId: FACTORY_ID, tokenA: DIESEL_ID, tokenB: FRBTC_ID,
        amountADesired: '100', amountBDesired: '50',
        amountAMin: '99', amountBMin: '49', deadline: '1000',
      }),
      buildFactoryBurnProtostone({
        factoryId: FACTORY_ID, tokenA: DIESEL_ID, tokenB: FRBTC_ID,
        liquidity: '100', amountAMin: '10', amountBMin: '5', deadline: '1000',
      }),
    ];

    for (const ps of singleFactoryRouter) {
      const brackets = ps.match(/\[/g);
      expect(brackets!.length).toBe(1);
      expect(ps).toMatch(/^\[.+\]:v\d+:v\d+$/);
    }
  });
});
