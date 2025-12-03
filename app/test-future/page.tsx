'use client';

import { useState } from 'react';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function TestFuturePage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testAPI = async () => {
    setLoading(true);
    setResult('Calling API...');
    
    try {
      const response = await fetch('/api/futures/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const data = await response.json();
      
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Test Future Generation API</h1>
      
      <button
        onClick={testAPI}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Calling...' : 'Test Generate Future API'}
      </button>

      <div style={{ marginTop: '20px' }}>
        <h3>Result:</h3>
        <pre style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '15px', 
          borderRadius: '5px',
          overflow: 'auto',
        }}>
          {result || 'Click button to test'}
        </pre>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>This page directly tests the /api/futures/generate endpoint.</p>
        <p>If this works but the Futures page doesn't, there's a caching issue.</p>
      </div>
    </div>
  );
}
