/**
 * CoordinatorWallet — Balance tracker + rebalancing state machine.
 *
 * The coordinator holds assets on both BTC and EVM chains. As bridge operations
 * flow in one direction (e.g., many USDC→BTC deposits), one side accumulates
 * excess while the other depletes. The rebalancer detects this and moves funds
 * back using the same mint/burn/swap mechanisms users use.
 *
 * This is chain-agnostic: it works identically with in-process devnet engines
 * or live RPC backends. The callbacks handle the actual I/O.
 *
 * State machine:
 *   idle → detecting_imbalance → rebalancing → cooldown → idle
 *
 * Fee model:
 *   Protocol fee (0.1%) is collected on every bridge operation.
 *   Half funds the operational reserve, half is protocol revenue.
 *   Rebalancing only triggers when fee revenue exceeds estimated gas costs.
 */

// ---- Types ----

export type RebalanceDirection = 'btc_to_evm' | 'evm_to_btc';
export type RebalanceState = 'idle' | 'detecting' | 'rebalancing' | 'cooldown';

export interface ChainBalances {
  /** BTC-side: sats of BTC held by coordinator */
  btcSats: bigint;
  /** BTC-side: frBTC units held (can be unwrapped to BTC) */
  frbtcUnits: bigint;
  /** BTC-side: frUSD units held (can be swapped to frBTC → BTC) */
  frusdUnits: bigint;
  /** EVM-side: USDC units (6 decimals) */
  usdcUnits: bigint;
  /** EVM-side: USDT units (6 decimals) */
  usdtUnits: bigint;
}

export interface FeeAccounting {
  /** Total protocol fees collected (in USDC-equivalent 6-dec units) */
  totalFeesCollected: bigint;
  /** Fees allocated to operational reserve */
  operationalReserve: bigint;
  /** Fees allocated to protocol revenue */
  protocolRevenue: bigint;
  /** Cost of last rebalance (estimated gas in USDC-equivalent) */
  lastRebalanceCost: bigint;
  /** Number of rebalances performed */
  rebalanceCount: number;
}

export interface RebalanceEvent {
  timestamp: number;
  direction: RebalanceDirection;
  amount: bigint;         // USDC-equivalent units moved
  gasCost: bigint;        // estimated gas cost
  success: boolean;
  txIds: string[];        // tx IDs involved
  error?: string;
}

export interface CoordinatorWalletConfig {
  /** Imbalance threshold as a ratio (0.0-1.0). Default 0.3 = rebalance when
   *  one side holds >65% of total value. */
  imbalanceThreshold: number;
  /** Minimum fee revenue required before a rebalance is allowed (USDC 6-dec) */
  minFeeRevenueForRebalance: bigint;
  /** Cooldown between rebalances in milliseconds. Default 60_000 (1 min for devnet) */
  cooldownMs: number;
  /** Minimum operational reserve to maintain on each chain (USDC 6-dec) */
  minOperationalReserve: bigint;
  /** Estimated gas cost per rebalance tx (USDC 6-dec). Used for profitability check. */
  estimatedGasCostPerRebalance: bigint;
  /** BTC price in USDC (6-dec) for value normalization. Updated externally. */
  btcPriceUsdc: bigint;
}

// ---- Callbacks (chain-agnostic I/O) ----

export interface WalletCallbacks {
  /** Query BTC balance (sats) at a Bitcoin address */
  getBtcBalance: (address: string) => Promise<bigint>;
  /** Query alkane balance for a token at a Bitcoin address */
  getAlkaneBalance: (address: string, alkaneId: string) => Promise<bigint>;
  /** Query ERC20 balance on EVM */
  getEvmTokenBalance: (tokenAddress: string, walletAddress: string) => Promise<bigint>;
  /** Execute a Bitcoin alkanes operation (mint, burn, swap) */
  executeBtcOp: (protostone: string, inputReqs: string) => Promise<string>;
  /** Execute an EVM vault operation */
  executeEvmOp: (to: string, calldata: string, value: bigint) => Promise<string>;
  /** Mine a BTC block (devnet) or wait for confirmation (production) */
  confirmBtc: () => Promise<void>;
}

