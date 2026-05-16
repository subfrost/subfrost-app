/**
 * Devnet E2E: lib/walletState/fetchPoolState
 *
 * Exercises the server-side opcode-999 (PoolDetails) decoder against the
 * in-browser qubitcoin + alkanes WASM backend with a live DIESEL/frBTC
 * pool. Pins the load-bearing behaviours of the swap-quote critical path:
 *
 *   1. Live reserves come back as non-zero decimal strings matching the
 *      seeded liquidity.
 *   2. The fee field equals the protocol default (30 / 1000).
 *   3. token0/token1 alkane IDs match the pair the pool was created with
 *      (order may be swapped — pool stores tokens canonically sorted).
 *   4. Executing a small swap moves reserves in the expected direction.
 *   5. tipHash advances when a new block is mined.
 *
 * Setup mirrors e2e-swaps.test.ts: deploy AMM contracts, mint DIESEL,
 * wrap BTC → frBTC, create the DIESEL/frBTC pool with initial liquidity.
 * Because the e2e-swaps setup is non-trivial and depends on `prod_wasms/`
 * fixtures being present + indexer behavior matching deploy-subfrost-regtest.sh,
 * each test here defensively skips with a console warning if pool
 * creation didn't succeed (matches the lenient pattern used in
 * e2e-swaps.test.ts itself).
 *
 * Run: pnpm vitest run __tests__/devnet/walletState-fetchPoolState.test.ts --testTimeout=600000
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
import { deployAmmContracts } from './amm-deploy';

import { fetchPoolState } from '../../lib/walletState/fetchPoolState';
import { __resetTipHashCacheForTests } from '../../lib/walletState/tipHash';

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;
type TestSigner = import('../sdk/test-utils/createTestSigner').TestSignerResult;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let harness: any;
let provider: WebProvider;
let signer: TestSigner;
let segwitAddress: string;
let taprootAddress: string;
let factoryId: string;
let poolId: string | null = null;
let seededReserve0: bigint = 0n;
let seededReserve1: bigint = 0n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: { toAddresses?: string[]; envelopeHex?: string | null },
): Promise<string> {
  const opts = options || {};
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(opts.toAddresses || [taprootAddress]),
    inputRequirements,
    protostone,
    1,
    opts.envelopeHex === undefined ? null : opts.envelopeHex,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      ordinals_strategy: 'burn',
    }),
  );
  const txid =
    result?.reveal_txid || result?.revealTxid || result?.txid;
  await mineBlocks(harness, 1);
  return txid ?? '';
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

beforeAll(async () => {
  disposeHarness();
  const ctx = await createDevnetTestContext();
  harness = ctx.harness;
  provider = ctx.provider;
  signer = ctx.signer;
  segwitAddress = ctx.segwitAddress;
  taprootAddress = ctx.taprootAddress;

  // Coinbase maturity
  await mineBlocks(harness, 201);

  // ---- Deploy AMM contracts ----------------------------------------------
  let amm: { factoryId: string };
  try {
    amm = await deployAmmContracts(
      provider,
      signer,
      segwitAddress,
      taprootAddress,
      harness,
    );
    factoryId = amm.factoryId;
    console.log('[poolState-e2e] Factory deployed:', factoryId);
  } catch (e: any) {
    console.warn('[poolState-e2e] AMM deploy failed — pool tests will skip:', e?.message);
    return;
  }

  // ---- Mint DIESEL several times -----------------------------------------
  for (let i = 0; i < 3; i++) {
    try {
      await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
    } catch (e: any) {
      console.warn('[poolState-e2e] mint #' + i + ' failed:', e?.message);
    }
  }
  const dieselBalance = await getAlkaneBalance(
    provider,
    taprootAddress,
    DEVNET.DIESEL_ID,
  );
  console.log('[poolState-e2e] DIESEL balance:', dieselBalance.toString());

  // ---- Wrap BTC → frBTC ---------------------------------------------------
  let signerAddr =
    'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
  const signerResult = await simulateAlkane('32:0', ['103']);
  if (signerResult?.result?.execution?.data) {
    const hex = signerResult.result.execution.data.replace('0x', '');
    if (hex.length === 64) {
      try {
        const xOnlyPubkey = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({
          internalPubkey: xOnlyPubkey,
          network: bitcoin.networks.regtest,
        });
        if (payment.address) signerAddr = payment.address;
      } catch { /* keep default */ }
    }
  }
  try {
    await executeAlkanes('[32,0,77]:v1:v1', 'B:1000000:v0', {
      toAddresses: [signerAddr, taprootAddress],
    });
  } catch (e: any) {
    console.warn('[poolState-e2e] wrap failed:', e?.message);
  }
  const frbtcBalance = await getAlkaneBalance(
    provider,
    taprootAddress,
    DEVNET.FRBTC_ID,
  );
  console.log('[poolState-e2e] frBTC balance:', frbtcBalance.toString());

  if (dieselBalance === 0n || frbtcBalance === 0n) {
    console.warn('[poolState-e2e] missing token balances — pool tests will skip');
    return;
  }

  // ---- Create DIESEL/frBTC pool ------------------------------------------
  const dieselAmount = dieselBalance / 3n;
  const frbtcAmount = frbtcBalance / 2n;
  seededReserve0 = dieselAmount;
  seededReserve1 = frbtcAmount;

  const [fBlock, fTx] = factoryId.split(':');
  const createPoolProtostone =
    `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`;
  const createPoolReqs = `2:0:${dieselAmount},32:0:${frbtcAmount}`;

  try {
    await executeAlkanes(createPoolProtostone, createPoolReqs);
  } catch (e: any) {
    console.warn('[poolState-e2e] create-pool tx failed:', e?.message);
    return;
  }

  // Discover the pool id via FindExistingPoolId (opcode 2).
  const findPool = await simulateAlkane(factoryId, ['2', '2', '0', '32', '0']);
  if (findPool?.result?.execution?.data) {
    const hex = findPool.result.execution.data.replace('0x', '');
    if (hex.length >= 32) {
      const buf = Buffer.from(hex, 'hex');
      const block = Number(buf.readBigUInt64LE(0));
      const tx = Number(buf.readBigUInt64LE(16));
      if (block > 0) {
        poolId = `${block}:${tx}`;
        console.log('[poolState-e2e] Pool ID:', poolId);
      }
    }
  }
  if (!poolId) {
    console.warn('[poolState-e2e] could not locate pool ID — tests will skip');
  }
}, 600_000);

