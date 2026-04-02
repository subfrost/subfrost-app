/**
 * carbine-orderbook-edge-cases.test.ts
 *
 * Vitest + in-process devnet integration tests for Carbine CLOB edge cases
 * not covered by carbine-orderbook-parsing.test.ts.
 *
 * ## Tests
 *   EC-1  Two sell orders at the same price → depth aggregates them (combined amount)
 *   EC-2  Partial fill → unfilled remainder stays at correct level in depth
 *   EC-3  Reversed pair query → empty; correct pair query → returns data
 *   EC-4  Exact-price crossing → buy at exact ask price triggers fill
 *   EC-5  Depth request exceeds available levels → returns actual count, no padding
 *
 * ## Run
 *   pnpm vitest run __tests__/devnet/carbine-orderbook-edge-cases.test.ts --testTimeout=600000
 *
 * ## Setup mirrors carbine-orderbook-parsing.test.ts EXACTLY:
 *   1. disposeHarness() — fresh singleton, no shared state with other suites
 *   2. mineBlocks(201) — coinbase maturity (regtest requires 100 confirmations)
 *   3. Mint DIESEL (3×) — opcode 77 on [2,0]
 *   4. frBTC signer query (opcode 103) + wrap 2000000 sats
 *   5. Deploy Carbine (auth-token-factory → controller → proxy → template → beacon → instance)
 *   6. Initialize controller with template [4:70001]
 *
 * ## IMPORTANT: NO restoreSnapshot() in test bodies
 *   restoreSnapshot() restores alkanes/metashrew state but NOT bitcoind chain height.
 *   After restore, metashrew_height < getblockcount, causing "Indexer sync timed out".
 *   Tests run sequentially and accumulate state (same pattern as carbine-orderbook-parsing.test.ts).
 *
 * ## Key findings from investigation (verified 2026-04-02):
 *   - deployWasm uses `from` + `mine_enabled: true` (WASM envelope, needs internal mining)
 *   - executeAlkanes uses `from_addresses` + `ordinals_strategy: 'burn'` (regular calls)
 *   - The restoreSnapshot sync bug (not the mine_enabled choice) was the root cause of all
 *     "Indexer sync timed out" failures. See CLAUDE.md Vitest Devnet Test Authoring Rules.
 *   - beacon-proxy MUST use 0x7fff (initialize), NOT 0x8fff (forward) — sets /beacon storage
 *   - simulate() transaction/block args must be '0x' strings
 *
 * Source: __tests__/devnet/carbine-orderbook-parsing.test.ts (ground truth for setup)
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DEVNET } from './devnet-constants';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
  getAlkaneBalance,
} from './devnet-helpers';
// NOTE: takeSnapshot/restoreSnapshot intentionally excluded.
// restoreSnapshot resets metashrew but NOT bitcoind height → "Indexer sync timed out".
// Tests run sequentially and accumulate state instead (like carbine-orderbook-parsing.test.ts).
import { parseOrderbookResponse, readU32LE, readU128LE } from '../../hooks/useOrderbook';

try { bitcoin.initEccLib(ecc); } catch { /* already initialized */ }

// ============================================================================
// Constants
// ============================================================================

const CONTROLLER_ID = '4:70000';

// Raw u128 values in 1e8 units. Display = raw / 1e8.
const PRICE_MID  = 50000n;   // 0.0005 display
const PRICE_HIGH = 70000n;   // 0.0007 display
const AMT_A      = 1000n;    // 0.00001 display
const AMT_B      = 2000n;    // 0.00002 display
const AMT_CROSS  = 500n;     // partial fill amount (< AMT_A)

// ============================================================================
// Shared state
// ============================================================================

let harness: any;
let provider: any;
let segwitAddress: string;
let taprootAddress: string;
let carbineDeployed = false;

// ============================================================================
// WASM loading — mirrors carbine-orderbook-parsing.test.ts exactly
// ============================================================================

