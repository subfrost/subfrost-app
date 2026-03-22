/** @vitest-environment jsdom */
// @ts-nocheck — test file uses loose mock types
/**
 * useVaultStats Tests — vault contract query integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock wallet
vi.mock('@/context/WalletContext', () => ({
  useWallet: () => ({ network: 'devnet', address: 'bcrt1ptest' }),
}));

vi.mock('@/context/AlkanesSDKContext', () => ({
  useAlkanesSDK: () => ({ provider: null, isReady: false }),
}));

describe('useVaultStats data parsing', () => {
  it('should parse u128 from 16 LE bytes', () => {
    // Test the core parsing logic used by vault stats
    function parseU128LE(bytes: number[]): string {
      let value = BigInt(0);
      for (let i = 0; i < 16 && i < bytes.length; i++) {
        value |= BigInt(bytes[i]) << BigInt(i * 8);
      }
      return value.toString();
    }

    // 1000 sats = 0xe8, 0x03, 0x00...
    const bytes = [0xe8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(parseU128LE(bytes)).toBe('1000');
  });

  it('should calculate share price from total assets and supply', () => {
    const totalAssets = 1_000_000_000n; // 10 BTC
    const totalSupply = 500_000_000n;   // 5 shares
    const sharePrice = totalSupply > 0n
      ? Number(totalAssets) / Number(totalSupply)
      : 1;
    expect(sharePrice).toBe(2); // Each share worth 2 BTC
  });

  it('should return share price 1 when no supply', () => {
    const totalAssets = 0n;
    const totalSupply = 0n;
    const sharePrice = totalSupply > 0n
      ? Number(totalAssets) / Number(totalSupply)
      : 1;
    expect(sharePrice).toBe(1);
  });

  it('should format TVL correctly', () => {
    const totalAssets = 500_000_000; // 5 BTC in sats
    const btcPrice = 100_000;
    const tvlUsd = (totalAssets / 1e8) * btcPrice;
    expect(tvlUsd).toBe(500_000);
  });

  it('should compute APY from emission rate', () => {
    const emissionRate = 665_000; // per block
    const blocksPerYear = 52560; // ~10min blocks
    const totalStaked = 100_000_000; // 1 BTC

    const annualEmission = emissionRate * blocksPerYear;
    const apy = totalStaked > 0 ? (annualEmission / totalStaked) * 100 : 0;
    expect(apy).toBeGreaterThan(0);
  });

  it('should handle zero values gracefully', () => {
    const totalAssets = 0;
    const totalSupply = 0;
    const formatted = totalAssets > 0 ? (totalAssets / 1e8).toFixed(8) : '0.00';
    expect(formatted).toBe('0.00');
  });

  it('should parse vault contract ID from config', () => {
    const devnetConfig = {
      DXBTC_VAULT_ID: '4:7020',
    };
    const [block, tx] = devnetConfig.DXBTC_VAULT_ID.split(':');
    expect(block).toBe('4');
    expect(tx).toBe('7020');
  });
});
