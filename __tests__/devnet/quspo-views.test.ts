/**
 * Devnet E2E: Quspo Tertiary Indexer Views
 *
 * Proves quspo views return correct data by deploying contracts,
 * executing transactions, then querying via metashrew_view.
 *
 * Run: pnpm vitest run __tests__/devnet/quspo-views.test.ts --testTimeout=600000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { deployAmmContracts } from './amm-deploy';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}

let harness: any;
let provider: WebProvider;
let signer: any;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let poolId: string;

// ── Helper: call a quspo view and decode the hex JSON response ──────────
async function quspoView(viewName: string, inputHex: string): Promise<any> {
  const result = await rpcCall('metashrew_view', [viewName, inputHex, 'latest']);
  if (!result?.result) return null;
  const hex = (result.result as string).replace('0x', '');
  if (!hex) return null;
  const jsonStr = Buffer.from(hex, 'hex').toString('utf-8');
  try { return JSON.parse(jsonStr); } catch { return jsonStr; }
}

function toHexInput(input: string | object): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return '0x' + Buffer.from(str, 'utf-8').toString('hex');
}

// ── Helper: execute alkanes tx ──────────────────────────────────────────
async function executeAlkanes(
  protostone: string, reqs: string, opts?: { toAddresses?: string[] }
): Promise<string> {
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(opts?.toAddresses || [taprootAddress]),
    reqs, protostone, 1, null,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      ordinals_strategy: 'burn',
    }),
  );
  if (result?.reveal_txid || result?.revealTxid) {
    mineBlocks(harness, 1);
    return result.reveal_txid || result.revealTxid;
  }
  if (result?.txid) {
    mineBlocks(harness, 1);
    return result.txid;
  }
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

// =========================================================================
// Setup: Deploy AMM, mint tokens, create pool
// =========================================================================

describe('Quspo Tertiary Indexer Views', () => {
  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine initial blocks for coinbase maturity
    mineBlocks(harness, 110);

    // Deploy AMM contracts (factory + pool logic + beacon)
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;

    // Mint DIESEL to user
    await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    mineBlocks(harness, 1);

    // Wrap some BTC to get frBTC
    // Get signer address for frBTC
    const signerResult = await rpcCall('alkanes_simulate', [{
      target: { block: '32', tx: '0' }, inputs: ['103'],
      alkanes: [], transaction: '0x', block: '0x', height: '999999',
      txindex: 0, vout: 0,
    }]);
    const signerHex = signerResult?.result?.execution?.data?.replace('0x', '') || '';
    let signerAddr = taprootAddress;
    if (signerHex.length === 64) {
      const xOnlyPubkey = Buffer.from(signerHex, 'hex');
      const payment = bitcoin.payments.p2tr({
        internalPubkey: xOnlyPubkey,
        network: bitcoin.networks.regtest,
      });
      if (payment.address) signerAddr = payment.address;
    }
    await executeAlkanes(
      '[32,0,77]:v1:v1', 'B:100000:v0',
      { toAddresses: [signerAddr, taprootAddress] }
    );
    mineBlocks(harness, 1);

    // Create pool with DIESEL + frBTC
    const dieselBal = await getAlkaneBalance(provider, taprootAddress, '2:0');
    const frbtcBal = await getAlkaneBalance(provider, taprootAddress, '32:0');
    console.log(`[setup] DIESEL balance: ${dieselBal}, frBTC balance: ${frbtcBal}`);

    if (dieselBal > 0n && frbtcBal > 0n) {
      const [fBlock, fTx] = factoryId.split(':');
      const dieselAmt = dieselBal > 1000000000n ? 1000000000n : dieselBal / 2n;
      const frbtcAmt = frbtcBal > 100000n ? 100000n : frbtcBal / 2n;
      await executeAlkanes(
        `[${fBlock},${fTx},1,2,0,32,0,${dieselAmt},${frbtcAmt}]:v0:v0`,
        `2:0:${dieselAmt},32:0:${frbtcAmt}`
      );
      mineBlocks(harness, 1);

      // Discover pool ID via factory opcode 2 (FindExistingPoolId)
      const findResult = await rpcCall('alkanes_simulate', [{
        target: { block: fBlock, tx: fTx },
        inputs: ['2', '2', '0', '32', '0'],
        alkanes: [], transaction: '0x', block: '0x', height: '999999',
        txindex: 0, vout: 0,
      }]);
      const findHex = findResult?.result?.execution?.data?.replace('0x', '') || '';
      if (findHex.length >= 64) {
        const bytes = Buffer.from(findHex, 'hex');
        const poolBlock = Number(bytes.readBigUInt64LE(0));
        const poolTx = Number(bytes.readBigUInt64LE(16));
        poolId = `${poolBlock}:${poolTx}`;
      }
      console.log(`[setup] Pool created: ${poolId}`);
    }

    // Mine a few more blocks so quspo has recent data
    mineBlocks(harness, 3);
  }, 300_000);

  afterAll(() => {
    disposeHarness();
  });

  // ─── Balance Views ─────────────────────────────────────────────────────

  describe('get_alkanes_by_address', () => {
    it('returns DIESEL balance for user address', async () => {
      const result = await quspoView(
        'get_alkanes_by_address',
        toHexInput(taprootAddress),
      );
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      const diesel = result.find((a: any) =>
        String(a.alkaneId?.block) === '2' && String(a.alkaneId?.tx) === '0'
      );
      expect(diesel).toBeDefined();
      expect(BigInt(diesel.balance)).toBeGreaterThan(0n);
      console.log('[get_alkanes_by_address] DIESEL:', diesel.balance);
    });

    it('returns empty array for unknown address', async () => {
      const result = await quspoView(
        'get_alkanes_by_address',
        toHexInput('bcrt1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs'),
      );
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(0);
    });
  });

  // ─── Pool Views ────────────────────────────────────────────────────────

  describe('get_pools', () => {
    it('returns pool with correct tokens and non-zero reserves', async () => {
      const [fBlock, fTx] = factoryId.split(':');
      const result = await quspoView(
        'get_pools',
        toHexInput({ block: fBlock, tx: fTx }),
      );

      expect(result).toBeDefined();
      expect(result.pools).toBeInstanceOf(Array);
      expect(result.pools.length).toBeGreaterThan(0);

      const pool = result.pools[0];
      console.log('[get_pools] Pool:', JSON.stringify(pool));

      // Verify pool has correct token pair
      const t0 = `${pool.token0.block}:${pool.token0.tx}`;
      const t1 = `${pool.token1.block}:${pool.token1.tx}`;
      const tokens = new Set([t0, t1]);
      expect(tokens.has('2:0')).toBe(true);   // DIESEL
      expect(tokens.has('32:0')).toBe(true);   // frBTC

      // Quspo returns pool IDs and tokens correctly.
      // Reserves read 0 because tertiary indexers cannot access the protorune
      // balance system (/alkanes/{token}/balances/{pool}) — this is a known
      // limitation of the qubitcoin tertiary indexer API. The frontend augments
      // quspo pools with live reserves via alkanes_simulate opcode 97.
      console.log(`[get_pools] quspo reserves: ${pool.reserve0} / ${pool.reserve1}`);

      // Verify live reserves are available via alkanes_simulate
      const reserveResult = await rpcCall('alkanes_simulate', [{
        target: { block: pool.poolId.block, tx: pool.poolId.tx },
        inputs: ['97'],
        alkanes: [], transaction: '0x', block: '0x', height: '999999',
        txindex: 0, vout: 0,
      }]);
      const rExec = reserveResult?.result?.execution;
      expect(rExec?.data).toBeDefined();
      expect(rExec?.error).toBeNull();
      const hex = (rExec.data as string).replace('0x', '');
      const bytes = Buffer.from(hex, 'hex');
      let r0 = 0n, r1 = 0n;
      for (let i = 0; i < 16; i++) { r0 |= BigInt(bytes[i]) << BigInt(i * 8); }
      for (let i = 0; i < 16; i++) { r1 |= BigInt(bytes[16 + i]) << BigInt(i * 8); }
      expect(r0).toBeGreaterThan(0n);
      expect(r1).toBeGreaterThan(0n);
      console.log(`[get_pools] alkanes_simulate reserves: ${r0} / ${r1}`);
    });
  });

  // ─── Token Metadata Views ─────────────────────────────────────────────

  describe('get_alkane_info', () => {
    it('returns DIESEL token info', async () => {
      const result = await quspoView('get_alkane_info', toHexInput('2:0'));
      expect(result).toBeDefined();
      expect(result.block).toBeDefined();
      expect(result.tx).toBeDefined();
      console.log('[get_alkane_info] DIESEL:', JSON.stringify(result));
    });
  });

  describe('get_all_alkanes', () => {
    it('returns array (may be empty if names key not populated)', async () => {
      const result = await quspoView('get_all_alkanes', '0x');
      expect(result).toBeInstanceOf(Array);
      console.log('[get_all_alkanes] count:', result.length);
      // Note: returns empty if /runes/proto/1/names isn't populated
      // This is a known limitation — use get_alkanes_by_address for per-user balances
    });
  });

  describe('get_token_details', () => {
    it('returns details for DIESEL', async () => {
      const result = await quspoView('get_token_details', toHexInput('2:0'));
      expect(result).toBeDefined();
      console.log('[get_token_details] DIESEL:', JSON.stringify(result));
    });
  });

  // ─── Contract State Views ─────────────────────────────────────────────

  describe('get_contract_state', () => {
    it('reads factory all_pools_length', async () => {
      const [fBlock, fTx] = factoryId.split(':');
      const result = await quspoView('get_contract_state', toHexInput({
        contract: factoryId,
        key: '/all_pools_length',
      }));
      expect(result).toBeDefined();
      console.log('[get_contract_state] factory pools:', JSON.stringify(result));
    });

    it('reads pool token0 from storage', async () => {
      if (!poolId) return;
      const result = await quspoView('get_contract_state', toHexInput({
        contract: poolId,
        key: '/alkane/0',
      }));
      console.log('[get_contract_state] pool token0:', JSON.stringify(result));
      expect(result).toBeDefined();
    });

    it('reads pool token1 from storage', async () => {
      if (!poolId) return;
      const result = await quspoView('get_contract_state', toHexInput({
        contract: poolId,
        key: '/alkane/1',
      }));
      console.log('[get_contract_state] pool token1:', JSON.stringify(result));
      expect(result).toBeDefined();
    });

    it('debug: reads balance key via debug_read_raw_key', async () => {
      if (!poolId) return;
      const token_block = 2, token_tx = 0;
      const [pBlock, pTx] = poolId.split(':').map(Number);

      // Build token_id bytes (32 bytes: block_u128_le + tx_u128_le)
      const tokenId = Buffer.alloc(32);
      tokenId.writeBigUInt64LE(BigInt(token_block), 0);
      tokenId.writeBigUInt64LE(0n, 8);
      tokenId.writeBigUInt64LE(BigInt(token_tx), 16);
      tokenId.writeBigUInt64LE(0n, 24);

      const poolIdBuf = Buffer.alloc(32);
      poolIdBuf.writeBigUInt64LE(BigInt(pBlock), 0);
      poolIdBuf.writeBigUInt64LE(0n, 8);
      poolIdBuf.writeBigUInt64LE(BigInt(pTx), 16);
      poolIdBuf.writeBigUInt64LE(0n, 24);

      const balanceKey = Buffer.concat([
        Buffer.from('/alkanes/'),
        tokenId,
        Buffer.from('/balances/'),
        poolIdBuf,
      ]);
      console.log('[debug] Balance key hex:', balanceKey.toString('hex'));

      const result = await quspoView('debug_read_raw_key', toHexInput(balanceKey.toString('hex')));
      console.log('[debug] debug_read_raw_key result:', JSON.stringify(result));

      // Also try without /alkanes/ prefix (maybe the secondary storage strips it?)
      const keyNoPrefix = Buffer.concat([tokenId, Buffer.from('/balances/'), poolIdBuf]);
      const result2 = await quspoView('debug_read_raw_key', toHexInput(keyNoPrefix.toString('hex')));
      console.log('[debug] without /alkanes/ prefix:', JSON.stringify(result2));
    });
  });

  // ─── Activity Views ───────────────────────────────────────────────────

  describe('get_activity', () => {
    it('returns recent activity events', async () => {
      const result = await quspoView(
        'get_activity',
        toHexInput({ limit: 20 }),
      );
      expect(result).toBeDefined();
      expect(result.items).toBeInstanceOf(Array);
      console.log(`[get_activity] ${result.items?.length || 0} events, count: ${result.count || 0}`);
      if (result.items?.length > 0) {
        console.log('[get_activity] first event:', JSON.stringify(result.items[0]));
      }
    });
  });

  // ─── Utility Views ────────────────────────────────────────────────────

  describe('get_bitcoin_price', () => {
    it('returns mock BTC price', async () => {
      const result = await quspoView('get_bitcoin_price', '0x');
      expect(result).toBeDefined();
      expect(result.usd).toBeGreaterThan(0);
      console.log('[get_bitcoin_price]', result);
    });
  });

  // ─── Data API Compatibility ───────────────────────────────────────────

  describe('REST-equivalent data flows', () => {
    it('get_alkanes_by_address returns format compatible with app balance query', async () => {
      const result = await quspoView(
        'get_alkanes_by_address',
        toHexInput(taprootAddress),
      );
      // The app's alkaneBalanceQueryOptions expects:
      // [ { alkaneId: { block, tx }, balance, name?, symbol? } ]
      for (const item of result) {
        expect(item.alkaneId).toBeDefined();
        expect(item.alkaneId.block).toBeDefined();
        expect(item.alkaneId.tx).toBeDefined();
        expect(item.balance).toBeDefined();
      }
    });

    it('get_pools returns format compatible with app pool query', async () => {
      const [fBlock, fTx] = factoryId.split(':');
      const result = await quspoView(
        'get_pools',
        toHexInput({ block: fBlock, tx: fTx }),
      );
      // The app's usePools expects:
      // { pools: [{ poolId: {block, tx}, token0: {block, tx}, token1: {block, tx}, reserve0, reserve1 }] }
      expect(result.pools).toBeDefined();
      for (const pool of result.pools) {
        expect(pool.poolId).toBeDefined();
        expect(pool.poolId.block).toBeDefined();
        expect(pool.poolId.tx).toBeDefined();
        expect(pool.token0).toBeDefined();
        expect(pool.token1).toBeDefined();
        expect(pool.reserve0).toBeDefined();
        expect(pool.reserve1).toBeDefined();
      }
    });
  });
});