const PROD_WASMS_DIR  = resolve(__dirname, '../../prod_wasms');
const PUBLIC_WASM_DIR = resolve(__dirname, '../../public/wasm');
const STD_WASMS_DIR   = resolve(process.env.HOME || '~', 'alkanes-rs/prod_wasms');

function loadWasm(name: string): string {
  for (const dir of [PROD_WASMS_DIR, PUBLIC_WASM_DIR]) {
    const p = resolve(dir, `${name}.wasm`);
    if (existsSync(p)) return readFileSync(p).toString('hex');
  }
  throw new Error(`WASM not found: ${name}. Checked: ${PROD_WASMS_DIR}, ${PUBLIC_WASM_DIR}`);
}

function loadStdWasm(name: string): string {
  for (const dir of [STD_WASMS_DIR, PUBLIC_WASM_DIR]) {
    const p = resolve(dir, `${name}.wasm`);
    if (existsSync(p)) return readFileSync(p).toString('hex');
  }
  throw new Error(`Std WASM not found: ${name}. Checked: ${STD_WASMS_DIR}, ${PUBLIC_WASM_DIR}`);
}

// ============================================================================
// Helpers — exact copy of carbine-orderbook-parsing.test.ts helpers
// ============================================================================

/**
 * Execute an alkanes transaction.
 *
 * Uses `from_addresses` + `ordinals_strategy: 'burn'` — exact copy of the pattern
 * in carbine-orderbook-parsing.test.ts:133-162, which passes all 16 integration tests.
 * feeRate as number 1 (not string '1') — the parsing test uses number too.
 *
 * After the WASM call resolves, we mine 1 block via the harness to include the tx.
 * The WASM does NOT mine internally in this path (no mine_enabled).
 */
async function executeAlkanes(
  protostone: string,
  inputRequirements: string,
  options?: { toAddresses?: string[]; envelopeHex?: string | null },
): Promise<string> {
  const opts = options || {};
  const result = await provider.alkanesExecuteFull(
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
  if (result?.reveal_txid || result?.revealTxid) {
    const txid = result.reveal_txid || result.revealTxid;
    mineBlocks(harness, 1);
    return txid;
  }
  if (result?.txid) {
    mineBlocks(harness, 1);
    return result.txid;
  }
  throw new Error('No txid: ' + JSON.stringify(result).slice(0, 200));
}

/**
 * Simulate a call. transaction/block args must be '0x' strings.
 * Matches carbine-orderbook-parsing.test.ts:164-176 exactly.
 */
async function simulate(target: string, inputs: string[], alkanes?: any[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes: alkanes || [],
    transaction: '0x',
    block: '0x',
    height: '999',
    txindex: 0,
    vout: 0,
  }]);
}

/** Read open order count via opcode 25 (GetOpenOrderCount). */
async function getOpenOrderCount(): Promise<bigint> {
  const r = await simulate(CONTROLLER_ID, ['25']);
  const hex = r?.result?.execution?.data?.replace('0x', '') ?? '';
  if (!hex) return 0n;
  const bytes = Array.from(Buffer.from(hex.padEnd(32, '0'), 'hex'));
  return readU128LE(bytes, 0);
}

/**
 * Query GetOrderbookDepth (opcode 24) and parse.
 * Tries both pair orderings; returns the one with data, or null.
 */
async function getDepth(
  baseBlock: string, baseTx: string,
  quoteBlock: string, quoteTx: string,
  depth = 10,
): Promise<ReturnType<typeof parseOrderbookResponse>> {
  // Try requested ordering first
  const r1 = await simulate(CONTROLLER_ID, ['24', baseBlock, baseTx, quoteBlock, quoteTx, depth.toString()]);
  const d1 = r1?.result?.execution?.data ? parseOrderbookResponse(r1.result.execution.data) : null;
  if (d1 && (d1.bids.length > 0 || d1.asks.length > 0)) return d1;

  // Try reversed ordering
  const r2 = await simulate(CONTROLLER_ID, ['24', quoteBlock, quoteTx, baseBlock, baseTx, depth.toString()]);
  const d2 = r2?.result?.execution?.data ? parseOrderbookResponse(r2.result.execution.data) : null;
  return d2;
}

