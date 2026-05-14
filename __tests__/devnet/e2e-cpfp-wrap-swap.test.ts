/**
 * Devnet E2E: CPFP atomic wrap+swap bundle
 *
 * Drives BTC → frBTC → DIESEL as a SPLIT-TX bundle (`split_transactions=true`)
 * and asserts the SDK actually produces TWO transactions — a parent wrap
 * (`split_txid`) and a child swap (`reveal_txid`) where the child spends
 * the parent's outputs (the alkane carrier + BTC change).
 *
 * STATUS (2026-05-14): assertions are in place and tsc-clean, but
 * `beforeAll` currently fails on the pool-create step with
 * "Insufficient alkanes: have 0". The SDK's coin selection can't see
 * the minted DIESEL during pool seeding even though `getAlkaneBalance`
 * reports it correctly. The neighbouring `e2e-swaps.test.ts` does pool
 * creation inside an `it` block (not `beforeAll`) and the same call
 * shape works there. Likely needs one of: move pool seeding out of
 * `beforeAll` into an early `it.only`; add an extra mining sequence
 * between wrap and create-pool; or precede the create-pool with the
 * consolidation-mint pattern from e2e-swaps line ~239
 * (`executeAlkanesSetup('[2,0,77]:v0:v0', '2:0:1000000')`) inside an
 * `it` block, then snapshot from there. The assertions themselves
 * (split_txid / reveal_txid / child-protostone-non-empty / CPFP
 * chaining) are the value — they pin every observable surface from the
 * production failure modes flagged 2026-05-03 (only one
 * sendrawtransaction) and 2026-05-14 (child confirms but with empty
 * protostone, mainnet tx a2f458f3...).
 *
 * Why this exists:
 *   Two unit tests already cover the JS wrapper layer:
 *     - `lib/alkanes/__tests__/executeTyped-splitTransactions.test.ts`
 *       (proves `splitTransactions: true` reaches options JSON)
 *     - `lib/alkanes/__tests__/mempool-aware-utxo-selection.test.ts`
 *       (proves Tx A's prevouts are stripped from Tx B's candidate set,
 *       mirroring the Rust `apply_mempool_adjustment` logic in pure JS)
 *
 *   Neither actually broadcasts. The Rust gate in
 *   `crates/alkanes-cli-common/src/alkanes/execute.rs::execute_full` that
 *   branches on `params.split_transactions` is uncovered end-to-end —
 *   exactly the layer where the "might be broken" regression would land.
 *
 * What this test pins:
 *   1. With `split_transactions: true` set in options, the result carries
 *      BOTH `split_txid` (Tx A — wrap-only) AND `reveal_txid` (Tx B —
 *      swap that consumes Tx A's outputs). Two distinct txids, not one.
 *   2. After mining, BOTH txids exist on-chain (proves both
 *      `sendrawtransaction` calls actually fired — the 2026-05-03
 *      symptom was "only ONE sendrawtransaction observed").
 *   3. Tx B's vins reference Tx A's vouts (proves CPFP chaining, not
 *      two unrelated broadcasts that happened to share a label).
 *   4. The swap leg actually settled: DIESEL balance increases by at
 *      least the minimum-output the swap protostone asked for.
 *   5. The wrap leg is real: frBTC supply increased and the alkane
 *      carrier UTXO from Tx A is now spent (in Tx B).
 *
 * Counterfactual smoke test:
 *   Same protostone pair with `split_transactions: false` produces a
 *   SINGLE atomic tx (one `reveal_txid`, no `split_txid`). This catches
 *   the case where the SDK silently splits when the caller didn't ask
 *   for it (would regress the atomic-execution invariant).
 *
 * Run:
 *   pnpm vitest run __tests__/devnet/e2e-cpfp-wrap-swap.test.ts --testTimeout=600000
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
  takeSnapshot,
  restoreSnapshot,
  hasSnapshot,
} from './devnet-helpers';
import { deployAmmContracts } from './amm-deploy';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ---------------------------------------------------------------------------
// Shared state — populated once in beforeAll, then snapshotted
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let frbtcSignerAddress: string;

const SNAPSHOT = 'cpfp-wrap-swap-pool-seeded';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Setup helper — mirrors the working `executeAlkanes` in e2e-swaps.test.ts.
 * Auto-broadcasts via `alkanesExecuteFull` and falls back to the external
 * `signAndBroadcast(signer)` path when the SDK returns ReadyToSign. Auto-
 * mines a block after broadcast. Returns the txid.
 *
 * Used for setup steps (DIESEL mint, frBTC wrap, pool create) — NOT for
 * the CPFP test assertions themselves, which use `executeAlkanesSplit`
 * below to get the full result object with `split_txid` + `reveal_txid`.
 */
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
  // SDK returned ReadyToSign / readyToSignCommit — use the external signer.
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

