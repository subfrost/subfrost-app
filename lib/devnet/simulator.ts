/**
 * DevnetSimulator — drives ~60 agents through random market actions on the
 * in-browser devnet. Each round, a subset of agents pick a weighted-random
 * action (swap, LP, vault, stake, wrap/unwrap) and execute it via the boot
 * wallet's provider. A single block is mined at the end of each round so the
 * app sees real on-chain state changes.
 *
 * All transactions go through the single boot wallet (same signing key).
 * The "agents" are logical personas that track their own state and make
 * independent decisions — the diversity comes from action types, amounts,
 * and directions, not from separate private keys.
 *
 * JOURNAL (2026-03-24): Performance fix — mine once per round (not per tx),
 * cache balance checks, yield 300ms between agents to keep UI responsive.
 * The original version mined after every executeCall including token top-ups,
 * causing 10-15 WASM indexer runs per round and choking the main thread.
 */

import type {
  SimAgent,
  SimActionType,
  SimLogEntry,
  SimulationState,
  SimulationStatus,
  SimulationControls,
  DeployedContracts,
} from './types';
import { getBootAddresses, getProvider, getHarness } from './boot';

// ── Agent name generator ─────────────────────────────────────────────────

const PREFIXES = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho',
  'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
];
const SUFFIXES = [
  'whale', 'degen', 'farmer', 'hodler', 'flipper', 'ape', 'bot',
  'shark', 'crab', 'shrimp', 'bull', 'bear',
];

function agentName(id: number): string {
  const p = PREFIXES[id % PREFIXES.length];
  const s = SUFFIXES[Math.floor(id / PREFIXES.length) % SUFFIXES.length];
  return `${p}-${s}-${id}`;
}

// ── Weighted random selection ────────────────────────────────────────────

interface WeightedAction {
  action: SimActionType;
  weight: number;
}

function weightedPick(actions: WeightedAction[]): SimActionType {
  const total = actions.reduce((s, a) => s + a.weight, 0);
  if (total <= 0) return 'idle';
  let r = Math.random() * total;
  for (const a of actions) {
    r -= a.weight;
    if (r <= 0) return a.action;
  }
  return actions[actions.length - 1].action;
}

// ── Random amount helpers ────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randAmount(min: bigint, max: bigint): bigint {
  if (max <= min) return min;
  const range = max - min;
  const r = BigInt(Math.floor(Math.random() * Number(range)));
  return min + r;
}

// ── RPC helper ───────────────────────────────────────────────────────────

let _rpcId = 100000;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch('http://localhost:18888', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: _rpcId++ }),
  });
  return response.json();
}

async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0,
  }]);
}

async function getAlkaneBalance(address: string, alkaneId: string): Promise<bigint> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);
  if (!result?.result?.outpoints) return 0n;
  let total = 0n;
  for (const outpoint of result.result.outpoints) {
    const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      const tx = parseInt(entry.tx ?? '0', 10);
      if (block === targetBlock && tx === targetTx) {
        total += BigInt(entry.amount || '0');
      }
    }
  }
  return total;
}

// ── Action executors ─────────────────────────────────────────────────────

/**
 * Execute a transaction WITHOUT mining. Mining is deferred to the end of the
 * round to avoid running the WASM indexer after every single tx.
 */
async function executeTx(
  provider: any,
  segwit: string,
  taproot: string,
  protostone: string,
  inputRequirements: string,
  toAddresses?: string[],
): Promise<void> {
  await provider.alkanesExecuteFull(
    JSON.stringify(toAddresses || [taproot]),
    inputRequirements,
    protostone,
    '1',
    null,
    JSON.stringify({
      from_addresses: [segwit, taproot],
      change_address: segwit,
      alkanes_change_address: taproot,
      mine_enabled: true,
    }),
  );
  // No mineBlocks here — caller batches mining at end of round
}

/** Yield to the browser event loop so React can paint / GC can run. */
function breathe(ms = 300): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Core simulator class ─────────────────────────────────────────────────

const NUM_AGENTS = 60;
const MAX_LOG_ENTRIES = 200;
const DEFAULT_INTERVAL_MS = 4000;
const DEFAULT_AGENTS_PER_ROUND = 3;

