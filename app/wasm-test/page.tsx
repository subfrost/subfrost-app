'use client';

/**
 * WASM Test Page
 *
 * Test page for alkanes-web-sys WASM integration
 * Verifies that alkanes-cli functions can be properly invoked via WASM
 *
 * Visit: http://localhost:3000/wasm-test
 */

import { useState, useEffect, useCallback } from 'react';

// Types for the WASM module
interface WasmModule {
  WebProvider: new (provider: string, config?: object | null) => WebProviderInstance;
  analyze_psbt: (psbt_base64: string) => string;
  get_subfrost_address: (network: string) => Promise<string>;
  get_frbtc_total_supply: (network: string) => Promise<string>;
  get_pending_unwraps: (network: string, confirmations: bigint) => Promise<string>;
  wrap_btc: (network: string, params_json: string) => Promise<string>;
  get_alkane_bytecode: (network: string, block: number, tx: number, block_tag: string) => Promise<string>;
  simulate_alkane_call: (alkane_id_str: string, wasm_hex: string, cellpack_hex: string) => Promise<string>;
}

interface WebProviderInstance {
  sandshrew_rpc_url: () => string;
  esplora_rpc_url: () => string | undefined;
  bitcoin_rpc_url: () => string;
  esploraGetBlocksTipHeight: () => Promise<number>;
  alkanesBalance: (address?: string | null) => Promise<object>;
  alkanesSequence: (block_tag?: string | null) => Promise<object>;
  getSubfrostAddress: () => Promise<string>;
  getFrbtcTotalSupply: () => Promise<string>;
}

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
}