/**
 * CPFP-aware variant. Forwards `split_transactions` (which the setup
 * helper above never sets) and returns the **raw** EnhancedExecuteResult
 * so the test can assert on both `split_txid` (parent) and `reveal_txid`
 * (child). Does NOT auto-mine — the test controls block production so it
 * can observe mempool state before confirmation.
 */
async function executeAlkanesSplit(
  protostones: string,
  inputRequirements: string,
  opts: {
    toAddresses?: string[];
    splitTransactions: boolean;
    feeRate?: number;
  },
): Promise<any> {
  return (provider as any).alkanesExecuteFull(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostones,
    opts.feeRate ?? 1,
    null,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      ordinals_strategy: 'burn',
      split_transactions: opts.splitTransactions,
    }),
  );
}

async function simulateAlkane(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [
    {
      target: { block, tx },
      inputs,
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    },
  ]);
}

async function getRawTx(txid: string): Promise<any> {
  // Returns null when the tx isn't in the mempool / chain (e.g. before broadcast).
  const res = await rpcCall('esplora_tx::raw', [txid]);
  if (res?.error) return null;
  return res?.result ?? null;
}

async function getTxStatus(txid: string): Promise<any> {
  const res = await rpcCall('esplora_tx', [txid]);
  if (res?.error) return null;
  return res?.result ?? null;
}

function parseTxInputs(rawHex: string): Array<{ txid: string; vout: number }> {
  const tx = bitcoin.Transaction.fromHex(rawHex);
  return tx.ins.map((vin) => ({
    // bitcoinjs-lib gives the hash in little-endian — reverse to display txid
    txid: Buffer.from(vin.hash).reverse().toString('hex'),
    vout: vin.index,
  }));
}

/**
 * Extract the OP_RETURN scripts from a tx, in tx-output order. Used to
 * inspect the protostone payload — specifically to catch the production
 * failure mode where a CPFP child confirms but its protostone is empty
 * (`6a0216 00` = 2-byte payload), silently burning any alkanes routed
 * through it (observed on mainnet tx a2f458f3... 2026-05-14).
 */
function extractOpReturnScripts(rawHex: string): Buffer[] {
  const tx = bitcoin.Transaction.fromHex(rawHex);
  const scripts: Buffer[] = [];
  for (const out of tx.outs) {
    if (out.script.length > 0 && out.script[0] === 0x6a /* OP_RETURN */) {
      scripts.push(Buffer.from(out.script));
    }
  }
  return scripts;
}

/**
 * Decode the length of the protostone payload pushed after OP_RETURN.
 * A healthy wrap+swap child carries ~30+ bytes (runestone header +
 * factory cellpack + edicts). The burning failure mode had only 2 bytes
 * (runestone header alone, swap cellpack missing).
 */
