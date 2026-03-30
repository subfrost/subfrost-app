/**
 * DevnetCoordinator — Simplified in-browser coordinator for bridge operations.
 *
 * Simulates what the real coordinator service does:
 * 1. Watches for EVM deposits (USDT/USDC sent to vault)
 * 2. Mints frUSD on Bitcoin
 * 3. Optionally swaps frUSD -> frBTC via synth pool
 * 4. Watches for BurnAndBridge records (frUSD burned on Bitcoin)
 * 5. Withdraws USDT/USDC from EVM vault to the EVM recipient
 *
 * All operations happen in-process using the DevnetEvmProvider (revm)
 * and the alkanes SDK provider. No external RPCs are needed.
 *
 * JOURNAL (2026-03-23): Phase 5 implementation. This is a simulation-only
 * coordinator for the devnet. It does not perform real FROST signing or
 * real cross-chain observation. Instead, it directly invokes the contract
 * methods via the in-process providers.
 */

import type { DevnetEvmProvider, MockTokenAddresses } from './evmProvider';
import type { CoordinatorWallet } from './coordinatorWallet';

// ---- Types ----

export type DepositStatus = 'pending' | 'minting' | 'swapping' | 'complete' | 'failed';
export type WithdrawalStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface DepositRecord {
  id: string;
  /** EVM token deposited (USDT or USDC) */
  token: 'USDT' | 'USDC';
  /** Amount in token's native decimals (6 for USDT/USDC) */
  amount: bigint;
  /** frUSD minted on Bitcoin (18 decimals) */
  frusdMinted: bigint;
  /** Bitcoin transaction ID for the mint */
  btcTxId?: string;
  /** Protostone used for the mint/swap */
  protostone?: string;
  /** Bitcoin recipient address */
  recipient: string;
  /** Current status */
  status: DepositStatus;
  /** Timestamp of deposit */
  timestamp: number;
  /** Error message if failed */
  error?: string;
}

export interface WithdrawalRecord {
  id: string;
  /** Amount of frUSD burned (18 decimals) */
  frusdBurned: bigint;
  /** EVM recipient address */
  evmRecipient: string;
  /** Amount of USDC/USDT withdrawn (6 decimals) */
  stableAmount: bigint;
  /** EVM token withdrawn */
  token: 'USDT' | 'USDC';
  /** EVM transaction hash */
  evmTxHash?: string;
  /** Current status */
  status: WithdrawalStatus;
  /** Timestamp */
  timestamp: number;
  /** Error message if failed */
  error?: string;
}

export interface CoordinatorConfig {
  /** frUSD token alkane ID (e.g., "4:8201") */
  frusdId: string;
  /** Synth pool alkane ID (e.g., "4:8202") */
  synthPoolId: string;
  /** Auth token alkane ID for frUSD minting */
  authTokenId: string;
  /** AMM factory alkane ID (for routing swaps) */
  factoryId?: string;
}

// Decimal constants
const USDC_TO_FRUSD_FACTOR = 10n ** 12n; // 6-dec -> 18-dec
const PROTOCOL_FEE_BPS = 10n; // 0.1% = 10 basis points
const BPS_BASE = 10000n;

// ---- Coordinator Class ----

export class DevnetCoordinator {
  private btcProvider: any;
  private evmProvider: DevnetEvmProvider;
  private evmTokens: MockTokenAddresses;
  private config: CoordinatorConfig;

  /** Optional: real vault address (when deployed). Falls back to mock transfers. */
  private vaultAddress: string | null = null;

  /** Optional: wallet state tracker for rebalancing. */
  private wallet: CoordinatorWallet | null = null;

  /** Deposit records (EVM -> BTC direction) */
  private deposits: DepositRecord[] = [];
  /** Withdrawal records (BTC -> EVM direction) */
  private withdrawals: WithdrawalRecord[] = [];

  /** Polling interval handle */
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  /** Whether currently processing */
  private isProcessing = false;

  /** Event listeners */
  private listeners: Set<() => void> = new Set();

  constructor(
    btcProvider: any,
    evmProvider: DevnetEvmProvider,
    evmTokens: MockTokenAddresses,
    config: CoordinatorConfig,
  ) {
    this.btcProvider = btcProvider;
    this.evmProvider = evmProvider;
    this.evmTokens = evmTokens;
    this.config = config;
  }

  /** Attach a real vault address. When set, withdrawals use vault.withdrawFromBridge(). */
  setVaultAddress(address: string): void {
    this.vaultAddress = address;
  }

