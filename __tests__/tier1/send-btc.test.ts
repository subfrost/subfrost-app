/**
 * Tier 1: BTC Send Test
 *
 * Verifies sending BTC from the test wallet to a recipient address on regtest.
 * Uses the SDK's PSBT builder directly (no UI).
 *
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/send-btc.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import {
  createRegtestTestContext,
  getBtcBalance,
  mineBlocks,
  rpcCall,
  sleep,
} from '../shared/regtest-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Initialize ECC
try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

const INTEGRATION = !!process.env.INTEGRATION;
const SEND_AMOUNT = 50_000; // 50K sats

describe.runIf(INTEGRATION)('Tier 1: Send BTC', () => {
  let provider: WebProvider;
  let signer: TestSignerResult;
  let segwitAddress: string;
  let taprootAddress: string;
  const recipientAddress = 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx';

  beforeAll(async () => {
    const ctx = await createRegtestTestContext();
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Fund wallet
    const balance = await getBtcBalance(provider, segwitAddress);
    if (balance < 100_000_000n) {
      await mineBlocks(provider, 201, segwitAddress);
      await sleep(3000);
    }
  }, 120_000);

  it('should send BTC to a recipient and verify balances', async () => {
    // Snapshot balances
    const senderBefore = await getBtcBalance(provider, segwitAddress);
    const recipientBefore = await getBtcBalance(provider, recipientAddress);
    console.log(`[send-btc] Before: sender=${senderBefore}, recipient=${recipientBefore}`);

    expect(senderBefore).toBeGreaterThan(BigInt(SEND_AMOUNT + 10000));

    // Get UTXOs via esplora RPC
    const utxoResult = await rpcCall('esplora_address::utxo', [segwitAddress]);
    const allUtxos: Array<{
      txid: string; vout: number; value: number;
      status?: { block_height?: number; confirmed?: boolean };
    }> = utxoResult?.result || [];

    // Get current height to filter out immature coinbase UTXOs
    const heightResult = await rpcCall('metashrew_height', []);
    const currentHeight = Number(heightResult?.result || 0);

    // Filter: skip UTXOs mined within last 101 blocks — these could be coinbase
    // rewards that require 100 confirmations to be spendable.
    // Also skip unconfirmed and tiny (likely alkane dust) UTXOs.
    const utxos = allUtxos
      .filter(u => {
        const height = u.status?.block_height || 0;
        if (!height || !u.status?.confirmed) return false;
        if (u.value < 1000) return false; // skip alkane dust
        const depth = currentHeight - height;
        return depth >= 101; // only use mature UTXOs
      })
      .sort((a, b) => (a.status?.block_height || 0) - (b.status?.block_height || 0));

    expect(utxos.length).toBeGreaterThan(0);
    console.log(`[send-btc] Found ${utxos.length} spendable UTXOs (filtered from ${allUtxos.length})`);

    // Build PSBT manually
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

    // Add inputs until we have enough
    let totalInput = 0;
    for (const utxo of utxos) {
      if (totalInput >= SEND_AMOUNT + 5000) break;

      const txHex = await fetchRawTx(utxo.txid);
      if (!txHex) continue;

      const prevTx = bitcoin.Transaction.fromHex(txHex);
      const output = prevTx.outs[utxo.vout];
      if (!output) continue;

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: output.script,
          value: BigInt(output.value),
        },
      });
      totalInput += utxo.value;
    }

    // Add recipient output
    psbt.addOutput({
      address: recipientAddress,
      value: BigInt(SEND_AMOUNT),
    });

    // Calculate fee and add change
    const estimatedVsize = psbt.inputCount * 68 + 2 * 31 + 10;
    const fee = estimatedVsize * 2; // 2 sat/vB
    const change = totalInput - SEND_AMOUNT - fee;

    if (change > 546) {
      psbt.addOutput({
        address: segwitAddress,
        value: BigInt(change),
      });
    }

    // Sign
    const psbtHex = psbt.toHex();
    const { signedHexPsbt } = await signer.signer.signAllInputs({
      rawPsbtHex: psbtHex,
    });

    const signedPsbt = bitcoin.Psbt.fromHex(signedHexPsbt, {
      network: bitcoin.networks.regtest,
    });
    const tx = signedPsbt.extractTransaction();
    const txHex = tx.toHex();
    const txid = tx.getId();

    // Broadcast
    const broadcastResult = await provider.broadcastTransaction(txHex);
    console.log(`[send-btc] Broadcast txid: ${txid}`);
    expect(broadcastResult || txid).toBeTruthy();

    // Mine blocks and wait for indexer
    await provider.bitcoindGenerateToAddress(3, segwitAddress);
    await sleep(5000);

    // Verify recipient received funds
    const recipientAfter = await getBtcBalance(provider, recipientAddress);
    console.log(`[send-btc] Recipient balance: before=${recipientBefore}, after=${recipientAfter}`);
    expect(recipientAfter).toBeGreaterThanOrEqual(recipientBefore + BigInt(SEND_AMOUNT));
  }, 120_000);
});

/**
 * Fetch raw transaction hex via esplora RPC.
 */
async function fetchRawTx(txid: string): Promise<string | null> {
  try {
    const result = await rpcCall('esplora_tx::hex', [txid]);
    if (typeof result?.result === 'string') return result.result;
    return null;
  } catch {
    return null;
  }
}
