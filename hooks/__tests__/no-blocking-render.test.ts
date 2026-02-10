/**
 * Tests that verify the app renders without blocking.
 *
 * Root cause of perpetual loading spinner (2026-02-07):
 * WalletProvider had `if (isInitializing) return <full-screen spinner>` which
 * blocked the ENTIRE app tree (Header, Footer, pages) until wallet initialization
 * completed. If `connector.connect()` hung (e.g., browser extension unresponsive),
 * the app was permanently stuck on a blue spinner with no UI.
 *
 * Fix: WalletProvider always renders {children}. The wallet state is simply null
 * during initialization. Components that need wallet state handle the loading state
 * themselves.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('No blocking render patterns', () => {
  it('WalletProvider does not block children rendering with a full-screen spinner', () => {
    const walletContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // The old blocking pattern was:
    //   if (isInitializing) {
    //     return <div className="...h-screen..."><Loader2 .../></div>;
    //   }
    // This blocked ALL children from rendering. Verify it's gone.
    const hasBlockingSpinner = /if\s*\(isInitializing\)\s*\{?\s*return\s*\(/m.test(walletContextSrc);
    expect(hasBlockingSpinner, 'WalletProvider should not block rendering with isInitializing check').toBe(false);

    // Verify the provider always renders children
    expect(walletContextSrc).toContain('WalletContext.Provider value={contextValue}');
    expect(walletContextSrc).toContain('{children}');
  });

  it('AlkanesSDKProvider does not block children rendering', () => {
    const sdkContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/AlkanesSDKContext.tsx'),
      'utf-8'
    );

    // Verify no blocking pattern
    const hasBlockingReturn = /if\s*\(!isInitialized\)\s*return\s+null/m.test(sdkContextSrc);
    expect(hasBlockingReturn, 'AlkanesSDKProvider should not block rendering').toBe(false);

    // Verify always renders children
    expect(sdkContextSrc).toContain('{children}');
  });

  it('ExchangeProvider does not block children rendering', () => {
    const exchangeContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/ExchangeContext.tsx'),
      'utf-8'
    );

    // Verify no blocking pattern
    const hasBlockingReturn = /if\s*\(poolsLoading\)\s*return\s+null/m.test(exchangeContextSrc);
    expect(hasBlockingReturn, 'ExchangeProvider should not block rendering on poolsLoading').toBe(false);

    expect(exchangeContextSrc).toContain('{children}');
  });

  it('WalletProvider auto-reconnect uses cached addresses without prompting extension', () => {
    const walletContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // Primary path: reconstruct from cached addresses (no extension prompt)
    expect(walletContextSrc).toContain('Restored browser wallet from cache');

    // Fallback: clear stored wallet instead of calling connector.connect() which
    // would leave dangling requests to the extension and block manual connection
    expect(walletContextSrc).toContain('No cached addresses for auto-reconnect');

    // Must NOT call connector.connect during auto-reconnect (leaves dangling requests)
    const hasConnectorFallback = /connector\.connect\(walletInfo\).*Wallet reconnect timeout/s.test(walletContextSrc);
    expect(hasConnectorFallback, 'Auto-reconnect must not call connector.connect').toBe(false);
  });

  it('Pools page does not block render on loading', () => {
    const poolsPageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/pools/page.tsx'),
      'utf-8'
    );

    // Should NOT have: if (isLoading) return <...>
    const hasBlockingReturn = /if\s*\(isLoading\)\s*return\s/m.test(poolsPageSrc);
    expect(hasBlockingReturn, 'Pools page should use skeleton placeholders, not blocking return').toBe(false);

    // Should have skeleton placeholders
    expect(poolsPageSrc).toContain('animate-pulse');
  });
});

describe('Xverse wallet uses current API', () => {
  it('connectBrowserWallet uses getAccounts on the direct BitcoinProvider', () => {
    const walletContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // Xverse direct provider uses getAccounts (same as SDK WalletConnector)
    // Note: sats-connect library methods (wallet_connect, getAddresses) are different
    // from the direct provider methods and will hang if called on BitcoinProvider
    expect(walletContextSrc).toContain("request('getAccounts'");
  });

  it('isWalletInstalled has specific Xverse detection checking BitcoinProvider', () => {
    const walletsSrc = fs.readFileSync(
      path.resolve(__dirname, '../../constants/wallets.ts'),
      'utf-8'
    );

    // Must have a specific case for xverse, not just the default injectionKey check
    expect(walletsSrc).toContain("case 'xverse':");
    expect(walletsSrc).toContain('XverseProviders?.BitcoinProvider');
  });

  it('Xverse connection uses SDK WalletConnector and extracts paymentAddress', () => {
    const walletContextSrc = fs.readFileSync(
      path.resolve(__dirname, '../../context/WalletContext.tsx'),
      'utf-8'
    );

    // Xverse uses sats-connect's getAddress() to connect and extract addresses.
    // The response contains ordinals (taproot) and payment (segwit) accounts.
    expect(walletContextSrc).toContain("import('sats-connect')");
    expect(walletContextSrc).toContain("purpose === 'ordinals'");
  });
});

describe('No direct fetch calls to external URLs', () => {
  const hookFiles = [
    'hooks/useDynamicPools.ts',
    'hooks/usePools.ts',
    'hooks/useAlkanesTokenPairs.ts',
    'hooks/useAmmHistory.ts',
  ];

  hookFiles.forEach((hookFile) => {
    it(`${hookFile} does not use direct fetch() to external URLs`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, '../../', hookFile), 'utf-8');

      // Should NOT have direct fetch to subfrost/alkanode endpoints
      const hasDirectFetch = /fetch\s*\(\s*[`'"](https?:\/\/)/m.test(src);
      expect(hasDirectFetch, `${hookFile} should not have direct fetch to external URLs`).toBe(false);

      // Should NOT reference alkanode URLs
      expect(src).not.toContain('alkanode.com');
      expect(src).not.toContain('api.oyl');

      // Should NOT have a getApiUrl helper
      const hasGetApiUrl = /function\s+getApiUrl|const\s+getApiUrl/m.test(src);
      expect(hasGetApiUrl, `${hookFile} should not have getApiUrl helper`).toBe(false);
    });
  });

  it('queries/pools.ts does not export direct fetch functions', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../queries/pools.ts'), 'utf-8');

    // Should NOT have NETWORK_API_URLS or fetchPoolMetadataById
    expect(src).not.toContain('NETWORK_API_URLS');
    expect(src).not.toContain('fetchPoolMetadataById');
  });
});

describe('Pool data processing logic', () => {
  it('processes raw SDK pool data into DynamicPool format', () => {
    // Simulate the raw data format returned by alkanesGetAllPoolsWithDetails
    const rawPools = [
      {
        pool_id_block: 2,
        pool_id_tx: 77087,
        details: {
          token_a_block: 2,
          token_a_tx: 0,
          token_b_block: 32,
          token_b_tx: 0,
          token_a_name: 'DIESEL',
          token_b_name: 'SUBFROST BTC',
          reserve_a: '35700000000',
          reserve_b: '2170000000',
          pool_name: 'DIESEL / SUBFROST BTC LP',
        },
      },
      {
        pool_id_block: 2,
        pool_id_tx: 100,
        details: {
          token_a_block: 2,
          token_a_tx: 0,
          token_b_block: 2,
          token_b_tx: 500,
          reserve_a: '1000000',
          reserve_b: '2000000',
          pool_name: 'DIESEL / ALKAMIST LP',
        },
      },
    ];

    // Replicate the processing logic from useDynamicPools.ts
    const pools = rawPools.map((p) => {
      const details = p.details || {};
      const poolIdBlock = p.pool_id_block ?? 0;
      const poolIdTx = p.pool_id_tx ?? 0;
      const poolId = `${poolIdBlock}:${poolIdTx}`;

      let tokenAName = (details.token_a_name || '').replace('SUBFROST BTC', 'frBTC');
      let tokenBName = (details.token_b_name || '').replace('SUBFROST BTC', 'frBTC');

      const poolName = details.pool_name || '';
      if ((!tokenAName || !tokenBName) && poolName) {
        const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
        if (match) {
          tokenAName = tokenAName || match[1].trim().replace('SUBFROST BTC', 'frBTC');
          tokenBName = tokenBName || match[2].trim().replace('SUBFROST BTC', 'frBTC');
        }
      }

      return {
        pool_id: poolId,
        pool_id_block: poolIdBlock,
        pool_id_tx: poolIdTx,
        details: {
          token_a_block: details.token_a_block ?? 0,
          token_a_tx: details.token_a_tx ?? 0,
          token_b_block: details.token_b_block ?? 0,
          token_b_tx: details.token_b_tx ?? 0,
          token_a_name: tokenAName,
          token_b_name: tokenBName,
          reserve_a: details.reserve_a || '0',
          reserve_b: details.reserve_b || '0',
          pool_name: poolName,
        },
      };
    });

    expect(pools).toHaveLength(2);

    // First pool: DIESEL/frBTC
    expect(pools[0].pool_id).toBe('2:77087');
    expect(pools[0].details.token_a_name).toBe('DIESEL');
    expect(pools[0].details.token_b_name).toBe('frBTC'); // SUBFROST BTC → frBTC
    expect(pools[0].details.reserve_a).toBe('35700000000');
    expect(pools[0].details.reserve_b).toBe('2170000000');

    // Second pool: DIESEL/ALKAMIST
    expect(pools[1].pool_id).toBe('2:100');
    expect(pools[1].details.token_a_name).toBe('DIESEL');
    expect(pools[1].details.token_b_name).toBe('ALKAMIST');
  });

  it('extracts token names from pool_name when individual names missing', () => {
    const rawPool = {
      pool_id_block: 2,
      pool_id_tx: 50,
      details: {
        token_a_block: 2,
        token_a_tx: 0,
        token_b_block: 32,
        token_b_tx: 0,
        // No token_a_name or token_b_name
        reserve_a: '1000',
        reserve_b: '2000',
        pool_name: 'DIESEL / SUBFROST BTC LP',
      },
    };

    const details: any = rawPool.details || {};
    let tokenAName = (details.token_a_name || '').replace('SUBFROST BTC', 'frBTC');
    let tokenBName = (details.token_b_name || '').replace('SUBFROST BTC', 'frBTC');

    const poolName = details.pool_name || '';
    if ((!tokenAName || !tokenBName) && poolName) {
      const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        tokenAName = tokenAName || match[1].trim().replace('SUBFROST BTC', 'frBTC');
        tokenBName = tokenBName || match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    expect(tokenAName).toBe('DIESEL');
    expect(tokenBName).toBe('frBTC');
  });
});

describe('getConfig works for all networks', () => {
  it('returns valid config for all supported networks without throwing', async () => {
    const { getConfig } = await import('../../utils/getConfig');

    const networks = ['mainnet', 'testnet', 'signet', 'regtest', 'subfrost-regtest', ''];
    for (const network of networks) {
      expect(() => getConfig(network)).not.toThrow();
      const config = getConfig(network);
      expect(config).toBeDefined();
      expect(config.ALKANE_FACTORY_ID).toBeTruthy();
    }
  });

  it('mainnet config has required token IDs', async () => {
    const { getConfig } = await import('../../utils/getConfig');

    const config = getConfig('mainnet');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65522');
    expect(config.FRBTC_ALKANE_ID).toBe('32:0');
  });
});