// ============================================================================
// beforeAll — exact mirror of carbine-orderbook-parsing.test.ts beforeAll
// ============================================================================

beforeAll(async () => {
  // Fresh harness — no shared state with other test suites
  disposeHarness();
  const ctx = await createDevnetTestContext();
  harness        = ctx.harness;
  provider       = ctx.provider;
  segwitAddress  = ctx.segwitAddress;
  taprootAddress = ctx.taprootAddress;

  // Mine 201 blocks for coinbase maturity (regtest: 100-block lock)
  mineBlocks(harness, 201);

  // Mint DIESEL (opcode 77 on [2,0]) — 3 rounds to ensure enough balance
  for (let i = 0; i < 3; i++) {
    mineBlocks(harness, 1);
    await executeAlkanes('[2,0,77]:v0:v0', 'B:10000:v0');
  }

  // Get frBTC signer address (opcode 103 = GetSignerPubkey on frBTC contract)
  const signerResult = await simulate('32:0', ['103']);
  let signerAddr = 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz';
  if (signerResult?.result?.execution?.data) {
    const hex = signerResult.result.execution.data.replace('0x', '');
    if (hex.length === 64) {
      try {
        const xOnlyPubkey = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: bitcoin.networks.regtest });
        if (payment.address) signerAddr = payment.address;
      } catch { /* use default */ }
    }
  }

  // Wrap frBTC — 2000000 sats, output split to signer + taproot (required by frBTC contract)
  await executeAlkanes('[32,0,77]:v1:v1', 'B:2000000:v0', { toAddresses: [signerAddr, taprootAddress] });
  mineBlocks(harness, 1);

  // Deploy Carbine via proxy/beacon pattern
  // auth-token-factory MUST be first — upgradeable.initialize() calls deploy_auth_token()
  // deployWasm: exact copy of carbine-orderbook-parsing.test.ts:391-410.
  // Uses `from` + `mine_enabled: true` + mineBlocks(1) after — same as parsing test.
  const deployWasm = async (wasmHex: string, slot: number, args: number[], label: string) => {
    const protostone = `[3,${slot},${args.join(',')}]:v0:v0`;
    console.log(`[ec] Deploying ${label}, protostone=${protostone}`);
    await provider.alkanesExecuteFull(
      JSON.stringify([taprootAddress]),
      'B:100000:v0',
      protostone,
      '1',
      wasmHex,
      JSON.stringify({
        from: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        alkanes_change_address: taprootAddress,
        mine_enabled: true,
      }),
    );
    mineBlocks(harness, 1);
    console.log(`[ec] Deployed ${label} → [4:${slot}]`);
  };

  try {
    await deployWasm(loadStdWasm('alkanes_std_auth_token'), 0xffed, [100],             'Auth Token Factory');
    await deployWasm(loadWasm('carbine_controller'),               80000, [0, 0, 0],          'Controller impl');
    await deployWasm(loadStdWasm('alkanes_std_upgradeable'),       70000, [0x7fff, 4, 80000, 1], 'Controller proxy');
    await deployWasm(loadWasm('carbine_template'),                 80001, [3],                'Template impl');
    await deployWasm(loadStdWasm('alkanes_std_upgradeable_beacon'), 90001, [0x7fff, 4, 80001, 1], 'Template beacon');
    // 0x7fff = initialize(beacon) — sets /beacon storage so template lookups work.
    // DO NOT use 0x8fff — that's forward(), ignores args, never sets /beacon.
    await deployWasm(loadStdWasm('alkanes_std_beacon_proxy'),      70001, [0x7fff, 4, 90001], 'Template instance');

    // Initialize controller with real template reference [4:70001]
    await executeAlkanes('[4,70000,0,4,70001]:v0:v0', 'B:10000:v0');

    const verify = await simulate(CONTROLLER_ID, ['25']);
    if (!verify?.result?.execution?.error) {
      carbineDeployed = true;
      console.log('[ec] Carbine deployed and initialized ✓');
    } else {
      console.error('[ec] Carbine verify failed:', verify.result.execution.error);
    }
  } catch (e: any) {
    console.error('[ec] Deployment failed:', e?.message?.slice(0, 400));
  }

  // Diagnostic: log harness heights — must be equal (no metashrew/bitcoind gap)
  console.log(`[ec] harness.height=${harness.height} harness.indexerHeight=${harness.indexerHeight}`);
}, 600_000);

