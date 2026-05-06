/**
 * YieldHarvester — Periodic process that converts yield into dxBTC value.
 *
 * Two yield sources feed into dxBTC:
 *
 * 1. **Vault yield printing**: EVM vaults (stETH, Curve) earn yield. When
 *    vault_assets > frAsset_supply, surplus is minted as frETH/frUSD,
 *    swapped to frBTC via synth pool, and deposited into dxBTC (opcode 6).
 *
 * 2. **Synth pool protocol fees**: StableSwap pools accumulate admin fees
 *    on every trade. The harvester calls claim-admin-fees (opcode 10) to
 *    collect LP fees, removes liquidity to get frBTC + frAsset, swaps the
 *    non-frBTC side to frBTC, and deposits everything into dxBTC (opcode 6).
 *
 * dxBTC opcode 6 (deposit_fees) increases vault assets WITHOUT minting new
 * shares — existing dxBTC holders see their share value appreciate.
 *
 * This runs identically on devnet (in-process engines) and production
 * (real RPCs) — all I/O goes through injected callbacks.
 *
 * JOURNAL (2026-03-29): Initial implementation. Matches protostone format
 * from e2e-yield-harvester.test.ts. Synth pool opcodes confirmed from
 * alkanes.toml: swap=5, claim-admin-fees=10, remove-liquidity=2.
 */

// ---- Types ----

export type HarvestSource = 'eth_yield' | 'usd_yield' | 'synth_fees';

export interface HarvestEvent {
  timestamp: number;
  source: HarvestSource;
  /** Amount of frAsset minted or LP fees collected */
  inputAmount: bigint;
  /** frBTC deposited into dxBTC */
  frbtcDeposited: bigint;
  /** Transaction IDs */
  txIds: string[];
  success: boolean;
  error?: string;
}

export interface YieldSourceConfig {
  /** frAsset alkane ID (e.g., "4:52224" for frETH) */
  frAssetId: string;
  /** Synth pool alkane ID for frBTC/frAsset swaps */
  synthPoolId: string;
  /** Source label */
  source: HarvestSource;
  /** Minimum surplus to trigger harvest (frAsset units) */
  minSurplus: bigint;
  /** Slippage tolerance in bps (100 = 1%) */
  slippageBps: number;
}

export interface SynthPoolFeeConfig {
  /** Synth pool alkane ID */
  poolId: string;
  /** Token A alkane ID */
  tokenAId: string;
  /** Token B alkane ID */
  tokenBId: string;
  /** Label for logging */
  label: string;
}

export interface HarvesterConfig {
  /** dxBTC vault alkane ID */
  dxbtcVaultId: string;
  /** frBTC alkane ID (32:0) */
  frbtcId: string;
  /** Yield sources to harvest (EVM vault surplus) */
  yieldSources: YieldSourceConfig[];
  /** Synth pools to collect fees from */
  synthPools: SynthPoolFeeConfig[];
  /** Harvest interval in milliseconds (30s devnet, 3600s production) */
  intervalMs: number;
  /** Current chain height getter (for deadline calculation) */
  deadlineBlocks: number;
}

// ---- Callbacks (chain-agnostic I/O) ----

export interface HarvesterCallbacks {
  /** Get total assets in an EVM vault (used for surplus detection) */
  getVaultAssets: (source: HarvestSource) => Promise<bigint>;
  /** Get total supply of a frAsset (alkane) */
  getFrAssetSupply: (alkaneId: string) => Promise<bigint>;
  /** Get accumulated admin fees in a synth pool (opcode 10 simulation) */
  getPoolAdminFees: (poolId: string) => Promise<bigint>;
  /** Execute a Bitcoin alkanes operation and return txid */
  executeBtcOp: (protostone: string, inputReqs: string) => Promise<string>;
  /** Mine/confirm a BTC block */
  confirmBtc: () => Promise<void>;
  /** Get current chain height */
  getHeight: () => Promise<number>;
  /** Query synth pool reserves (opcode 101) */
  getPoolReserves: (poolId: string) => Promise<{ reserveA: bigint; reserveB: bigint }>;
}

// ---- Constants ----

// Synth pool opcodes (from synth-pool/alkanes.toml)
const SYNTH_SWAP = 5;
const SYNTH_REMOVE_LIQUIDITY = 2;
const SYNTH_CLAIM_ADMIN_FEES = 10;

// dxBTC opcodes (from dx-btc/alkanes.toml)
const DXBTC_DEPOSIT_FEES = 6;

// ---- Harvester ----