export default function WasmTestPage() {
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [wasmModule, setWasmModule] = useState<WasmModule | null>(null);
  const [provider, setProvider] = useState<WebProviderInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [network, setNetwork] = useState('regtest');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Add a log entry
  const log = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
      info: '  ',
      success: '  ',
      error: '  ',
      warn: '  '
    }[type];
    const logMessage = `[${timestamp}] ${prefix} ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  }, []);

  // Load the WASM module
  useEffect(() => {
    async function loadWasm() {
      try {
        log('Loading alkanes-web-sys WASM module...');

        // Dynamic import of the WASM module from public directory
        // The WASM files are copied to /public/wasm/ from alkanes-web-sys/pkg/
        // @ts-expect-error - Dynamic import from public folder at runtime
        const wasm = await import(/* webpackIgnore: true */ '/wasm/alkanes_web_sys.js');

        // Initialize the WASM module
        log('Initializing WASM module...');
        await wasm.default();

        log('WASM module loaded successfully!', 'success');
        setWasmModule(wasm as unknown as WasmModule);
        setWasmLoaded(true);

        // Create a WebProvider for the selected network
        log(`Creating WebProvider for ${network}...`);
        const providerInstance = new wasm.WebProvider(network);
        setProvider(providerInstance);
        log(`WebProvider created for ${network}`, 'success');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Failed to load WASM module: ${errorMessage}`, 'error');
        setLoadError(errorMessage);
      }
    }

    loadWasm();
  }, [network, log]);

  // Update a test result
  const updateTestResult = useCallback((name: string, updates: Partial<TestResult>) => {
    setTestResults(prev => prev.map(r =>
      r.name === name ? { ...r, ...updates } : r
    ));
  }, []);

  // Run a single test
  const runTest = useCallback(async (
    name: string,
    testFn: () => Promise<string>
  ) => {
    updateTestResult(name, { status: 'running' });
    const startTime = performance.now();

    try {
      log(`Running test: ${name}...`);
      const result = await testFn();
      const duration = Math.round(performance.now() - startTime);

      log(`Test "${name}" passed in ${duration}ms`, 'success');
      updateTestResult(name, {
        status: 'success',
        result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        duration
      });
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : String(error);

      log(`Test "${name}" failed: ${errorMessage}`, 'error');
      updateTestResult(name, {
        status: 'error',
        error: errorMessage,
        duration
      });
    }
  }, [log, updateTestResult]);

  // Run all tests
  const runAllTests = useCallback(async () => {
    if (!wasmModule || !provider) {
      log('WASM module or provider not loaded', 'error');
      return;
    }

    log('='.repeat(50));
    log('Starting alkanes-web-sys WASM tests...');
    log('='.repeat(50));

    // Initialize test results
    const tests: TestResult[] = [
      { name: 'WebProvider URLs', status: 'pending' },
      { name: 'Esplora Block Height', status: 'pending' },
      { name: 'Alkanes Sequence', status: 'pending' },
      { name: 'Get Subfrost Address', status: 'pending' },
      { name: 'Get frBTC Total Supply', status: 'pending' },
      { name: 'Alkanes Balance', status: 'pending' },
    ];
    setTestResults(tests);

    // Test 1: WebProvider URLs (sync)
    await runTest('WebProvider URLs', async () => {
      const urls = {
        sandshrew: provider.sandshrew_rpc_url(),
        esplora: provider.esplora_rpc_url(),
        bitcoin: provider.bitcoin_rpc_url(),
      };
      return JSON.stringify(urls, null, 2);
    });

    // Test 2: Esplora Block Height
    await runTest('Esplora Block Height', async () => {
      const height = await provider.esploraGetBlocksTipHeight();
      return `Block height: ${height}`;
    });

    // Test 3: Alkanes Sequence
    await runTest('Alkanes Sequence', async () => {
      const sequence = await provider.alkanesSequence();
      return JSON.stringify(sequence, null, 2);
    });

    // Test 4: Get Subfrost Address
    await runTest('Get Subfrost Address', async () => {
      const address = await provider.getSubfrostAddress();
      return `Subfrost address: ${address}`;
    });

    // Test 5: Get frBTC Total Supply
    await runTest('Get frBTC Total Supply', async () => {
      const supply = await provider.getFrbtcTotalSupply();
      return `Total supply: ${supply} sats`;
    });

    // Test 6: Alkanes Balance (for a test address)
    await runTest('Alkanes Balance', async () => {
      const balance = await provider.alkanesBalance();
      return JSON.stringify(balance, null, 2);
    });

    log('='.repeat(50));
    log('All tests completed!');
    log('='.repeat(50));
  }, [wasmModule, provider, log, runTest]);

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
    setTestResults([]);
  };

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">
          Alkanes Web-Sys WASM Test
        </h1>
        <p className="text-gray-600">
          Test page for verifying alkanes-cli functions work correctly via WASM
        </p>
      </div>

      {/* Status Section */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
        <h2 className="font-bold text-lg mb-3">WASM Module Status</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-medium">WASM Loaded:</span>{' '}
            {wasmLoaded ? (
              <span className="text-green-600">Yes</span>
            ) : loadError ? (
              <span className="text-red-600">Error</span>
            ) : (
              <span className="text-yellow-600">Loading...</span>
            )}
          </div>
          <div>
            <span className="font-medium">Network:</span>{' '}
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="ml-2 border rounded px-2 py-1"
            >
              <option value="regtest">Regtest</option>
              <option value="signet">Signet</option>
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div>
            <span className="font-medium">Provider Ready:</span>{' '}
            {provider ? (
              <span className="text-green-600">Yes</span>
            ) : (
              <span className="text-yellow-600">No</span>
            )}
          </div>
        </div>
        {loadError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <strong>Error:</strong> {loadError}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={runAllTests}
          disabled={!wasmLoaded || !provider}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 font-medium"
        >
          Run All Tests
        </button>
        <button
          onClick={clearLogs}
          className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 font-medium"
        >
          Clear Logs
        </button>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="mb-6">
          <h2 className="font-bold text-lg mb-3">Test Results</h2>
          <div className="space-y-2">
            {testResults.map((test) => (
              <div
                key={test.name}
                className={`p-3 rounded border ${
                  test.status === 'success'
                    ? 'bg-green-50 border-green-200'
                    : test.status === 'error'
                    ? 'bg-red-50 border-red-200'
                    : test.status === 'running'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{test.name}</span>
                  <span className="text-sm">
                    {test.status === 'success' && `${test.duration}ms`}
                    {test.status === 'running' && 'Running...'}
                    {test.status === 'pending' && 'Pending'}
                    {test.status === 'error' && 'Failed'}
                  </span>
                </div>
                {test.result && (
                  <pre className="mt-2 text-xs bg-white p-2 rounded overflow-x-auto">
                    {test.result}
                  </pre>
                )}
                {test.error && (
                  <div className="mt-2 text-sm text-red-600">
                    {test.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Console Output */}
      <div className="mb-6">
        <h2 className="font-bold text-lg mb-3">Console Output</h2>
        <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-gray-500">No logs yet. Run tests to see output.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-bold text-blue-900 mb-2">Instructions</h3>
        <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1">
          <li>Make sure the WASM module is loaded (check status above)</li>
          <li>Select the network you want to test against</li>
          <li>Click &quot;Run All Tests&quot; to execute the test suite</li>
          <li>Open browser DevTools (F12) to see detailed console logs</li>
          <li>Check test results to verify alkanes-cli functions work correctly</li>
        </ol>
      </div>

      {/* Technical Info */}
      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded">
        <h3 className="font-bold text-gray-900 mb-2">Technical Details</h3>
        <ul className="text-xs font-mono text-gray-700 space-y-1">
          <li>WASM Source: alkanes-rs/crates/alkanes-web-sys</li>
          <li>WASM Binary: alkanes_web_sys_bg.wasm (~5MB)</li>
          <li>Exposed Functions: WebProvider class + utility functions</li>
          <li>alkanes-cli-common integration: via wasm-bindgen</li>
        </ul>
      </div>
    </div>
  );
}