afterAll(() => {
  disposeHarness();
});

// ---------------------------------------------------------------------------
// (1) Opcode 999 returns reserves
// ---------------------------------------------------------------------------

describe('fetchPoolState — reserves + supply via opcode 999', () => {
  it('returns non-zero reserves matching the seeded liquidity', async () => {
    if (!poolId) {
      console.warn('[poolState-e2e] skipping — no pool');
      return;
    }
    __resetTipHashCacheForTests();
    const state = await fetchPoolState('devnet', poolId);
    expect(state).not.toBeNull();
    expect(state!.poolId).toBe(poolId);

    const r0 = BigInt(state!.reserves0);
    const r1 = BigInt(state!.reserves1);
    expect(r0).toBeGreaterThan(0n);
    expect(r1).toBeGreaterThan(0n);

    // The pool MAY canonically order tokens, so we check the set
    // {r0, r1} equals the set of seeded amounts rather than positional
    // equality.
    const reserves = new Set([r0.toString(), r1.toString()]);
    expect(reserves.has(seededReserve0.toString())).toBe(true);
    expect(reserves.has(seededReserve1.toString())).toBe(true);
  }, 60_000);

  // -------------------------------------------------------------------------
  // (2) Fee field
  // -------------------------------------------------------------------------
  it('fee field equals 30 (the oyl-amm Pool::DEFAULT_FEE)', async () => {
    if (!poolId) return;
    __resetTipHashCacheForTests();
    const state = await fetchPoolState('devnet', poolId);
    expect(state).not.toBeNull();
    // 30 per 1000 = 0.30 %. Matches DEFAULT_FEE_PER_1000 in fetchPoolState.
    expect(state!.fee).toBe(30);
  }, 60_000);

  // -------------------------------------------------------------------------
  // (3) token0 / token1 IDs match the seeded pair
  // -------------------------------------------------------------------------
  it('token0/token1 are the DIESEL/frBTC pair we seeded the pool with', async () => {
    if (!poolId) return;
    __resetTipHashCacheForTests();
    const state = await fetchPoolState('devnet', poolId);
    expect(state).not.toBeNull();
    const pair = new Set([state!.token0Id, state!.token1Id]);
    expect(pair.has(DEVNET.DIESEL_ID)).toBe(true);
    expect(pair.has(DEVNET.FRBTC_ID)).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// (4) Swap moves reserves
// ---------------------------------------------------------------------------

describe('fetchPoolState — reserves after a swap', () => {
  it('a small DIESEL→frBTC swap shifts reserves in the expected direction', async () => {
    if (!poolId) {
      console.warn('[poolState-e2e] skipping — no pool');
      return;
    }
    __resetTipHashCacheForTests();
    const before = await fetchPoolState('devnet', poolId);
    expect(before).not.toBeNull();

    // Which slot holds DIESEL (the sell token)?
    const dieselIsToken0 = before!.token0Id === DEVNET.DIESEL_ID;
    const dieselReservesBefore = BigInt(
      dieselIsToken0 ? before!.reserves0 : before!.reserves1,
    );
    const frbtcReservesBefore = BigInt(
      dieselIsToken0 ? before!.reserves1 : before!.reserves0,
    );

    const dieselWalletBefore = await getAlkaneBalance(
      provider,
      taprootAddress,
      DEVNET.DIESEL_ID,
    );
    if (dieselWalletBefore < 1000n) {
      console.warn('[poolState-e2e] not enough DIESEL to swap — skipping');
      return;
    }
    const swapAmount = dieselWalletBefore / 20n;

    const [fBlock, fTx] = factoryId.split(':');
    const protostone =
      `[${fBlock},${fTx},13,2,2,0,32,0,${swapAmount},1,99999]:v0:v0`;
    try {
      await executeAlkanes(protostone, `2:0:${swapAmount}`);
    } catch (e: any) {
      console.warn('[poolState-e2e] swap tx failed:', e?.message);
      return;
    }

    __resetTipHashCacheForTests();
    const after = await fetchPoolState('devnet', poolId);
    expect(after).not.toBeNull();
    const dieselReservesAfter = BigInt(
      dieselIsToken0 ? after!.reserves0 : after!.reserves1,
    );
    const frbtcReservesAfter = BigInt(
      dieselIsToken0 ? after!.reserves1 : after!.reserves0,
    );

    // DIESEL reserves went UP (we sold DIESEL into the pool).
    expect(dieselReservesAfter).toBeGreaterThan(dieselReservesBefore);
    // frBTC reserves went DOWN.
    expect(frbtcReservesAfter).toBeLessThan(frbtcReservesBefore);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// (5) tipHash advances on a new block
// ---------------------------------------------------------------------------

describe('fetchPoolState — tipHash advance', () => {
  it('tipHash flips when a new block is mined', async () => {
    if (!poolId) return;

    __resetTipHashCacheForTests();
    const before = await fetchPoolState('devnet', poolId);
    expect(before).not.toBeNull();

    await mineBlocks(harness, 1);
    __resetTipHashCacheForTests();
    const after = await fetchPoolState('devnet', poolId);
    expect(after).not.toBeNull();

    expect(after!.metashrewHeight).toBeGreaterThan(before!.metashrewHeight);
    if (before!.tipHash && after!.tipHash) {
      expect(after!.tipHash).not.toBe(before!.tipHash);
    } else {
      console.warn(
        '[poolState-e2e] tipHash empty — metashrew_getblockhash unavailable on this harness',
      );
    }
  }, 60_000);
});
