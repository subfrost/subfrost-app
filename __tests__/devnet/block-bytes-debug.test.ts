/**
 * Block Bytes Debug
 *
 * Compares the raw block bytes fed to _start for:
 * 1. A DIESEL mint tx (genesis target [2:0] — works)
 * 2. A factory tx (block-4 target [4:1] — fails)
 *
 * The protorune runtime parses the OP_RETURN from the block bytes.
 * If the encoding differs, that's the bug.
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

try { bitcoin.initEccLib(ecc); } catch {}

describe('Block Bytes Debug', () => {
  let harness: any, provider: any, signer: any;
  let segwitAddress: string, taprootAddress: string;

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness; provider = ctx.provider; signer = ctx.signer;
    segwitAddress = ctx.segwitAddress; taprootAddress = ctx.taprootAddress;
    mineBlocks(harness, 201);

    // Deploy AMM
    await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
  }, 600_000);

  afterAll(() => { disposeHarness(); });

  async function buildAndInspectTx(
    protostone: string,
    inputReqs: string,
    label: string,
    toAddresses?: string[],
  ): Promise<{ txid: string; opReturnHex: string; inputCount: number; outputCount: number }> {
    const result = await provider.alkanesExecuteWithStrings(
      JSON.stringify(toAddresses || [taprootAddress]),
      inputReqs,
      protostone,
      '1',
      null,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        auto_confirm: false,
      }),
    );
    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);

    // Fetch raw tx
    const rawResult = await rpcCall('esplora_tx::hex', [txid]);
    const rawHex = rawResult?.result || '';
    const tx = bitcoin.Transaction.fromHex(rawHex);

    // Find OP_RETURN output
    let opReturnHex = '';
    for (const out of tx.outs) {
      if (out.script[0] === 0x6a) {
        opReturnHex = out.script.toString('hex');
        break;
      }
    }

    console.log(`[${label}] txid=${txid}`);
    console.log(`[${label}] inputs=${tx.ins.length} outputs=${tx.outs.length}`);
    console.log(`[${label}] OP_RETURN length=${opReturnHex.length / 2} bytes`);
    console.log(`[${label}] OP_RETURN hex=${opReturnHex}`);

    // Decode the runestone
    // OP_RETURN format: 6a (OP_RETURN) 5d (OP_13 = runestone magic) <pushdata>
    if (opReturnHex.startsWith('6a5d')) {
      console.log(`[${label}] Has runestone magic (OP_13)`);
      // The rest is pushdata with the runestone body
    } else if (opReturnHex.startsWith('6a')) {
      console.log(`[${label}] OP_RETURN but no runestone magic`);
    }

    // Log each output
    for (let i = 0; i < tx.outs.length; i++) {
      const out = tx.outs[i];
      const isOpReturn = out.script[0] === 0x6a;
      console.log(`[${label}]   out[${i}]: value=${out.value} script_type=${isOpReturn ? 'OP_RETURN' : out.script.length <= 34 ? 'P2WPKH/P2TR' : 'other'}`);
    }

    // Log each input
    for (let i = 0; i < tx.ins.length; i++) {
      const inp = tx.ins[i];
      const txidHex = Buffer.from(inp.hash).reverse().toString('hex');
      console.log(`[${label}]   in[${i}]: ${txidHex.slice(0, 16)}... vout=${inp.index} witness=${inp.witness.length}`);
    }

    mineBlocks(harness, 1);
    return { txid, opReturnHex, inputCount: tx.ins.length, outputCount: tx.outs.length };
  }

  it('should compare OP_RETURN for genesis vs block-4 target', async () => {
    // Mint DIESEL first to have tokens
    mineBlocks(harness, 1);
    await buildAndInspectTx('[2,0,77]:v0:v0', 'B:10000:v0', 'MINT');
    mineBlocks(harness, 1);

    // Check balances
    const diesel = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('[debug] DIESEL balance:', diesel.toString());
    expect(diesel).toBeGreaterThan(0n);

    // TX A: Send DIESEL to DIESEL [2:0] opcode 100 (GetSymbol) — WORKS
    console.log('\n=== TX A: Genesis target [2:0] ===');
    mineBlocks(harness, 1);
    const txA = await buildAndInspectTx(
      '[2,0,100]:v0:v0',
      '2:0:1000',
      'TX_A_GENESIS',
    );

    // TX B: Send DIESEL to factory [4:1] opcode 50 (Forward) — FAILS
    console.log('\n=== TX B: Block-4 target [4:1] ===');
    const txB = await buildAndInspectTx(
      '[4,1,50]:v0:v0',
      '2:0:1000',
      'TX_B_BLOCK4',
    );

    // Compare
    console.log('\n=== COMPARISON ===');
    console.log('TX A OP_RETURN length:', txA.opReturnHex.length / 2);
    console.log('TX B OP_RETURN length:', txB.opReturnHex.length / 2);

    // The critical difference should be in the protostone cellpack encoding
    // TX A cellpack: [2,0,100] → target block=2, tx=0, opcode=100
    // TX B cellpack: [4,1,50]  → target block=4, tx=1, opcode=50
    // The protorune runtime should treat both the same for token allocation

    // Check balances after
    const dieselAfter = await getAlkaneBalance(provider, taprootAddress, '2:0');
    console.log('DIESEL after both txs:', dieselAfter.toString());
  }, 120_000);
});
