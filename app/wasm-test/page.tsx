'use client';

import { useState, useEffect } from 'react';

// Disable static generation for this page since it uses WASM
export const dynamic = 'force-dynamic';

export default function WasmTestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [wasmModule, setWasmModule] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
    console.log(message);
  };

  const testWasmInit = async () => {
    try {
      addLog('Starting WASM import...');
      
      // Import WASM module
      const wasm = await import('@alkanes/ts-sdk/wasm');
      addLog('WASM module imported successfully');
      addLog(`WASM module keys: ${Object.keys(wasm).join(', ')}`);
      addLog(`Default export type: ${typeof wasm.default}`);
      
      setWasmModule(wasm);

      // Try to call default export if it's a function
      if (typeof wasm.default === 'function') {
        // Note: wasm.default() is not a function in this WASM module
        addLog('✅ WASM module loaded (no init function needed)');
      } else {
        addLog(`Default is not a function, it's: ${wasm.default}`);
      }

      // Check for init function (using type assertion)
      const wasmAny = wasm as any;
      if (typeof wasmAny.init === 'function') {
        addLog('Calling wasm.init()...');
        try {
          await wasmAny.init();
          addLog('✅ wasm.init() completed successfully');
        } catch (err) {
          addLog(`⚠️ wasm.init() failed: ${err}`);
        }
      }

      // Check for WebProvider
      if (wasmAny.WebProvider) {
        addLog(`WebProvider found: ${typeof wasmAny.WebProvider}`);
        
        // Try to create an instance
        try {
          const providerInstance = new wasmAny.WebProvider(
            'https://signet.subfrost.io/v4/subfrost',
            'https://signet.subfrost.io/v4/subfrost'
          );
          addLog('✅ WebProvider instance created');
          addLog(`Provider methods: ${Object.keys(providerInstance).slice(0, 10).join(', ')}...`);
          setProvider(providerInstance);

          // Try a simple call
          try {
            addLog('Testing provider.get_network()...');
            const network = await providerInstance.get_network();
            addLog(`✅ Network: ${network}`);
          } catch (err) {
            addLog(`⚠️ get_network() failed: ${err}`);
          }
        } catch (err) {
          addLog(`❌ Failed to create WebProvider: ${err}`);
          throw err;
        }
      } else {
        addLog('❌ WebProvider not found in WASM module');
      }

      addLog('🎉 All tests completed');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addLog(`❌ Error: ${errorMsg}`);
      setError(errorMsg);
      console.error('Full error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-4">
          WASM Initialization Test
        </h1>
        
        <div className="mb-6">
          <button
            onClick={testWasmInit}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Test WASM Initialization
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
            <h2 className="text-red-400 font-bold mb-2">Error</h2>
            <pre className="text-red-300 text-sm whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Console Log</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-400 italic">No logs yet. Click the button to start testing.</p>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className="text-sm font-mono text-gray-300 p-2 bg-gray-900 rounded"
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {wasmModule && (
          <div className="mt-6 bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">WASM Module Info</h2>
            <div className="text-sm text-gray-300 space-y-2">
              <div>
                <span className="font-bold">Available exports:</span>
                <pre className="mt-2 p-2 bg-gray-900 rounded overflow-x-auto">
                  {JSON.stringify(Object.keys(wasmModule), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {provider && (
          <div className="mt-6 bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Provider Info</h2>
            <div className="text-sm text-gray-300 space-y-2">
              <div>
                <span className="font-bold">Provider methods (first 20):</span>
                <pre className="mt-2 p-2 bg-gray-900 rounded overflow-x-auto">
                  {JSON.stringify(
                    Object.keys(provider).slice(0, 20),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
