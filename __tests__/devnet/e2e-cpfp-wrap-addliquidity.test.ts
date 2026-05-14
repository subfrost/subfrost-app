/**
 * Devnet E2E: CPFP atomic wrap+addLiquidity bundle
 *
 * Drives BTC + DIESEL → LP as a SPLIT-TX bundle. The parent (Tx A) wraps
 * BTC into frBTC; the child (Tx B) consumes the user's DIESEL plus the
 * parent's freshly-minted frBTC carrier and routes both into the AMM
 * factory's AddLiquidity (opcode 11), minting LP tokens to the user.
 *
 * Why this exists:
 *   `useAtomicWrapAddLiquidityMutation` defaults `splitTransactions=true`
 *   on mainnet for the same fuel-budget reason as wrap+swap: combined
 *   wrap+addLP can exceed MINIMUM_FUEL_CHANGE1 in a busy block.
 *   The split-tx mode is on the hot path for the BTC + Token X → LP
 *   user flow, but no integration test currently broadcasts it.
 *
 *   This test pins:
 *     1. Parent (wrap) + child (addLP) are TWO distinct broadcasts.
 *     2. Child consumes parent's frBTC carrier (CPFP chain proven).
 *     3. Both confirm in the same block.
 *     4. LP token balance lands on the user's taproot address
 *        (= proves the addLiquidity protostone actually executed and
 *        didn't just refund both incoming alkanes).
 *
 * Counterfactual: same protostones with split_transactions=false produce
 * a single atomic tx with one reveal_txid and no split_txid.
 *
 * Run:
 *   pnpm vitest run __tests__/devnet/e2e-cpfp-wrap-addliquidity.test.ts --testTimeout=600000
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
let poolId: string | null = null;
let frbtcSignerAddress: string;

const SNAPSHOT = 'cpfp-wrap-addlp-pool-seeded';

// ---------------------------------------------------------------------------
// Helpers (mirror e2e-cpfp-wrap-swap.test.ts — kept inline to avoid
// cross-test coupling on a shared helper file that might get tweaked.)
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

describe('Devnet E2E: CPFP atomic wrap+addLiquidity bundle', () => {

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

    // Resolve frBTC signer dynamically.
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

    // Mint DIESEL — need plenty for seeding the pool AND the CPFP add.
    for (let i = 0; i < 4; i++) {
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

    // Wrap enough BTC to seed the initial pool.
    await executeAlkanesSetup('[32,0,77]:v1:v1', 'B:5000000:v0', {
      toAddresses: [frbtcSignerAddress, taprootAddress],
    });
    mineBlocks(harness, 1);

    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const frbtcBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.FRBTC_ID);

    // Seed a DIESEL/frBTC pool with ~half of each, leaving the rest for the
    // CPFP wrap+addLP test.
    const dieselSeed = dieselBalance / 3n;
    const frbtcSeed = frbtcBalance / 2n;
    const [fBlock, fTx] = factoryId.split(':');
    const createPoolProtostone = `[${fBlock},${fTx},1,2,0,32,0,${dieselSeed},${frbtcSeed}]:v0:v0`;
    const createPoolReqs = `2:0:${dieselSeed},32:0:${frbtcSeed}`;
    await executeAlkanesSetup(createPoolProtostone, createPoolReqs);
    mineBlocks(harness, 1);

    // Resolve pool id via factory.FindExistingPoolId (opcode 2).
    const findRes = await simulateAlkane(factoryId, ['2', '2', '0', '32', '0']);
    const poolData = findRes?.result?.execution?.data;
    if (typeof poolData === 'string') {
      // Pool id is returned as two u128s (block, tx). Pull block + tx out of
      // the hex blob — first 32 bytes = block, next 32 = tx (LE u128 each).
      const hex = poolData.replace(/^0x/, '');
      if (hex.length >= 64) {
        const blockHex = hex.slice(0, 32);
        const txHex = hex.slice(32, 64);
        const block = BigInt('0x' + Buffer.from(blockHex, 'hex').reverse().toString('hex'));
        const tx = BigInt('0x' + Buffer.from(txHex, 'hex').reverse().toString('hex'));
        if (block > 0n) poolId = `${block}:${tx}`;
      }
    }
    if (!poolId) {
      throw new Error('Pool was not registered with factory after CreateNewPool — fixture broken');
    }

    takeSnapshot(SNAPSHOT);
  }, 600_000);

  afterAll(() => {
    disposeHarness();
  });

  // -------------------------------------------------------------------------
  // The wrap+addLP bundle: parent = wrap, child = addLiquidity that consumes
  // parent's frBTC carrier and the user's DIESEL.
  // -------------------------------------------------------------------------
  it('split_transactions=true: wrap parent + addLP child, LP token minted to user', async () => {
    restoreSnapshot(SNAPSHOT);
    if (!poolId) throw new Error('poolId missing after snapshot restore');

    const lpBefore = await getAlkaneBalance(provider, taprootAddress, poolId);
    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);

    // Pick conservative AddLiquidity amounts so the test doesn't drain the
    // pool: ~10% of remaining DIESEL, 100k sat wrap (≈ 100k frBTC since 1:1).
    const wrapSats = 100_000n;
    const dieselDesired = dieselBalance / 10n;
    const frbtcDesired = wrapSats; // 1:1 wrap ratio
    // 50% slippage floor — keeps the test loose so pool-state quirks don't
    // make it flake, while still proving the addLP executed (a refund would
    // mint 0 LP regardless of mins).
    const dieselMin = dieselDesired / 2n;
    const frbtcMin = frbtcDesired / 2n;
    const deadline = 1_000_000n;

    const [fBlock, fTx] = factoryId.split(':');

    // Canonical atomic wrap+addLiquidity shape (mirrors useAtomicWrapAddLiquidityMutation):
    //   p1: [32,0,77] wrap → mints frBTC to v1 carrier
    //   p0: [factory,11,...] AddLiquidity, consumes DIESEL (from user UTXOs)
    //       + frBTC carrier (from p1)
    const protostones =
      `[32,0,77]:v1:v1,` +
      `[${fBlock},${fTx},11,2,0,32,0,${dieselDesired},${frbtcDesired},${dieselMin},${frbtcMin},${deadline}]:v0:v0`;

    // Input requirements: BTC for the wrap + DIESEL for the addLP.
    const inputReqs = `B:${wrapSats}:v0,2:0:${dieselDesired}`;

    const result = await executeAlkanesSplit(protostones, inputReqs, {
      toAddresses: [frbtcSignerAddress, taprootAddress],
      splitTransactions: true,
    });

    const splitTxid: string | undefined = result?.split_txid ?? result?.splitTxid;
    const revealTxid: string | undefined = result?.reveal_txid ?? result?.revealTxid;

    expect(splitTxid, 'parent wrap txid must be set with split_transactions=true').toBeTruthy();
    expect(revealTxid, 'child addLP txid must be set').toBeTruthy();
    expect(splitTxid).not.toBe(revealTxid);

    // Both broadcasts visible to the indexer before mining.
    const parentRaw = await getRawTx(splitTxid!);
    const childRaw = await getRawTx(revealTxid!);
    expect(parentRaw, 'parent wrap tx must be in mempool').toBeTruthy();
    expect(childRaw, 'child addLP tx must be in mempool').toBeTruthy();

    // CPFP chain: child's inputs must reference parent's outputs.
    const childInputs = parseTxInputs(childRaw);
    const chainsFromParent = childInputs.some((vin) => vin.txid === splitTxid);
    expect(
      chainsFromParent,
      `child addLP tx must spend at least one output from parent wrap tx ${splitTxid} — ` +
      `inputs: ${JSON.stringify(childInputs)}`,
    ).toBe(true);

    mineBlocks(harness, 1);

    const parentStatus = await getTxStatus(splitTxid!);
    const childStatus = await getTxStatus(revealTxid!);
    expect(parentStatus?.status?.confirmed ?? parentStatus?.confirmed).toBe(true);
    expect(childStatus?.status?.confirmed ?? childStatus?.confirmed).toBe(true);

    // LP token balance increased — the AddLiquidity protostone actually
    // executed and minted LP tokens, not just refunded the incoming alkanes.
    const lpAfter = await getAlkaneBalance(provider, taprootAddress, poolId);
    expect(
      lpAfter > lpBefore,
      `LP balance must increase after wrap+addLP CPFP bundle. before=${lpBefore} after=${lpAfter} poolId=${poolId}`,
    ).toBe(true);
  }, 300_000);

  it('split_transactions=false: atomic wrap+addLP — single reveal_txid, no split_txid', async () => {
    restoreSnapshot(SNAPSHOT);
    if (!poolId) throw new Error('poolId missing after snapshot restore');

    const dieselBalance = await getAlkaneBalance(provider, taprootAddress, DEVNET.DIESEL_ID);
    const wrapSats = 100_000n;
    const dieselDesired = dieselBalance / 10n;
    const frbtcDesired = wrapSats;
    const dieselMin = dieselDesired / 2n;
    const frbtcMin = frbtcDesired / 2n;
    const deadline = 1_000_000n;
    const [fBlock, fTx] = factoryId.split(':');

    const protostones =
      `[32,0,77]:v1:v1,` +
      `[${fBlock},${fTx},11,2,0,32,0,${dieselDesired},${frbtcDesired},${dieselMin},${frbtcMin},${deadline}]:v0:v0`;
    const inputReqs = `B:${wrapSats}:v0,2:0:${dieselDesired}`;

    const result = await executeAlkanesSplit(protostones, inputReqs, {
      toAddresses: [frbtcSignerAddress, taprootAddress],
      splitTransactions: false,
    });

    const splitTxid: string | undefined = result?.split_txid ?? result?.splitTxid;
    const revealTxid: string | undefined = result?.reveal_txid ?? result?.revealTxid;
    expect(revealTxid).toBeTruthy();
    expect(splitTxid).toBeFalsy();
  }, 300_000);
});