export class DevnetSimulator implements SimulationControls {
  private state: SimulationState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private contracts: DeployedContracts;
  private listeners: Set<() => void> = new Set();
  /** Cached balance — refreshed once per round, not per agent. */
  private _cachedDieselBal: bigint = 0n;
  private _cachedFrbtcBal: bigint = 0n;
  private _balanceCacheRound = -1;
  /** Pending tx count this round (for batch mining). */
  private _pendingTxs = 0;
  /** Discovered pool ID (may be empty from boot, resolved lazily). */
  private _poolId: string;
  private _poolDiscoveryAttempted = false;

  constructor(contracts: DeployedContracts) {
    this.contracts = contracts;
    this._poolId = contracts.ammPoolId || '';
    this.state = {
      status: 'idle',
      round: 0,
      agentsPerRound: DEFAULT_AGENTS_PER_ROUND,
      intervalMs: DEFAULT_INTERVAL_MS,
      totalActions: 0,
      totalErrors: 0,
      agents: Array.from({ length: NUM_AGENTS }, (_, i) => ({
        id: i,
        name: agentName(i),
        personality: i % 4,
        actionCount: 0,
        lastAction: 'idle' as SimActionType,
        hasLp: false,
        hasFireStake: false,
        hasGaugeStake: false,
        hasVaultDeposit: false,
      })),
      log: [],
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  getState(): SimulationState {
    return this.state;
  }

  start() {
    if (this.state.status === 'running') return;
    this.state = { ...this.state, status: 'running', error: undefined };
    this.notify();
    this.scheduleRound();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = { ...this.state, status: 'idle' };
    this.notify();
  }

  pause() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = { ...this.state, status: 'paused' };
    this.notify();
  }

  resume() {
    if (this.state.status !== 'paused') return;
    this.state = { ...this.state, status: 'running' };
    this.notify();
    this.scheduleRound();
  }

  setSpeed(intervalMs: number) {
    this.state = { ...this.state, intervalMs: Math.max(1000, intervalMs) };
    this.notify();
  }

  setAgentsPerRound(n: number) {
    this.state = { ...this.state, agentsPerRound: Math.max(1, Math.min(10, n)) };
    this.notify();
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  // ── Round scheduling ──────────────────────────────────────────────────

  private scheduleRound() {
    if (this.state.status !== 'running') return;
    this.timer = setTimeout(() => this.runRound(), this.state.intervalMs);
  }

  private async runRound() {
    if (this.state.status !== 'running') return;

    const provider = getProvider();
    const harness = getHarness();
    if (!provider || !harness) {
      this.state = { ...this.state, status: 'error', error: 'Devnet not ready' };
      this.notify();
      return;
    }

    const boot = getBootAddresses();
    const round = this.state.round + 1;
    this._pendingTxs = 0;

    // Discover pool if not yet known
    await this.discoverPool();

    // Refresh balance cache ONCE per round
    await this.refreshBalanceCache(boot.taproot, round);
    await breathe(100);

    // Pick N random agents for this round
    const shuffled = [...this.state.agents].sort(() => Math.random() - 0.5);
    const active = shuffled.slice(0, this.state.agentsPerRound);

    const newLog: SimLogEntry[] = [];

    for (const agent of active) {
      if (this.state.status !== 'running') break;

      const action = this.pickAction(agent);
      let detail = '';
      let success = false;

      try {
        detail = await this.executeAction(
          action, agent, provider, harness, boot.segwit, boot.taproot,
        );
        success = true;
        agent.actionCount++;
        agent.lastAction = action;
        this.state.totalActions++;
      } catch (e: any) {
        detail = e?.message?.slice(0, 80) || 'Unknown error';
        success = false;
        this.state.totalErrors++;
      }

      newLog.push({
        round,
        agentId: agent.id,
        agentName: agent.name,
        action,
        detail,
        success,
        timestamp: Date.now(),
      });

      // Yield between agents so the browser stays responsive
      await breathe(300);
    }

    // Mine ONE block to confirm all this round's transactions
    if (this._pendingTxs > 0) {
      try {
        harness.mineBlocks(1);
        await breathe(200); // let indexer + GC settle
      } catch { /* ignore */ }
    }

    // Update state
    const combinedLog = [...newLog, ...this.state.log].slice(0, MAX_LOG_ENTRIES);
    this.state = {
      ...this.state,
      round,
      log: combinedLog,
      agents: [...this.state.agents],
    };
    this.notify();

    // Schedule next round
    this.scheduleRound();
  }

  // ── Pool discovery ─────────────────────────────────────────────────────

  /**
   * If poolId is empty (boot failed to discover it), try to find it via
   * factory opcode 2 (FindExistingPoolId). Only attempts once.
   */
  private async discoverPool(): Promise<void> {
    if (this._poolId || this._poolDiscoveryAttempted) return;
    this._poolDiscoveryAttempted = true;
    try {
      const factoryId = this.contracts.ammFactoryId;
      const result = await simulate(factoryId, ['2', '2', '0', '32', '0']);
      const poolData = result?.result?.execution?.data?.replace('0x', '') || '';
      if (poolData.length >= 64) {
        const buf = Buffer.from(poolData, 'hex');
        this._poolId = `${Number(buf.readBigUInt64LE(0))}:${Number(buf.readBigUInt64LE(16))}`;
        console.log('[simulator] Discovered pool:', this._poolId);
      } else {
        console.warn('[simulator] No pool found via factory opcode 2');
      }
    } catch (e: any) {
      console.warn('[simulator] Pool discovery failed:', e?.message?.slice(0, 60));
    }
  }

  // ── Balance cache ─────────────────────────────────────────────────────

  private async refreshBalanceCache(taproot: string, round: number) {
    if (this._balanceCacheRound === round) return;
    try {
      this._cachedDieselBal = await getAlkaneBalance(taproot, '2:0');
      this._cachedFrbtcBal = await getAlkaneBalance(taproot, '32:0');
    } catch {
      // stale cache is fine
    }
    this._balanceCacheRound = round;
  }

  // ── Action selection ──────────────────────────────────────────────────

  private pickAction(agent: SimAgent): SimActionType {
    const p = agent.personality;
    const hasPool = !!this._poolId;

    const actions: WeightedAction[] = [
      { action: 'swap_diesel_to_frbtc', weight: hasPool ? (p === 0 ? 30 : 15) : 0 },
      { action: 'swap_frbtc_to_diesel', weight: hasPool ? (p === 0 ? 30 : 15) : 0 },
      { action: 'wrap_btc',             weight: 15 },
      { action: 'unwrap_frbtc',         weight: 8 },
      { action: 'vault_deposit',        weight: p === 2 ? 20 : 10 },
      { action: 'idle',                 weight: 10 },
    ];

    // LP actions only if pool exists
    if (hasPool) {
      if (!agent.hasLp) {
        actions.push({ action: 'add_liquidity', weight: p === 1 ? 25 : 10 });
      } else {
        actions.push({ action: 'remove_liquidity', weight: p === 1 ? 15 : 8 });
        actions.push({ action: 'add_liquidity', weight: 5 });
      }
    }

    if (agent.hasVaultDeposit) {
      actions.push({ action: 'vault_withdraw', weight: p === 2 ? 12 : 6 });
    }

    if (hasPool && agent.hasLp && !agent.hasFireStake) {
      actions.push({ action: 'fire_stake', weight: p === 2 ? 20 : 8 });
    } else if (agent.hasFireStake) {
      actions.push({ action: 'fire_unstake', weight: 5 });
      actions.push({ action: 'fire_claim', weight: 10 });
    }

    if (hasPool && agent.hasLp && !agent.hasGaugeStake) {
      actions.push({ action: 'gauge_stake', weight: p === 2 ? 15 : 5 });
    } else if (agent.hasGaugeStake) {
      actions.push({ action: 'gauge_unstake', weight: 5 });
    }

    return weightedPick(actions);
  }

  // ── Action execution ──────────────────────────────────────────────────

  private async executeAction(
    action: SimActionType,
    agent: SimAgent,
    provider: any,
    harness: any,
    segwit: string,
    taproot: string,
  ): Promise<string> {
    const factoryId = this.contracts.ammFactoryId;
    const poolId = this._poolId;
    const [fBlock, fTx] = factoryId.split(':');

    switch (action) {
      case 'swap_diesel_to_frbtc': {
        const amount = randAmount(1_000_000n, 50_000_000n);
        await this.ensureDiesel(provider, harness, segwit, taproot);
        const protostone = `[${fBlock},${fTx},13,2,2,0,32,0,${amount},1,999999]:v0:v0`;
        await executeTx(provider, segwit, taproot, protostone, `2:0:${amount}`);
        this._pendingTxs++;
        return `Swapped ${amount} DIESEL → frBTC`;
      }

      case 'swap_frbtc_to_diesel': {
        const amount = randAmount(100_000n, 5_000_000n);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        const protostone = `[${fBlock},${fTx},13,2,32,0,2,0,${amount},1,999999]:v0:v0`;
        await executeTx(provider, segwit, taproot, protostone, `32:0:${amount}`);
        this._pendingTxs++;
        return `Swapped ${amount} frBTC → DIESEL`;
      }

      case 'add_liquidity': {
        if (!poolId) return 'No pool available (skip)';
        const dieselAmt = randAmount(5_000_000n, 100_000_000n);
        const frbtcAmt = randAmount(500_000n, 10_000_000n);
        await this.ensureDiesel(provider, harness, segwit, taproot);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        const [pBlock, pTx] = poolId.split(':');
        const protostone = `[${pBlock},${pTx},1]:v0:v0`;
        await executeTx(provider, segwit, taproot,
          protostone, `2:0:${dieselAmt},32:0:${frbtcAmt}`);
        this._pendingTxs++;
        agent.hasLp = true;
        return `Added LP: ${dieselAmt} DIESEL + ${frbtcAmt} frBTC`;
      }

      case 'remove_liquidity': {
        if (!poolId) return 'No pool available (skip)';
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) {
          agent.hasLp = false;
          return 'No LP tokens to remove (skip)';
        }
        const burnAmount = randAmount(1n, lpBal / 2n > 0n ? lpBal / 2n : 1n);
        const [pBlock, pTx] = poolId.split(':');
        const protostone = `[${pBlock},${pTx},2]:v0:v0`;
        await executeTx(provider, segwit, taproot,
          protostone, `${poolId}:${burnAmount}`);
        this._pendingTxs++;
        if (burnAmount >= lpBal) agent.hasLp = false;
        return `Removed LP: burned ${burnAmount} LP tokens`;
      }

      case 'vault_deposit': {
        const vaultId = this.contracts.dxBtcVaultId;
        if (!vaultId) return 'No vault deployed (skip)';
        const amount = randAmount(100_000n, 2_000_000n);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        const [vBlock, vTx] = vaultId.split(':');
        // Vault opcode 1: Purchase — send frBTC as input
        const protostone = `[${vBlock},${vTx},1,${amount}]:v1:v1`;
        await executeTx(provider, segwit, taproot,
          protostone, `32:0:${amount}`);
        this._pendingTxs++;
        agent.hasVaultDeposit = true;
        return `Vault deposit: ${amount} frBTC`;
      }

      case 'vault_withdraw': {
        const vaultId = this.contracts.dxBtcVaultId;
        if (!vaultId) return 'No vault deployed (skip)';
        const unitBal = await getAlkaneBalance(taproot, vaultId);
        if (unitBal <= 0n) {
          agent.hasVaultDeposit = false;
          return 'No vault units to withdraw (skip)';
        }
        const units = randAmount(1n, unitBal / 2n > 0n ? unitBal / 2n : 1n);
        const [vBlock, vTx] = vaultId.split(':');
        // Vault opcode 2: Redeem — send vault units as input
        const protostone = `[${vBlock},${vTx},2,${units},1]:v1:v1`;
        await executeTx(provider, segwit, taproot,
          protostone, `${vaultId}:${units}`);
        this._pendingTxs++;
        if (units >= unitBal) agent.hasVaultDeposit = false;
        return `Vault withdraw: ${units} units`;
      }

      case 'wrap_btc': {
        const signerAddr = await this.getFrbtcSigner();
        await executeTx(provider, segwit, taproot,
          '[32,0,77]:v1:v1', 'B:100000:v0',
          [signerAddr, taproot]);
        this._pendingTxs++;
        return 'Wrapped 100k sats → frBTC';
      }

      case 'unwrap_frbtc': {
        if (this._cachedFrbtcBal <= 10_000n) return 'Insufficient frBTC to unwrap (skip)';
        const amount = randAmount(10_000n,
          this._cachedFrbtcBal / 4n > 10_000n ? this._cachedFrbtcBal / 4n : 10_000n);
        // frBTC opcode 78 = unwrap (NOT 77 which is wrap)
        await executeTx(provider, segwit, taproot,
          '[32,0,78]:v1:v1', `32:0:${amount}`);
        this._pendingTxs++;
        this._cachedFrbtcBal -= amount;
        return `Unwrapped ${amount} frBTC → BTC`;
      }

      case 'fire_stake': {
        if (!poolId) return 'No pool available (skip)';
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) {
          agent.hasLp = false;
          return 'No LP to stake in FIRE (skip)';
        }
        const stakeAmt = randAmount(1n, lpBal / 3n > 0n ? lpBal / 3n : 1n);
        const lockTier = randInt(0, 4);
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        const protostone = `[${sBlock},${sTx},1,${lockTier}]:v0:v0`;
        await executeTx(provider, segwit, taproot,
          protostone, `${poolId}:${stakeAmt}`);
        this._pendingTxs++;
        agent.hasFireStake = true;
        return `FIRE staked ${stakeAmt} LP (tier ${lockTier})`;
      }

      case 'fire_unstake': {
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        const protostone = `[${sBlock},${sTx},2,0]:v0:v0`;
        try {
          await executeTx(provider, segwit, taproot, protostone, 'B:10000:v0');
          this._pendingTxs++;
          agent.hasFireStake = false;
          return 'FIRE unstaked position 0';
        } catch {
          return 'FIRE unstake failed (lock not expired?)';
        }
      }

      case 'fire_claim': {
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        const protostone = `[${sBlock},${sTx},3,0]:v0:v0`;
        await executeTx(provider, segwit, taproot, protostone, 'B:10000:v0');
        this._pendingTxs++;
        return 'FIRE claimed rewards';
      }

      case 'gauge_stake': {
        if (!poolId) return 'No pool available (skip)';
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) return 'No LP for gauge (skip)';
        const stakeAmt = randAmount(1n, lpBal / 4n > 0n ? lpBal / 4n : 1n);
        const gaugeId = this.contracts.vxFuelGaugeId;
        const [gBlock, gTx] = gaugeId.split(':');
        const protostone = `[${gBlock},${gTx},1]:v0:v0`;
        await executeTx(provider, segwit, taproot,
          protostone, `${poolId}:${stakeAmt}`);
        this._pendingTxs++;
        agent.hasGaugeStake = true;
        return `Gauge staked ${stakeAmt} LP`;
      }

      case 'gauge_unstake': {
        const gaugeId = this.contracts.vxFuelGaugeId;
        const [gBlock, gTx] = gaugeId.split(':');
        const protostone = `[${gBlock},${gTx},2,0]:v0:v0`;
        try {
          await executeTx(provider, segwit, taproot, protostone, 'B:10000:v0');
          this._pendingTxs++;
          agent.hasGaugeStake = false;
          return 'Gauge unstaked';
        } catch {
          return 'Gauge unstake failed';
        }
      }

      case 'idle':
      default:
        return 'Idle';
    }
  }

  // ── Token top-up helpers ──────────────────────────────────────────────

  /**
   * Ensure boot wallet has DIESEL. Uses cached balance to avoid redundant
   * RPC calls. Mints into the mempool (no mining — batched at round end).
   */
  private async ensureDiesel(
    provider: any, harness: any, segwit: string, taproot: string,
  ): Promise<void> {
    if (this._cachedDieselBal >= 100_000_000n) return;
    // Need to mine so the mint confirms and the balance is spendable
    await executeTx(provider, segwit, taproot, '[2,0,77]:v0:v0', 'B:10000:v0');
    harness.mineBlocks(1);
    await breathe(100);
    this._cachedDieselBal = 500_000_000n; // approximate — avoids re-check
  }

  private async ensureFrbtc(
    provider: any, harness: any, segwit: string, taproot: string,
  ): Promise<void> {
    if (this._cachedFrbtcBal >= 10_000_000n) return;
    const signerAddr = await this.getFrbtcSigner();
    await executeTx(provider, segwit, taproot,
      '[32,0,77]:v1:v1', 'B:500000:v0',
      [signerAddr, taproot]);
    harness.mineBlocks(1);
    await breathe(100);
    this._cachedFrbtcBal = 50_000_000n; // approximate
  }

  private _frbtcSigner: string | null = null;

  private async getFrbtcSigner(): Promise<string> {
    if (this._frbtcSigner) return this._frbtcSigner;
    try {
      const result = await simulate('32:0', ['103']);
      const hex = result?.result?.execution?.data?.replace('0x', '') || '';
      if (hex.length === 64) {
        const bitcoin = await import('bitcoinjs-lib');
        const ecc = await import('@bitcoinerlab/secp256k1');
        bitcoin.initEccLib(ecc);
        const xOnly = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({
          internalPubkey: xOnly,
          network: bitcoin.networks.regtest,
        });
        if (payment.address) {
          this._frbtcSigner = payment.address;
          return payment.address;
        }
      }
    } catch { /* fallback */ }
    return getBootAddresses().taproot;
  }
}
