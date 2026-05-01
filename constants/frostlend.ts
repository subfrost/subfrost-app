/**
 * Frostlend (Liquity-style CDP on Bitcoin/Alkanes) — contract IDs, opcodes, and protocol constants.
 *
 * Single source of truth for the lend page, mutation hooks, and the devnet deploy helper.
 * Mirrors `reference/frost-lend/crates/frost-lend-constants/src/lib.rs` and
 * `reference/frost-lend/scripts/deploy-all.sh` — when those change, update this file.
 *
 * Contract slot scheme:
 *   - Deploy target block = 3, deployed block = 4 (alkanes convention).
 *   - frostlend uses the 0x200 range to avoid collision with FIRE at 0x100.
 *   - Auth token factory at [4:0xFFEE] (= 65518) is shared across protocols
 *     and MUST be deployed before any contract that calls spawn_auth_token().
 */

// -- Frostlend contract template IDs (tx slot at block 4) --

export const FROST_USD_TOKEN_TX = 0x200; // 512  — frostUSD stablecoin
export const TROVE_MANAGER_TX = 0x201; // 513  — liquidation/redemption logic
export const BORROWER_OPS_TX = 0x202; // 514  — user-facing trove operations
export const STABILITY_POOL_TX = 0x203; // 515  — liquidation absorption
export const ACTIVE_POOL_TX = 0x204; // 516  — active collateral + debt accounting
export const SORTED_TROVES_TX = 0x205; // 517  — NICR-ordered linked list
export const PRICE_FEED_TX = 0x206; // 518  — mock oracle (PostPrice opcode 1)
export const STAKING_TX = 0x207; // 519  — FIRE staking for fee revenue
export const DEFAULT_POOL_TX = 0x208; // 520  — redistributed coll + debt (not deployed; logic in TM)
export const COLL_SURPLUS_POOL_TX = 0x209; // 521  — surplus from capped liquidations
export const GAS_POOL_TX = 0x20a; // 522  — frostUSD gas compensation reserve

// Auth-token-factory slot (shared with other protocols — deploy ONCE).
// Repo defines AUTH_TOKEN_FACTORY_ID = 0xffee (= 65518).
export const FROSTLEND_AUTH_TOKEN_FACTORY_TX = 0xffee;

// FIRE token slot (LQTY analog). Pre-existing in this app at [4:256].
export const FIRE_TOKEN_TX = 0x100;

// External references
export const FRBTC_BLOCK = 32;
export const FRBTC_TX = 0;

// -- AlkaneId helpers ("block:tx" string form used throughout the app) --

export const FROSTLEND_CONTRACTS = {
  AUTH_TOKEN_FACTORY: `4:${FROSTLEND_AUTH_TOKEN_FACTORY_TX}`,
  FIRE_TOKEN: `4:${FIRE_TOKEN_TX}`,
  FROST_USD: `4:${FROST_USD_TOKEN_TX}`,
  TROVE_MANAGER: `4:${TROVE_MANAGER_TX}`,
  BORROWER_OPS: `4:${BORROWER_OPS_TX}`,
  STABILITY_POOL: `4:${STABILITY_POOL_TX}`,
  ACTIVE_POOL: `4:${ACTIVE_POOL_TX}`,
  SORTED_TROVES: `4:${SORTED_TROVES_TX}`,
  PRICE_FEED: `4:${PRICE_FEED_TX}`,
  STAKING: `4:${STAKING_TX}`,
  COLL_SURPLUS_POOL: `4:${COLL_SURPLUS_POOL_TX}`,
  FRBTC: `${FRBTC_BLOCK}:${FRBTC_TX}`,
} as const;

// -- BorrowerOps opcodes (source: alkanes/frost-lend-borrower-ops/src/lib.rs) --

