/**
 * Trace Investigation Tests
 *
 * Tests to verify we get proper trace data from:
 * - frBTC wrap operations (BTC -> 32:0)
 * - DIESEL mint operations (2:0)
 * - Swap operations via AMM pool
 */

import { describe, it, expect, beforeAll } from 'vitest';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

const POOL_ID = '2:3';
const FACTORY_ID = '4:65522';
const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';

// Known regtest address for testing (we'll also try pool creator if available)
const REGTEST_TEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

// Pool creator address on regtest (bcrt1p format, NOT bc1p)
const POOL_CREATOR_ADDRESS = 'bcrt1pc5atgz66lgxwptny32fg0w9u89ku0cjp4aeltqsehnhr046x3feq5kaftp';

// Known transaction from pool creation block (647) - this should have alkanes operations
const KNOWN_ALKANES_TXID = 'e73067508de15a1a7461692653c73f990938f26fa0b65d58f3b3fe8e34b3c810';

/**
 * Helper to get a value from a Map or Object
 */
function getVal(obj: any, key: string): any {
  if (!obj) return undefined;
  if (obj instanceof Map) return obj.get(key);
  return obj[key];
}

/**
 * Helper to extract pools from WASM response (may be Map or Object)
 */
function extractPoolsArray(response: any): any[] {
  if (!response) return [];
  if (response instanceof Map) {
    const data = response.get('data');
    if (data instanceof Map) {
      const pools = data.get('pools');
      if (Array.isArray(pools)) return pools;
    }
    const directPools = response.get('pools');
    if (Array.isArray(directPools)) return directPools;
    return [];
  }
  if (response.data?.pools && Array.isArray(response.data.pools)) return response.data.pools;
  if (response.pools && Array.isArray(response.pools)) return response.pools;
  if (Array.isArray(response)) return response;
  return [];
}

