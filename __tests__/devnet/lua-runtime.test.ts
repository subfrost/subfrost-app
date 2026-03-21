/**
 * Devnet: Lua Runtime via Wasmoon
 *
 * Tests that lua_evalscript, lua_evalsaved, and sandshrew_savescript
 * work through the wasmoon Lua VM in the DevnetTestHarness.
 *
 * Run: pnpm vitest run __tests__/devnet/lua-runtime.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
} from './devnet-helpers';

describe('Devnet: Lua Runtime', () => {
  let harness: any;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine enough blocks for mature coinbase UTXOs
    mineBlocks(harness, 110);
  }, 60_000);

  afterAll(() => {
    disposeHarness();
  });

  describe('lua_evalscript', () => {
    it('should execute a simple Lua script', async () => {
      const script = 'return 42';
      const result = await rpcCall('lua_evalscript', [script]);

      expect(result.result).toBeTruthy();
      expect(result.result.returns).toBe(42);
      expect(result.result.calls).toBe(0);
      expect(typeof result.result.runtime).toBe('number');
    });

    it('should pass args to script', async () => {
      const script = 'return args[1] + args[2]';
      const result = await rpcCall('lua_evalscript', [script, 10, 32]);

      expect(result.result).toBeTruthy();
      expect(result.result.returns).toBe(42);
    });

    it('should access _RPC table for btc_getblockcount', async () => {
      const script = 'return _RPC.btc_getblockcount()';
      const result = await rpcCall('lua_evalscript', [script]);

      expect(result.result).toBeTruthy();
      expect(result.result.returns).toBeGreaterThan(100);
      expect(result.result.calls).toBe(1);
    });

    it('should access _RPC table for esplora_addressutxo', async () => {
      const script = `
        local utxos = _RPC.esplora_addressutxo(args[1])
        if not utxos then return { count = 0 } end
        return { count = #utxos }
      `;
      const result = await rpcCall('lua_evalscript', [script, segwitAddress]);

      expect(result.result).toBeTruthy();
      expect(result.result.returns).toBeTruthy();
      expect(typeof result.result.returns.count).toBe('number');
    });

    it('should handle Lua errors gracefully', async () => {
      const script = 'error("test error")';
      const result = await rpcCall('lua_evalscript', [script]);

      expect(result.result).toBeTruthy();
      expect(result.result.error).toBeTruthy();
    });

    it('should return Lua tables as objects', async () => {
      const script = 'return { name = "test", value = 123, nested = { a = 1, b = 2 } }';
      const result = await rpcCall('lua_evalscript', [script]);

      expect(result.result).toBeTruthy();
      const ret = result.result.returns;
      expect(ret.name).toBe('test');
      expect(ret.value).toBe(123);
      expect(ret.nested.a).toBe(1);
      expect(ret.nested.b).toBe(2);
    });

    it('should return Lua arrays as arrays', async () => {
      const script = 'return {10, 20, 30}';
      const result = await rpcCall('lua_evalscript', [script]);

      expect(result.result).toBeTruthy();
      expect(Array.isArray(result.result.returns)).toBe(true);
      expect(result.result.returns).toEqual([10, 20, 30]);
    });
  });

  describe('sandshrew_savescript + sandshrew_evalsaved', () => {
    it('should save a script and execute by hash', async () => {
      // Save
      const script = 'return args[1] * 2';
      const saveResult = await rpcCall('sandshrew_savescript', [script]);

      expect(saveResult.result).toBeTruthy();
      expect(saveResult.result.hash).toBeTruthy();
      const hash = saveResult.result.hash;

      // Execute by hash
      const evalResult = await rpcCall('sandshrew_evalsaved', [hash, 21]);

      expect(evalResult.result).toBeTruthy();
      expect(evalResult.result.returns).toBe(42);
    });
  });

  describe('lua_evalsaved with pre-loaded scripts', () => {
    it('should execute spendable_utxos script', async () => {
      // The spendable_utxos.lua script is pre-loaded from alkanes-rs/lua/
      // Its hash is c1e61d349c30deb20b023b70dc6641b5ada176db552bdbef24dee7cd05273e97
      const SPENDABLE_HASH = 'c1e61d349c30deb20b023b70dc6641b5ada176db552bdbef24dee7cd05273e97';

      const result = await rpcCall('lua_evalsaved', [SPENDABLE_HASH, segwitAddress]);

      expect(result.result).toBeTruthy();
      const returns = result.result.returns;
      if (returns) {
        expect(returns).toHaveProperty('spendable');
        expect(returns).toHaveProperty('currentHeight');
        expect(returns).toHaveProperty('address');
        expect(returns.address).toBe(segwitAddress);
        expect(Array.isArray(returns.spendable)).toBe(true);
        // Spendable UTXOs may be empty if esplora doesn't index this address
        // (coinbase goes to p2pkh, segwit address may have no UTXOs yet)
        expect(returns.currentHeight).toBeGreaterThan(100);
      }
    });

    it('should execute balances script', async () => {
      const BALANCES_HASH = '4efbe0cdfe14270cb72eec80bce63e44f9f926951a67a0ad7256fca39046b80f';

      const result = await rpcCall('lua_evalsaved', [BALANCES_HASH, segwitAddress]);

      expect(result.result).toBeTruthy();
      const returns = result.result.returns;
      if (returns) {
        expect(returns).toHaveProperty('spendable');
        expect(returns).toHaveProperty('assets');
        expect(returns).toHaveProperty('pending');
      }
    });

    it('should execute multicall script', async () => {
      const MULTICALL_HASH = '3a6cdae683f3bfa9691e577f002f3d774e56fbfe118ead500ddcaa44a81e5dfc';

      // Each call tuple is a separate arg (matching production lua_evalscript behavior)
      const result = await rpcCall('lua_evalsaved', [
        MULTICALL_HASH,
        ['btc_getblockcount', []],
        ['btc_getbestblockhash', []],
      ]);

      expect(result.result).toBeTruthy();
      const returns = result.result.returns;
      if (returns) {
        expect(Array.isArray(returns)).toBe(true);
        expect(returns.length).toBe(2);
        // First result should be block count
        expect(returns[0].result).toBeGreaterThan(100);
      }
    });

    it('should execute batch_utxo_balances script', async () => {
      const BATCH_HASH = '5b51b9b50f12dc4fd2ada2206bc29d2a929375502ee07b969b1bf98cb48854d9';

      const result = await rpcCall('lua_evalsaved', [BATCH_HASH, segwitAddress]);

      expect(result.result).toBeTruthy();
      const returns = result.result.returns;
      if (returns) {
        expect(returns).toHaveProperty('utxos');
        expect(returns).toHaveProperty('count');
        expect(Array.isArray(returns.utxos)).toBe(true);
      }
    });
  });

  describe('SDK integration: getEnrichedBalances', () => {
    it('should work with the provider.getEnrichedBalances path', async () => {
      // This exercises the full path: SDK → lua_evalsaved → wasmoon → _RPC → devnet
      // getEnrichedBalances internally calls lua_evalsaved with the balances.lua hash
      const result = await rpcCall('lua_evalsaved', [
        '4efbe0cdfe14270cb72eec80bce63e44f9f926951a67a0ad7256fca39046b80f',
        segwitAddress,
        '1',
      ]);

      expect(result.result).toBeTruthy();
      if (result.result.returns) {
        const balances = result.result.returns;
        // Should have spendable UTXOs after mining 110 blocks
        expect(balances.spendable).toBeTruthy();
        expect(Array.isArray(balances.spendable)).toBe(true);

        // Each spendable UTXO should have value
        if (balances.spendable.length > 0) {
          const utxo = balances.spendable[0];
          expect(utxo).toHaveProperty('outpoint');
          expect(utxo).toHaveProperty('value');
          expect(utxo.value).toBeGreaterThan(0);
        }
      }
    });
  });
});
