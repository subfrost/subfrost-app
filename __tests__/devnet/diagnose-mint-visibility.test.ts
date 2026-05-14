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

  it('dust-carrier mint puts DIESEL on a 546-sat UTXO that the SDK can spend', async () => {
    // Production pattern: mint DIESEL with the `:v1:v1` cellpack pointer so
    // the runtime routes the minted alkanes to output 1 (a fresh 546-sat
    // dust carrier), not output 0 (the funded BTC output). Per
    // alkanes-rs/crates/alkanes-cli-common/src/alkanes/execute.rs ~L?
    //   `.filter(|(_, u)| u.amount <= 1000) // alkanes live on dust`
    // — the SDK's per-outpoint protorunesbyoutpoint fan-out only checks
    // UTXOs with value <= 1000 sats. The 10000-sat output produced by
    // `[2,0,77]:v0:v0` with `B:10000:v0` is invisible to coin selection
    // because of this dust filter, even though the indexer indexes the
    // DIESEL on that outpoint just fine.
    mineBlocks(harness, 1);
    const mintTxid = await executeAlkanesSetup(
      '[2,0,77]:v1:v1',
      'B:10000:v0',
      { toAddresses: [taprootAddress, taprootAddress] },
    );
    mineBlocks(harness, 2);
    console.log(`[dust-mint] minted DIESEL via dust carrier at ${mintTxid}:1`);

    // Look at the on-chain tx — output 1 should be ~546 sats with DIESEL.
    const rawRes = await rpcCall('esplora_tx::raw', [mintTxid]);
    const rawHex = rawRes?.result;
    if (rawHex) {
      const tx = bitcoin.Transaction.fromHex(rawHex);
      for (let i = 0; i < tx.outs.length; i++) {
        const out = tx.outs[i];
        const isOp = out.script[0] === 0x6a;
        console.log(`[dust-mint]   vout=${i} value=${out.value} op_return=${isOp}`);
      }
    }

    // Per-outpoint balance — DIESEL should be at vout=1.
    const r1 = await rpcCall('alkanes_protorunesbyoutpoint', [
      { txid: mintTxid, vout: 1, protocolTag: '1' },
    ]);
    const v1Balances = r1?.result?.balance_sheet?.cached?.balances ?? [];
    const v1Diesel = v1Balances
      .filter((b: any) => Number(b.block) === 2 && Number(b.tx) === 0)
      .reduce((s: bigint, b: any) => s + BigInt(b.amount ?? '0'), 0n);
    console.log(`[dust-mint] vout=1 DIESEL: ${v1Diesel}`);

    expect(v1Diesel, 'DIESEL must land on vout=1 (the dust carrier) via :v1:v1 pointer').toBeGreaterThan(0n);

    // Now: can the SDK actually spend it? Trigger a consolidation mint that
    // consumes 1000 DIESEL as input. This is the same call that fails
    // ("have 0") when DIESEL is on a non-dust carrier.
    mineBlocks(harness, 1);
    let consolidationTxid: string | null = null;
    let consolidationError: string | null = null;
    try {
      consolidationTxid = await executeAlkanesSetup('[2,0,77]:v1:v1', '2:0:1000', {
        toAddresses: [taprootAddress, taprootAddress],
      });
    } catch (e: any) {
      consolidationError = (e?.message || String(e)).slice(0, 300);
    }

    expect(
      consolidationError,
      `SDK coin selection must find DIESEL on dust UTXO and broadcast the consolidation; got: ${consolidationError}`,
    ).toBeNull();
    expect(consolidationTxid, 'consolidation broadcast should produce a txid').toBeTruthy();
  }, 120_000);

  it('protorunesbyoutpoint determinism — same RPC, same outpoint, 5 calls', async () => {
    // Mint a single DIESEL UTXO so we have a fresh outpoint to query.
    mineBlocks(harness, 1);
    const mintTxid = await executeAlkanesSetup('[2,0,77]:v0:v0', 'B:10000:v0');
    mineBlocks(harness, 2);
    console.log(`[determinism] minted DIESEL at ${mintTxid}:0`);

    // The DIESEL output is vout=0 of the mint tx (per `[2,0,77]:v0:v0`
    // — cellpack at output 0, pointer to output 0).
    const op = { txid: mintTxid, vout: 0 };

    const balances: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await rpcCall('alkanes_protorunesbyoutpoint', [
        { txid: op.txid, vout: op.vout, protocolTag: '1' },
      ]);
      const bal = (
        r?.result?.balance_sheet?.cached?.balances ??
        r?.result?.balanceSheet?.balances ??
        []
      ) as Array<{ block: number | string; tx: number | string; amount: string | number }>;
      let diesel = 0n;
      for (const b of bal) {
        if (Number(b.block) === 2 && Number(b.tx) === 0) {
          diesel += BigInt(b.amount ?? '0');
        }
      }
      balances.push(diesel);
      console.log(`[determinism]   call #${i + 1}: DIESEL=${diesel}`);
    }

    // All 5 calls must agree. If they don't, that's a flat-out indexer
    // bug — same view fn, same input, same height, different answer.
    const first = balances[0];
    for (let i = 1; i < balances.length; i++) {
      expect(
        balances[i],
        `protorunesbyoutpoint must be deterministic. call #1=${first}, call #${i + 1}=${balances[i]}`,
      ).toBe(first);
    }
    expect(first, 'first call must see the freshly-minted DIESEL').toBeGreaterThan(0n);
  }, 120_000);

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
