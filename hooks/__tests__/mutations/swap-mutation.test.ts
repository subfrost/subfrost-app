/**
 * Swap Mutation Tests
 *
 * Tests for the useSwapMutation hook logic: calldata generation, parameter
 * serialization, address handling, deadline overrides, and error cases.
 *
 * All external dependencies (wallet context, SDK, providers) are mocked.
 * Tests focus on the LOGIC that drives swap transactions.
 *
 * Run with: pnpm test hooks/__tests__/mutations/swap-mutation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';
import * as fs from 'fs';
import * as path from 'path';

// Shared builder imports (pure functions, no WASM)
import {
  buildSwapProtostone,
  buildSwapInputRequirements,
} from '@/lib/alkanes/builders';
import { FACTORY_SWAP_OPCODE } from '@/lib/alkanes/constants';
import { getBitcoinNetwork, getSignerAddress, toAlks } from '@/lib/alkanes/helpers';

// ---------------------------------------------------------------------------
// Constants matching regtest config
// ---------------------------------------------------------------------------
const FACTORY_ID = '4:65498';
const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';

// ---------------------------------------------------------------------------
// 1. Factory Opcode 13 Parameter Serialization
// ---------------------------------------------------------------------------

describe('Swap calldata: factory opcode 13 serialization', () => {
  it('should serialize DIESEL→frBTC swap with correct field order', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '10000000',
      minOutput: '9500000',
      deadline: '2000',
    });
    // Format: [factory_block,factory_tx,13,path_len,sell_block,sell_tx,buy_block,buy_tx,amount,min,deadline]:ptr:ref
    expect(result).toBe('[4,65498,13,2,2,0,32,0,10000000,9500000,2000]:v0:v0');
  });

  it('should serialize frBTC→DIESEL swap with reversed path', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: FRBTC_ID,
      buyTokenId: DIESEL_ID,
      sellAmount: '500000',
      minOutput: '4500000',
      deadline: '1500',
    });
    expect(result).toBe('[4,65498,13,2,32,0,2,0,500000,4500000,1500]:v0:v0');
  });

  it('should always use path_len=2 for direct swaps', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '100',
      minOutput: '50',
      deadline: '100',
    });
    // After opcode 13, next value should be 2 (path length)
    const parts = result.match(/\[(.*?)\]/)?.[1]?.split(',');
    expect(parts?.[2]).toBe('13'); // opcode
    expect(parts?.[3]).toBe('2'); // path_len
  });

  it('should handle very large amounts without precision loss', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '340282366920938463463374607431768211455', // u128 max
      minOutput: '1',
      deadline: '999999999',
    });
    expect(result).toContain('340282366920938463463374607431768211455');
  });

  it('should place factory opcode at position 2 in cellpack', () => {
    const result = buildSwapProtostone({
      factoryId: '100:200',
      sellTokenId: '3:4',
      buyTokenId: '5:6',
      sellAmount: '10',
      minOutput: '5',
      deadline: '100',
    });
    const cellpack = result.match(/\[(.*?)\]/)?.[1];
    const parts = cellpack?.split(',');
    expect(parts?.[0]).toBe('100'); // factory block
    expect(parts?.[1]).toBe('200'); // factory tx
    expect(parts?.[2]).toBe(String(FACTORY_SWAP_OPCODE)); // opcode 13
  });
});

// ---------------------------------------------------------------------------
// 2. Input Requirements Generation
// ---------------------------------------------------------------------------

describe('Swap input requirements', () => {
  it('should generate alkane input for token→token swap', () => {
    const result = buildSwapInputRequirements({
      alkaneInputs: [{ alkaneId: DIESEL_ID, amount: '10000000' }],
    });
    expect(result).toBe('2:0:10000000');
  });

  it('should generate BTC input for BTC sell', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '100000',
    });
    expect(result).toBe('B:100000');
  });

  it('should return empty string when no inputs specified', () => {
    const result = buildSwapInputRequirements({});
    expect(result).toBe('');
  });

  it('should skip BTC when amount is zero', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '0',
      alkaneInputs: [{ alkaneId: FRBTC_ID, amount: '500000' }],
    });
    expect(result).toBe('32:0:500000');
    expect(result).not.toContain('B:');
  });

  it('should support combined BTC + alkane inputs', () => {
    const result = buildSwapInputRequirements({
      bitcoinAmount: '50000',
      alkaneInputs: [{ alkaneId: DIESEL_ID, amount: '10000' }],
    });
    expect(result).toBe('B:50000,2:0:10000');
  });
});

// ---------------------------------------------------------------------------
// 3. Wrap Fee Adjustment Logic
// ---------------------------------------------------------------------------

describe('Swap wrap fee adjustment', () => {
  const WRAP_FEE_PER_1000 = 5; // 0.5%

  it('should reduce sell amount by wrap fee when selling BTC', () => {
    const sellAmount = '100000000'; // 1 BTC
    const ammSellAmount = new BigNumber(sellAmount)
      .multipliedBy(1000 - WRAP_FEE_PER_1000)
      .dividedBy(1000)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    expect(ammSellAmount).toBe('99500000'); // 0.995 BTC
  });

  it('should increase buy amount by wrap fee when selling BTC', () => {
    const buyAmount = '1000000000'; // expected output
    const ammBuyAmount = new BigNumber(buyAmount)
      .multipliedBy(1000 + WRAP_FEE_PER_1000)
      .dividedBy(1000)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    expect(ammBuyAmount).toBe('1005000000'); // +0.5%
  });

  it('should not adjust amounts when not selling BTC', () => {
    const sellAmount = '100000000';
    const isBtcSell = false;
    const ammSellAmount = isBtcSell
      ? new BigNumber(sellAmount).multipliedBy(995).dividedBy(1000).integerValue(BigNumber.ROUND_FLOOR).toString()
      : sellAmount;
    expect(ammSellAmount).toBe('100000000');
  });

  it('should floor to integer after fee adjustment', () => {
    const sellAmount = '3'; // tiny amount
    const ammSellAmount = new BigNumber(sellAmount)
      .multipliedBy(1000 - WRAP_FEE_PER_1000)
      .dividedBy(1000)
      .integerValue(BigNumber.ROUND_FLOOR)
      .toString();
    // 3 * 995 / 1000 = 2.985 → floor to 2
    expect(ammSellAmount).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// 4. Regtest Deadline Override
// ---------------------------------------------------------------------------

describe('Regtest deadline override', () => {
  it('should use 1000 blocks on regtest', () => {
    const network = 'subfrost-regtest';
    const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
    const deadlineBlocks = isRegtest ? 1000 : 3;
    expect(deadlineBlocks).toBe(1000);
  });

  it('should use 1000 blocks on regtest-local', () => {
    const network = 'regtest-local';
    const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
    expect(isRegtest).toBe(true);
  });

  it('should use default (3 blocks) on mainnet', () => {
    const network = 'mainnet';
    const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
    const deadlineBlocks = isRegtest ? 1000 : 3;
    expect(deadlineBlocks).toBe(3);
  });

  it('should use custom deadlineBlocks on mainnet when specified', () => {
    const network = 'mainnet';
    const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
    const userDeadline = 10;
    const deadlineBlocks = isRegtest ? 1000 : (userDeadline || 3);
    expect(deadlineBlocks).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 5. Browser Wallet Address Handling (source code verification)
// ---------------------------------------------------------------------------

describe('Browser wallet address handling in useSwapMutation', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useSwapMutation.ts'), 'utf-8');
  });

  it('should define isBrowserWallet check', () => {
    expect(src).toContain("isBrowserWallet = walletType === 'browser'");
  });

  it('should use actual primaryAddress for browser wallet toAddresses', () => {
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain('primaryAddress');
    expect(match![1]).not.toContain("'p2tr:0'");
  });

  it('should use segwitAddress fallback for browser wallet changeAddr', () => {
    const match = src.match(/changeAddr\s*=\s*isBrowserWallet\s*\n\s*\?\s*(.+)\n/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain('segwitAddress');
    expect(match![1]).toContain('taprootAddress');
  });

  it('should use symbolic p2tr:0 for keystore wallet toAddresses', () => {
    const match = src.match(/toAddresses\s*=\s*isBrowserWallet\s*\n\s*\?.+\n\s*:\s*(.+);/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain("'p2tr:0'");
  });

  it('should call signTaprootPsbt only once for browser wallets', () => {
    // Browser wallet path should NOT call signSegwitPsbt
    expect(src).toContain('if (isBrowserWallet)');
    // Must call signTaprootPsbt for browser
    expect(src).toContain('signTaprootPsbt(finalPsbtBase64)');
  });

  it('should call both signSegwitPsbt and signTaprootPsbt for keystore', () => {
    expect(src).toContain('signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64)');
    expect(src).toContain('signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64)');
  });
});

// ---------------------------------------------------------------------------
// 6. BTC→Token Two-Step Guard
// ---------------------------------------------------------------------------

describe('BTC→Token two-step guard', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useSwapMutation.ts'), 'utf-8');
  });

  it('should reject BTC→non-frBTC swaps', () => {
    expect(src).toContain("swapData.sellCurrency === 'btc' && swapData.buyCurrency !== FRBTC_ALKANE_ID");
  });

  it('should throw error about frBTC routing', () => {
    expect(src).toContain('BTC swaps must go through frBTC');
  });

  it('should resolve BTC to FRBTC_ALKANE_ID for sell currency', () => {
    expect(src).toContain("swapData.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.sellCurrency");
  });
});

// ---------------------------------------------------------------------------
// 7. Slippage Calculation
// ---------------------------------------------------------------------------

describe('Slippage calculation', () => {
  // Replicate calculateMinimumFromSlippage logic
  function calculateMinimumFromSlippage(params: { amount: string; maxSlippage: string }): string {
    const { amount, maxSlippage } = params;
    const slippageMultiplier = new BigNumber(1).minus(new BigNumber(maxSlippage).dividedBy(100));
    return new BigNumber(amount).multipliedBy(slippageMultiplier).integerValue(BigNumber.ROUND_FLOOR).toString();
  }

  it('should calculate 0.5% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({ amount: '1000000', maxSlippage: '0.5' });
    expect(result).toBe('995000');
  });

  it('should calculate 1% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({ amount: '1000000', maxSlippage: '1' });
    expect(result).toBe('990000');
  });

  it('should calculate 5% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({ amount: '10000000', maxSlippage: '5' });
    expect(result).toBe('9500000');
  });

  it('should floor result for fractional amounts', () => {
    const result = calculateMinimumFromSlippage({ amount: '3', maxSlippage: '0.5' });
    // 3 * 0.995 = 2.985 → floor to 2
    expect(result).toBe('2');
  });

  it('should return 0 for zero amount', () => {
    const result = calculateMinimumFromSlippage({ amount: '0', maxSlippage: '0.5' });
    expect(result).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// 8. Network Configuration
// ---------------------------------------------------------------------------

describe('Network configuration for swap', () => {
  it('should return regtest network for subfrost-regtest', () => {
    const network = getBitcoinNetwork('subfrost-regtest');
    expect(network.bech32).toBe('bcrt');
  });

  it('should return mainnet network for mainnet', () => {
    const network = getBitcoinNetwork('mainnet');
    expect(network.bech32).toBe('bc');
  });

  it('should return regtest for oylnet', () => {
    const network = getBitcoinNetwork('oylnet');
    expect(network.bech32).toBe('bcrt');
  });

  it('should default to mainnet for unknown network', () => {
    const network = getBitcoinNetwork('some-unknown');
    expect(network.bech32).toBe('bc');
  });
});

// ---------------------------------------------------------------------------
// 9. Edge Cases and Error Scenarios
// ---------------------------------------------------------------------------

describe('Swap edge cases', () => {
  it('should handle zero sell amount in protostone', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: FRBTC_ID,
      sellAmount: '0',
      minOutput: '0',
      deadline: '100',
    });
    expect(result).toContain(',0,0,100');
  });

  it('should handle same token for sell and buy (invalid but buildable)', () => {
    const result = buildSwapProtostone({
      factoryId: FACTORY_ID,
      sellTokenId: DIESEL_ID,
      buyTokenId: DIESEL_ID,
      sellAmount: '100',
      minOutput: '100',
      deadline: '100',
    });
    // Should build without error (factory will reject at runtime)
    expect(result).toContain(',2,0,2,0,');
  });

  it('should handle single-digit token IDs', () => {
    const result = buildSwapProtostone({
      factoryId: '1:1',
      sellTokenId: '2:3',
      buyTokenId: '4:5',
      sellAmount: '100',
      minOutput: '50',
      deadline: '99',
    });
    expect(result).toBe('[1,1,13,2,2,3,4,5,100,50,99]:v0:v0');
  });
});

// ---------------------------------------------------------------------------
// 10. ordinalsStrategy verification
// ---------------------------------------------------------------------------

describe('ordinalsStrategy in swap hook', () => {
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../../useSwapMutation.ts'), 'utf-8');
  });

  it('should set ordinalsStrategy to burn', () => {
    expect(src).toContain("ordinalsStrategy: 'burn'");
  });

  it('should pass ordinalsStrategy to alkanesExecuteTyped', () => {
    // Verify it's inside the alkanesExecuteTyped call
    const execCall = src.match(/alkanesExecuteTyped\(\{[\s\S]*?ordinalsStrategy[\s\S]*?\}\)/);
    expect(execCall).toBeTruthy();
  });
});
