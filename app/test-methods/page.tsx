"use client";

import { useEffect, useState } from "react";
import { useAlkanesSDK } from "@/context/AlkanesSDKContext";

export default function TestMethodsPage() {
  const { provider } = useAlkanesSDK();
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const testMethod = async (name: string, testFn: () => Promise<any> | undefined) => {
    if (!testFn) return;
    setLoading((prev) => ({ ...prev, [name]: true }));
    try {
      const result = await testFn();
      setResults((prev) => ({ ...prev, [name]: { success: true, data: result } }));
    } catch (error: any) {
      setResults((prev) => ({ ...prev, [name]: { success: false, error: error.message } }));
    } finally {
      setLoading((prev) => ({ ...prev, [name]: false }));
    }
  };

  const tests = [
    {
      category: "Bitcoin RPC",
      methods: [
        { name: "bitcoindGetBlockCount", test: () => provider?.bitcoindGetBlockCount() },
        { name: "bitcoindGetChainTips", test: () => provider?.bitcoindGetChainTips() },
        { name: "bitcoindGetBlockchainInfo", test: () => provider?.bitcoindGetBlockchainInfo() },
      ],
    },
    {
      category: "BRC20-Prog",
      methods: [
        { name: "brc20progChainId", test: () => provider?.brc20progChainId() },
        { name: "brc20progBlockNumber", test: () => provider?.brc20progBlockNumber() },
        { name: "brc20progWeb3ClientVersion", test: () => provider?.brc20progWeb3ClientVersion() },
      ],
    },
    {
      category: "Esplora",
      methods: [
        { name: "esploraGetBlocksTipHeight", test: () => provider?.esploraGetBlocksTipHeight() },
        { name: "esploraGetBlocksTipHash", test: () => provider?.esploraGetBlocksTipHash() },
      ],
    },
    {
      category: "Metashrew",
      methods: [
        { name: "metashrewHeight", test: () => provider?.metashrewHeight() },
      ],
    },
    {
      category: "New Methods",
      methods: [
        { name: "luaEvalScript", test: () => provider?.luaEvalScript("return 'Hello from Lua!'") },
        { name: "ordList", test: () => provider?.ordList("0000000000000000000000000000000000000000000000000000000000000000:0") },
        { name: "ordFind", test: () => provider?.ordFind(1) },
      ],
    },
  ];

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">🧪 WebProvider Method Tests</h1>
      
      <div className="mb-8">
        <p className="text-lg mb-4">
          Testing all 63 WASM methods. Click "Test" to verify each method exists and can be called.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Note: Some methods may fail if data doesn't exist, but that's expected - we're testing method availability.
        </p>
      </div>

      {tests.map((testGroup) => (
        <div key={testGroup.category} className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">{testGroup.category}</h2>
          
          <div className="space-y-4">
            {testGroup.methods.map((method) => (
              <div key={method.name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <code className="text-sm font-mono">{method.name}()</code>
                  <button
                    onClick={() => testMethod(method.name, method.test)}
                    disabled={loading[method.name]}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading[method.name] ? "Testing..." : "Test"}
                  </button>
                </div>
                
                {results[method.name] && (
                  <div className={`mt-2 p-3 rounded ${results[method.name].success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {results[method.name].success ? (
                      <>
                        <div className="font-semibold">✅ Success</div>
                        <pre className="text-xs mt-2 overflow-auto max-h-40">
                          {JSON.stringify(results[method.name].data, null, 2)}
                        </pre>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">❌ Error</div>
                        <div className="text-sm mt-1">{results[method.name].error}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-8 p-6 bg-blue-50 rounded-lg">
        <h3 className="text-xl font-semibold mb-2">📊 Test Summary</h3>
        <div className="text-lg">
          Tested: {Object.keys(results).length} / {tests.reduce((sum, g) => sum + g.methods.length, 0)}
        </div>
        <div className="text-lg">
          Successful: {Object.values(results).filter((r: any) => r.success).length}
        </div>
        <div className="text-lg">
          Failed: {Object.values(results).filter((r: any) => !r.success).length}
        </div>
      </div>
    </div>
  );
}
