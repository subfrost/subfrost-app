/**
 * Frostlend Contract Deployment for Devnet
 *
 * Mirrors lib/frostlend/deploy.ts but adapted for the in-process devnet test
 * harness (DevnetTestHarness via createDevnetTestContext). Used by the
 * frostlend E2E test to set up the full Liquity-style CDP system.
 *
 * Phases (must be in this order):
 *   1. Load + deploy 11 WASMs (auth-token-factory FIRST)
 *   2. Initialize 9 contracts (opcode 0)
 *   3. SetParams on BorrowerOps (locks MCR/CCR/min_net_debt/etc)
 *   4. FinalizeAuth on 7 callee contracts (locks the protocol auth token IDs)
 *   5. PostPrice on PriceFeed (set initial $1M oracle for liberal headroom)
 *
 * Slot scheme: 0x200-0x209 (= 512..521) plus 0xffee for auth-token-factory.
 * After CREATERESERVED, contracts are reachable at [4:slot].
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rpcCall } from './devnet-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const FROSTLEND_WASM_DIR = resolve(__dirname, '../../public/wasm/frostlend');

export const FROSTLEND_SLOTS = {
  AUTH_TOKEN_FACTORY: 0xffee,   // 65518 — shared with other protocols (cellpack-only deploy)
  FROST_USD_TOKEN:    0x200,    // 512  — frostUSD stablecoin
  TROVE_MANAGER:      0x201,    // 513  — liquidation/redemption logic
  BORROWER_OPS:       0x202,    // 514  — user-facing trove operations
  STABILITY_POOL:     0x203,    // 515  — liquidation absorption
  ACTIVE_POOL:        0x204,    // 516  — active coll + debt accounting
  SORTED_TROVES:      0x205,    // 517  — NICR-ordered linked list
  PRICE_FEED:         0x206,    // 518  — mock oracle
  STAKING:            0x207,    // 519  — FIRE staking for fee revenue
  COLL_SURPLUS_POOL:  0x209,    // 521  — surplus from capped liquidations
};

export const FROSTLEND_IDS = Object.fromEntries(
  Object.entries(FROSTLEND_SLOTS).map(([k, v]) => [k, `4:${v}`])
) as Record<keyof typeof FROSTLEND_SLOTS, string>;

// Protocol parameters (same as constants/frostlend.ts).
const DECIMAL_PRECISION_18 = 10n ** 18n;
const MCR = 1_100_000_000_000_000_000n;       // 110%
const CCR = 1_500_000_000_000_000_000n;       // 150%
const MIN_NET_DEBT = 180_000_000_000n;        // 1800 frostUSD (8 decimals)
const FROST_USD_GAS_COMP = 20_000_000_000n;   // 200 frostUSD
const MAX_BORROWING_FEE = 50_000_000_000_000_000n; // 5%
const INITIAL_PRICE_18DEC = 1_000_000n * DECIMAL_PRECISION_18; // $1M/BTC for safe ICR

function loadWasm(name: string): string {
  const path = resolve(FROSTLEND_WASM_DIR, `${name}.wasm`);
  return readFileSync(path).toString('hex');
}

/**
 * Deploy a single contract via envelope (commit/reveal).
 * Same pattern as amm-deploy.ts deployContract — alkanesExecuteFull handles
 * commit/reveal/mining internally on the in-process devnet.
 */
async function deployContract(
  provider: WebProvider,
  taprootAddress: string,
  segwitAddress: string,
  wasmHex: string,
  slot: number,
  inputs: number[],
): Promise<void> {
  const protostone = `[3,${slot},${inputs.join(',')}]:v0:v0`;

  const result = await (provider as any).alkanesExecuteFull(
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
  if (!result?.reveal_txid && !result?.revealTxid && !result?.txid) {
    throw new Error(`Deploy [3:${slot}] returned no txid`);
  }
}

/**
 * Fire-and-forget call (Initialize, SetParams, FinalizeAuth, PostPrice).
 * No witness envelope — just a cellpack protostone.
 */
async function executeCall(
  provider: WebProvider,
  taprootAddress: string,
  segwitAddress: string,
  protostone: string,
): Promise<string> {
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    'B:50000:v0',
    protostone,
    '1',
    null,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      mine_enabled: true,
    }),
  );
  const txid = result?.reveal_txid || result?.revealTxid || result?.txid;
  if (!txid) throw new Error('executeCall returned no txid');
  return txid;
}

/**
 * Full frostlend deployment. Run ONCE per test run, then the contracts at
 * FROSTLEND_IDS are live and the oracle is set to $1M/BTC.
 */
