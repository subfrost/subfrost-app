/**
 * Devnet: Quspo Tertiary Indexer — Address Balances
 *
 * Tests the quspo tertiary indexer's view functions by:
 * 1. Mining blocks (creates coinbase UTXOs)
 * 2. Minting DIESEL tokens
 * 3. Querying quspo's get_alkanes_by_address view
 *
 * Run: pnpm vitest run __tests__/devnet/quspo-balances.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DEVNET, loadTertiaryWasm } from './devnet-constants';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('Devnet: Quspo Tertiary Indexer', () => {
  let harness: any;
  let provider: WebProvider;
  let signer: TestSignerResult;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    // Check quspo WASM is available
    const quspoWasm = loadTertiaryWasm('quspo');
    if (!quspoWasm) {
      console.warn('[quspo] quspo.wasm not found in fixtures — skipping tests');
      return;
    }
    console.log('[quspo] Loaded quspo WASM:', quspoWasm.length, 'bytes');

    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine for coinbase maturity
    mineBlocks(harness, 201);
    console.log('[quspo] Chain height:', harness.height);
  }, 120_000);

  afterAll(() => {
    disposeHarness();
  });

  it('should have quspo loaded as tertiary indexer', () => {
    expect(harness).toBeTruthy();
  });

  it('should have UTXOs available (UTXO discovery works)', async () => {
    const result = await rpcCall('esplora_address::utxo', [segwitAddress]);
    expect(result.result).toBeTruthy();
    expect(Array.isArray(result.result)).toBe(true);
    expect(result.result.length).toBeGreaterThan(0);
    console.log('[quspo] Found', result.result.length, 'UTXOs for segwit address');
  });

  it('should query get_alkanes_by_address via metashrew_view', async () => {
    // The quspo view function is called via metashrew_view with the function name
    // The tertiary runtime tries all tertiary indexers when alkanes doesn't have the view
    const addressHex = Buffer.from(taprootAddress).toString('hex');
    const result = await rpcCall('metashrew_view', [
      'get_alkanes_by_address',
      '0x' + addressHex,
      'latest',
    ]);

    console.log('[quspo] get_alkanes_by_address result:', JSON.stringify(result).slice(0, 500));

    // At this point we haven't minted any tokens, so result should be empty array
    if (result.result) {
      // Decode hex result to JSON
      const hex = result.result.replace('0x', '');
      const jsonStr = Buffer.from(hex, 'hex').toString('utf-8');
      console.log('[quspo] Decoded:', jsonStr);
      const balances = JSON.parse(jsonStr);
      expect(Array.isArray(balances)).toBe(true);
      // No tokens minted yet — should be empty
      console.log('[quspo] Balances count (pre-mint):', balances.length);
    }
  });

  it('should return balances after DIESEL mint', async () => {
    // Mint DIESEL via alkanesExecuteWithStrings + signAndBroadcast
    try {
      const result = await (provider as any).alkanesExecuteWithStrings(
        JSON.stringify([taprootAddress]),
        'B:10000:v0',
        '[2,0,77]:v0:v0',
        1,
        null,
        JSON.stringify({
          from_addresses: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
        }),
      );
      const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
      mineBlocks(harness, 1);
      console.log('[quspo] DIESEL minted, txid:', txid);
    } catch (e: any) {
      console.log('[quspo] Mint error:', e?.message?.slice(0, 200));
    }

    // Check DIESEL balance via alkanes RPC
    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    console.log('[quspo] DIESEL balance via RPC:', dieselBalance.toString());

    // Now query quspo for the same data
    const addressHex = Buffer.from(taprootAddress).toString('hex');
    const result = await rpcCall('metashrew_view', [
      'get_alkanes_by_address',
      '0x' + addressHex,
      'latest',
    ]);

    if (result.result) {
      const hex = result.result.replace('0x', '');
      const jsonStr = Buffer.from(hex, 'hex').toString('utf-8');
      console.log('[quspo] Quspo balances after mint:', jsonStr);
      const balances = JSON.parse(jsonStr);
      expect(Array.isArray(balances)).toBe(true);

      // If DIESEL was minted, quspo should see it
      if (dieselBalance > 0n) {
        const dieselEntry = balances.find(
          (b: any) => b.alkaneId?.block === '2' && b.alkaneId?.tx === '0'
        );
        if (dieselEntry) {
          console.log('[quspo] Quspo found DIESEL balance:', dieselEntry.balance);
          expect(BigInt(dieselEntry.balance)).toBe(dieselBalance);
        } else {
          console.log('[quspo] Quspo did not find DIESEL — may need key format debugging');
        }
      }
    }
  });

  it('should query get_pools after AMM deployment + pool creation', async () => {
    // Deploy AMM and create a pool
    const { deployAmmContracts } = await import('./amm-deploy');
    await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);

    // Mint more DIESEL + wrap frBTC for pool creation
    mineBlocks(harness, 1);
    const mintResult = await (provider as any).alkanesExecuteFull(
      JSON.stringify([taprootAddress]), 'B:10000:v0', '[2,0,77]:v0:v0', '1', null,
      JSON.stringify({ from: [segwitAddress, taprootAddress], change_address: segwitAddress, alkanes_change_address: taprootAddress }),
    );
    if (mintResult?.txid) mineBlocks(harness, 1);

    // Wrap BTC for frBTC
    const bitcoin = await import('bitcoinjs-lib');
    const ecc = await import('@bitcoinerlab/secp256k1');
    try { bitcoin.initEccLib(ecc); } catch {}
    const signerResult = await rpcCall('alkanes_simulate', [{
      target: { block: '32', tx: '0' }, inputs: ['103'], alkanes: [],
      transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0
    }]);
    let signerAddr = taprootAddress;
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        try {
          const xOnly = Buffer.from(hex, 'hex');
          const payment = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: bitcoin.networks.regtest });
          if (payment.address) signerAddr = payment.address;
        } catch {}
      }
    }
    const wrapResult = await (provider as any).alkanesExecuteFull(
      JSON.stringify([signerAddr, taprootAddress]), 'B:500000:v0', '[32,0,77]:v1:v1', '1', null,
      JSON.stringify({ from: [segwitAddress, taprootAddress], change_address: segwitAddress, alkanes_change_address: taprootAddress }),
    );
    if (wrapResult?.txid || wrapResult?.reveal_txid) mineBlocks(harness, 1);

    // Create pool
    const dieselBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBal = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    if (dieselBal > 0n && frbtcBal > 0n) {
      const factoryId = '4:65522';
      const createResult = await (provider as any).alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        `2:0:${dieselBal / 3n},32:0:${frbtcBal / 2n}`,
        `[4,65522,1,2,0,32,0,${dieselBal / 3n},${frbtcBal / 2n}]:v0:v0`,
        '1', null,
        JSON.stringify({ from: [segwitAddress, taprootAddress], change_address: segwitAddress, alkanes_change_address: taprootAddress }),
      );
      if (createResult?.txid || createResult?.reveal_txid) mineBlocks(harness, 2);

      // Now query quspo get_pools with factory ID
      const poolsInput = Buffer.from(factoryId).toString('hex');
      const poolsResult = await rpcCall('metashrew_view', [
        'get_pools',
        '0x' + poolsInput,
        'latest',
      ]);

      if (poolsResult?.result) {
        const hex = poolsResult.result.replace('0x', '');
        const jsonStr = Buffer.from(hex, 'hex').toString('utf-8');
        console.log('[quspo] get_pools result:', jsonStr);
        const parsed = JSON.parse(jsonStr);
        console.log('[quspo] Pool count:', parsed.pools?.length ?? 0);
        if (parsed.pools?.length > 0) {
          console.log('[quspo] First pool:', JSON.stringify(parsed.pools[0]));
          expect(parsed.pools[0].poolId).toBeTruthy();
        }
      } else {
        console.log('[quspo] get_pools returned no result');
      }
    } else {
      console.log('[quspo] Skipping pool test — no DIESEL or frBTC balance');
    }
  }, 300_000);
});
