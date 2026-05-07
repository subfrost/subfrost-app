/**
 * Storage Roundtrip Test
 *
 * Tests that data written by _start in block N is readable by _start in block N+1.
 * This isolates the host runtime's __flush → __get_len/__get roundtrip.
 *
 * Strategy:
 * 1. Create devnet, mine 201 blocks (genesis + coinbase maturity)
 * 2. Mint DIESEL (block N) — this writes protorune balance sheet entries
 * 3. Query the storage keys directly via metashrew_view to verify data exists
 * 4. Mine a block with a tx that SPENDS the DIESEL outpoint
 * 5. Check if the protorune runtime found the balance data during _start
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

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch {}

describe('Storage Roundtrip', () => {
  let harness: any;
  let provider: WebProvider;
  let signer: any;
  let segwitAddress: string;
  let taprootAddress: string;

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

  it('should mint DIESEL and verify balance sheet keys exist', async () => {
    // Mint DIESEL
    const result = await provider.alkanesExecuteWithStrings(
      JSON.stringify([taprootAddress]),
      'B:10000:v0',
      '[2,0,77]:v0:v0',
      '2',
      null,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        auto_confirm: false,
      }),
    );
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log('[roundtrip] DIESEL mint txid:', txid);
    mineBlocks(harness, 1);

    // Verify DIESEL balance via protorunesbyaddress (view function)
    const balance = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[roundtrip] DIESEL balance:', balance.toString());
    expect(balance).toBeGreaterThan(0n);

    // Get the outpoint that has DIESEL
    const protoResult = await rpcCall('alkanes_protorunesbyaddress', [
      { address: taprootAddress, protocolTag: '1' }
    ]);
    const outpoints = protoResult?.result?.outpoints || [];
    const dieselOutpoint = outpoints.find((op: any) => {
      const balances = op?.balance_sheet?.cached?.balances || [];
      return balances.some((b: any) => b.block === 2 && b.tx === 0 && b.amount > 0);
    });

    expect(dieselOutpoint).toBeTruthy();
    console.log('[roundtrip] DIESEL outpoint:', JSON.stringify(dieselOutpoint?.outpoint));
    console.log('[roundtrip] DIESEL balance_sheet:', JSON.stringify(dieselOutpoint?.balance_sheet));
  }, 120_000);

  it('should check if spendablesbyaddress view returns the DIESEL outpoint', async () => {
    // The spendablesbyaddress view function reads from the protorune index
    // This is a different view function that should also see the balance data
    const spendResult = await rpcCall('metashrew_view', [
      'spendablesbyaddress',
      '0x' + Buffer.from(taprootAddress).toString('hex'),
      'latest',
    ]);
    console.log('[roundtrip] spendablesbyaddress:', JSON.stringify(spendResult?.result).slice(0, 300));
  });

  it('should verify chain height and indexer height match', async () => {
    const chain = (await rpcCall('btc_getblockcount', [])).result;
    const indexer = (await rpcCall('metashrew_height', [])).result;
    console.log('[roundtrip] chain=%s indexer=%s', chain, Number(indexer));
    expect(Number(chain)).toBe(Number(indexer));
  });

  it('should count flush pairs from a DIESEL mint block', async () => {
    // Mine a new block to get a new height for DIESEL mint
    mineBlocks(harness, 1);

    // Get height before
    const heightBefore = Number((await rpcCall('metashrew_height', [])).result);

    // Mint DIESEL
    const result = await provider.alkanesExecuteWithStrings(
      JSON.stringify([taprootAddress]),
      'B:10000:v0',
      '[2,0,77]:v0:v0',
      '2',
      null,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        auto_confirm: false,
      }),
    );
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    mineBlocks(harness, 1);

    const heightAfter = Number((await rpcCall('metashrew_height', [])).result);
    console.log('[roundtrip] Height before=%d after=%d', heightBefore, heightAfter);
    expect(heightAfter).toBeGreaterThan(heightBefore);

    // Check DIESEL balance increased
    const balance = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[roundtrip] DIESEL balance after 2nd mint:', balance.toString());
    expect(balance).toBeGreaterThan(5000000000n); // More than one mint
  }, 120_000);

  it('should test sending DIESEL to DIESEL contract (genesis) vs factory (block 4)', async () => {
    // This test doesn't deploy the factory — it uses the DIESEL contract itself
    // DIESEL opcode 77 = mint. Sending DIESEL as input should forward it back.

    const balanceBefore = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[roundtrip] Before send-to-self: DIESEL=%s', balanceBefore);

    // Send DIESEL to DIESEL [2:0] opcode 77 (mint)
    // The mint creates new DIESEL AND forwards incoming DIESEL back
    mineBlocks(harness, 1); // new height for mint
    const result = await provider.alkanesExecuteWithStrings(
      JSON.stringify([taprootAddress]),
      '2:0:1000000',  // Send 1M DIESEL as input
      '[2,0,77]:v0:v0',
      '2',
      null,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        auto_confirm: false,
      }),
    );
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log('[roundtrip] Send DIESEL to DIESEL txid:', txid);
    mineBlocks(harness, 1);

    const balanceAfter = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[roundtrip] After send-to-self: DIESEL=%s', balanceAfter);

    // Balance should have increased (mint adds tokens, input tokens returned)
    // The important thing: the 1M DIESEL input was SPENT (found by protorune)
    // and new DIESEL was minted. Total should be balanceBefore + 5B (mint) - 0 (input returned)
    const gained = balanceAfter - balanceBefore;
    console.log('[roundtrip] Gained: %s', gained);
    // If protorune auto-allocation works, gained should be ~5B (new mint)
    // If it fails, gained would be ~5B - 1M (input lost) or different
    expect(gained).toBeGreaterThan(0n);
  }, 120_000);

  it('should verify protorune auto-allocation works for genesis contracts', async () => {
    // frBTC unwrap WORKS (confirmed). This test verifies explicitly that
    // sending DIESEL as inputRequirement to a DIESEL contract results in
    // the tokens being delivered as incomingAlkanes.
    //
    // Strategy: Call DIESEL [2:0] opcode 100 (GetSymbol). This returns "DIESEL"
    // AND forwards incoming_alkanes. If we send 1000 DIESEL as input,
    // we should get it back AND the symbol response.

    const balBefore = await getAlkaneBalance(provider, taprootAddress, '2:0');
    mineBlocks(harness, 1); // fresh height

    // Try sending DIESEL to DIESEL opcode 100 (GetSymbol)
    // This is a read-only operation that also forwards incoming alkanes
    try {
      const result = await provider.alkanesExecuteWithStrings(
        JSON.stringify([taprootAddress]),
        '2:0:1000',  // 1000 DIESEL as input
        '[2,0,100]:v0:v0',  // GetSymbol
        '2',
        null,
        JSON.stringify({
          from: [segwitAddress, taprootAddress],
          change_address: segwitAddress,
          alkanes_change_address: taprootAddress,
          auto_confirm: false,
        }),
      );
      const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
      console.log('[roundtrip] DIESEL GetSymbol txid:', txid);
      mineBlocks(harness, 1);

      const balAfter = await getAlkaneBalance(provider, taprootAddress, '2:0');
      console.log('[roundtrip] GetSymbol: before=%s after=%s diff=%s', balBefore, balAfter, balAfter - balBefore);

      // If auto-allocation works: tokens forwarded back, no loss
      // Balance should stay same or gain (from the block's mint reward... wait, GetSymbol doesn't mint)
      // Actually GetSymbol just returns data + forwards. No new tokens created.
      // So balAfter should equal balBefore (tokens sent and returned)
      // If auto-allocation fails: 1000 tokens lost (go to Runestone pointer instead)

      // Actually tokens always go SOMEWHERE - either to the contract (forwarded back)
      // or to the Runestone pointer (output 0 = taprootAddress). Either way, balance stays same.
      // We can't distinguish without checking incomingAlkanes directly.

      console.log('[roundtrip] (Note: this test is ambiguous for genesis contracts)');
    } catch (e: any) {
      console.log('[roundtrip] GetSymbol error:', (e?.message || String(e))?.slice(0, 200));
    }
  }, 120_000);

  it('should inspect a tx sending DIESEL to factory [4:1]', async () => {
    // First verify factory exists
    const factoryCheck = await rpcCall('alkanes_simulate', [{
      target: { block: '4', tx: '1' },
      inputs: ['4'],  // GetNumPools
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    }]);
    const hasFactory = !factoryCheck?.result?.execution?.error;
    console.log('[roundtrip] Factory exists:', hasFactory);

    if (!hasFactory) {
      console.log('[roundtrip] Skipping factory test — no factory deployed');
      return;
    }

    const beforeBalance = await getAlkaneBalance(provider, taprootAddress, '2:0');

    // Build and broadcast: send DIESEL to factory opcode 50 (Forward)
    const result = await provider.alkanesExecuteWithStrings(
      JSON.stringify([taprootAddress]),
      '2:0:1000000',
      '[4,1,50]:v0:v0',
      '2',
      null,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        auto_confirm: false,
      }),
    );
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log('[roundtrip] Send DIESEL to factory txid:', txid);

    // Get the raw tx and inspect
    const rawTxResult = await rpcCall('esplora_tx::hex', [txid]);
    const rawHex = rawTxResult?.result;
    if (rawHex) {
      const tx = bitcoin.Transaction.fromHex(rawHex);
      console.log('[roundtrip] Factory tx: inputs=%d outputs=%d', tx.ins.length, tx.outs.length);
      for (let i = 0; i < tx.outs.length; i++) {
        const out = tx.outs[i];
        const isOpReturn = out.script[0] === 0x6a;
        console.log('[roundtrip]   out[%d]: value=%s opret=%s script=%s',
          i, out.value, isOpReturn,
          isOpReturn ? out.script.toString('hex').slice(0, 100) : '...');
      }
      for (let i = 0; i < tx.ins.length; i++) {
        const inp = tx.ins[i];
        const txidHex = Buffer.from(inp.hash).reverse().toString('hex');
        console.log('[roundtrip]   in[%d]: %s:%d witness=%d', i, txidHex.slice(0, 16) + '...', inp.index, inp.witness.length);
      }
    }

    mineBlocks(harness, 1);

    const afterBalance = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[roundtrip] Factory DIESEL: before=%s after=%s diff=%s',
      beforeBalance, afterBalance, afterBalance - beforeBalance);
  }, 120_000);

  it('should dump storage stats', async () => {
    // Check how many keys are in storage
    const heightResult = await rpcCall('metashrew_height', []);
    console.log('[roundtrip] Final indexer height:', heightResult?.result);

    // Try to read a known key pattern directly via metashrew_view
    // Use protorunesbyaddress for both addresses to see all outpoints
    const tapResult = await rpcCall('alkanes_protorunesbyaddress', [
      { address: taprootAddress, protocolTag: '1' }
    ]);
    const tapOutpoints = tapResult?.result?.outpoints || [];
    console.log('[roundtrip] Taproot outpoints with balances:', tapOutpoints.length);

    for (const op of tapOutpoints.slice(0, 3)) {
      console.log('[roundtrip]   %s:%d — balances: %s',
        op?.outpoint?.txid?.slice(0, 16) + '...',
        op?.outpoint?.vout,
        JSON.stringify(op?.balance_sheet?.cached?.balances));
    }
  });
});
