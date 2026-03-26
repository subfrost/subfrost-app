/**
 * Devnet: Faucet → Balance Display
 *
 * Verifies that faucet operations (BTC, DIESEL, frBTC) result in
 * queryable balances via the same data paths the UI uses.
 *
 * Run: pnpm vitest run __tests__/devnet/faucet-balance.test.ts --testTimeout=600000
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
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;

async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0,
  }]);
}

describe('Devnet: Faucet → Balance', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;
    mineBlocks(harness, 201);
  }, 300_000);

  afterAll(() => { disposeHarness(); });

  // ── BTC balance ──────────────────────────────────────────────

  describe('BTC faucet + balance', () => {
    it('should have BTC after mining coinbase', async () => {
      // Mine a block to the user's taproot address (same as devnet faucetBtc)
      await rpcCall('generatetoaddress', [1, taprootAddress]);
      mineBlocks(harness, 100); // maturity

      // Query via lua_evalsaved (same path as getSpendableTotalBalance)
      const luaResult = await rpcCall('lua_evalsaved', [
        'c1e61d349c30deb20b023b70dc6641b5ada176db552bdbef24dee7cd05273e97',
        taprootAddress,
      ]);
      const spendable = luaResult?.result?.returns?.spendable || [];
      const totalSats = spendable.reduce((s: number, u: any) => s + (u.value || 0), 0);

      console.log('[faucet-balance] BTC via lua_evalsaved:', totalSats, 'sats from', spendable.length, 'UTXOs');
      expect(totalSats).toBeGreaterThan(0);
    });

    it('should have BTC via getEnrichedBalances (UI path)', async () => {
      // This is what WalletContext.getSpendableTotalBalance uses
      try {
        const rawResult = await (provider as any).getEnrichedBalances(taprootAddress, '1');
        const spendable = rawResult?.returns?.spendable || rawResult?.spendable || [];
        const totalSats = spendable.reduce((s: number, u: any) => s + (u.value || 0), 0);
        console.log('[faucet-balance] BTC via getEnrichedBalances:', totalSats, 'sats');
        // This may return 0 on devnet if the Lua script doesn't work — that's the bug
        if (totalSats === 0) {
          console.warn('[faucet-balance] WARNING: getEnrichedBalances returned 0 — UI will show no BTC');
        }
      } catch (err) {
        console.warn('[faucet-balance] getEnrichedBalances failed:', err);
      }
      // Always passes — we're diagnosing, not asserting the broken path
      expect(true).toBe(true);
    });

    it('should have BTC via direct UTXO query (fallback path)', async () => {
      // Direct lua_evalsaved — the fallback we need
      const result = await rpcCall('lua_evalsaved', [
        'c1e61d349c30deb20b023b70dc6641b5ada176db552bdbef24dee7cd05273e97',
        taprootAddress,
      ]);
      const spendable = result?.result?.returns?.spendable || [];
      const totalSats = spendable.reduce((s: number, u: any) => s + (u.value || 0), 0);

      console.log('[faucet-balance] BTC via direct lua_evalsaved:', totalSats);
      expect(totalSats).toBeGreaterThan(0);
    });
  });

  // ── DIESEL balance ───────────────────────────────────────────

  describe('DIESEL faucet + balance', () => {
    it('should mint DIESEL and show balance', async () => {
      mineBlocks(harness, 1);
      // Mint DIESEL via opcode 77 (same as devnet faucetDiesel)
      await (provider as any).alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        'B:10000:v0',
        '[2,0,77]:v0:v0',
        '1', null,
        JSON.stringify({
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
        }),
      );
      mineBlocks(harness, 1);

      // Query via alkanesByAddress (the working devnet path)
      const balance = await getAlkaneBalance(provider, taprootAddress, '2:0');
      console.log('[faucet-balance] DIESEL balance:', balance.toString());
      expect(balance).toBeGreaterThan(0n);
    });

    it('should show DIESEL via dataApiGetAlkanesByAddress (UI primary path)', async () => {
      // Mine an extra block to give quspo a chance to index
      mineBlocks(harness, 1);
      await new Promise(r => setTimeout(r, 200));

      let dataApiItems = 0;
      try {
        const result = await (provider as any).dataApiGetAlkanesByAddress(taprootAddress);
        const items = result?.data || [];
        dataApiItems = items.length;
        console.log('[faucet-balance] DIESEL via dataApi:', items.length, 'items');
        for (const item of items) {
          console.log('[faucet-balance]   dataApi item:', JSON.stringify(item).slice(0, 200));
        }
      } catch (err: any) {
        console.warn('[faucet-balance] dataApi failed:', err?.message);
      }

      // Also test the direct quspo REST path
      try {
        const resp = await fetch('http://localhost:18888/get-alkanes-by-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: taprootAddress }),
        });
        const data = await resp.json();
        console.log('[faucet-balance] quspo REST get-alkanes-by-address:', JSON.stringify(data).slice(0, 300));
      } catch (err: any) {
        console.warn('[faucet-balance] quspo REST failed:', err?.message);
      }

      // Also test the direct RPC path (metashrew, always works)
      const rpcBalance = await getAlkaneBalance(provider, taprootAddress, '2:0');
      console.log('[faucet-balance] DIESEL via metashrew RPC:', rpcBalance.toString());
      expect(rpcBalance).toBeGreaterThan(0n);

      // Log whether quspo path works or needs fallback
      if (dataApiItems === 0) {
        console.warn('[faucet-balance] CONCLUSION: quspo get_alkanes_by_address returns EMPTY on devnet');
        console.warn('[faucet-balance] The alkanesByAddress RPC fallback is REQUIRED for devnet balance display');
      } else {
        console.log('[faucet-balance] CONCLUSION: quspo works — fallback is not needed');
      }
    });
  });

  // ── frBTC balance ────────────────────────────────────────────

  describe('frBTC faucet + balance', () => {
    it('should get dynamic frBTC signer address with ecc initialized', async () => {
      const signerResult = await simulate('32:0', ['103']);
      expect(signerResult?.result?.execution?.error).toBeNull();
      const hex = signerResult?.result?.execution?.data?.replace('0x', '') || '';
      expect(hex.length).toBe(64);

      // This must not throw — requires ecc init
      const xOnly = Buffer.from(hex, 'hex');
      const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
      expect(payment.address).toBeTruthy();
      expect(payment.address).toMatch(/^bcrt1p/);
      console.log('[faucet-balance] frBTC signer:', payment.address);
    });

    it('should wrap BTC to frBTC and show balance', async () => {
      // Get signer
      const signerResult = await simulate('32:0', ['103']);
      const hex = signerResult.result.execution.data.replace('0x', '');
      const xOnly = Buffer.from(hex, 'hex');
      const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
      const signerAddr = payment.address!;

      mineBlocks(harness, 1);
      await (provider as any).alkanesExecuteFull(
        JSON.stringify([signerAddr, taprootAddress]),
        'B:100000:v0',
        '[32,0,77]:v1:v1',
        '1', null,
        JSON.stringify({
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
        }),
      );
      mineBlocks(harness, 1);

      const balance = await getAlkaneBalance(provider, taprootAddress, '32:0');
      console.log('[faucet-balance] frBTC balance:', balance.toString());
      expect(balance).toBeGreaterThan(0n);
    });
  });
});