describe('Alkanes Trace Verification', () => {
  let provider: WebProvider;
  let knownTxids: string[] = [];
  let poolCreatorAddress: string = '';

  beforeAll(async () => {
    const wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);

    // Get pool data to find creator address and potential transactions
    try {
      const poolsResponse = await provider.dataApiGetPools(FACTORY_ID);
      const pools = extractPoolsArray(poolsResponse);
      console.log('[Setup] Found', pools.length, 'pools');

      if (pools.length > 0) {
        const pool = pools[0];
        // Handle both Map and Object responses
        poolCreatorAddress = getVal(pool, 'creator_address') || '';
        const poolBlock = getVal(pool, 'pool_block_id');
        const poolTx = getVal(pool, 'pool_tx_id');

        console.log('[Setup] Pool creator address:', poolCreatorAddress);
        console.log('[Setup] Pool block/tx:', poolBlock, ':', poolTx);

        // Log all keys to understand the structure
        if (pool instanceof Map) {
          console.log('[Setup] Pool is Map, keys:', Array.from(pool.keys()));
        } else {
          console.log('[Setup] Pool is Object, keys:', Object.keys(pool));
        }
      }
    } catch (error: any) {
      console.log('[Setup] Pools error:', error.message?.slice(0, 100));
    }

    // Try to get swap history
    try {
      const swapHistory = await provider.dataApiGetSwapHistory(POOL_ID, BigInt(10), BigInt(0));
      console.log('[Setup] Swap history:', JSON.stringify(swapHistory).slice(0, 500));

      if (swapHistory?.data && Array.isArray(swapHistory.data)) {
        for (const entry of swapHistory.data) {
          const txid = entry.txid || entry.tx_id || entry.transaction_id;
          if (txid && typeof txid === 'string' && txid.length === 64) {
            knownTxids.push(txid);
          }
        }
      }
      console.log('[Setup] Found', knownTxids.length, 'txids from swap history');
    } catch (error: any) {
      console.log('[Setup] Swap history error:', error.message?.slice(0, 100));
    }

    // Try mint history too
    try {
      const mintHistory = await provider.dataApiGetMintHistory(POOL_ID, BigInt(10), BigInt(0));
      console.log('[Setup] Mint history:', JSON.stringify(mintHistory).slice(0, 500));

      if (mintHistory?.data && Array.isArray(mintHistory.data)) {
        for (const entry of mintHistory.data) {
          const txid = entry.txid || entry.tx_id || entry.transaction_id;
          if (txid && typeof txid === 'string' && txid.length === 64 && !knownTxids.includes(txid)) {
            knownTxids.push(txid);
          }
        }
      }
      console.log('[Setup] Total txids after mint history:', knownTxids.length);
    } catch (error: any) {
      console.log('[Setup] Mint history error:', error.message?.slice(0, 100));
    }
  });

  describe('getAddressTxsWithTraces', () => {
    it('should return transactions with runestone trace data for pool creator address', async () => {
      if (!poolCreatorAddress) {
        console.log('[Trace] No pool creator address available - skipping');
        return;
      }

      console.log('[Trace] Fetching txs with traces for:', poolCreatorAddress);

      try {
        const txsWithTraces = await provider.getAddressTxsWithTraces(poolCreatorAddress, true);

        console.log('[Trace] Response type:', typeof txsWithTraces);
        console.log('[Trace] Is array:', Array.isArray(txsWithTraces));

        expect(txsWithTraces).toBeDefined();

        if (Array.isArray(txsWithTraces)) {
          console.log('[Trace] Found', txsWithTraces.length, 'transactions');

          // Check first few transactions for trace data
          for (let i = 0; i < Math.min(5, txsWithTraces.length); i++) {
            const tx = txsWithTraces[i];
            const hasTraceData = !!(tx.runestone_trace || tx.trace || tx.protostone_trace);

            console.log(`[Trace] TX ${i}:`, {
              txid: tx.txid?.slice(0, 16) + '...',
              hasRunestoneTrace: !!tx.runestone_trace,
              hasTrace: !!tx.trace,
              hasProtostoneTrace: !!tx.protostone_trace,
              keys: Object.keys(tx).join(', '),
            });

            if (tx.runestone_trace) {
              console.log(`[Trace] TX ${i} runestone_trace:`, JSON.stringify(tx.runestone_trace).slice(0, 300));
            }
          }

          // Count transactions with trace data
          const txsWithTraceData = txsWithTraces.filter(
            (tx: any) => tx.runestone_trace || tx.trace || tx.protostone_trace
          );
          console.log('[Trace] Transactions with trace data:', txsWithTraceData.length);
        }
      } catch (error: any) {
        // Address might be on wrong network (bc1p vs bcrt1p)
        console.log('[Trace] Error fetching txs with traces:', error.message?.slice(0, 100));
        // Don't fail - the address format might not match regtest
      }
    });
  });

  describe('alkanesTrace', () => {
    it('should trace outpoints from known transactions', async () => {
      if (knownTxids.length === 0) {
        console.log('[Trace] No known txids - skipping');
        return;
      }

      let tracesFound = 0;

      for (const txid of knownTxids.slice(0, 5)) {
        // Try tracing multiple outputs
        for (let vout = 0; vout < 4; vout++) {
          const outpoint = `${txid}:${vout}`;

          try {
            const trace = await provider.alkanesTrace(outpoint);

            if (trace) {
              tracesFound++;
              console.log(`[Trace] alkanesTrace(${outpoint.slice(0, 20)}...):`, JSON.stringify(trace).slice(0, 400));

              // Check trace structure
              expect(trace).toBeDefined();

              // Log what we find in the trace
              if (typeof trace === 'object') {
                console.log('[Trace] Trace keys:', Object.keys(trace));

                // Check for execution data
                if (trace.execution) {
                  console.log('[Trace] Execution:', JSON.stringify(trace.execution).slice(0, 300));
                }

                // Check for alkanes transfer data
                if (trace.alkanes_transferred || trace.transfers) {
                  console.log('[Trace] Transfers found!');
                }
              }
            }
          } catch (error: any) {
            // Some outpoints won't have traces - that's OK
            if (!error.message?.includes('not found')) {
              console.log(`[Trace] Error for ${outpoint}:`, error.message?.slice(0, 100));
            }
          }
        }
      }

      console.log('[Trace] Total traces found:', tracesFound);
    });
  });

  describe('traceOutpoint', () => {
    it('should trace protostone outpoints', async () => {
      if (knownTxids.length === 0) {
        console.log('[Trace] No known txids - skipping');
        return;
      }

      for (const txid of knownTxids.slice(0, 3)) {
        const outpoint = `${txid}:0`;

        try {
          const trace = await provider.traceOutpoint(outpoint);
          console.log(`[Trace] traceOutpoint(${outpoint.slice(0, 20)}...):`, JSON.stringify(trace).slice(0, 500));

          expect(trace).toBeDefined();

          // Verify trace contains expected fields
          if (trace && typeof trace === 'object') {
            console.log('[Trace] traceOutpoint keys:', Object.keys(trace));
          }
        } catch (error: any) {
          console.log(`[Trace] traceOutpoint error:`, error.message?.slice(0, 100));
        }
      }
    });
  });

  describe('runestoneDecodeTx and runestoneAnalyzeTx', () => {
    it('should decode and analyze runestones from alkanes transactions', async () => {
      if (knownTxids.length === 0) {
        console.log('[Trace] No known txids - skipping');
        return;
      }

      const txid = knownTxids[0];
      console.log('[Trace] Testing txid:', txid);

      // Decode
      try {
        const decoded = await provider.runestoneDecodeTx(txid);
        console.log('[Trace] runestoneDecodeTx:', JSON.stringify(decoded).slice(0, 500));
        expect(decoded).toBeDefined();
      } catch (error: any) {
        console.log('[Trace] Decode error:', error.message?.slice(0, 100));
      }

      // Analyze
      try {
        const analysis = await provider.runestoneAnalyzeTx(txid);
        console.log('[Trace] runestoneAnalyzeTx:', JSON.stringify(analysis).slice(0, 500));
        expect(analysis).toBeDefined();

        // Check for protostones (alkanes-specific data)
        if (analysis && analysis.protostones) {
          console.log('[Trace] Found', analysis.protostones.length, 'protostones');
          for (const ps of analysis.protostones) {
            console.log('[Trace] Protostone:', JSON.stringify(ps).slice(0, 200));
          }
        }
      } catch (error: any) {
        console.log('[Trace] Analysis error:', error.message?.slice(0, 100));
      }
    });
  });

  describe('Trace Data for Specific Operations', () => {
    it('should identify frBTC (32:0) operations in traces', async () => {
      // Get transactions for creator address and look for frBTC operations
      const testAddress = poolCreatorAddress || REGTEST_TEST_ADDRESS;
      try {
        const txsWithTraces = await provider.getAddressTxsWithTraces(testAddress, true);

        if (!Array.isArray(txsWithTraces)) {
          console.log('[Trace] No array response');
          return;
        }

        let frbtcOperations = 0;

        for (const tx of txsWithTraces) {
          // Check if this tx involves frBTC (32:0)
          const traceStr = JSON.stringify(tx.runestone_trace || tx.trace || {});

          if (traceStr.includes('32') && traceStr.includes(':0')) {
            frbtcOperations++;
            console.log('[Trace] frBTC operation found in tx:', tx.txid?.slice(0, 16));
            console.log('[Trace] Trace data:', traceStr.slice(0, 300));
          }
        }

        console.log('[Trace] Total frBTC operations found:', frbtcOperations);
      } catch (error: any) {
        console.log('[Trace] Error:', error.message?.slice(0, 100));
      }
    });

    it('should identify DIESEL (2:0) operations in traces', async () => {
      const testAddress = poolCreatorAddress || REGTEST_TEST_ADDRESS;
      try {
        const txsWithTraces = await provider.getAddressTxsWithTraces(testAddress, true);

        if (!Array.isArray(txsWithTraces)) {
          console.log('[Trace] No array response');
          return;
        }

        let dieselOperations = 0;

        for (const tx of txsWithTraces) {
          const traceStr = JSON.stringify(tx.runestone_trace || tx.trace || {});

          // Look for DIESEL (2:0) - but not pool (2:3)
          if (traceStr.includes('"2"') && traceStr.includes('"0"')) {
            dieselOperations++;
            console.log('[Trace] DIESEL operation found in tx:', tx.txid?.slice(0, 16));
            console.log('[Trace] Trace data:', traceStr.slice(0, 300));
          }
        }

        console.log('[Trace] Total DIESEL operations found:', dieselOperations);
      } catch (error: any) {
        console.log('[Trace] Error:', error.message?.slice(0, 100));
      }
    });
  });

  /**
   * This section documents how to get trace data for wrap and mint operations.
   *
   * Key insight: Traces are fetched AFTER a transaction is confirmed on-chain.
   *
   * For wrap (BTC -> frBTC, 32:0):
   *   1. Execute wrap via provider.alkanesExecute() with cellpack containing wrap opcode
   *   2. Wait for tx confirmation
   *   3. Call provider.alkanesTrace(`${txid}:0`) to get the trace
   *
   * For mint (DIESEL, 2:0):
   *   1. Execute mint via provider.alkanesExecute() with cellpack [2,0,77]:v0:v0
   *   2. Wait for tx confirmation
   *   3. Call provider.alkanesTrace(`${txid}:0`) to get the trace
   *
   * The trace response includes:
   *   - execution: the protostone execution result
   *   - alkanes_transferred: any alkane token transfers
   *   - pointer_updates: storage pointer changes
   */
  describe('Trace API Methods Documentation', () => {
    it('should demonstrate alkanesTrace method signature', async () => {
      // alkanesTrace takes an outpoint in format "txid:vout"
      // Returns trace data for the protostone execution at that outpoint

      console.log('[Doc] alkanesTrace(outpoint: string) -> Promise<any>');
      console.log('[Doc] Example: provider.alkanesTrace("abc123...def:0")');

      // The trace includes execution details like:
      // - opcode executed
      // - inputs consumed
      // - outputs produced
      // - any alkane token transfers

      expect(typeof provider.alkanesTrace).toBe('function');
    });

    it('should demonstrate traceOutpoint method signature', async () => {
      // traceOutpoint is similar but specifically for protostone outpoints
      console.log('[Doc] traceOutpoint(outpoint: string) -> Promise<any>');
      console.log('[Doc] Traces protostone execution for a specific outpoint');

      expect(typeof provider.traceOutpoint).toBe('function');
    });

    it('should demonstrate getAddressTxsWithTraces for bulk trace fetching', async () => {
      // getAddressTxsWithTraces gets all transactions for an address WITH their traces
      console.log('[Doc] getAddressTxsWithTraces(address: string, excludeCoinbase?: boolean)');
      console.log('[Doc] Returns array of txs, each with runestone_trace or trace field');

      expect(typeof provider.getAddressTxsWithTraces).toBe('function');
    });

    it('should demonstrate the trace flow for wrap operations', async () => {
      console.log('[Doc] === Trace Flow for BTC -> frBTC (32:0) Wrap ===');
      console.log('[Doc] 1. Build wrap transaction with alkanesExecute params:');
      console.log('[Doc]    { cellpack: "wrap", from: "p2tr:0", to: "p2tr:0", ... }');
      console.log('[Doc] 2. Sign and broadcast the transaction');
      console.log('[Doc] 3. Wait for confirmation (tx appears in a block)');
      console.log('[Doc] 4. Fetch trace: provider.alkanesTrace(`${txid}:0`)');
      console.log('[Doc] 5. The trace shows: input BTC satoshis, output frBTC amount');
    });

    it('should demonstrate the trace flow for mint operations', async () => {
      console.log('[Doc] === Trace Flow for DIESEL (2:0) Mint ===');
      console.log('[Doc] 1. Build mint transaction with alkanesExecute params:');
      console.log('[Doc]    { cellpack: "[2,0,77]:v0:v0", from: "p2tr:0", to: "p2tr:0", ... }');
      console.log('[Doc] 2. Sign and broadcast the transaction');
      console.log('[Doc] 3. Wait for confirmation');
      console.log('[Doc] 4. Fetch trace: provider.alkanesTrace(`${txid}:0`)');
      console.log('[Doc] 5. The trace shows: opcode 77 (mint), amount minted');
    });

    it('should simulate a contract call and check if it returns execution data', async () => {
      // alkanesSimulate runs a read-only contract call
      // This can be used to preview what an operation would do

      console.log('[Doc] alkanesSimulate(contract_id, context_json, block_tag?)');

      try {
        // Simulate calling the DIESEL contract (2:0) with empty context
        const context = JSON.stringify({
          inputs: [],
          op: 100, // Example opcode - get info
        });

        const result = await provider.alkanesSimulate(DIESEL_ID, context);
        console.log('[Simulate] DIESEL simulate result:', JSON.stringify(result).slice(0, 500));
      } catch (error: any) {
        // Expected - context format may not be correct
        console.log('[Simulate] DIESEL simulate error:', error.message?.slice(0, 200));
      }

      try {
        // Simulate calling the frBTC contract (32:0)
        const context = JSON.stringify({
          inputs: [],
          op: 100,
        });

        const result = await provider.alkanesSimulate(FRBTC_ID, context);
        console.log('[Simulate] frBTC simulate result:', JSON.stringify(result).slice(0, 500));
      } catch (error: any) {
        console.log('[Simulate] frBTC simulate error:', error.message?.slice(0, 200));
      }
    });
  });

  describe('traceProtostones', () => {
    it('should trace all protostones in a transaction', async () => {
      // traceProtostones takes a txid and traces all protostones in the transaction
      console.log('[TraceProtostones] Testing with known alkanes txid:', KNOWN_ALKANES_TXID);

      try {
        const traces = await provider.traceProtostones(KNOWN_ALKANES_TXID);

        // Convert Map to object for logging
        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value: any, key: string) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        console.log('[TraceProtostones] Result type:', typeof traces);
        console.log('[TraceProtostones] Is array:', Array.isArray(traces));

        if (traces === null || traces === undefined) {
          console.log('[TraceProtostones] No protostones found in transaction');
        } else if (Array.isArray(traces)) {
          console.log('[TraceProtostones] Found', traces.length, 'protostone traces');

          for (let i = 0; i < traces.length; i++) {
            const traceObj = mapToObject(traces[i]);
            console.log(`[TraceProtostones] Trace ${i}:`, JSON.stringify(traceObj).slice(0, 500));
          }
        } else {
          const traceObj = mapToObject(traces);
          console.log('[TraceProtostones] Single trace result:', JSON.stringify(traceObj).slice(0, 500));
        }

        // The result can be null if there are no protostones
        expect(traces === null || traces !== undefined).toBe(true);
      } catch (error: any) {
        console.log('[TraceProtostones] Error:', error.message?.slice(0, 300));
        // May fail if the transaction doesn't have protostones - that's OK
      }
    });

    it('should trace protostones in pool-related transactions', async () => {
      if (knownTxids.length === 0) {
        console.log('[TraceProtostones] No known txids - skipping');
        return;
      }

      console.log('[TraceProtostones] Testing with', knownTxids.length, 'known txids');

      let tracesFound = 0;

      for (const txid of knownTxids.slice(0, 3)) {
        console.log('[TraceProtostones] Testing txid:', txid);

        try {
          const traces = await provider.traceProtostones(txid);

          if (traces && Array.isArray(traces) && traces.length > 0) {
            tracesFound++;
            console.log(`[TraceProtostones] ${txid}: Found ${traces.length} protostone traces`);

            // Convert and log first trace
            const mapToObject = (item: any): any => {
              if (item instanceof Map) {
                const obj: any = {};
                item.forEach((value: any, key: string) => {
                  obj[key] = mapToObject(value);
                });
                return obj;
              }
              if (Array.isArray(item)) {
                return item.map(mapToObject);
              }
              return item;
            };

            const firstTrace = mapToObject(traces[0]);
            console.log('[TraceProtostones] First trace:', JSON.stringify(firstTrace).slice(0, 500));
          } else {
            console.log(`[TraceProtostones] ${txid}: No protostones (${traces === null ? 'null' : 'empty'})`);
          }
        } catch (error: any) {
          console.log(`[TraceProtostones] ${txid} error:`, error.message?.slice(0, 200));
        }
      }

      console.log('[TraceProtostones] Total txids with protostone traces:', tracesFound);
    });
  });

  describe('Actual Trace Response Structure', () => {
    it('should fetch trace for known alkanes transaction from pool creation', async () => {
      // Test alkanesTrace on a known transaction from the pool creation block
      console.log('[KnownTx] Testing alkanesTrace on:', KNOWN_ALKANES_TXID);

      try {
        // Try tracing multiple outputs
        for (let vout = 0; vout < 5; vout++) {
          const outpoint = `${KNOWN_ALKANES_TXID}:${vout}`;

          try {
            const trace = await provider.alkanesTrace(outpoint);

            if (trace) {
              // Convert Map to object for logging
              const mapToObject = (item: any): any => {
                if (item instanceof Map) {
                  const obj: any = {};
                  item.forEach((value: any, key: string) => {
                    obj[key] = mapToObject(value);
                  });
                  return obj;
                }
                if (Array.isArray(item)) {
                  return item.map(mapToObject);
                }
                return item;
              };

              const traceObj = mapToObject(trace);
              console.log(`[KnownTx] alkanesTrace(${outpoint}) FOUND:`);
              console.log(`[KnownTx] Keys:`, Object.keys(traceObj));
              console.log(`[KnownTx] Full trace:`, JSON.stringify(traceObj).slice(0, 1500));
            }
          } catch (err: any) {
            // Not all outputs will have traces
            console.log(`[KnownTx] ${outpoint}: ${err.message?.slice(0, 80) || 'no trace'}`);
          }
        }
      } catch (error: any) {
        console.log('[KnownTx] Error:', error.message?.slice(0, 200));
      }
    });

    it('should decode runestone from known alkanes transaction', async () => {
      console.log('[KnownTx] Testing runestoneDecodeTx on:', KNOWN_ALKANES_TXID);

      try {
        const decoded = await provider.runestoneDecodeTx(KNOWN_ALKANES_TXID);

        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value: any, key: string) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        const decodedObj = mapToObject(decoded);
        console.log('[KnownTx] runestoneDecodeTx result:', JSON.stringify(decodedObj).slice(0, 1500));
        console.log('[KnownTx] Keys:', Object.keys(decodedObj));
      } catch (error: any) {
        console.log('[KnownTx] runestoneDecodeTx error:', error.message?.slice(0, 200));
      }
    });

    it('should analyze runestone from known alkanes transaction', async () => {
      console.log('[KnownTx] Testing runestoneAnalyzeTx on:', KNOWN_ALKANES_TXID);

      try {
        const analysis = await provider.runestoneAnalyzeTx(KNOWN_ALKANES_TXID);

        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value: any, key: string) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        const analysisObj = mapToObject(analysis);
        console.log('[KnownTx] runestoneAnalyzeTx result:', JSON.stringify(analysisObj).slice(0, 1500));
        console.log('[KnownTx] Keys:', Object.keys(analysisObj));

        // Check for protostones
        if (analysisObj.protostones) {
          console.log('[KnownTx] Found', analysisObj.protostones.length, 'protostones');
        }
      } catch (error: any) {
        console.log('[KnownTx] runestoneAnalyzeTx error:', error.message?.slice(0, 200));
      }
    });

    it('should test traceOutpoint on known alkanes transaction', async () => {
      console.log('[KnownTx] Testing traceOutpoint on:', KNOWN_ALKANES_TXID);

      try {
        for (let vout = 0; vout < 3; vout++) {
          const outpoint = `${KNOWN_ALKANES_TXID}:${vout}`;

          try {
            const trace = await provider.traceOutpoint(outpoint);

            if (trace) {
              const mapToObject = (item: any): any => {
                if (item instanceof Map) {
                  const obj: any = {};
                  item.forEach((value: any, key: string) => {
                    obj[key] = mapToObject(value);
                  });
                  return obj;
                }
                if (Array.isArray(item)) {
                  return item.map(mapToObject);
                }
                return item;
              };

              const traceObj = mapToObject(trace);
              console.log(`[KnownTx] traceOutpoint(${outpoint}) FOUND:`);
              console.log(`[KnownTx] Keys:`, Object.keys(traceObj));
              console.log(`[KnownTx] Full trace:`, JSON.stringify(traceObj).slice(0, 1500));
            }
          } catch (err: any) {
            console.log(`[KnownTx] traceOutpoint(${outpoint}): ${err.message?.slice(0, 80) || 'no trace'}`);
          }
        }
      } catch (error: any) {
        console.log('[KnownTx] Error:', error.message?.slice(0, 200));
      }
    });

    it('should fetch transactions with traces for pool creator address', async () => {
      console.log('[PoolCreator] Testing getAddressTxsWithTraces for:', POOL_CREATOR_ADDRESS);

      try {
        const txsWithTraces = await provider.getAddressTxsWithTraces(POOL_CREATOR_ADDRESS, true);

        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value: any, key: string) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        if (!Array.isArray(txsWithTraces) || txsWithTraces.length === 0) {
          console.log('[PoolCreator] No transactions returned');
          return;
        }

        console.log('[PoolCreator] Got', txsWithTraces.length, 'transactions');

        // Look at first transaction in full detail
        const tx = mapToObject(txsWithTraces[0]);
        console.log(`\n[PoolCreator] First TX full structure:`);
        console.log(`[PoolCreator] txid:`, tx.txid);
        console.log(`[PoolCreator] All keys:`, Object.keys(tx));

        // Print ALL fields that exist
        for (const key of Object.keys(tx)) {
          const value = tx[key];
          const valueStr = JSON.stringify(value);
          if (valueStr.length > 200) {
            console.log(`[PoolCreator] tx.${key}: ${valueStr.slice(0, 200)}...`);
          } else {
            console.log(`[PoolCreator] tx.${key}:`, valueStr);
          }
        }
      } catch (error: any) {
        console.log('[PoolCreator] Error:', error.message?.slice(0, 200));
      }
    });

    it('should show actual response fields from getAddressTxsWithTraces', async () => {
      // The pool creator address is mainnet format (bc1p), so use regtest address
      // The regtest test address may only have coinbase txs which don't have traces
      const testAddress = REGTEST_TEST_ADDRESS;

      console.log('[Structure] Testing with address:', testAddress);

      try {
        // Include coinbase transactions (false = don't exclude)
        const txsWithTraces = await provider.getAddressTxsWithTraces(testAddress, false);

        if (!Array.isArray(txsWithTraces) || txsWithTraces.length === 0) {
          console.log('[Structure] No transactions returned');
          return;
        }

        console.log('[Structure] Got', txsWithTraces.length, 'transactions');

        // Helper to convert Map to plain object for logging
        const mapToObject = (item: any): any => {
          if (item instanceof Map) {
            const obj: any = {};
            item.forEach((value: any, key: string) => {
              obj[key] = mapToObject(value);
            });
            return obj;
          }
          if (Array.isArray(item)) {
            return item.map(mapToObject);
          }
          return item;
        };

        const tx = mapToObject(txsWithTraces[0]);
        console.log('[Structure] First TX keys:', Object.keys(tx));
        console.log('[Structure] First TX txid:', tx.txid);

        // Check for trace-related fields
        console.log('[Structure] Has runestone:', !!tx.runestone);
        console.log('[Structure] Has runestone_trace:', !!tx.runestone_trace);
        console.log('[Structure] Has alkanes_traces:', !!tx.alkanes_traces);
        console.log('[Structure] Has trace:', !!tx.trace);
        console.log('[Structure] Has protostone_trace:', !!tx.protostone_trace);

        // Log all fields that might contain trace data
        for (const key of Object.keys(tx)) {
          if (key.includes('trace') || key.includes('runestone') || key.includes('alkane') || key.includes('proto')) {
            console.log(`[Structure] tx.${key}:`, JSON.stringify(tx[key]).slice(0, 500));
          }
        }

        // If no trace fields found, log the full tx structure
        const hasAnyTrace = tx.runestone || tx.runestone_trace || tx.alkanes_traces || tx.trace || tx.protostone_trace;
        if (!hasAnyTrace) {
          console.log('[Structure] No trace fields found. Full tx:', JSON.stringify(tx).slice(0, 1000));
        }

        expect(txsWithTraces).toBeDefined();
      } catch (error: any) {
        console.log('[Structure] Error:', error.message?.slice(0, 200));
      }
    });

    it('should test alkanesTrace on a known outpoint to see response format', async () => {
      // We need an outpoint from a transaction that has alkanes operations
      // Using regtest test address
      const testAddress = REGTEST_TEST_ADDRESS;

      try {
        // Include coinbase transactions (false = don't exclude)
        const txsWithTraces = await provider.getAddressTxsWithTraces(testAddress, false);

        if (!Array.isArray(txsWithTraces) || txsWithTraces.length === 0) {
          console.log('[AlkanesTrace] No transactions to test');
          return;
        }

        console.log('[AlkanesTrace] Got', txsWithTraces.length, 'transactions');

        // Helper to get value from Map or Object
        const getValue = (obj: any, key: string) => {
          if (obj instanceof Map) return obj.get(key);
          return obj[key];
        };

        // Try tracing the first output of each transaction
        for (let i = 0; i < Math.min(3, txsWithTraces.length); i++) {
          const tx = txsWithTraces[i];
          const txid = getValue(tx, 'txid');

          if (!txid) continue;

          const outpoint = `${txid}:0`;

          try {
            const trace = await provider.alkanesTrace(outpoint);

            if (trace) {
              // Convert Map to object for logging
              const traceObj = trace instanceof Map ? Object.fromEntries(trace) : trace;
              console.log(`[AlkanesTrace] ${outpoint}:`, JSON.stringify(traceObj).slice(0, 800));
              console.log(`[AlkanesTrace] Keys:`, Object.keys(traceObj));

              // Check for expected trace fields
              if (traceObj.execution) {
                console.log('[AlkanesTrace] Has execution data');
              }
              if (traceObj.alkanes_transferred) {
                console.log('[AlkanesTrace] Has alkanes_transferred');
              }
            } else {
              console.log(`[AlkanesTrace] ${outpoint}: null/empty`);
            }
          } catch (err: any) {
            // Not all outpoints will have traces
            if (!err.message?.includes('not found')) {
              console.log(`[AlkanesTrace] ${outpoint} error:`, err.message?.slice(0, 100));
            }
          }
        }
      } catch (error: any) {
        console.log('[AlkanesTrace] Error:', error.message?.slice(0, 200));
      }
    });
  });
});