// ---- Constants ----

const PROTOCOL_FEE_BPS = 10n;     // 0.1%
const BPS_BASE = 10000n;
const USDC_DECIMALS = 6;
const FRUSD_TO_USDC = 10n ** 12n;  // 18-dec → 6-dec

const DEFAULT_CONFIG: CoordinatorWalletConfig = {
  imbalanceThreshold: 0.3,
  minFeeRevenueForRebalance: 100_000n,  // $0.10 minimum fees before rebalance
  cooldownMs: 60_000,                    // 1 min for devnet
  minOperationalReserve: 1_000_000n,     // $1.00 minimum per chain
  estimatedGasCostPerRebalance: 50_000n, // $0.05 estimated gas
  btcPriceUsdc: 100_000_000_000n,        // $100,000 (6-dec) — placeholder
};

// ---- Coordinator Wallet ----

export class CoordinatorWallet {
  private config: CoordinatorWalletConfig;
  private callbacks: WalletCallbacks;

  // Addresses
  private btcAddress: string;       // Bitcoin taproot address
  private evmAddress: string;       // EVM wallet address
  private usdcAddress: string;      // EVM USDC contract
  private usdtAddress: string;      // EVM USDT contract
  private frusdId: string;          // frUSD alkane ID
  private frbtcId: string;          // frBTC alkane ID (32:0)
  private synthPoolId: string;      // frBTC/frUSD synth pool
  private factoryId: string;        // AMM factory

  // State
  private balances: ChainBalances = {
    btcSats: 0n, frbtcUnits: 0n, frusdUnits: 0n,
    usdcUnits: 0n, usdtUnits: 0n,
  };
  private fees: FeeAccounting = {
    totalFeesCollected: 0n, operationalReserve: 0n,
    protocolRevenue: 0n, lastRebalanceCost: 0n, rebalanceCount: 0,
  };
  private state: RebalanceState = 'idle';
  private lastRebalanceTime = 0;
  private history: RebalanceEvent[] = [];
  private listeners: Set<() => void> = new Set();

