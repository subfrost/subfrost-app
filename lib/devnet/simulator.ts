/**
 * DevnetSimulator — drives ~60 agents through random market actions on the
 * in-browser devnet. Each round, a subset of agents pick a weighted-random
 * action (swap, LP, vault, stake, wrap/unwrap) and execute it via the boot
 * wallet's provider. Blocks are mined between rounds so the app sees real
 * on-chain state changes.
 *
 * All transactions go through the single boot wallet (same signing key).
 * The "agents" are logical personas that track their own state and make
 * independent decisions — the diversity comes from action types, amounts,
 * and directions, not from separate private keys.
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

/** Random integer in [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random BigInt amount — returns a value between min and max (inclusive). */
function randAmount(min: bigint, max: bigint): bigint {
  if (max <= min) return min;
  const range = max - min;
  // Use float randomness (good enough for simulation)
  const r = BigInt(Math.floor(Math.random() * Number(range)));
  return min + r;
}

// ── RPC helper (reuse from boot.ts pattern) ──────────────────────────────

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

async function executeCall(
  provider: any,
  harness: any,
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
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 100));
}

// ── Core simulator class ─────────────────────────────────────────────────

const NUM_AGENTS = 60;
const MAX_LOG_ENTRIES = 200;
const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_AGENTS_PER_ROUND = 5;

export class DevnetSimulator implements SimulationControls {
  private state: SimulationState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private contracts: DeployedContracts;
  private listeners: Set<() => void> = new Set();

  constructor(contracts: DeployedContracts) {
    this.contracts = contracts;
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
        personality: i % 4, // 0=trader, 1=LP, 2=staker, 3=mixed
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

  /** Subscribe to state changes. Returns unsubscribe function. */
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
    this.state = { ...this.state, intervalMs: Math.max(500, intervalMs) };
    this.notify();
  }

  setAgentsPerRound(n: number) {
    this.state = { ...this.state, agentsPerRound: Math.max(1, Math.min(20, n)) };
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
    }

    // Mine a block to confirm the round's transactions
    try {
      harness.mineBlocks(1);
    } catch { /* ignore */ }

    // Update state
    const combinedLog = [...newLog, ...this.state.log].slice(0, MAX_LOG_ENTRIES);
    this.state = {
      ...this.state,
      round,
      log: combinedLog,
      agents: [...this.state.agents], // trigger re-render
    };
    this.notify();