export const BORROWER_OPS_OPCODES = {
  Initialize: 0,
  /** OpenTrove(frost_usd_amount, hint_prev_block, hint_prev_tx, hint_next_block, hint_next_tx, max_fee_percentage). */
  OpenTrove: 1,
  /** AdjustTrove(trove_id, coll_withdrawal, frost_usd_change, is_debt_increase, hint_prev_block, hint_prev_tx, hint_next_block, hint_next_tx, max_fee_percentage). */
  AdjustTrove: 2,
  CloseTrove: 3,
  AddColl: 4,
  WithdrawColl: 5,
  DrawFrostUsd: 6,
  RepayFrostUsd: 7,
  ClaimCollateral: 8,
  GetProtocolAuthToken: 50,
  /** SetParams(mcr, ccr, min_net_debt, gas_compensation, max_borrowing_fee). One-shot, before finalize_auth. */
  SetParams: 70,
} as const;

// -- TroveManager opcodes (source: alkanes/frost-lend-trove-manager/src/lib.rs) --

export const TROVE_MANAGER_OPCODES = {
  Initialize: 0,
  CreateTrove: 1,
  UpdateTrove: 2,
  CloseTrove: 3,
  /** Liquidate(trove_id) — permissionless, anyone can call. */
  Liquidate: 4,
  RedeemCollateral: 5,
  ApplyPendingRewards: 6,
  /** LiquidateTroves(max_count) — batch liquidation from worst ICR up. */
  LiquidateTroves: 7,
  GetTroveColl: 20,
  GetTroveDebt: 21,
  GetTroveStatus: 22,
  GetTroveCount: 23,
  GetTcr: 24,
  CheckRecoveryMode: 25,
  GetBaseRate: 26,
  GetBorrowingRate: 27,
  GetRedemptionRate: 28,
  GetEntireSystemColl: 29,
  GetEntireSystemDebt: 30,
  GetNominalIcr: 31,
  GetCurrentIcr: 32,
  GetTroveAuthToken: 33,
  SetTroveAuthToken: 34,
  ClearTroveAuthToken: 35,
  GetProtocolAuthToken: 50,
  FinalizeAuth: 60,
  /** SetParams(mcr, ccr, gas_compensation, percent_divisor). */
  SetParams: 70,
} as const;

// -- StabilityPool opcodes (source: alkanes/frost-lend-stability-pool/src/lib.rs) --

export const STABILITY_POOL_OPCODES = {
  Initialize: 0,
  /** Deposit() — send frostUSD as incoming alkane transfer. Returns depositor_id + auth token. */
  Deposit: 1,
  /** Withdraw(depositor_id, amount). */
  Withdraw: 2,
  /** Offset(debt_to_absorb, coll_to_add) — TroveManager-only during liquidation. */
  Offset: 3,
  /** TopUpDeposit(depositor_id) — send frostUSD + auth token. */
  TopUpDeposit: 4,
  GetTotalDeposits: 20,
  GetCompoundedDeposit: 21,
  GetDepositorFrbtcGain: 22,
  GetP: 23,
  GetDepositorAuthToken: 24,
  FinalizeAuth: 60,
} as const;

// -- PriceFeed opcodes (source: alkanes/frost-lend-price-feed/src/lib.rs) --

export const PRICE_FEED_OPCODES = {
  Initialize: 0,
  /** PostPrice(price_18dec) — MOCK ORACLE, permissionless. Used by devnet helper. */
  PostPrice: 1,
  GetPrice: 20,
  GetLastUpdateTime: 21,
  IsPriceFresh: 22,
  /** GetStoredPrice — no staleness check, safe in alkanes_simulate. */
  GetStoredPrice: 30,
} as const;

// -- Sorted troves & other contracts only need FinalizeAuth from the deploy script perspective --

export const ACTIVE_POOL_OPCODES = { Initialize: 0, FinalizeAuth: 60 } as const;
export const SORTED_TROVES_OPCODES = { Initialize: 0, FinalizeAuth: 60 } as const;
export const FROST_USD_TOKEN_OPCODES = { Initialize: 0, FinalizeAuth: 60 } as const;
export const STAKING_OPCODES = { Initialize: 0, FinalizeAuth: 60 } as const;
export const COLL_SURPLUS_POOL_OPCODES = { Initialize: 0, FinalizeAuth: 60 } as const;