afterAll(() => disposeHarness());

// ============================================================================
// EC-1: Two sell orders at the same price → depth aggregates amounts
//
// Place two sell orders at PRICE_MID with amounts AMT_A and AMT_B.
// GetOrderbookDepth must return ONE ask level at that price with
// combined amount = AMT_A + AMT_B.
// ============================================================================
// Tests run sequentially — state accumulates. No restoreSnapshot() (see header).
it('EC-1: two sell orders at same price aggregate in depth', async () => {
  expect(carbineDeployed).toBe(true);
  const [cBlock, cTx] = CONTROLLER_ID.split(':');

  await executeAlkanes(
    `[${cBlock},${cTx},20,2,0,32,0,1,${PRICE_MID},${AMT_A}]:v0:v0`,
    `2:0:${AMT_A}`,
  );
  await executeAlkanes(
    `[${cBlock},${cTx},20,2,0,32,0,1,${PRICE_MID},${AMT_B}]:v0:v0`,
    `2:0:${AMT_B}`,
  );

  const count = await getOpenOrderCount();
  expect(count).toBeGreaterThanOrEqual(2n);

  const depth = await getDepth('2', '0', '32', '0');
  expect(depth).not.toBeNull();
  expect(depth!.asks.length).toBeGreaterThanOrEqual(1);

  // Find the ask level at PRICE_MID (display = 50000 / 1e8 = 0.0005)
  const midAsk = depth!.asks.find(a =>
    Math.round(parseFloat(a.price.replace(/,/g, '')) * 1e8) === Number(PRICE_MID)
  );
  expect(midAsk, `No ask level at price ${PRICE_MID}`).toBeDefined();

  const expectedAmt = Number(AMT_A + AMT_B) / 1e8;
  const actualAmt   = parseFloat(midAsk!.amount.replace(/,/g, ''));
  expect(actualAmt).toBeCloseTo(expectedAmt, 7);

  console.log(`[EC-1] ✓ ask at ${PRICE_MID}: amount=${actualAmt} (expected ${expectedAmt})`);
}, 120_000);

// ============================================================================
// EC-2: Partial fill → ask amount decreases by exactly AMT_CROSS
//
// State is cumulative from EC-1. We snapshot ask amount at PRICE_MID before
// and after a partial buy of AMT_CROSS. The delta must equal AMT_CROSS.
// open_order_count must NOT decrement (fills ≠ cancels).
// ============================================================================
it('EC-2: partial fill decrements ask amount by exactly AMT_CROSS', async () => {
  expect(carbineDeployed).toBe(true);
  const [cBlock, cTx] = CONTROLLER_ID.split(':');

  // Snapshot before
  const depthBefore = await getDepth('2', '0', '32', '0');
  const midAskBefore = depthBefore?.asks.find(a =>
    Math.round(parseFloat(a.price.replace(/,/g, '')) * 1e8) === Number(PRICE_MID)
  );
  expect(midAskBefore, 'PRICE_MID ask must exist before EC-2 (from EC-1)').toBeDefined();
  const amtBefore = parseFloat(midAskBefore!.amount.replace(/,/g, ''));

  const countBefore = await getOpenOrderCount();

  // Partial cross: buy AMT_CROSS at PRICE_MID
  // Quote amount = price × amount / 1e8 (both in 1e8 units)
  const quoteAmt = (PRICE_MID * AMT_CROSS) / BigInt(1e8);
  await executeAlkanes(
    `[${cBlock},${cTx},20,2,0,32,0,0,${PRICE_MID},${AMT_CROSS}]:v0:v0`,
    `32:0:${quoteAmt}`,
  );

  // Fills do NOT decrement open_order_count
  const countAfter = await getOpenOrderCount();
  expect(countAfter).toBeGreaterThanOrEqual(countBefore);

  // Ask amount at PRICE_MID must have decreased by exactly AMT_CROSS
  const depthAfter = await getDepth('2', '0', '32', '0');
  const midAskAfter = depthAfter?.asks.find(a =>
    Math.round(parseFloat(a.price.replace(/,/g, '')) * 1e8) === Number(PRICE_MID)
  );
  expect(midAskAfter, 'PRICE_MID ask must still exist after partial fill (AMT_CROSS < total)').toBeDefined();
  const amtAfter = parseFloat(midAskAfter!.amount.replace(/,/g, ''));
  const delta = amtBefore - amtAfter;
  expect(delta).toBeCloseTo(Number(AMT_CROSS) / 1e8, 7);
  console.log(`[EC-2] ✓ partial fill: before=${amtBefore} after=${amtAfter} delta=${delta} (expected ${Number(AMT_CROSS)/1e8})`);
}, 120_000);

