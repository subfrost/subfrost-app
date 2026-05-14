/**
 * Devnet diagnostic — why does the SDK's coin selection report
 * "Insufficient alkanes: have 0" for DIESEL right after a successful mint?
 *
 * Background: 2026-05-14 investigation found that e2e-swaps.test.ts
 * was reporting 13/13 passing but actually silently skipping all AMM
 * pool tests because `executeAlkanes('[2,0,77]:v0:v0','2:0:1000')` and
 * the pool-create call BOTH fail with "Insufficient alkanes: have 0",
 * even though `getAlkaneBalance` via `alkanes_protorunesbyaddress`
 * reports DIESEL = 15B at the same address.
 *
 * This file is a debug harness — NOT a regression test. It prints:
 *   - The mint tx's outputs (where the DIESEL is supposed to land)
 *   - The full `alkanes_protorunesbyaddress` response (address-keyed view)
 *   - `alkanes_protorunesbyoutpoint` for each dust UTXO at the wallet
 *     addresses (per-outpoint view — what coin selection actually uses)
 *   - `esplora_address::utxo` for each address (the SDK's UTXO source)
 *
 * The goal: figure out where the per-outpoint balance lookup diverges
 * from the per-address aggregate, which is the precondition for any
 * "alkane carrier UTXO not found" coin-selection failure.
 *
 * Run:
 *   pnpm vitest run --config vitest.config.devnet.ts \
 *     __tests__/devnet/diagnose-mint-visibility.test.ts --testTimeout=300000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { DEVNET } from './devnet-constants';
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

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;

async function executeAlkanesSetup(
  protostones: string,
  inputRequirements: string,
  opts: { toAddresses?: string[] } = {},
): Promise<string> {
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostones,
    1,
    null,
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

describe('Devnet diagnostic: post-mint DIESEL visibility', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;
    mineBlocks(harness, 201);
    console.log(`[diag] addresses: segwit=${segwitAddress} taproot=${taprootAddress}`);
  }, 600_000);

  afterAll(() => {
    disposeHarness();
  });

  it('mint 3x DIESEL, then inspect every layer the SDK uses for coin selection', async () => {
    // ── Step 1: mint DIESEL three times.
    const mintTxids: string[] = [];
    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      const txid = await executeAlkanesSetup('[2,0,77]:v0:v0', 'B:10000:v0');
      mintTxids.push(txid);
      console.log(`[diag] mint #${i + 1}: txid=${txid}`);
    }
    mineBlocks(harness, 2);

    // ── Step 2: per-address aggregate (what getAlkaneBalance uses).
    const diesel = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    console.log(`[diag] alkanes_protorunesbyaddress aggregate DIESEL: ${diesel}`);

    // ── Step 3: dump the full protorunesbyaddress response — see which
    //   outpoints the indexer attributes DIESEL to.
    const par = await rpcCall('alkanes_protorunesbyaddress', [
      { address: taprootAddress, protocolTag: '1' },
    ]);
    const outpoints = par?.result?.outpoints ?? [];
    console.log(`[diag] protorunesbyaddress.outpoints.length = ${outpoints.length}`);
    for (const op of outpoints) {
      const opTxid = op?.outpoint?.txid ?? '?';
      const opVout = op?.outpoint?.vout ?? '?';
      const balances = op?.balance_sheet?.cached?.balances ?? [];
      const fmt = balances.map((b: any) => `${b.block}:${b.tx}=${b.amount}`).join(',');
      console.log(`[diag]   outpoint ${opTxid.slice(0, 16)}...:${opVout} → ${fmt || '(empty)'}`);
    }

    // ── Step 4: per-outpoint lookup via `alkanes_protorunesbyoutpoint`
    //   for each UTXO esplora reports at our addresses. THIS is what the
    //   SDK's coin selection actually uses, so any divergence between
    //   step 3 and step 4 explains the "have 0" failure.
    const fetchUtxos = async (addr: string) => {
      const res = await rpcCall('esplora_address::utxo', [addr]);
      return res?.result ?? [];
    };

    const utxoLists = [
      ['segwit', await fetchUtxos(segwitAddress)] as const,
      ['taproot', await fetchUtxos(taprootAddress)] as const,
    ];
    for (const [label, utxos] of utxoLists) {
      console.log(`[diag] ${label} esplora_address::utxo count = ${(utxos as any[]).length}`);
      for (const u of (utxos as any[])) {
        const val = u.value ?? '?';
        const status = u.status?.confirmed ?? '?';
        const block = u.status?.block_height ?? '?';
        // Per-outpoint balance lookup — same RPC the SDK uses.
        const r = await rpcCall('alkanes_protorunesbyoutpoint', [
          { txid: u.txid, vout: u.vout, protocolTag: '1' },
        ]);
        const balances =
          r?.result?.balance_sheet?.cached?.balances ??
          r?.result?.balanceSheet?.balances ??
          [];
        const fmt = balances.map((b: any) => `${b.block}:${b.tx}=${b.amount}`).join(',');
        console.log(
          `[diag]   ${label} utxo ${u.txid?.slice(0, 16)}...:${u.vout} val=${val} confirmed=${status} block=${block} → ${fmt || '(empty)'}`,
        );
      }
    }

    // ── Step 5: try the actual coin-selection failure to make sure we're
    //   reproducing the same error in this diagnostic.
    let coinSelectError: string | null = null;
    try {
      await executeAlkanesSetup('[2,0,77]:v0:v0', '2:0:1000');
    } catch (e: any) {
      coinSelectError = (e?.message || String(e)).slice(0, 300);
      console.log(`[diag] reproduced coin-selection error: ${coinSelectError}`);
    }

    // ── Step 6: assertion shape — there should be AT LEAST ONE outpoint
    //   carrying DIESEL across both lookup paths.
    expect(diesel, 'address-aggregate DIESEL must be > 0 after 3 mints').toBeGreaterThan(0n);

    const hasDieselViaByAddress = outpoints.some((op: any) => {
      const balances = op?.balance_sheet?.cached?.balances ?? [];
      return balances.some((b: any) => Number(b.block) === 2 && Number(b.tx) === 0);
    });
    expect(hasDieselViaByAddress, 'at least one outpoint in protorunesbyaddress.outpoints must carry DIESEL [2:0]').toBe(true);

    // ── Diagnostic-only assertion: per-outpoint lookup matches per-address.
    // If this fails, the SDK's coin selection (which uses per-outpoint) is
    // looking at a different view than `getAlkaneBalance` (per-address) —
    // which is precisely the "have 0" bug we're investigating.
    let dieselViaPerOutpoint = 0n;
    for (const [, utxos] of utxoLists) {
      for (const u of (utxos as any[])) {
        const r = await rpcCall('alkanes_protorunesbyoutpoint', [
          { txid: u.txid, vout: u.vout, protocolTag: '1' },
        ]);
        const balances =
          r?.result?.balance_sheet?.cached?.balances ??
          r?.result?.balanceSheet?.balances ??
          [];
        for (const b of balances) {
          if (Number(b.block) === 2 && Number(b.tx) === 0) {
            dieselViaPerOutpoint += BigInt(b.amount ?? '0');
          }
        }
      }
    }
    console.log(`[diag] DIESEL via per-outpoint sum: ${dieselViaPerOutpoint}`);
    console.log(`[diag] DIESEL via per-address agg: ${diesel}`);
    expect(
      dieselViaPerOutpoint,
      `per-outpoint sum (${dieselViaPerOutpoint}) must match per-address (${diesel}) — ` +
      `divergence is the root cause of the "Insufficient alkanes: have 0" coin-selection failure`,
    ).toBe(diesel);
  }, 300_000);
});