export class YieldHarvester {
  private config: HarvesterConfig;
  private callbacks: HarvesterCallbacks;
  private history: HarvestEvent[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();

  // Running totals
  private totalFrbtcDeposited = 0n;
  private totalHarvests = 0;

  constructor(callbacks: HarvesterCallbacks, config: HarvesterConfig) {
    this.callbacks = callbacks;
    this.config = config;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Run a single harvest cycle: check all sources, harvest if surplus. */
  async harvestAll(): Promise<HarvestEvent[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;
    const events: HarvestEvent[] = [];

    try {
      // 1. Harvest yield surplus from EVM vaults
      for (const source of this.config.yieldSources) {
        try {
          const event = await this.harvestYieldSurplus(source);
          if (event) events.push(event);
        } catch (e: any) {
          console.warn(`[YieldHarvester] ${source.source} harvest failed:`, e?.message?.slice(0, 80));
        }
      }

      // 2. Collect protocol fees from synth pools
      for (const pool of this.config.synthPools) {
        try {
          const event = await this.harvestPoolFees(pool);
          if (event) events.push(event);
        } catch (e: any) {
          console.warn(`[YieldHarvester] ${pool.label} fee harvest failed:`, e?.message?.slice(0, 80));
        }
      }

      if (events.length > 0) {
        const totalDeposited = events.reduce((sum, e) => sum + (e.success ? e.frbtcDeposited : 0n), 0n);
        console.log(
          `[YieldHarvester] Cycle complete: ${events.length} harvests, ` +
          `${totalDeposited} frBTC deposited into dxBTC`
        );
      }
    } finally {
      this.isProcessing = false;
    }

    return events;
  }

  /** Start periodic harvesting. */
  startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.harvestAll().catch((e) => {
        console.warn('[YieldHarvester] Poll error:', e);
      });
    }, this.config.intervalMs);
    console.log(`[YieldHarvester] Started (every ${this.config.intervalMs}ms)`);
  }

  /** Stop periodic harvesting. */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[YieldHarvester] Stopped');
    }
  }

  // =========================================================================
  // Yield Surplus Harvesting
  // =========================================================================

  /**
   * Detect and harvest yield surplus from an EVM vault.
   *
   * surplus = vault_assets - frAsset_supply
   * If surplus > minSurplus: mint frAsset → swap to frBTC → deposit into dxBTC
   */
  private async harvestYieldSurplus(source: YieldSourceConfig): Promise<HarvestEvent | null> {
    // Step 1: Detect surplus
    const [vaultAssets, frSupply] = await Promise.all([
      this.callbacks.getVaultAssets(source.source),
      this.callbacks.getFrAssetSupply(source.frAssetId),
    ]);

    const surplus = vaultAssets > frSupply ? vaultAssets - frSupply : 0n;

    if (surplus < source.minSurplus) {
      return null; // No actionable surplus
    }

    console.log(
      `[YieldHarvester] ${source.source} surplus detected: ` +
      `vault=${vaultAssets}, supply=${frSupply}, surplus=${surplus}`
    );

    const event: HarvestEvent = {
      timestamp: Date.now(),
      source: source.source,
      inputAmount: surplus,
      frbtcDeposited: 0n,
      txIds: [],
      success: false,
    };

    try {
      const height = await this.callbacks.getHeight();
      const deadline = height + this.config.deadlineBlocks;

      // Step 2: Estimate swap output for slippage protection
      const reserves = await this.callbacks.getPoolReserves(source.synthPoolId);
      const expectedFrbtc = this.estimateSwapOutput(
        surplus, reserves.reserveA, reserves.reserveB,
      );
      const minFrbtcOut = expectedFrbtc * BigInt(10000 - source.slippageBps) / 10000n;

      // Step 3: Build 3-protostone chain: mint → swap → deposit
      // The mint happens implicitly — coordinator has auth to mint frAsset matching surplus
      const [frB, frT] = source.frAssetId.split(':');
      const [poolB, poolT] = source.synthPoolId.split(':');
      const [dxB, dxT] = this.config.dxbtcVaultId.split(':');

      // Single tx with 3 chained protostones:
      // p0: edict — transfer frAsset to p1 (the swap protostone)
      // p1: swap frAsset → frBTC on synth pool, output to p2
      // p2: deposit frBTC into dxBTC via opcode 6 (no share dilution)
      //
      // For the mint step, we use alkanesExecuteFull with the frAsset auth token
      // to mint surplus, then chain the swap + deposit in the same tx.

      // Simplified: mint frAsset first, then swap+deposit
      // Step 3a: Mint frAsset matching surplus
      const mintProtostone = `[${frB},${frT},1,0,0,${surplus}]:v0:v0`;
      const mintTxId = await this.callbacks.executeBtcOp(mintProtostone, 'B:10000:v0');
      event.txIds.push(mintTxId);
      await this.callbacks.confirmBtc();

      // Step 3b: Swap frAsset → frBTC via synth pool
      const swapProtostone = `[${poolB},${poolT},${SYNTH_SWAP},${minFrbtcOut},${deadline}]:v0:v0`;
      const swapTxId = await this.callbacks.executeBtcOp(
        swapProtostone,
        `${source.frAssetId}:${surplus}`,
      );
      event.txIds.push(swapTxId);
      await this.callbacks.confirmBtc();

      // Step 3c: Deposit frBTC into dxBTC (opcode 6 = deposit_fees)
      const depositProtostone = `[${dxB},${dxT},${DXBTC_DEPOSIT_FEES}]:v0:v0`;
      const depositTxId = await this.callbacks.executeBtcOp(
        depositProtostone,
        `${this.config.frbtcId}:${expectedFrbtc}`,
      );
      event.txIds.push(depositTxId);
      await this.callbacks.confirmBtc();

      event.frbtcDeposited = expectedFrbtc;
      event.success = true;
      this.totalFrbtcDeposited += expectedFrbtc;
      this.totalHarvests++;
    } catch (e: any) {
      event.error = e?.message || 'Unknown error';
    }

    this.history.push(event);
    this.notify();
    return event;
  }

  // =========================================================================
  // Synth Pool Fee Harvesting
  // =========================================================================

  /**
   * Collect accumulated protocol fees from a synth pool.
   *
   * Flow:
   * 1. Call claim-admin-fees (opcode 10) on the pool → receive LP tokens
   * 2. Remove liquidity (opcode 2) → receive tokenA + tokenB
   * 3. If tokenA is not frBTC, swap it to frBTC via the same pool
   * 4. Deposit all frBTC into dxBTC (opcode 6)
   */
  private async harvestPoolFees(pool: SynthPoolFeeConfig): Promise<HarvestEvent | null> {
    // Step 1: Check if there are fees to collect
    const adminFees = await this.callbacks.getPoolAdminFees(pool.poolId);

    if (adminFees === 0n) {
      return null; // No fees accumulated
    }

    console.log(`[YieldHarvester] ${pool.label} admin fees: ${adminFees}`);

    const event: HarvestEvent = {
      timestamp: Date.now(),
      source: 'synth_fees',
      inputAmount: adminFees,
      frbtcDeposited: 0n,
      txIds: [],
      success: false,
    };

    try {
      const height = await this.callbacks.getHeight();
      const deadline = height + this.config.deadlineBlocks;
      const [poolB, poolT] = pool.poolId.split(':');
      const [dxB, dxT] = this.config.dxbtcVaultId.split(':');

      // Step 2: Claim admin fees (opcode 10)
      const claimProtostone = `[${poolB},${poolT},${SYNTH_CLAIM_ADMIN_FEES}]:v0:v0`;
      const claimTxId = await this.callbacks.executeBtcOp(claimProtostone, 'B:10000:v0');
      event.txIds.push(claimTxId);
      await this.callbacks.confirmBtc();

      // Step 3: Remove liquidity to get frBTC + frAsset
      // For the LP token received from claim, burn it to get both tokens
      const removeLiqProtostone = `[${poolB},${poolT},${SYNTH_REMOVE_LIQUIDITY},0,0,${deadline}]:v0:v0`;
      const removeTxId = await this.callbacks.executeBtcOp(
        removeLiqProtostone,
        `${pool.poolId}:${adminFees}`, // LP token = pool's own alkane ID
      );
      event.txIds.push(removeTxId);
      await this.callbacks.confirmBtc();

      // Step 4: Swap non-frBTC side to frBTC (if tokenA or tokenB is not frBTC)
      const isTokenAFrbtc = pool.tokenAId === this.config.frbtcId;
      const nonFrbtcToken = isTokenAFrbtc ? pool.tokenBId : pool.tokenAId;

      if (nonFrbtcToken !== this.config.frbtcId) {
        // Query how much of the non-frBTC token we received
        // For simplicity, swap half the admin fee equivalent
        const swapAmount = adminFees / 2n;
        if (swapAmount > 0n) {
          const swapProtostone = `[${poolB},${poolT},${SYNTH_SWAP},0,${deadline}]:v0:v0`;
          const swapTxId = await this.callbacks.executeBtcOp(
            swapProtostone,
            `${nonFrbtcToken}:${swapAmount}`,
          );
          event.txIds.push(swapTxId);
          await this.callbacks.confirmBtc();
        }
      }

      // Step 5: Deposit all frBTC into dxBTC (opcode 6)
      // At this point the coordinator wallet holds frBTC from the LP unwrap + swap
      const depositProtostone = `[${dxB},${dxT},${DXBTC_DEPOSIT_FEES}]:v0:v0`;
      const depositTxId = await this.callbacks.executeBtcOp(
        depositProtostone,
        `${this.config.frbtcId}:${adminFees}`, // approximate — actual amount from LP unwrap
      );
      event.txIds.push(depositTxId);
      await this.callbacks.confirmBtc();

      event.frbtcDeposited = adminFees; // approximate
      event.success = true;
      this.totalFrbtcDeposited += adminFees;
      this.totalHarvests++;
    } catch (e: any) {
      event.error = e?.message || 'Unknown error';
    }

    this.history.push(event);
    this.notify();
    return event;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Constant-product swap output estimation (Uniswap V2 formula, 0.3% fee). */
  private estimateSwapOutput(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
  ): bigint {
    if (reserveIn === 0n || reserveOut === 0n) return 0n;
    const feeAdjusted = amountIn * 997n;
    const numerator = feeAdjusted * reserveOut;
    const denominator = reserveIn * 1000n + feeAdjusted;
    return numerator / denominator;
  }

  // =========================================================================
  // State Accessors
  // =========================================================================

  getHistory(): readonly HarvestEvent[] { return this.history; }
  getTotalFrbtcDeposited(): bigint { return this.totalFrbtcDeposited; }
  getTotalHarvests(): number { return this.totalHarvests; }
  get isPolling(): boolean { return this.pollInterval !== null; }

  getSummary(): {
    totalHarvests: number;
    totalFrbtcDeposited: string;
    lastHarvest: HarvestEvent | null;
    isRunning: boolean;
  } {
    return {
      totalHarvests: this.totalHarvests,
      totalFrbtcDeposited: this.totalFrbtcDeposited.toString(),
      lastHarvest: this.history.length > 0 ? this.history[this.history.length - 1] : null,
      isRunning: this.isPolling,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  dispose(): void {
    this.stopPolling();
    this.listeners.clear();
  }
}

// =========================================================================
// Factory — create a configured harvester for the devnet
// =========================================================================

/**
 * Create a YieldHarvester configured for the devnet protocol stack.
 */
export function createDevnetHarvester(
  callbacks: HarvesterCallbacks,
  contracts: {
    dxbtcVaultId: string;
    frethId: string;
    frusdId: string;
    synthFrbtcFreth: string;
    synthFrbtcFrusd: string;
    synthFrbtcFrzec: string;
    synthFrzecFreth: string;
    synthFrzecFrusd: string;
    synthFrethFrusd: string;
    frzecId: string;
    frbtcId?: string;
  },
): YieldHarvester {
  return new YieldHarvester(callbacks, {
    dxbtcVaultId: contracts.dxbtcVaultId,
    frbtcId: contracts.frbtcId || '32:0',
    deadlineBlocks: 1000,
    intervalMs: 30_000, // 30s for devnet

    yieldSources: [
      {
        frAssetId: contracts.frethId,
        synthPoolId: contracts.synthFrbtcFreth,
        source: 'eth_yield',
        minSurplus: 10000n,   // 0.0001 frETH minimum
        slippageBps: 100,     // 1% slippage
      },
      {
        frAssetId: contracts.frusdId,
        synthPoolId: contracts.synthFrbtcFrusd,
        source: 'usd_yield',
        minSurplus: 1000000n, // 0.01 frUSD minimum
        slippageBps: 100,
      },
    ],

    synthPools: [
      {
        poolId: contracts.synthFrbtcFreth,
        tokenAId: '32:0',
        tokenBId: contracts.frethId,
        label: 'frBTC/frETH fees',
      },
      {
        poolId: contracts.synthFrbtcFrusd,
        tokenAId: '32:0',
        tokenBId: contracts.frusdId,
        label: 'frBTC/frUSD fees',
      },
      {
        poolId: contracts.synthFrbtcFrzec,
        tokenAId: '32:0',
        tokenBId: contracts.frzecId,
        label: 'frBTC/frZEC fees',
      },
      {
        poolId: contracts.synthFrzecFreth,
        tokenAId: contracts.frzecId,
        tokenBId: contracts.frethId,
        label: 'frZEC/frETH fees',
      },
      {
        poolId: contracts.synthFrzecFrusd,
        tokenAId: contracts.frzecId,
        tokenBId: contracts.frusdId,
        label: 'frZEC/frUSD fees',
      },
      {
        poolId: contracts.synthFrethFrusd,
        tokenAId: contracts.frethId,
        tokenBId: contracts.frusdId,
        label: 'frETH/frUSD fees',
      },
    ],
  });
}