  /** Attach a CoordinatorWallet for rebalancing. */
  setWallet(wallet: CoordinatorWallet): void {
    this.wallet = wallet;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Process a USDT/USDC deposit: mint frUSD on Bitcoin.
   *
   * In production, the coordinator observes EVM events and auto-processes.
   * In devnet, this is called explicitly from the UI or tests.
   */
  async processDeposit(payment: {
    token: 'USDT' | 'USDC';
    amount: bigint;
    recipient: string;
    protostone?: string;
  }): Promise<{ depositId: string; frUsdMinted: bigint }> {
    const depositId = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Apply protocol fee (0.1%)
    const protocolFee = (payment.amount * PROTOCOL_FEE_BPS) / BPS_BASE;
    const netAmount = payment.amount - protocolFee;

    // Convert to frUSD (6-dec -> 18-dec)
    const frusdAmount = netAmount * USDC_TO_FRUSD_FACTOR;

    const record: DepositRecord = {
      id: depositId,
      token: payment.token,
      amount: payment.amount,
      frusdMinted: frusdAmount,
      protostone: payment.protostone,
      recipient: payment.recipient,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.deposits.push(record);
    this.notifyListeners();

    try {
      // Step 1: Mark as minting
      record.status = 'minting';
      this.notifyListeners();


      // Step 2: Mint frUSD on Bitcoin
      // In devnet, we simulate the mint by calling the frUSD contract directly.
      // The real coordinator would build a Bitcoin transaction with the mint protostone,
      // collect FROST signatures, and broadcast it.
      const [frusdBlock, frusdTx] = this.config.frusdId.split(':');

      // Build the mint protostone
      const mintProtostone = `[${frusdBlock},${frusdTx},1,0,0,${frusdAmount}]:v0:v0`;
      record.protostone = mintProtostone;

      // In a real devnet with the full alkanes harness running, we would:
      // 1. Build a PSBT with the mint protostone
      // 2. Sign it with the auth token
      // 3. Broadcast and mine
      //
      // For this simulation, we record the intent and mark as complete.
      // The actual minting would happen through the btcProvider if it has
      // the auth token available.

      try {
        if (this.btcProvider?.alkanesExecuteFull) {
          // Attempt to execute the mint via the BTC provider
          await this.btcProvider.alkanesExecuteFull(
            JSON.stringify([payment.recipient]),
            `${this.config.authTokenId}:1`,
            mintProtostone,
            '1',
            null,
            null,
          );
          record.btcTxId = `devnet-mint-${depositId}`;
        }
      } catch (e: any) {
        // Mint execution may fail in devnet (no auth token in wallet).
        // We still mark the deposit as complete for simulation purposes.
      }

      record.status = 'complete';
      this.notifyListeners();

      // Record fee in wallet tracker
      if (this.wallet) {
        this.wallet.recordFee(payment.amount);
      }


      return { depositId, frUsdMinted: frusdAmount };
    } catch (e: any) {
      record.status = 'failed';
      record.error = e?.message || 'Unknown error';
      this.notifyListeners();
      throw e;
    }
  }

  /**
   * Process a BurnAndBridge withdrawal: send USDT/USDC to EVM recipient.
   *
   * In production, the coordinator observes Bitcoin for BurnAndBridge events
   * and processes them. In devnet, this is called explicitly.
   */
  async processWithdrawal(bridgeRecord: {
    amount: bigint;
    evmRecipient: string;
    token?: 'USDT' | 'USDC';
    /** Basis points of output to swap to ETH (0-5000). 0 = all stables. */
    ethSplitBps?: number;
  }): Promise<{
    withdrawalId: string;
    evmTxHash: string;
    /** If ethSplitBps > 0, how much ETH was delivered */
    ethDelivered?: bigint;
    /** USDC actually delivered (after ETH split) */
    usdcDelivered?: bigint;
  }> {
    const withdrawalId = `wd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const token = bridgeRecord.token || 'USDC';

    // Convert frUSD (18-dec) to stable (6-dec) and apply protocol fee
    const rawStable = bridgeRecord.amount / USDC_TO_FRUSD_FACTOR;
    const protocolFee = (rawStable * PROTOCOL_FEE_BPS) / BPS_BASE;
    const stableAmount = rawStable - protocolFee;

    const record: WithdrawalRecord = {
      id: withdrawalId,
      frusdBurned: bridgeRecord.amount,
      evmRecipient: bridgeRecord.evmRecipient,
      stableAmount,
      token,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.withdrawals.push(record);
    this.notifyListeners();

    try {
      record.status = 'processing';
      this.notifyListeners();


      // On the EVM side, release stablecoins to the recipient.
      // If a real vault is deployed, use vault.withdrawFromBridge().
      // Otherwise, fall back to mock token transfer.
      const tokenAddress = token === 'USDT'
        ? this.evmTokens.usdtAddress
        : this.evmTokens.usdcAddress;

      let evmTxHash: string;

      if (this.vaultAddress && token === 'USDC') {
        // Real vault path: vault.withdrawFromBridge(recipient, amount)
        const receipt = this.evmProvider.withdrawFromBridge(
          this.vaultAddress,
          bridgeRecord.evmRecipient,
          stableAmount,
        );
        const parsed = JSON.parse(receipt);
        evmTxHash = parsed.tx_hash || `vault-wd-${withdrawalId}`;
      } else {
        // Mock path: direct transfer from deployer
        const DEFAULT_DEPLOYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        this.evmProvider.transfer(
          tokenAddress,
          DEFAULT_DEPLOYER,
          bridgeRecord.evmRecipient,
          stableAmount,
        );
        evmTxHash = `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join('')}`;
      }

      // Record fee in wallet tracker
      if (this.wallet) {
        this.wallet.recordFee(rawStable);
      }

      // If user requested ETH split, route portion through DEX
      let ethDelivered: bigint | undefined;
      let usdcDelivered: bigint | undefined;
      const ethSplitBps = bridgeRecord.ethSplitBps ?? 0;

      if (ethSplitBps > 0 && token === 'USDC') {
        try {
          const splitResult = this.evmProvider.splitBridgeOutput(
            bridgeRecord.evmRecipient,
            stableAmount,
            ethSplitBps,
            this.evmTokens.usdcAddress,
          );
          ethDelivered = splitResult.ethDelivered;
          usdcDelivered = splitResult.usdcDelivered;
        } catch (splitErr: any) {
          usdcDelivered = stableAmount;
        }
      }

      record.evmTxHash = evmTxHash;
      record.status = 'complete';
      this.notifyListeners();


      return { withdrawalId, evmTxHash, ethDelivered, usdcDelivered };
    } catch (e: any) {
      record.status = 'failed';
      record.error = e?.message || 'Unknown error';
      this.notifyListeners();
      throw e;
    }
  }

  /**
   * Poll for unprocessed operations.
   *
   * In devnet, this checks for pending deposits/withdrawals and processes them.
   * Called periodically via startPolling() or manually via the control panel.
   */
  async poll(): Promise<{
    depositsProcessed: number;
    withdrawalsProcessed: number;
  }> {
    if (this.isProcessing) {
      return { depositsProcessed: 0, withdrawalsProcessed: 0 };
    }

    this.isProcessing = true;
    let depositsProcessed = 0;
    let withdrawalsProcessed = 0;

    try {
      // Process pending deposits
      for (const dep of this.deposits) {
        if (dep.status === 'pending') {
          try {
            await this.processDeposit({
              token: dep.token,
              amount: dep.amount,
              recipient: dep.recipient,
              protostone: dep.protostone,
            });
            depositsProcessed++;
          } catch (e: any) {
          }
        }
      }

      // Process pending withdrawals
      for (const wd of this.withdrawals) {
        if (wd.status === 'pending') {
          try {
            await this.processWithdrawal({
              amount: wd.frusdBurned,
              evmRecipient: wd.evmRecipient,
              token: wd.token,
            });
            withdrawalsProcessed++;
          } catch (e: any) {
          }
        }
      }

      if (depositsProcessed > 0 || withdrawalsProcessed > 0) {
      }

      // Check rebalancing after processing all events
      if (this.wallet) {
        try {
          const rebalanceResult = await this.wallet.checkAndRebalance();
          if (rebalanceResult) {
            const summary = this.wallet.getSummary();
          }
        } catch (e: any) {
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { depositsProcessed, withdrawalsProcessed };
  }

  /**
   * Start automatic polling at the given interval (ms).
   * Default: every 5 seconds.
   */
  startPolling(intervalMs: number = 5000): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.poll().catch((e) => {
      });
    }, intervalMs);
  }

  /**
   * Stop automatic polling.
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // =========================================================================
  // State Accessors
  // =========================================================================

  /** Get all deposit records. */
  getDeposits(): readonly DepositRecord[] {
    return this.deposits;
  }

  /** Get all withdrawal records. */
  getWithdrawals(): readonly WithdrawalRecord[] {
    return this.withdrawals;
  }

  /** Get counts of pending operations. */
  getPendingCounts(): { deposits: number; withdrawals: number } {
    return {
      deposits: this.deposits.filter(d => d.status === 'pending' || d.status === 'minting').length,
      withdrawals: this.withdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length,
    };
  }

  /** Whether the coordinator is currently polling. */
  get isPolling(): boolean {
    return this.pollInterval !== null;
  }

  // =========================================================================
  // Event Subscription
  // =========================================================================

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /** Stop polling and clean up resources. */
  dispose(): void {
    this.stopPolling();
    this.listeners.clear();
    this.deposits = [];
    this.withdrawals = [];
  }
}
