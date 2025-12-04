'use client';

import { useState } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function TestFuturePage() {
  const { provider, isInitialized, network } = useAlkanesSDK();
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testGenerateFuture = async () => {
    setLoading(true);
    setResult('Generating future via WASM provider...');

    try {
      if (!provider || !isInitialized) {
        throw new Error('Provider not initialized');
      }

      // Only allow on regtest networks
      if (network !== 'regtest' && network !== 'subfrost-regtest' && network !== 'oylnet') {
        throw new Error('Generate future is only available on regtest networks');
      }

      // Use WASM provider's bitcoind generate future method
      const blockHash = await provider.bitcoindGenerateFuture('');

      setResult(JSON.stringify({ success: true, blockHash }, null, 2));
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Test Future Generation (WASM)</h1>

      <div style={{ marginBottom: '10px', color: '#888' }}>
        Network: {network} | Provider: {isInitialized ? 'Ready' : 'Initializing...'}
      </div>

      <button
        onClick={testGenerateFuture}
        disabled={loading || !isInitialized}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading || !isInitialized ? 'not-allowed' : 'pointer',
          opacity: loading || !isInitialized ? 0.5 : 1,
        }}
      >
        {loading ? 'Generating...' : 'Generate Future Block'}
      </button>

      <div style={{ marginTop: '20px' }}>
        <h3>Result:</h3>
        <pre style={{
          backgroundColor: '#f5f5f5',
          padding: '15px',
          borderRadius: '5px',
          overflow: 'auto',
          color: '#333',
        }}>
          {result || 'Click button to test'}
        </pre>
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>This page tests the WASM WebProvider's bitcoindGenerateFuture method.</p>
        <p>Only works on regtest networks (subfrost-regtest, regtest, oylnet).</p>
      </div>
    </div>
  );
}