// -- Trove status enum (source: trove manager) --

export const TROVE_STATUS = {
  NonExistent: 0,
  Active: 1,
  ClosedByOwner: 2,
  ClosedByLiquidation: 3,
  ClosedByRedemption: 4,
} as const;
export type TroveStatus = (typeof TROVE_STATUS)[keyof typeof TROVE_STATUS];

// -- Protocol parameters (18-decimal fixed-point, sourced from constants crate) --

/** 1e18 — fixed-point precision used by all ratios, fees, prices. */
export const DECIMAL_PRECISION_18 = 10n ** 18n;
/** 1e20 — used for NICR. */
export const NICR_PRECISION = 10n ** 20n;

/** Minimum Collateral Ratio: 110%. Below this triggers liquidation. */
export const MCR = 1_100_000_000_000_000_000n;
/** Critical Collateral Ratio: 150%. Below this puts the system in Recovery Mode. */
export const CCR = 1_500_000_000_000_000_000n;

/** Borrowing fee floor: 0.5%. */
export const BORROWING_FEE_FLOOR = 5_000_000_000_000_000n;
/** Maximum borrowing fee: 5%. */
export const MAX_BORROWING_FEE = 50_000_000_000_000_000n;
/** Redemption fee floor: 0.5%. */
export const REDEMPTION_FEE_FLOOR = 5_000_000_000_000_000n;

/** frostUSD gas compensation per trove: 200 frostUSD (8 decimals). */
export const FROST_USD_GAS_COMPENSATION = 20_000_000_000n;
/** Minimum net debt: 1800 frostUSD (8 decimals). */
export const MIN_NET_DEBT = 180_000_000_000n;
/** Coll gas compensation divisor: 0.5% of collateral. */
export const PERCENT_DIVISOR = 200n;

/** alkanes token decimals (sat-style, like BTC). frBTC and frostUSD both use 8. */
export const FROSTLEND_TOKEN_DECIMALS = 8;

/** Default initial price: $50,000/BTC in 18-decimal fixed-point. */
export const DEFAULT_INITIAL_PRICE_18DEC = 50_000n * DECIMAL_PRECISION_18;

// -- Helpers --

/** Convert a USD-per-BTC price (e.g. 50000) to 18-decimal fixed-point u128. */
export function usdPriceTo18Dec(usd: number | bigint): bigint {
  const usdBig = typeof usd === 'bigint' ? usd : BigInt(Math.floor(usd));
  return usdBig * DECIMAL_PRECISION_18;
}

/** Convert an 18-decimal price to a JS number (USD per BTC). Loses precision below cents. */
export function price18DecToUsd(price18: bigint): number {
  // Divide first, then to number, to keep precision for typical values.
  return Number(price18 / 10n ** 16n) / 100;
}

/** Convert frBTC sats (8 decimals) → BTC float. */
export function frbtcSatsToBtc(sats: bigint): number {
  return Number(sats) / 1e8;
}

/** Convert frostUSD smallest-unit (8 decimals) → USD float. */
export function frostUsdToFloat(amount: bigint): number {
  return Number(amount) / 1e8;
}

/** Compute Individual Collateral Ratio (ICR) = coll * price / debt, in 18-dec fixed-point. */
export function computeIcr(collFrbtcSats: bigint, debtFrostUsd: bigint, price18: bigint): bigint {
  if (debtFrostUsd === 0n) return 2n ** 256n - 1n; // infinite
  // coll (8dec) * price (18dec) = 26dec result; divide by debt (8dec) → 18dec
  return (collFrbtcSats * price18) / debtFrostUsd;
}

/** ICR fixed-point → percent (e.g. 1.1e18 → 110). */
export function icrToPercent(icr18: bigint): number {
  return Number(icr18 / 10n ** 14n) / 100;
}
