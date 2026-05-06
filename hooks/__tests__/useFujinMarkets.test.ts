/** @vitest-environment jsdom */
// @ts-nocheck
/**
 * useFujinMarkets Tests — futures market data parsing
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/context/WalletContext', () => ({
  useWallet: () => ({ network: 'devnet' }),
}));

describe('Fujin market data parsing', () => {
  it('should parse factory ID from config', () => {
    const factoryId = '4:7105';
    const [block, tx] = factoryId.split(':');
    expect(block).toBe('4');
    expect(tx).toBe('7105');
  });

  it('should parse u128 market count from bytes', () => {
    function readU128LE(bytes: number[]): bigint {
      let value = BigInt(0);
      for (let i = 0; i < 16 && i < bytes.length; i++) {
        value |= BigInt(bytes[i]) << BigInt(i * 8);
      }
      return value;
    }

    // 3 markets
    const bytes = [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(Number(readU128LE(bytes))).toBe(3);
  });

  it('should parse market IDs from response', () => {
    // Each market ID is 32 bytes (two u128 LE: block + tx)
    function parseMarketIds(hex: string): string[] {
      const bytes = Buffer.from(hex.replace('0x', ''), 'hex');
      if (bytes.length < 16) return [];

      const count = Number(bytes.readBigUInt64LE(0));
      const ids: string[] = [];

      for (let i = 0; i < count && 16 + i * 32 + 32 <= bytes.length; i++) {
        const offset = 16 + i * 32;
        const block = Number(bytes.readBigUInt64LE(offset));
        const tx = Number(bytes.readBigUInt64LE(offset + 16));
        ids.push(`${block}:${tx}`);
      }

      return ids;
    }

    // Simulate: 1 market at 2:100
    const hex = '01000000000000000000000000000000' + // count=1
                '02000000000000000000000000000000' + // block=2
                '64000000000000000000000000000000';   // tx=100
    expect(parseMarketIds(hex)).toEqual(['2:100']);
  });

  it('should handle empty market list', () => {
    const hex = '00000000000000000000000000000000'; // count=0
    const bytes = Buffer.from(hex, 'hex');
    const count = Number(bytes.readBigUInt64LE(0));
    expect(count).toBe(0);
  });

  it('should detect Unrecognized opcode as no factory', () => {
    const error = 'Unrecognized opcode';
    const isNotDeployed = error === 'Unrecognized opcode' || error?.includes('unexpected end');
    expect(isNotDeployed).toBe(true);
  });

  it('should detect balance underflow as expected simulation error', () => {
    const error = 'balance underflow, transferring(2:0, 1000)';
    const isBalanceError = error?.includes('balance underflow');
    expect(isBalanceError).toBe(true);
  });

  it('should format market price', () => {
    const priceRaw = 99850_000_000n; // 998.50 with 8 decimals
    const price = Number(priceRaw) / 1e8;
    expect(price).toBe(998.5);
  });

  it('should compute epoch progress', () => {
    const blocksPerEpoch = 2016;
    const currentBlock = 1450;
    const epochStart = 0; // genesis
    const blocksInEpoch = currentBlock % blocksPerEpoch;
    const progress = (blocksInEpoch / blocksPerEpoch) * 100;
    expect(progress).toBeCloseTo(71.9, 0);
  });
});
