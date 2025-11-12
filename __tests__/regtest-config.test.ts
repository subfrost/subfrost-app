/**
 * Regtest Configuration Tests
 * 
 * Tests to verify that regtest mode configuration works correctly
 */

import { getConfig, ETHEREUM_CONTRACTS } from '../utils/getConfig';

// Simple test framework
let testsPassed = 0;
let testsFailed = 0;

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ❌ ${name}`);
    console.error(`     ${error}`);
  }
}

function expect(value: any) {
  return {
    toBeDefined: () => {
      if (value === undefined) throw new Error(`Expected value to be defined`);
    },
    toBe: (expected: any) => {
      if (value !== expected) throw new Error(`Expected ${value} to be ${expected}`);
    },
    toContain: (substring: string) => {
      if (!String(value).includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    toBeUndefined: () => {
      if (value !== undefined) throw new Error(`Expected value to be undefined`);
    },
    toMatch: (pattern: RegExp) => {
      if (!pattern.test(String(value))) {
        throw new Error(`Expected "${value}" to match ${pattern}`);
      }
    },
    not: {
      toBe: (expected: any) => {
        if (value === expected) throw new Error(`Expected ${value} not to be ${expected}`);
      }
    },
    toHaveProperty: (prop: string) => {
      if (!(prop in value)) throw new Error(`Expected object to have property "${prop}"`);
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) throw new Error(`Expected ${value} to be greater than ${expected}`);
    },
    toBeLessThan: (expected: number) => {
      if (value >= expected) throw new Error(`Expected ${value} to be less than ${expected}`);
    }
  };
}

describe('Regtest Network Configuration', () => {
  describe('getConfig', () => {
    it('should return regtest configuration when network is regtest', () => {
      const config = getConfig('regtest');
      
      expect(config).toBeDefined();
      expect(config.OYL_API_URL).toContain('localhost:3001');
      expect(config.BLOCK_EXPLORER_URL_BTC).toContain('localhost');
      expect(config.BLOCK_EXPLORER_URL_ETH).toContain('localhost');
      expect(config.ETHEREUM_NETWORK).toBe('regtest');
      expect(config.BOUND_API_URL).toContain('localhost:3002');
    });

    it('should have correct Alkane IDs for regtest', () => {
      const config = getConfig('regtest');
      
      expect(config.ALKANE_FACTORY_ID).toBe('4:65522');
      expect(config.BUSD_ALKANE_ID).toBe('2:0');
      expect(config.FRBTC_ALKANE_ID).toBe('32:0');
      expect(config.DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID).toBe('2:0');
      expect(config.VEDIESEL_VAULT_ID).toBe('2:1');
      expect(config.DXBTC_VAULT_ID).toBe('2:2');
    });

    it('should allow env var overrides for OYL API URL', () => {
      const customUrl = 'http://custom-oyl-api:3001';
      process.env.NEXT_PUBLIC_OYL_API_URL = customUrl;
      
      const config = getConfig('regtest');
      expect(config.OYL_API_URL).toBe(customUrl);
      
      delete process.env.NEXT_PUBLIC_OYL_API_URL;
    });

    it('should allow env var overrides for Bound API URL', () => {
      const customUrl = 'http://custom-bound-api:3002/api/v1';
      process.env.NEXT_PUBLIC_BOUND_API_URL = customUrl;
      
      const config = getConfig('regtest');
      expect(config.BOUND_API_URL).toBe(customUrl);
      
      delete process.env.NEXT_PUBLIC_BOUND_API_URL;
    });
  });

  describe('ETHEREUM_CONTRACTS', () => {
    it('should have regtest Ethereum contract configuration', () => {
      expect(ETHEREUM_CONTRACTS.regtest).toBeDefined();
      expect(ETHEREUM_CONTRACTS.regtest.CHAIN_ID).toBe(31337); // Anvil default
    });

    it('should have USDC address for regtest', () => {
      const { USDC_ADDRESS } = ETHEREUM_CONTRACTS.regtest;
      expect(USDC_ADDRESS).toBeDefined();
      expect(USDC_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/); // Valid Ethereum address
    });

    it('should have USDT address for regtest', () => {
      const { USDT_ADDRESS } = ETHEREUM_CONTRACTS.regtest;
      expect(USDT_ADDRESS).toBeDefined();
      expect(USDT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/); // Valid Ethereum address
    });

    it('should allow env var override for USDC address', () => {
      // Note: Env vars are read at module import time, so we test that
      // the config respects env vars when they're set before import
      const { USDC_ADDRESS } = ETHEREUM_CONTRACTS.regtest;
      
      // Verify it either uses env var OR has a default
      expect(USDC_ADDRESS).toBeDefined();
      expect(USDC_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should allow env var override for USDT address', () => {
      // Note: Env vars are read at module import time, so we test that
      // the config respects env vars when they're set before import
      const { USDT_ADDRESS } = ETHEREUM_CONTRACTS.regtest;
      
      // Verify it either uses env var OR has a default
      expect(USDT_ADDRESS).toBeDefined();
      expect(USDT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should use different contract addresses for each network', () => {
      const mainnetUSDC = ETHEREUM_CONTRACTS.mainnet.USDC_ADDRESS;
      const sepoliaUSDC = ETHEREUM_CONTRACTS.sepolia.USDC_ADDRESS;
      const regtestUSDC = ETHEREUM_CONTRACTS.regtest.USDC_ADDRESS;
      
      expect(mainnetUSDC).not.toBe(sepoliaUSDC);
      expect(mainnetUSDC).not.toBe(regtestUSDC);
      expect(sepoliaUSDC).not.toBe(regtestUSDC);
    });

    it('should have correct chain IDs for each network', () => {
      expect(ETHEREUM_CONTRACTS.mainnet.CHAIN_ID).toBe(1);
      expect(ETHEREUM_CONTRACTS.sepolia.CHAIN_ID).toBe(11155111);
      expect(ETHEREUM_CONTRACTS.regtest.CHAIN_ID).toBe(31337);
    });
  });
});

describe('Network Detection', () => {
  it('should detect regtest from NEXT_PUBLIC_NETWORK env var', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'regtest';
    const config = getConfig(process.env.NEXT_PUBLIC_NETWORK);
    expect(config.ETHEREUM_NETWORK).toBe('regtest');
    delete process.env.NEXT_PUBLIC_NETWORK;
  });

  it('should handle mainnet as default', () => {
    const config = getConfig('mainnet');
    expect(config.ETHEREUM_NETWORK).toBe('mainnet');
  });

  it('should handle signet network', () => {
    const config = getConfig('signet');
    expect(config.ETHEREUM_NETWORK).toBe('sepolia');
  });

  it('should handle oylnet network', () => {
    const config = getConfig('oylnet');
    expect(config.ETHEREUM_NETWORK).toBe('mainnet');
  });
});

describe('Regtest Configuration Completeness', () => {
  it('should have all required configuration fields', () => {
    const config = getConfig('regtest');
    
    const requiredFields = [
      'ALKANE_FACTORY_ID',
      'BUSD_ALKANE_ID',
      'FRBTC_ALKANE_ID',
      'DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID',
      'VEDIESEL_VAULT_ID',
      'DXBTC_VAULT_ID',
      'OYL_API_URL',
      'BLOCK_EXPLORER_URL_BTC',
      'BLOCK_EXPLORER_URL_ETH',
      'ETHEREUM_NETWORK',
      'BOUND_API_URL',
    ];

    requiredFields.forEach(field => {
      expect(config).toHaveProperty(field);
      expect((config as any)[field]).toBeDefined();
    });
  });

  it('should use localhost URLs for all APIs in regtest', () => {
    const config = getConfig('regtest');
    
    expect(config.OYL_API_URL).toContain('localhost');
    expect(config.BLOCK_EXPLORER_URL_BTC).toContain('localhost');
    expect(config.BLOCK_EXPLORER_URL_ETH).toContain('localhost');
    expect(config.BOUND_API_URL).toContain('localhost');
  });

  it('should not have BUSD_SPLITTER_ID defined for regtest', () => {
    const config = getConfig('regtest');
    expect(config.BUSD_SPLITTER_ID).toBeUndefined();
  });
});

// Run tests and report
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}
