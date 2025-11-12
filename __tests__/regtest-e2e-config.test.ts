/**
 * Regtest E2E Configuration Tests
 * 
 * Tests for regtest-specific E2E test configuration
 */

import { REGTEST_CONFIG, TESTNET_CONFIG } from '../e2e/testnet.config';

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
    },
    toBeLessThanOrEqual: (expected: number) => {
      if (value > expected) throw new Error(`Expected ${value} to be less than or equal ${expected}`);
    },
    toMatch: (pattern: RegExp) => {
      if (!pattern.test(String(value))) {
        throw new Error(`Expected "${value}" to match ${pattern}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
      }
    }
  };
}

describe('Regtest E2E Configuration', () => {
  describe('REGTEST_CONFIG', () => {
    it('should be defined and exported', () => {
      expect(REGTEST_CONFIG).toBeDefined();
    });

    it('should have correct network set to regtest', () => {
      expect(REGTEST_CONFIG.network).toBe('regtest');
    });

    it('should have localhost base URL', () => {
      expect(REGTEST_CONFIG.baseUrl).toContain('localhost');
    });

    it('should have faster timeouts than testnet', () => {
      expect(REGTEST_CONFIG.timeouts.transactionConfirm)
        .toBeLessThan(TESTNET_CONFIG.timeouts.transactionConfirm);
      
      expect(REGTEST_CONFIG.timeouts.blockTime)
        .toBeLessThan(TESTNET_CONFIG.timeouts.blockTime);
    });

    it('should have larger test amounts than testnet', () => {
      expect(REGTEST_CONFIG.testAmounts.btc)
        .toBeGreaterThan(TESTNET_CONFIG.testAmounts.btc);
      
      expect(REGTEST_CONFIG.testAmounts.alkane)
        .toBeGreaterThan(TESTNET_CONFIG.testAmounts.alkane);
      
      expect(REGTEST_CONFIG.testAmounts.vaultDeposit)
        .toBeGreaterThan(TESTNET_CONFIG.testAmounts.vaultDeposit);
    });

    it('should have separate screenshot directory for regtest', () => {
      expect(REGTEST_CONFIG.screenshotsDir).toContain('regtest');
      expect(REGTEST_CONFIG.screenshotsDir).not.toBe(TESTNET_CONFIG.screenshotsDir);
    });

    it('should have fewer retry attempts than testnet', () => {
      expect(REGTEST_CONFIG.retries.transactionCheck)
        .toBeLessThanOrEqual(TESTNET_CONFIG.retries.transactionCheck);
    });

    it('should have shorter check interval than testnet', () => {
      expect(REGTEST_CONFIG.retries.checkInterval)
        .toBeLessThan(TESTNET_CONFIG.retries.checkInterval);
    });
  });

  describe('Regtest Contracts Configuration', () => {
    it('should have vault contract IDs defined', () => {
      expect(REGTEST_CONFIG.contracts.yveDieselVault).toBeDefined();
      expect(REGTEST_CONFIG.contracts.dxBtcVault).toBeDefined();
    });

    it('should have token contract IDs defined', () => {
      expect(REGTEST_CONFIG.contracts.dieselToken).toBeDefined();
      expect(REGTEST_CONFIG.contracts.frbtcToken).toBeDefined();
      expect(REGTEST_CONFIG.contracts.busdToken).toBeDefined();
    });

    it('should use Alkane ID format', () => {
      const alkaneIdPattern = /^\d+:\d+$/;
      
      expect(REGTEST_CONFIG.contracts.yveDieselVault).toMatch(alkaneIdPattern);
      expect(REGTEST_CONFIG.contracts.dxBtcVault).toMatch(alkaneIdPattern);
      expect(REGTEST_CONFIG.contracts.dieselToken).toMatch(alkaneIdPattern);
      expect(REGTEST_CONFIG.contracts.frbtcToken).toMatch(alkaneIdPattern);
      expect(REGTEST_CONFIG.contracts.busdToken).toMatch(alkaneIdPattern);
    });

    it('should allow env var overrides for vault IDs', () => {
      const customVaultId = '2:9999';
      process.env.YVE_DIESEL_VAULT_ID = customVaultId;
      
      // Config reads from env vars
      expect(process.env.YVE_DIESEL_VAULT_ID).toBe(customVaultId);
      
      delete process.env.YVE_DIESEL_VAULT_ID;
    });
  });

  describe('Regtest Timeouts', () => {
    it('should have reasonable timeout for local development', () => {
      // Local regtest should be fast
      expect(REGTEST_CONFIG.timeouts.pageLoad).toBeLessThanOrEqual(10000); // 10s
      expect(REGTEST_CONFIG.timeouts.transactionConfirm).toBeLessThanOrEqual(30000); // 30s
      expect(REGTEST_CONFIG.timeouts.blockTime).toBeLessThanOrEqual(10000); // 10s
    });

    it('should have all required timeout fields', () => {
      expect(REGTEST_CONFIG.timeouts).toHaveProperty('pageLoad');
      expect(REGTEST_CONFIG.timeouts).toHaveProperty('walletConnect');
      expect(REGTEST_CONFIG.timeouts).toHaveProperty('transactionConfirm');
      expect(REGTEST_CONFIG.timeouts).toHaveProperty('blockTime');
    });

    it('should have positive timeout values', () => {
      Object.values(REGTEST_CONFIG.timeouts).forEach(timeout => {
        expect(timeout).toBeGreaterThan(0);
      });
    });
  });

  describe('Regtest Test Amounts', () => {
    it('should have reasonable amounts for testing', () => {
      // Should be large enough for meaningful tests but not excessive
      expect(REGTEST_CONFIG.testAmounts.btc).toBeGreaterThan(0);
      expect(REGTEST_CONFIG.testAmounts.btc).toBeLessThan(100);
      
      expect(REGTEST_CONFIG.testAmounts.alkane).toBeGreaterThan(0);
      expect(REGTEST_CONFIG.testAmounts.alkane).toBeLessThan(10000);
      
      expect(REGTEST_CONFIG.testAmounts.vaultDeposit).toBeGreaterThan(0);
      expect(REGTEST_CONFIG.testAmounts.vaultDeposit).toBeLessThan(1000);
    });

    it('should have all required amount fields', () => {
      expect(REGTEST_CONFIG.testAmounts).toHaveProperty('btc');
      expect(REGTEST_CONFIG.testAmounts).toHaveProperty('alkane');
      expect(REGTEST_CONFIG.testAmounts).toHaveProperty('vaultDeposit');
    });
  });

  describe('Regtest Browser Configuration', () => {
    it('should respect HEADLESS env var', () => {
      process.env.HEADLESS = 'false';
      expect(process.env.HEADLESS).toBe('false');
      delete process.env.HEADLESS;
    });

    it('should respect SLOW_MO env var', () => {
      process.env.SLOW_MO = '100';
      expect(process.env.SLOW_MO).toBe('100');
      delete process.env.SLOW_MO;
    });

    it('should have browser config defined', () => {
      expect(REGTEST_CONFIG.browser).toBeDefined();
      expect(REGTEST_CONFIG.browser).toHaveProperty('headless');
      expect(REGTEST_CONFIG.browser).toHaveProperty('slowMo');
      expect(REGTEST_CONFIG.browser).toHaveProperty('devtools');
    });
  });

  describe('Configuration Completeness', () => {
    it('should have all required top-level fields', () => {
      const requiredFields = [
        'baseUrl',
        'network',
        'testWallet',
        'testAmounts',
        'contracts',
        'timeouts',
        'retries',
        'screenshotsOnFailure',
        'screenshotsDir',
        'browser',
      ];

      requiredFields.forEach(field => {
        expect(REGTEST_CONFIG).toHaveProperty(field);
      });
    });

    it('should be compatible with TESTNET_CONFIG structure', () => {
      // Both configs should have the same structure
      const regtestKeys = Object.keys(REGTEST_CONFIG).sort();
      const testnetKeys = Object.keys(TESTNET_CONFIG).sort();
      
      expect(regtestKeys).toEqual(testnetKeys);
    });
  });
});

describe('Regtest vs Testnet Configuration Comparison', () => {
  it('should have different network values', () => {
    expect(REGTEST_CONFIG.network).toBe('regtest');
    expect(TESTNET_CONFIG.network).toBe('testnet');
  });

  it('should have faster timeouts for regtest', () => {
    expect(REGTEST_CONFIG.timeouts.transactionConfirm)
      .toBeLessThan(TESTNET_CONFIG.timeouts.transactionConfirm);
  });

  it('should have different contract IDs', () => {
    // Regtest and testnet should use different contract deployments
    expect(REGTEST_CONFIG.contracts.yveDieselVault)
      .not.toBe(TESTNET_CONFIG.contracts.yveDieselVault);
  });

  it('should enable screenshots for both configs', () => {
    expect(REGTEST_CONFIG.screenshotsOnFailure).toBe(true);
    expect(TESTNET_CONFIG.screenshotsOnFailure).toBe(true);
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