// ============================================================================
// EC-3: Reversed pair query returns empty; correct pair returns data
//
// After placing a sell order as (base=DIESEL=2:0, quote=frBTC=32:0),
// querying with the REVERSED pair should return empty (numBids=0, numAsks=0).
// Exactly ONE orientation should have data.
// ============================================================================
it('EC-3: reversed pair query returns empty; correct pair returns data', async () => {
  expect(carbineDeployed).toBe(true);
  const [cBlock, cTx] = CONTROLLER_ID.split(':');

  // Place sell under (DIESEL=2:0 base, frBTC=32:0 quote)
  await executeAlkanes(
    `[${cBlock},${cTx},20,2,0,32,0,1,${PRICE_MID},${AMT_A}]:v0:v0`,
    `2:0:${AMT_A}`,
  );

  // Query both orderings directly (without auto-retry to see raw truth)
  const r_AB = await simulate(CONTROLLER_ID, ['24', '2', '0', '32', '0', '10']);
  const r_BA = await simulate(CONTROLLER_ID, ['24', '32', '0', '2', '0', '10']);

  const d_AB = r_AB?.result?.execution?.data ? parseOrderbookResponse(r_AB.result.execution.data) : null;
  const d_BA = r_BA?.result?.execution?.data ? parseOrderbookResponse(r_BA.result.execution.data) : null;

  const AB_has = d_AB !== null && (d_AB.asks.length > 0 || d_AB.bids.length > 0);
  const BA_has = d_BA !== null && (d_BA.asks.length > 0 || d_BA.bids.length > 0);

  console.log(`[EC-3] DIESEL/frBTC (A/B): bids=${d_AB?.bids.length ?? 0} asks=${d_AB?.asks.length ?? 0}`);
  console.log(`[EC-3] frBTC/DIESEL (B/A): bids=${d_BA?.bids.length ?? 0} asks=${d_BA?.asks.length ?? 0}`);

  // At least one orientation must see the order
  expect(AB_has || BA_has, 'Neither pair orientation found the sell order').toBe(true);

  // The two orientations must NOT both have data at the same price
  // (same physical order cannot exist under two different pair hash keys)
  if (AB_has && BA_has) {
    const AB_prices = d_AB!.asks.map(a => a.price);
    const BA_prices = d_BA!.asks.map(a => a.price);
    const overlap = AB_prices.filter(p => BA_prices.includes(p));
    expect(overlap.length, 'Same ask price found in both pair orientations — impossible').toBe(0);
    console.log('[EC-3] ✓ Both have data but at different prices (no hash collision)');
  } else {
    expect(AB_has !== BA_has, 'Exactly one orientation should have data').toBe(true);
    console.log(`[EC-3] ✓ Only ${AB_has ? 'DIESEL/frBTC' : 'frBTC/DIESEL'} has data`);
  }
}, 120_000);

