'use client';

/**
 * Wallet Test Page
 * 
 * Test page for Alkanes wallet integration
 * Visit: http://localhost:3000/wallet-test
 */

import { useState } from 'react';
import { AlkanesWalletExample } from '@/app/components/AlkanesWalletExample';

export default function WalletTestPage() {
  const [cleared, setCleared] = useState(false);

  const clearStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      setCleared(true);
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">
          Alkanes Wallet Integration Test
        </h1>
        <p className="text-gray-600">
          Test the alkanes-rs keystore backend
        </p>
      </div>

      {/* Clear Storage Warning */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded">
        <p className="text-sm font-semibold text-yellow-900 mb-2">
          ⚠️ Getting "Invalid keystore format" error?
        </p>
        <p className="text-sm text-yellow-800 mb-3">
          Old data from previous implementation may be stored. Click below to clear:
        </p>
        <button
          onClick={clearStorage}
          disabled={cleared}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 text-sm font-medium"
        >
          {cleared ? '✅ Cleared! Refreshing...' : '🗑️ Clear All Storage & Refresh'}
        </button>
      </div>

      <AlkanesWalletExample />

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-bold text-blue-900 mb-2">
          ℹ️ Integration Status
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✅ Alkanes WASM initialized in layout</li>
          <li>✅ Wallet integration module created</li>
          <li>✅ React hook (useAlkanesWallet) available</li>
          <li>✅ Storage persistence enabled (localStorage)</li>
          <li>✅ Compatible with alkanes provider interface</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded">
        <h3 className="font-bold text-gray-900 mb-2">
          📋 Files Created
        </h3>
        <ul className="text-xs font-mono text-gray-700 space-y-1">
          <li>lib/oyl/alkanes/wallet-integration.ts</li>
          <li>hooks/useAlkanesWallet.ts</li>
          <li>app/components/AlkanesWasmInitializer.tsx</li>
          <li>app/components/AlkanesWalletExample.tsx</li>
          <li>app/layout.tsx (modified)</li>
        </ul>
      </div>
    </div>
  );
}