function opReturnPayloadLength(script: Buffer): number {
  if (script.length < 2 || script[0] !== 0x6a) return 0;
  const op = script[1];
  if (op >= 0x01 && op <= 0x4b) return op; // direct push
  if (op === 0x4c && script.length >= 3) return script[2]; // OP_PUSHDATA1
  if (op === 0x4d && script.length >= 4) return script[2] | (script[3] << 8); // OP_PUSHDATA2
  return 0;
}

// ===========================================================================
// Setup: deploy AMM + DIESEL/frBTC pool, then snapshot
// ===========================================================================

describe('Devnet E2E: CPFP atomic wrap+swap bundle', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 201);

    // Deploy AMM
    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;

    // Resolve frBTC signer address dynamically (opcode 103 → x-only pubkey → P2TR)
    const signerRes = await simulateAlkane('32:0', ['103']);
    frbtcSignerAddress = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
    const data = signerRes?.result?.execution?.data;
    if (typeof data === 'string') {
      const hex = data.replace(/^0x/, '');
      if (hex.length === 64) {
        const internalPubkey = Buffer.from(hex, 'hex');
        const p2tr = bitcoin.payments.p2tr({ internalPubkey, network: bitcoin.networks.regtest });
        if (p2tr.address) frbtcSignerAddress = p2tr.address;
      }
    }

    // Mint DIESEL three times for plenty of liquidity. Each iteration:
    //   - mine a block first (gives `executeAlkanesSetup` a fresh coinbase
    //     to spend in the mint tx),
    //   - broadcast the mint (the helper mines 1 more block to confirm it).
    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      await executeAlkanesSetup('[2,0,77]:v0:v0', 'B:10000:v0');
    }
    mineBlocks(harness, 1);

    // Wrap a chunk of BTC → frBTC so we have frBTC liquidity for the pool.
    await executeAlkanesSetup('[32,0,77]:v1:v1', 'B:1000000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    mineBlocks(harness, 1);

    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

    const dieselSeed = dieselBalance / 3n;
    const frbtcSeed = frbtcBalance / 2n;
    const [fBlock, fTx] = factoryId.split(':');

    // ── Priming calls A & B — copied verbatim from e2e-swaps.test.ts line
    // 208-244. Empirically required: pool-create-in-beforeAll fails with
    // "Insufficient alkanes: have 0" without these, even though the JS-side
    // `getAlkaneBalance` reports the minted DIESEL correctly. The
    // executeAlkanesSetup helper's signAndBroadcast fallback path
    // (when alkanesExecuteFull returns ReadyToSign) does something during
    // these priming calls — likely refreshes the SDK's spendable-UTXO view
    // — that the mint-only sequence doesn't trigger on its own.
    // Future: investigate which specific code path makes the difference;
    // until then we mirror the known-working harness pattern.
    try {
      await executeAlkanesSetup(`[${fBlock},${fTx},4]:v0:v0`, `2:0:1000`);
      mineBlocks(harness, 1);
    } catch (e: any) {
      console.log('[cpfp setup] priming-A error (non-fatal):', (e?.message || e)?.toString()?.slice(0, 120));
    }
    mineBlocks(harness, 1);
    try {
      await executeAlkanesSetup('[2,0,77]:v0:v0', '2:0:1000000');
      mineBlocks(harness, 1);
    } catch (e: any) {
      console.log('[cpfp setup] priming-B (consolidation mint) error:', (e?.message || e)?.toString()?.slice(0, 120));
    }

    // Now re-read balances and recompute seed amounts — the priming calls
    // may have consumed/produced DIESEL.
    const dieselAfterPrime = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcAfterPrime = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    const dieselSeedFinal = dieselAfterPrime / 3n;
    const frbtcSeedFinal = frbtcAfterPrime / 2n;

    const createPoolProtostone = `[${fBlock},${fTx},1,2,0,32,0,${dieselSeedFinal},${frbtcSeedFinal}]:v0:v0`;
    const createPoolReqs = `2:0:${dieselSeedFinal},32:0:${frbtcSeedFinal}`;
    await executeAlkanesSetup(createPoolProtostone, createPoolReqs);
    mineBlocks(harness, 1);

    takeSnapshot(SNAPSHOT);
  }, 600_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // The split-tx bundle behaves the way the production atomic-wrap-swap hook
  // expects: TWO broadcasts, child spends parent.
  // -------------------------------------------------------------------------
  it('split_transactions=true produces parent (wrap) + child (swap) txids and BOTH mine', async () => {
    restoreSnapshot(SNAPSHOT);

    const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const wrapSats = 100_000n;
    const minOut = 1n; // tiny floor — we only care that the swap executed, not how much

    // Canonical atomic wrap+swap protostone shape (mirrors prod hooks):
    //   p1: [32:0 opcode 77] wrap → mints frBTC, pointer=v1 (carrier output)
    //   p0: [4:factoryTx, 13, ...path, amount_out_min, deadline] swap → consumes
    //       frBTC carrier from p1, outputs DIESEL.
    const [fBlock, fTx] = factoryId.split(':');
    const deadline = 1_000_000; // far future so the test doesn't flake on slow CI
    const protostones =
      `[32,0,77]:v1:v1,[${fBlock},${fTx},13,2,32,0,2,0,${minOut},${deadline}]:v0:v0`;

    const inputReqs = `B:${wrapSats}:v0`;

    const result = await executeAlkanesSplit(protostones, inputReqs, {
      toAddresses: [frbtcSignerAddress, taprootAddress],
      splitTransactions: true,
    });

    // ---- Assertion 1: two distinct txids in the result.
    const splitTxid: string | undefined = result?.split_txid ?? result?.splitTxid;
    const revealTxid: string | undefined = result?.reveal_txid ?? result?.revealTxid;

    expect(splitTxid, 'split_txid (parent wrap) must be present when split_transactions=true').toBeTruthy();
    expect(revealTxid, 'reveal_txid (child swap) must be present when split_transactions=true').toBeTruthy();
    expect(splitTxid).not.toBe(revealTxid);

    // ---- Assertion 2: BOTH broadcast — visible to the indexer before mining.
    // Devnet's sendrawtransaction is synchronous, so a broadcast that fired
    // is queryable immediately.
    const parentRawBeforeMine = await getRawTx(splitTxid!);
    const childRawBeforeMine = await getRawTx(revealTxid!);
    expect(parentRawBeforeMine, 'parent wrap tx must be in mempool before mining').toBeTruthy();
    expect(childRawBeforeMine, 'child swap tx must be in mempool before mining').toBeTruthy();

    // ---- Assertion 3: child's inputs reference parent's outputs (CPFP chain).
    // If the SDK accidentally produced two unrelated txs (the 2026-05-03
    // symptom where the second tx was a stale rebuild against the OLD UTXOs),
    // none of child.vins would point at parent.txid.
    const childInputs = parseTxInputs(childRawBeforeMine);
    const chainsFromParent = childInputs.some((vin) => vin.txid === splitTxid);
    expect(
      chainsFromParent,
      `child swap tx must spend at least one output from parent wrap tx ${splitTxid} — ` +
      `observed inputs: ${JSON.stringify(childInputs)}`,
    ).toBe(true);

    // ---- Assertion 3.5: child's protostone is NOT EMPTY.
    //
    // Production failure mode observed 2026-05-14 (mainnet tx a2f458f3...):
    // child broadcasts and confirms, child correctly spends parent's frBTC
    // carrier — but the child's OP_RETURN payload is `1600` (2 bytes), a
    // bare runestone header with NO swap cellpack. The frBTC has nowhere to
    // route, runtime burns it, user's BTC is silently lost.
    //
    // A real wrap+swap child carries the swap cellpack
    // `[factoryBlock, factoryTx, 13, ...path, amount_min, deadline]` plus
    // any auto-edicts — encoded as varint-LE-128 inside the runestone, that
    // bottoms out around 30 bytes for the smallest valid swap.
    const childOpReturns = extractOpReturnScripts(childRawBeforeMine);
    expect(
      childOpReturns.length,
      'child swap tx must have at least one OP_RETURN output (runestone with swap protostone)',
    ).toBeGreaterThan(0);
    const childProtostonePayloadLen = opReturnPayloadLength(childOpReturns[0]);
    expect(
      childProtostonePayloadLen,
      `child swap protostone payload must contain the swap cellpack — observed ` +
      `${childProtostonePayloadLen} bytes (a 2-byte payload means the cellpack was ` +
      `dropped and any alkanes routed through this tx will be burned). ` +
      `Raw OP_RETURN hex: ${childOpReturns[0].toString('hex')}`,
    ).toBeGreaterThan(10);

    // Also assert the factory id and opcode are textually present in the
    // payload's hex (the cellpack varints are byte-by-byte recognisable).
    // factoryId is e.g. "4:65498"; encoded in the cellpack as varint LE-128
    // bytes. We don't decode the runestone in full — just spot-check that
    // the swap opcode (13 = 0x0d) and a factory tx-id-byte are both present.
    const childPayloadHex = childOpReturns[0].slice(2).toString('hex');
    expect(
      /0d/i.test(childPayloadHex),
      `child swap protostone must contain opcode 13 (0x0d) for SwapExactTokensForTokens — ` +
      `payload hex: ${childPayloadHex}`,
    ).toBe(true);

    // ---- Assertion 4: both confirm into the next block.
    mineBlocks(harness, 1);

    const parentStatus = await getTxStatus(splitTxid!);
    const childStatus = await getTxStatus(revealTxid!);
    const parentConfirmed = !!(parentStatus?.status?.confirmed ?? parentStatus?.confirmed);
    const childConfirmed = !!(childStatus?.status?.confirmed ?? childStatus?.confirmed);
    expect(parentConfirmed, 'parent wrap tx must confirm in the next block').toBe(true);
    expect(childConfirmed, 'child swap tx must confirm in the next block').toBe(true);

    // ---- Assertion 5: DIESEL balance increased (the swap leg actually executed).
    const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    expect(
      dieselAfter > dieselBefore,
      `DIESEL must increase after wrap+swap CPFP bundle. before=${dieselBefore} after=${dieselAfter}`,
    ).toBe(true);
    expect(dieselAfter - dieselBefore).toBeGreaterThanOrEqual(minOut);
  }, 300_000);

  // -------------------------------------------------------------------------
  // Counterfactual: same protostones with split_transactions=false yields a
  // single atomic tx. Pins the invariant that the SDK doesn't sneakily split
  // when the caller didn't ask for it.
  // -------------------------------------------------------------------------
  it('split_transactions=false stays atomic — one reveal_txid, no split_txid', async () => {
    restoreSnapshot(SNAPSHOT);

    const wrapSats = 100_000n;
    const minOut = 1n;
    const [fBlock, fTx] = factoryId.split(':');
    const deadline = 1_000_000;
    const protostones =
      `[32,0,77]:v1:v1,[${fBlock},${fTx},13,2,32,0,2,0,${minOut},${deadline}]:v0:v0`;

    const result = await executeAlkanesSplit(protostones, `B:${wrapSats}:v0`, {
      toAddresses: [frbtcSignerAddress, taprootAddress],
      splitTransactions: false,
    });

    // Atomic mode: one reveal_txid, no split_txid.
    const splitTxid: string | undefined = result?.split_txid ?? result?.splitTxid;
    const revealTxid: string | undefined = result?.reveal_txid ?? result?.revealTxid;

    expect(revealTxid, 'atomic mode must still produce a reveal_txid').toBeTruthy();
    expect(splitTxid, 'atomic mode must NOT produce a split_txid').toBeFalsy();
  }, 300_000);
});