export async function deployFrostlend(
  provider: WebProvider,
  taprootAddress: string,
  segwitAddress: string,
  initialPrice18Dec: bigint = INITIAL_PRICE_18DEC,
): Promise<void> {
  // Phase 1 — deploy 10 WASMs (skip frost_lend_fire_token; FIRE may already exist).
  const deploys: Array<[string, number, number[]]> = [
    ['alkanes_std_auth_token',         FROSTLEND_SLOTS.AUTH_TOKEN_FACTORY, [100]],
    ['frost_lend_token',               FROSTLEND_SLOTS.FROST_USD_TOKEN,    [0]],
    ['frost_lend_trove_manager',       FROSTLEND_SLOTS.TROVE_MANAGER,      [0]],
    ['frost_lend_borrower_ops',        FROSTLEND_SLOTS.BORROWER_OPS,       [0]],
    ['frost_lend_stability_pool',      FROSTLEND_SLOTS.STABILITY_POOL,     [0]],
    ['frost_lend_active_pool',         FROSTLEND_SLOTS.ACTIVE_POOL,        [0]],
    ['frost_lend_sorted_troves',       FROSTLEND_SLOTS.SORTED_TROVES,      [0]],
    ['frost_lend_price_feed',          FROSTLEND_SLOTS.PRICE_FEED,         [0]],
    ['frost_lend_staking',             FROSTLEND_SLOTS.STAKING,            [0]],
    ['frost_lend_coll_surplus_pool',   FROSTLEND_SLOTS.COLL_SURPLUS_POOL,  [0]],
  ];

  for (const [name, slot, args] of deploys) {
    const wasm = loadWasm(name);
    await deployContract(provider, taprootAddress, segwitAddress, wasm, slot, args);
  }

  // Phase 2 — Initialize (opcode 0) on each.
  const initContracts = [
    FROSTLEND_SLOTS.FROST_USD_TOKEN,
    FROSTLEND_SLOTS.TROVE_MANAGER,
    FROSTLEND_SLOTS.BORROWER_OPS,
    FROSTLEND_SLOTS.STABILITY_POOL,
    FROSTLEND_SLOTS.ACTIVE_POOL,
    FROSTLEND_SLOTS.SORTED_TROVES,
    FROSTLEND_SLOTS.PRICE_FEED,
    FROSTLEND_SLOTS.STAKING,
    FROSTLEND_SLOTS.COLL_SURPLUS_POOL,
  ];
  for (const slot of initContracts) {
    await executeCall(provider, taprootAddress, segwitAddress, `[4,${slot},0]:v0:v0`);
  }

  // Phase 3 — SetParams on BorrowerOps (opcode 70).
  // Args: mcr, ccr, min_net_debt, gas_compensation, max_borrowing_fee
  await executeCall(
    provider, taprootAddress, segwitAddress,
    `[4,${FROSTLEND_SLOTS.BORROWER_OPS},70,${MCR},${CCR},${MIN_NET_DEBT},${FROST_USD_GAS_COMP},${MAX_BORROWING_FEE}]:v0:v0`,
  );

  // Phase 4 — FinalizeAuth (opcode 60) on the 7 callees.
  const finalizeContracts = [
    FROSTLEND_SLOTS.TROVE_MANAGER,
    FROSTLEND_SLOTS.ACTIVE_POOL,
    FROSTLEND_SLOTS.STABILITY_POOL,
    FROSTLEND_SLOTS.SORTED_TROVES,
    FROSTLEND_SLOTS.FROST_USD_TOKEN,
    FROSTLEND_SLOTS.STAKING,
    FROSTLEND_SLOTS.COLL_SURPLUS_POOL,
  ];
  for (const slot of finalizeContracts) {
    await executeCall(provider, taprootAddress, segwitAddress, `[4,${slot},60]:v0:v0`);
  }

  // Phase 5 — Post initial price.
  await executeCall(
    provider, taprootAddress, segwitAddress,
    `[4,${FROSTLEND_SLOTS.PRICE_FEED},1,${initialPrice18Dec}]:v0:v0`,
  );
}

/**
 * Read the oracle price (18-dec USD/BTC).
 */
export async function readOraclePrice(): Promise<bigint> {
  const r = await rpcCall('alkanes_simulate', [{
    target: { block: '4', tx: String(FROSTLEND_SLOTS.PRICE_FEED) },
    inputs: ['30'], // GetStoredPrice
    alkanes: [], transaction: '0x', block: '0x',
    height: '0', txindex: 0, vout: 0,
  }]);
  const data = r?.result?.execution?.data || '0x';
  const clean = data.replace(/^0x/, '').padEnd(32, '0').slice(0, 32);
  const bytes = (clean.match(/.{2}/g) || []).reverse().join('');
  return BigInt('0x' + bytes);
}

/**
 * Read trove fields (coll, debt, status) for a given trove_id.
 */
export async function readTrove(troveId: bigint): Promise<{
  coll: bigint; debt: bigint; status: number;
}> {
  async function sim(opcode: string): Promise<string> {
    const r = await rpcCall('alkanes_simulate', [{
      target: { block: '4', tx: String(FROSTLEND_SLOTS.TROVE_MANAGER) },
      inputs: [opcode, troveId.toString()],
      alkanes: [], transaction: '0x', block: '0x',
      height: '0', txindex: 0, vout: 0,
    }]);
    return r?.result?.execution?.data || '0x';
  }
  function le128(hex: string): bigint {
    const c = hex.replace(/^0x/, '').padEnd(32, '0').slice(0, 32);
    const b = (c.match(/.{2}/g) || []).reverse().join('');
    return BigInt('0x' + b);
  }
  const [coll, debt, status] = await Promise.all([
    sim('20'), sim('21'), sim('22'),
  ]);
  return {
    coll: le128(coll),
    debt: le128(debt),
    status: parseInt(status.replace(/^0x/, '').slice(0, 2) || '0', 16),
  };
}