    // Schedule next round
    this.scheduleRound();
  }

  // ── Action selection ──────────────────────────────────────────────────

  private pickAction(agent: SimAgent): SimActionType {
    const p = agent.personality;

    // Base weights — everyone can do these
    const actions: WeightedAction[] = [
      { action: 'swap_diesel_to_frbtc', weight: p === 0 ? 30 : 15 },
      { action: 'swap_frbtc_to_diesel', weight: p === 0 ? 30 : 15 },
      { action: 'wrap_btc',             weight: 10 },
      { action: 'unwrap_frbtc',         weight: 5 },
      { action: 'idle',                 weight: 10 },
    ];

    // LP actions
    if (!agent.hasLp) {
      actions.push({ action: 'add_liquidity', weight: p === 1 ? 25 : 10 });
    } else {
      actions.push({ action: 'remove_liquidity', weight: p === 1 ? 15 : 8 });
      // Keep some chance to add more
      actions.push({ action: 'add_liquidity', weight: 5 });
    }

    // Vault actions
    if (!agent.hasVaultDeposit) {
      actions.push({ action: 'vault_deposit', weight: p === 2 ? 20 : 8 });
    } else {
      actions.push({ action: 'vault_withdraw', weight: p === 2 ? 12 : 6 });
    }

    // FIRE staking (requires LP tokens logically)
    if (agent.hasLp && !agent.hasFireStake) {
      actions.push({ action: 'fire_stake', weight: p === 2 ? 20 : 8 });
    } else if (agent.hasFireStake) {
      actions.push({ action: 'fire_unstake', weight: 5 });
      actions.push({ action: 'fire_claim', weight: 10 });
    }

    // Gauge staking
    if (agent.hasLp && !agent.hasGaugeStake) {
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
    const poolId = this.contracts.ammPoolId;
    const [fBlock, fTx] = factoryId.split(':');

    switch (action) {
      case 'swap_diesel_to_frbtc': {
        // Random DIESEL amount: 1M - 50M units
        const amount = randAmount(1_000_000n, 50_000_000n);
        // Ensure we have DIESEL
        await this.ensureDiesel(provider, harness, segwit, taproot);
        // Factory opcode 13: SwapExactTokensForTokens
        // path = [DIESEL(2:0), frBTC(32:0)], amount_in, amount_out_min=1, deadline=999999
        const protostone = `[${fBlock},${fTx},13,2,2,0,32,0,${amount},1,999999]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot, protostone, `2:0:${amount}`);
        return `Swapped ${amount} DIESEL → frBTC`;
      }

      case 'swap_frbtc_to_diesel': {
        const amount = randAmount(100_000n, 5_000_000n);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        const protostone = `[${fBlock},${fTx},13,2,32,0,2,0,${amount},1,999999]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot, protostone, `32:0:${amount}`);
        return `Swapped ${amount} frBTC → DIESEL`;
      }

      case 'add_liquidity': {
        const dieselAmt = randAmount(5_000_000n, 100_000_000n);
        const frbtcAmt = randAmount(500_000n, 10_000_000n);
        await this.ensureDiesel(provider, harness, segwit, taproot);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        if (!poolId) throw new Error('No pool');
        const [pBlock, pTx] = poolId.split(':');
        // Pool opcode 1: AddLiquidity (direct pool call, 2 token inputs)
        const protostone = `[${pBlock},${pTx},1]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `2:0:${dieselAmt},32:0:${frbtcAmt}`);
        agent.hasLp = true;
        return `Added LP: ${dieselAmt} DIESEL + ${frbtcAmt} frBTC`;
      }

      case 'remove_liquidity': {
        if (!poolId) throw new Error('No pool');
        // Check LP balance
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) {
          agent.hasLp = false;
          return 'No LP tokens to remove (skip)';
        }
        const burnAmount = randAmount(1n, lpBal / 2n > 0n ? lpBal / 2n : 1n);
        const [pBlock, pTx] = poolId.split(':');
        // Pool opcode 2: WithdrawAndBurn (1 LP token input)
        const protostone = `[${pBlock},${pTx},2]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `${poolId}:${burnAmount}`);
        if (burnAmount >= lpBal) agent.hasLp = false;
        return `Removed LP: burned ${burnAmount} LP tokens`;
      }

      case 'vault_deposit': {
        const vaultId = this.contracts.dxBtcVaultId;
        if (!vaultId) throw new Error('No vault');
        const amount = randAmount(100_000n, 5_000_000n);
        await this.ensureFrbtc(provider, harness, segwit, taproot);
        const [vBlock, vTx] = vaultId.split(':');
        // Vault opcode 1: Purchase (deposit frBTC)
        const protostone = `[${vBlock},${vTx},1,${amount}]:v1:v1`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `32:0:${amount}`);
        agent.hasVaultDeposit = true;
        return `Vault deposit: ${amount} frBTC`;
      }

      case 'vault_withdraw': {
        const vaultId = this.contracts.dxBtcVaultId;
        if (!vaultId) throw new Error('No vault');
        // Check vault unit balance (vault tokens are at the vault's alkane ID)
        const unitBal = await getAlkaneBalance(taproot, vaultId);
        if (unitBal <= 0n) {
          agent.hasVaultDeposit = false;
          return 'No vault units to withdraw (skip)';
        }
        const units = randAmount(1n, unitBal / 2n > 0n ? unitBal / 2n : 1n);
        const [vBlock, vTx] = vaultId.split(':');
        // Vault opcode 2: Redeem
        const protostone = `[${vBlock},${vTx},2,${units},1]:v1:v1`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `${vaultId}:${units}`);
        if (units >= unitBal) agent.hasVaultDeposit = false;
        return `Vault withdraw: ${units} units`;
      }

      case 'wrap_btc': {
        // Wrap BTC → frBTC
        const signerAddr = await this.getFrbtcSigner();
        await executeCall(provider, harness, segwit, taproot,
          '[32,0,77]:v1:v1', 'B:100000:v0',
          [signerAddr, taproot]);
        return 'Wrapped 100k sats → frBTC';
      }

      case 'unwrap_frbtc': {
        const frbtcBal = await getAlkaneBalance(taproot, '32:0');
        if (frbtcBal <= 10_000n) return 'Insufficient frBTC to unwrap (skip)';
        const amount = randAmount(10_000n, frbtcBal / 4n > 10_000n ? frbtcBal / 4n : 10_000n);
        // frBTC opcode 77: unwrap sends BTC back
        await executeCall(provider, harness, segwit, taproot,
          '[32,0,77]:v0:v0', `32:0:${amount}`);
        return `Unwrapped ${amount} frBTC → BTC`;
      }

      case 'fire_stake': {
        if (!poolId) throw new Error('No pool');
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) {
          agent.hasLp = false;
          return 'No LP to stake in FIRE (skip)';
        }
        const stakeAmt = randAmount(1n, lpBal / 3n > 0n ? lpBal / 3n : 1n);
        const lockTier = randInt(0, 4); // random lock duration
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        // FIRE Staking opcode 1: Stake(lock_duration)
        const protostone = `[${sBlock},${sTx},1,${lockTier}]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `${poolId}:${stakeAmt}`);
        agent.hasFireStake = true;
        return `FIRE staked ${stakeAmt} LP (tier ${lockTier})`;
      }

      case 'fire_unstake': {
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        // FIRE Staking opcode 2: Unstake(position_id=0)
        // Use position 0 — simplification for simulation
        const protostone = `[${sBlock},${sTx},2,0]:v0:v0`;
        try {
          await executeCall(provider, harness, segwit, taproot, protostone, 'B:10000:v0');
          agent.hasFireStake = false;
          return 'FIRE unstaked position 0';
        } catch {
          return 'FIRE unstake failed (lock not expired?)';
        }
      }

      case 'fire_claim': {
        const stakingId = this.contracts.fireStakingId;
        const [sBlock, sTx] = stakingId.split(':');
        // FIRE Staking opcode 3: ClaimRewards(position_id=0)
        const protostone = `[${sBlock},${sTx},3,0]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot, protostone, 'B:10000:v0');
        return 'FIRE claimed rewards';
      }

      case 'gauge_stake': {
        if (!poolId) throw new Error('No pool');
        const lpBal = await getAlkaneBalance(taproot, poolId);
        if (lpBal <= 0n) return 'No LP for gauge (skip)';
        const stakeAmt = randAmount(1n, lpBal / 4n > 0n ? lpBal / 4n : 1n);
        const gaugeId = this.contracts.vxFuelGaugeId;
        const [gBlock, gTx] = gaugeId.split(':');
        // Gauge opcode 1: Stake
        const protostone = `[${gBlock},${gTx},1]:v0:v0`;
        await executeCall(provider, harness, segwit, taproot,
          protostone, `${poolId}:${stakeAmt}`);
        agent.hasGaugeStake = true;
        return `Gauge staked ${stakeAmt} LP`;
      }

      case 'gauge_unstake': {
        const gaugeId = this.contracts.vxFuelGaugeId;
        const [gBlock, gTx] = gaugeId.split(':');
        // Gauge opcode 2: Unstake
        const protostone = `[${gBlock},${gTx},2,0]:v0:v0`;
        try {
          await executeCall(provider, harness, segwit, taproot, protostone, 'B:10000:v0');
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

  /** Ensure boot wallet has some DIESEL. Mints if balance is low. */
  private async ensureDiesel(
    provider: any, harness: any, segwit: string, taproot: string,
  ): Promise<void> {
    const bal = await getAlkaneBalance(taproot, '2:0');
    if (bal < 100_000_000n) {
      // Mint DIESEL via opcode 77
      await executeCall(provider, harness, segwit, taproot,
        '[2,0,77]:v0:v0', 'B:10000:v0');
    }
  }

  /** Ensure boot wallet has some frBTC. Wraps if balance is low. */
  private async ensureFrbtc(
    provider: any, harness: any, segwit: string, taproot: string,
  ): Promise<void> {
    const bal = await getAlkaneBalance(taproot, '32:0');
    if (bal < 10_000_000n) {
      const signerAddr = await this.getFrbtcSigner();
      await executeCall(provider, harness, segwit, taproot,
        '[32,0,77]:v1:v1', 'B:500000:v0',
        [signerAddr, taproot]);
    }
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
    // Fallback to boot taproot (won't actually mint but won't crash)
    return getBootAddresses().taproot;
  }
}