  constructor(
    callbacks: WalletCallbacks,
    addresses: {
      btcAddress: string;
      evmAddress: string;
      usdcAddress: string;
      usdtAddress: string;
      frusdId: string;
      frbtcId?: string;
      synthPoolId: string;
      factoryId: string;
    },
    config?: Partial<CoordinatorWalletConfig>,
  ) {
    this.callbacks = callbacks;
    this.btcAddress = addresses.btcAddress;
    this.evmAddress = addresses.evmAddress;
    this.usdcAddress = addresses.usdcAddress;
    this.usdtAddress = addresses.usdtAddress;
    this.frusdId = addresses.frusdId;
    this.frbtcId = addresses.frbtcId || '32:0';
    this.synthPoolId = addresses.synthPoolId;
    this.factoryId = addresses.factoryId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Refresh balances from both chains. */
  async refreshBalances(): Promise<ChainBalances> {
    const [btcSats, frbtcUnits, frusdUnits, usdcUnits, usdtUnits] = await Promise.all([
      this.callbacks.getBtcBalance(this.btcAddress),
      this.callbacks.getAlkaneBalance(this.btcAddress, this.frbtcId),
      this.callbacks.getAlkaneBalance(this.btcAddress, this.frusdId),
      this.callbacks.getEvmTokenBalance(this.usdcAddress, this.evmAddress),
      this.callbacks.getEvmTokenBalance(this.usdtAddress, this.evmAddress),
    ]);

    this.balances = { btcSats, frbtcUnits, frusdUnits, usdcUnits, usdtUnits };
    this.notify();
    return this.balances;
  }

  /** Record a fee collection from a bridge operation. */
  recordFee(usdcEquivalentAmount: bigint): void {
    const fee = (usdcEquivalentAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    this.fees.totalFeesCollected += fee;
    // Split 50/50: operational reserve and protocol revenue
    const half = fee / 2n;
    this.fees.operationalReserve += half;
    this.fees.protocolRevenue += fee - half;
    this.notify();
  }

  /**
   * Check for imbalance and rebalance if needed.
   * Called every poll cycle (e.g., every 5 seconds).
   * Returns null if no action taken, or the rebalance event if triggered.
   */
  async checkAndRebalance(): Promise<RebalanceEvent | null> {
    // Don't rebalance during cooldown
    if (this.state === 'rebalancing') return null;
    if (this.state === 'cooldown') {
      if (Date.now() - this.lastRebalanceTime < this.config.cooldownMs) return null;
      this.state = 'idle';
    }

    this.state = 'detecting';
    this.notify();

    // Refresh balances
    await this.refreshBalances();

    // Compute normalized value on each side (all in USDC 6-dec)
    const btcValue = this.computeBtcSideValue();
    const evmValue = this.computeEvmSideValue();
    const totalValue = btcValue + evmValue;

    if (totalValue === 0n) {
      this.state = 'idle';
      this.notify();
      return null;
    }

    // Check imbalance
    const btcRatio = Number(btcValue * 1000n / totalValue) / 1000;
    const evmRatio = Number(evmValue * 1000n / totalValue) / 1000;
    const threshold = this.config.imbalanceThreshold;

    let direction: RebalanceDirection | null = null;
    let moveAmount = 0n; // USDC-equivalent to move

    if (btcRatio > (0.5 + threshold)) {
      // BTC side overweight → move value to EVM
      direction = 'btc_to_evm';
      const targetBtcValue = totalValue / 2n;
      moveAmount = btcValue - targetBtcValue;
    } else if (evmRatio > (0.5 + threshold)) {
      // EVM side overweight → move value to BTC
      direction = 'evm_to_btc';
      const targetEvmValue = totalValue / 2n;
      moveAmount = evmValue - targetEvmValue;
    }

    if (!direction) {
      this.state = 'idle';
      this.notify();
      return null;
    }

    // Profitability check: fees must exceed gas costs
    const gasCost = this.config.estimatedGasCostPerRebalance;
    if (this.fees.operationalReserve < gasCost + this.config.minFeeRevenueForRebalance) {
      console.log(
        `[CoordinatorWallet] Imbalance detected (${direction}) but insufficient fee revenue.` +
        ` Reserve: ${this.fees.operationalReserve}, needed: ${gasCost + this.config.minFeeRevenueForRebalance}`
      );
      this.state = 'idle';
      this.notify();
      return null;
    }

    // Execute rebalance
    return this.executeRebalance(direction, moveAmount, gasCost);
  }

  /** Update BTC price (called externally, e.g., from oracle or config). */
  setBtcPrice(priceUsdc6Dec: bigint): void {
    this.config.btcPriceUsdc = priceUsdc6Dec;
  }

  // =========================================================================
  // Rebalance Execution
  // =========================================================================

  private async executeRebalance(
    direction: RebalanceDirection,
    amount: bigint,
    estimatedGas: bigint,
  ): Promise<RebalanceEvent> {
    this.state = 'rebalancing';
    this.notify();

    const event: RebalanceEvent = {
      timestamp: Date.now(),
      direction,
      amount,
      gasCost: estimatedGas,
      success: false,
      txIds: [],
    };

    try {
      if (direction === 'btc_to_evm') {
        await this.rebalanceBtcToEvm(amount, event);
      } else {
        await this.rebalanceEvmToBtc(amount, event);
      }

      event.success = true;
      this.fees.operationalReserve -= estimatedGas;
      this.fees.lastRebalanceCost = estimatedGas;
      this.fees.rebalanceCount++;

      console.log(
        `[CoordinatorWallet] Rebalance ${direction} complete: moved ${amount} USDC-equiv.` +
        ` Gas cost: ${estimatedGas}. Txs: ${event.txIds.join(', ')}`
      );
    } catch (e: any) {
      event.error = e?.message || 'Unknown error';
      console.error(`[CoordinatorWallet] Rebalance ${direction} failed:`, event.error);
    }

    this.history.push(event);
    this.lastRebalanceTime = Date.now();
    this.state = 'cooldown';
    this.notify();
    return event;
  }

  /**
   * BTC→EVM rebalance: frBTC → frUSD (synth pool) → burn frUSD → vault deposits USDC
   *
   * Steps:
   * 1. If holding frBTC: swap frBTC → frUSD via synth pool
   * 2. BurnAndBridge frUSD with coordinator's EVM address as recipient
   * 3. Coordinator detects its own burn → vault releases USDC to coordinator EVM wallet
   */
  private async rebalanceBtcToEvm(usdcAmount: bigint, event: RebalanceEvent): Promise<void> {
    // Convert USDC amount to frBTC amount (via price)
    const frbtcAmount = this.usdcToFrbtc(usdcAmount);

    // Step 1: Swap frBTC → frUSD via synth pool (if we have frBTC)
    if (this.balances.frbtcUnits >= frbtcAmount) {
      const [poolBlock, poolTx] = this.synthPoolId.split(':');
      // Synth pool swap: send frBTC, receive frUSD
      const swapProtostone = `[${poolBlock},${poolTx},1,0,0]:v0:v0`;
      const txId = await this.callbacks.executeBtcOp(
        swapProtostone,
        `${this.frbtcId}:${frbtcAmount}`,
      );
      event.txIds.push(txId);
      await this.callbacks.confirmBtc();
    }

    // Step 2: BurnAndBridge frUSD → EVM coordinator address
    const frusdAmount = usdcAmount * FRUSD_TO_USDC; // 6-dec → 18-dec
    if (this.balances.frusdUnits >= frusdAmount || event.txIds.length > 0) {
      const [frusdBlock, frusdTx] = this.frusdId.split(':');
      // Encode EVM address as u128 pair for the burn protostone
      const evmAddr = this.evmAddress.replace('0x', '').toLowerCase();
      const addrHi = BigInt('0x' + evmAddr.slice(0, 16));
      const addrLo = BigInt('0x' + evmAddr.slice(16, 40).padEnd(32, '0'));
      const burnProtostone = `[${frusdBlock},${frusdTx},5,${addrHi},${addrLo}]:v0:v0`;
      const txId = await this.callbacks.executeBtcOp(
        burnProtostone,
        `${this.frusdId}:${frusdAmount}`,
      );
      event.txIds.push(txId);
      await this.callbacks.confirmBtc();
    }
  }

  /**
   * EVM→BTC rebalance: USDC → vault deposit → coordinator mints frUSD → swap to frBTC
   *
   * Steps:
   * 1. Deposit USDC into EVM vault (vault.depositAndBridge)
   * 2. Coordinator detects its own deposit → mints frUSD on Bitcoin
   * 3. Swap frUSD → frBTC via synth pool (keep as frBTC for future unwraps)
   */
  private async rebalanceEvmToBtc(usdcAmount: bigint, event: RebalanceEvent): Promise<void> {
    // Step 1: Deposit USDC to vault
    // ABI: depositAndBridge(uint256 amount, bytes32 btcRecipient)
    const amountHex = usdcAmount.toString(16).padStart(64, '0');
    // Encode BTC address as bytes32 (simplified — real impl would use proper encoding)
    const btcAddrHex = Buffer.from(this.btcAddress).toString('hex').padEnd(64, '0');
    const calldata = '0x' + 'a1234567' + amountHex + btcAddrHex; // placeholder selector

    const txId = await this.callbacks.executeEvmOp(
      this.usdcAddress, // target: vault address (should be vault, using USDC as placeholder)
      calldata,
      0n,
    );
    event.txIds.push(txId);

    // Step 2: Mint frUSD (coordinator has auth token)
    const frusdAmount = usdcAmount * FRUSD_TO_USDC;
    const [frusdBlock, frusdTx] = this.frusdId.split(':');
    const mintProtostone = `[${frusdBlock},${frusdTx},1,0,0,${frusdAmount}]:v0:v0`;
    const mintTxId = await this.callbacks.executeBtcOp(mintProtostone, 'B:10000:v0');
    event.txIds.push(mintTxId);
    await this.callbacks.confirmBtc();

    // Step 3: Swap frUSD → frBTC via synth pool (keep frBTC for fast future unwraps)
    const [poolBlock, poolTx] = this.synthPoolId.split(':');
    const swapProtostone = `[${poolBlock},${poolTx},1,0,0]:v0:v0`;
    const swapTxId = await this.callbacks.executeBtcOp(
      swapProtostone,
      `${this.frusdId}:${frusdAmount}`,
    );
    event.txIds.push(swapTxId);
    await this.callbacks.confirmBtc();
  }

  // =========================================================================
  // Value Computation
  // =========================================================================

  /** Compute total USDC-equivalent value on the BTC side. */
  private computeBtcSideValue(): bigint {
    const btcInUsdc = (this.balances.btcSats * this.config.btcPriceUsdc) / 100_000_000n;
    const frbtcInUsdc = (this.balances.frbtcUnits * this.config.btcPriceUsdc) / 100_000_000n;
    const frusdInUsdc = this.balances.frusdUnits / FRUSD_TO_USDC;
    return btcInUsdc + frbtcInUsdc + frusdInUsdc;
  }

  /** Compute total USDC-equivalent value on the EVM side. */
  private computeEvmSideValue(): bigint {
    return this.balances.usdcUnits + this.balances.usdtUnits;
  }

  /** Convert USDC amount to approximate frBTC units (via BTC price). */
  private usdcToFrbtc(usdcAmount: bigint): bigint {
    if (this.config.btcPriceUsdc === 0n) return 0n;
    return (usdcAmount * 100_000_000n) / this.config.btcPriceUsdc;
  }

  // =========================================================================
  // State Accessors
  // =========================================================================

  getBalances(): Readonly<ChainBalances> { return this.balances; }
  getFees(): Readonly<FeeAccounting> { return this.fees; }
  getState(): RebalanceState { return this.state; }
  getHistory(): readonly RebalanceEvent[] { return this.history; }

  /** Is the system profitable? (total fees > total rebalance costs) */
  isProfitable(): boolean {
    const totalCosts = this.fees.lastRebalanceCost * BigInt(this.fees.rebalanceCount);
    return this.fees.totalFeesCollected > totalCosts;
  }

  /** Summary for logging/UI. */
  getSummary(): {
    btcValueUsdc: string;
    evmValueUsdc: string;
    imbalanceRatio: number;
    feesCollected: string;
    rebalanceCount: number;
    profitable: boolean;
    state: RebalanceState;
  } {
    const btcValue = this.computeBtcSideValue();
    const evmValue = this.computeEvmSideValue();
    const total = btcValue + evmValue;
    const ratio = total > 0n ? Math.abs(Number(btcValue - evmValue) * 1000 / Number(total)) / 1000 : 0;

    return {
      btcValueUsdc: (Number(btcValue) / 1_000_000).toFixed(2),
      evmValueUsdc: (Number(evmValue) / 1_000_000).toFixed(2),
      imbalanceRatio: ratio,
      feesCollected: (Number(this.fees.totalFeesCollected) / 1_000_000).toFixed(4),
      rebalanceCount: this.fees.rebalanceCount,
      profitable: this.isProfitable(),
      state: this.state,
    };
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }
}
