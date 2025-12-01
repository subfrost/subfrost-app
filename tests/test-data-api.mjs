// Comprehensive Data API test suite
import { WebProvider } from '../ts-sdk/build/wasm/alkanes_web_sys.js';

const tests = [
  {
    name: 'get-pools',
    fn: (p) => p.dataApiGetPools('4:0'),
    args: ['factory: 4:0'],
    description: 'Get all pools for AMM factory'
  },
  {
    name: 'get-pool-history',
    fn: (p) => p.dataApiGetPoolHistory('2:3', null, 10n, 0n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get pool history (all categories)'
  },
  {
    name: 'get-all-history',
    fn: (p) => p.dataApiGetAllHistory('2:3', 10n, 0n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get all pool events'
  },
  {
    name: 'get-swap-history',
    fn: (p) => p.dataApiGetSwapHistory('2:3', 10n, 0n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get swap events only'
  },
  {
    name: 'get-mint-history',
    fn: (p) => p.dataApiGetMintHistory('2:3', 10n, 0n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get mint/add liquidity events'
  },
  {
    name: 'get-burn-history',
    fn: (p) => p.dataApiGetBurnHistory('2:3', 10n, 0n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get burn/remove liquidity events'
  },
  {
    name: 'get-reserves',
    fn: (p) => p.dataApiGetReserves('2:3'),
    args: ['pool: 2:3'],
    description: 'Get current pool reserves'
  },
  {
    name: 'get-trades',
    fn: (p) => p.dataApiGetTrades('2:3', null, null, 10n),
    args: ['pool: 2:3', 'limit: 10'],
    description: 'Get trade data'
  },
  {
    name: 'get-candles',
    fn: (p) => p.dataApiGetCandles('2:3', '1h', null, null, 24n),
    args: ['pool: 2:3', 'interval: 1h', 'limit: 24'],
    description: 'Get OHLCV candle data'
  },
  {
    name: 'get-holders',
    fn: (p) => p.dataApiGetHolders('2:3', 0n, 10n),
    args: ['alkane: 2:3', 'page: 0', 'limit: 10'],
    description: 'Get token holders'
  },
  {
    name: 'get-holders-count',
    fn: (p) => p.dataApiGetHoldersCount('2:3'),
    args: ['alkane: 2:3'],
    description: 'Get total holder count'
  },
  {
    name: 'get-keys',
    fn: (p) => p.dataApiGetKeys('2:3', null, 10n),
    args: ['alkane: 2:3', 'limit: 10'],
    description: 'Get contract storage keys'
  },
  {
    name: 'get-bitcoin-price',
    fn: (p) => p.dataApiGetBitcoinPrice(),
    args: [],
    description: 'Get current Bitcoin price'
  },
  {
    name: 'get-bitcoin-market-chart',
    fn: (p) => p.dataApiGetBitcoinMarketChart('7'),
    args: ['days: 7'],
    description: 'Get 7-day BTC price history'
  },
];

async function runTests() {
  console.log('🧪 Testing Data API Routes');
  console.log('Network: regtest.subfrost.io');
  console.log('='.repeat(70) + '\n');
  
  const provider = new WebProvider('subfrost-regtest', null);
  let passed = 0;
  let failed = 0;
  const failures = [];
  const successes = [];
  
  for (const test of tests) {
    process.stdout.write(`Testing ${test.name.padEnd(30)} `);
    
    try {
      const startTime = Date.now();
      const result = await test.fn(provider);
      const duration = Date.now() - startTime;
      
      console.log(`✅ PASS (${duration}ms)`);
      passed++;
      successes.push({
        test: test.name,
        duration,
        result: typeof result === 'object' ? JSON.stringify(result).substring(0, 100) : String(result)
      });
    } catch (error) {
      console.log(`❌ FAIL`);
      failed++;
      failures.push({
        test: test.name,
        error: error.message,
        args: test.args,
        description: test.description
      });
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed out of ${tests.length} total`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  
  if (successes.length > 0) {
    console.log('\n✅ Successful Tests:');
    successes.forEach(s => {
      console.log(`  ${s.test} - ${s.duration}ms`);
    });
  }
  
  if (failures.length > 0) {
    console.log('\n❌ Failed Tests:');
    failures.forEach(f => {
      console.log(`\n  Test: ${f.test}`);
      console.log(`  Description: ${f.description}`);
      console.log(`  Args: ${f.args.join(', ')}`);
      console.log(`  Error: ${f.error}`);
    });
    
    console.log('\n💡 Troubleshooting:');
    console.log('  1. Verify Data API is running: curl https://regtest.subfrost.io/v4/dataapi/health');
    console.log('  2. Check if data exists for pool 2:3');
    console.log('  3. Verify the indexer has synced recent blocks');
    console.log('  4. Test individual endpoints with curl');
  }
  
  console.log('\n' + '='.repeat(70));
  
  if (failed === 0) {
    console.log('🎉 All Data API routes working correctly!');
  } else {
    console.log(`⚠️  ${failed} route(s) need attention`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

console.log('Starting Data API test suite...\n');
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