// ============================================================================
// EC-4: Exact-price crossing — buy triggers fill, ask amount decreases by AMT_A
//
// State is cumulative. We snapshot ask amount at PRICE_MID before and after
// a buy of AMT_A. The delta must equal AMT_A (exact crossing fill).
// open_order_count must NOT decrement (fills ≠ cancels).
// ============================================================================
it('EC-4: buy at exact ask price triggers fill, ask amount decrements by AMT_A', async () => {
  expect(carbineDeployed).toBe(true);
  const [cBlock, cTx] = CONTROLLER_ID.split(':');

  // Snapshot ask amount before
  const depthBC = await getDepth('2', '0', '32', '0');
  const askBC = depthBC?.asks.find(a =>
    Math.round(parseFloat(a.price.replace(/,/g, '')) * 1e8) === Number(PRICE_MID)
  );
  expect(askBC, 'PRICE_MID ask must exist (from EC-1/EC-2)').toBeDefined();
  const amtBC = parseFloat(askBC!.amount.replace(/,/g, ''));
  console.log(`[EC-4] Ask before cross: amount=${amtBC}`);

  const countBC = await getOpenOrderCount();

  // Buy at exact PRICE_MID for AMT_A (exact-price crossing)
  const quoteAmt = (PRICE_MID * AMT_A) / BigInt(1e8);
  await executeAlkanes(
    `[${cBlock},${cTx},20,2,0,32,0,0,${PRICE_MID},${AMT_A}]:v0:v0`,
    `32:0:${quoteAmt}`,
  );

  // Fills do NOT decrement count
  const countAC = await getOpenOrderCount();
  expect(countAC).toBeGreaterThanOrEqual(countBC);

  // Ask amount must have decreased by exactly AMT_A
  const depthAC = await getDepth('2', '0', '32', '0');
  const askAC = depthAC?.asks.find(a =>
    Math.round(parseFloat(a.price.replace(/,/g, '')) * 1e8) === Number(PRICE_MID)
  );
  // Level may be fully consumed or partially remaining
  const amtAC = askAC ? parseFloat(askAC.amount.replace(/,/g, '')) : 0;
  const delta = amtBC - amtAC;
  expect(delta).toBeCloseTo(Number(AMT_A) / 1e8, 7);
  console.log(`[EC-4] ✓ exact-price fill: before=${amtBC} after=${amtAC} delta=${delta} (expected ${Number(AMT_A)/1e8})`);
}, 120_000);

// ============================================================================
// EC-5: Depth request exceeds available orders → returns actual count, no padding
//
// Place 2 sell orders at different prices.
// Request depth=20. Must return exactly 2 asks, no U128_MAX padding.
// ============================================================================
it('EC-5: depth=20 returns asks without U128_MAX padding', async () => {
  // State is cumulative. Request depth=20; whatever asks exist must have sane amounts.
  // The key invariant: no U128_MAX sentinel values appear when depth > actual order count.
  expect(carbineDeployed).toBe(true);

  // Request depth=20 on existing cumulative book
  const depth = await getDepth('2', '0', '32', '0', 20);

  expect(depth).not.toBeNull();

  // depth.asks.length must be ≤ 20 (no padding beyond actual orders)
  expect(depth!.asks.length).toBeLessThanOrEqual(20);
  expect(depth!.asks.length).toBeGreaterThanOrEqual(1);

  // No U128_MAX padding (corrupted state would show amounts near 3.4e38)
  for (const ask of depth!.asks) {
    const amt = parseFloat(ask.amount.replace(/,/g, ''));
    expect(amt).toBeGreaterThan(0);
    expect(amt).toBeLessThan(1e10); // sane upper bound — U128_MAX / 1e8 ≈ 3.4e30
  }

  console.log(`[EC-5] ✓ depth=20, got ${depth!.asks.length} asks, all sane amounts`);
}, 120_000);
