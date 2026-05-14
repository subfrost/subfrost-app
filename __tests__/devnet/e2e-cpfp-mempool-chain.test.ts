/**
 * Devnet E2E: mempool-aware coin selection across CPFP boundaries
 *
 * The Rust `apply_mempool_adjustment` (alkanes-rs
 * `crates/alkanes-cli-common/src/alkanes/execute.rs`) does two things when
 * the SDK builds Tx B while Tx A is still unconfirmed in mempool:
 *
 *   1. STRIP — removes outpoints that Tx A's vins reference. Without this,
 *      Tx B would happily try to spend Tx A's prevouts and bitcoind would
 *      reject it as a BIP125 RBF conflict ("insufficient fee, rejecting
 *      replacement"). The 2026-05-10 mainnet camoufoxd run hit exactly
 *      this when two consecutive wrap+swap attempts re-used the same
 *      confirmed UTXO before the second saw the first in mempool.
 *
 *   2. ADD — surfaces Tx A's pay-to-us outputs (alkane carrier + BTC
 *      change) as candidate UTXOs even though they're unconfirmed. Without
 *      this, the CPFP child in a split-tx bundle has no candidates: the
 *      lua spendable-UTXO script only returns confirmed UTXOs.
 *
 * A pure-JS mirror of this logic is unit-tested in
 * `lib/alkanes/__tests__/mempool-aware-utxo-selection.test.ts`. This test
 * exercises the REAL Rust path: broadcast Tx A, hold off on mining,
 * trigger a second flow, prove the second tx behaves correctly given the
 * mempool state.
 *
 * Two scenarios:
 *   - "STRIP" — broadcast a wrap tx (Tx A) without mining. Then trigger a
 *     SECOND wrap from the same wallet. Tx2 must NOT spend any of Tx A's
 *     prevouts (otherwise it'd be an RBF conflict at broadcast). Both txs
 *     mine cleanly in the next block.
 *   - "ADD" — broadcast a wrap (Tx A) without mining. Trigger a wrap+swap
 *     that consumes the freshly-minted frBTC. The SDK must pick Tx A's
 *     unconfirmed alkane carrier output as the source of frBTC for the
 *     swap leg. Both txs mine cleanly.
 *
 * Run:
 *   pnpm vitest run __tests__/devnet/e2e-cpfp-mempool-chain.test.ts --testTimeout=600000
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
} from './devnet-helpers';
import { deployAmmContracts } from './amm-deploy';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

let harness: any;
let provider: WebProvider;
let signer: TestSignerResult;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let frbtcSignerAddress: string;

const SNAPSHOT = 'cpfp-mempool-chain-pool-seeded';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Setup helper — mirrors the working `executeAlkanes` in e2e-swaps.test.ts.
 * Auto-broadcasts and falls back to external signing on ReadyToSign.
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
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

/**
 * CPFP-aware variant — forwards split_transactions and returns the raw
 * EnhancedExecuteResult (with split_txid / reveal_txid). No auto-mine.
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

/**
 * Raw broadcast — no split option, no auto-mine. Used by the mempool-chain
 * test for the "Tx A" wrap that must stay unconfirmed while Tx B is built.
 */
async function executeAlkanesBroadcastOnly(
  protostones: string,
  inputRequirements: string,
  opts: { toAddresses?: string[] } = {},
): Promise<any> {
  return (provider as any).alkanesExecuteFull(
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
    txid: Buffer.from(vin.hash).reverse().toString('hex'),
    vout: vin.index,
  }));
}

// ===========================================================================

describe('Devnet E2E: mempool-aware coin selection across CPFP boundaries', () => {

  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 201);

    const amm = await deployAmmContracts(provider, signer, segwitAddress, taprootAddress, harness);
    factoryId = amm.factoryId;

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

    for (let i = 0; i < 3; i++) {
      mineBlocks(harness, 1);
      // Dust-carrier mint: DIESEL lands at vout=1 (~546 sat carrier) per
      // the :v1:v1 pointer, NOT vout=0 (the 10000-sat BTC output). The SDK's
      // select_utxos only queries protorunesbyoutpoint for UTXOs with value
      // <= 1000 sats, so a v0 mint (10000-sat carrier) becomes invisible to
      // coin selection. Production mints (via swap/transfer) always produce
      // dust carriers; the test fixture must do the same.
      await executeAlkanesSetup('[2,0,77]:v1:v1', 'B:10000:v0', {
        toAddresses: [taprootAddress, taprootAddress],
      });
    }
    mineBlocks(harness, 1);

    // Wrap a chunk so we have frBTC + a pool to swap into.
    await executeAlkanesSetup('[32,0,77]:v1:v1', 'B:5000000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    mineBlocks(harness, 1);

    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);
    const dieselSeed = dieselBalance / 3n;
    const frbtcSeed = frbtcBalance / 2n;
    const [fBlock, fTx] = factoryId.split(':');
    await executeAlkanesSetup(
      `[${fBlock},${fTx},1,2,0,32,0,${dieselSeed},${frbtcSeed}]:v0:v0`,
      `2:0:${dieselSeed},32:0:${frbtcSeed}`,
    );
    mineBlocks(harness, 1);

    takeSnapshot(SNAPSHOT);
  }, 600_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // STRIP: Tx 2 must not share any prevout with Tx 1 while Tx 1 is in mempool.
  //
  // Failure mode this catches: SDK ignores the mempool, both txs pick the
  // same biggest confirmed UTXO, second broadcast → BIP125 RBF rejection
  // ("insufficient fee, rejecting replacement"). Observed 2026-05-10
  // mainnet, fixed by `apply_mempool_adjustment` in alkanes-rs.
  // -------------------------------------------------------------------------
  it('STRIP — two consecutive wraps from same wallet do not share prevouts', async () => {
    restoreSnapshot(SNAPSHOT);

    // First wrap — broadcast, do NOT mine.
    const wrap1Result = await executeAlkanesBroadcastOnly('[32,0,77]:v1:v1', 'B:50000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    const wrap1Txid: string | undefined = wrap1Result?.reveal_txid ?? wrap1Result?.revealTxid ?? wrap1Result?.txid;
    expect(wrap1Txid, 'first wrap must broadcast').toBeTruthy();

    const wrap1Raw = await getRawTx(wrap1Txid!);
    expect(wrap1Raw, 'first wrap must be visible in mempool').toBeTruthy();
    const wrap1Inputs = parseTxInputs(wrap1Raw);
    const wrap1Spent = new Set(wrap1Inputs.map((v) => `${v.txid}:${v.vout}`));

    // Second wrap — same wallet, NO mining in between. The mempool-aware
    // selector in select_utxos must strip wrap1's prevouts from candidates.
    const wrap2Result = await executeAlkanesBroadcastOnly('[32,0,77]:v1:v1', 'B:50000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    const wrap2Txid: string | undefined = wrap2Result?.reveal_txid ?? wrap2Result?.revealTxid ?? wrap2Result?.txid;
    expect(wrap2Txid, 'second wrap must broadcast (would fail with RBF if the strip step were missing)').toBeTruthy();
    expect(wrap2Txid).not.toBe(wrap1Txid);

    const wrap2Raw = await getRawTx(wrap2Txid!);
    expect(wrap2Raw, 'second wrap must reach mempool').toBeTruthy();
    const wrap2Inputs = parseTxInputs(wrap2Raw);

    // Core assertion: no overlap between wrap1's prevouts and wrap2's.
    const overlapping = wrap2Inputs.filter((v) => wrap1Spent.has(`${v.txid}:${v.vout}`));
    expect(
      overlapping.length,
      `wrap2 must not spend any UTXO already pending-spent by wrap1. ` +
      `overlap=${JSON.stringify(overlapping)} wrap1Inputs=${JSON.stringify(wrap1Inputs)} wrap2Inputs=${JSON.stringify(wrap2Inputs)}`,
    ).toBe(0);

    // Both confirm in the next block.
    mineBlocks(harness, 1);
    const s1 = await getTxStatus(wrap1Txid!);
    const s2 = await getTxStatus(wrap2Txid!);
    expect(s1?.status?.confirmed ?? s1?.confirmed).toBe(true);
    expect(s2?.status?.confirmed ?? s2?.confirmed).toBe(true);
  }, 300_000);

  // -------------------------------------------------------------------------
  // ADD: a follow-up tx must be ABLE to spend an unconfirmed Tx A's output.
  //
  // Specifically: broadcast a wrap (Tx A) → frBTC carrier sits in mempool.
  // Immediately fire a wrap+swap that needs frBTC — the second tx must be
  // able to use Tx A's pending frBTC carrier as input (or, equivalently,
  // chain its own newly-minted frBTC across both txs into the swap leg).
  //
  // The minimal observable: both txs broadcast cleanly, both mine, and the
  // wallet ends with more DIESEL than before — proving the swap leg
  // actually executed against an indexed alkane carrier.
  // -------------------------------------------------------------------------
  it('ADD — follow-up wrap+swap proceeds while a prior wrap is still in mempool', async () => {
    restoreSnapshot(SNAPSHOT);

    const dieselBefore = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);

    // Tx A: standalone wrap. Broadcast only — do not mine.
    const wrapResult = await executeAlkanesBroadcastOnly('[32,0,77]:v1:v1', 'B:100000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    const wrapTxid: string | undefined = wrapResult?.reveal_txid ?? wrapResult?.revealTxid ?? wrapResult?.txid;
    expect(wrapTxid, 'wrap must broadcast').toBeTruthy();
    const wrapRaw = await getRawTx(wrapTxid!);
    expect(wrapRaw, 'wrap must be in mempool before mining').toBeTruthy();
    const wrapPrevouts = new Set(parseTxInputs(wrapRaw).map((v) => `${v.txid}:${v.vout}`));

    // Tx B: wrap+swap (split). Broadcast while wrap is still unconfirmed.
    // The split-tx parent (Tx B-parent) must not RBF-conflict with Tx A,
    // and Tx B-child must reference Tx B-parent (CPFP).
    const [fBlock, fTx] = factoryId.split(':');
    const protostones =
      `[32,0,77]:v1:v1,[${fBlock},${fTx},13,2,32,0,2,0,1,1000000]:v0:v0`;
    const result = await executeAlkanesSplit(protostones, 'B:100000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
      splitTransactions: true,
    });

    const splitTxid: string | undefined = result?.split_txid ?? result?.splitTxid;
    const revealTxid: string | undefined = result?.reveal_txid ?? result?.revealTxid;
    expect(splitTxid, 'B-parent (wrap) must broadcast even though Tx A is still in mempool').toBeTruthy();
    expect(revealTxid, 'B-child (swap) must broadcast').toBeTruthy();

    const bParentRaw = await getRawTx(splitTxid!);
    const bChildRaw = await getRawTx(revealTxid!);
    expect(bParentRaw, 'B-parent in mempool').toBeTruthy();
    expect(bChildRaw, 'B-child in mempool').toBeTruthy();

    // CPFP chain still intact: B-child spends from B-parent.
    const bChildInputs = parseTxInputs(bChildRaw);
    expect(bChildInputs.some((v) => v.txid === splitTxid)).toBe(true);

    // B-parent must NOT spend any of Tx A's prevouts (otherwise BIP125 RBF
    // would have killed the second broadcast).
    const bParentInputs = parseTxInputs(bParentRaw);
    const overlap = bParentInputs.filter((v) => wrapPrevouts.has(`${v.txid}:${v.vout}`));
    expect(
      overlap.length,
      `B-parent must not share inputs with Tx A (RBF guard). overlap=${JSON.stringify(overlap)}`,
    ).toBe(0);

    // All three confirm.
    mineBlocks(harness, 1);
    const sA = await getTxStatus(wrapTxid!);
    const sBp = await getTxStatus(splitTxid!);
    const sBc = await getTxStatus(revealTxid!);
    expect(sA?.status?.confirmed ?? sA?.confirmed, 'Tx A wrap confirmed').toBe(true);
    expect(sBp?.status?.confirmed ?? sBp?.confirmed, 'B-parent confirmed').toBe(true);
    expect(sBc?.status?.confirmed ?? sBc?.confirmed, 'B-child confirmed').toBe(true);

    // The swap leg actually executed — DIESEL went up.
    const dieselAfter = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    expect(
      dieselAfter > dieselBefore,
      `DIESEL must increase after wrap+swap fires alongside an unconfirmed Tx A. before=${dieselBefore} after=${dieselAfter}`,
    ).toBe(true);
  }, 300_000);
});
