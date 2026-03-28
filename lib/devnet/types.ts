/**
 * Types for the in-browser devnet system.
 */

export interface DeployedContracts {
  // AMM
  ammFactoryId: string;
  ammPoolId: string; // DIESEL/frBTC pool

  // FIRE Protocol
  fireTokenId: string;
  fireStakingId: string;
  fireTreasuryId: string;
  fireBondingId: string;
  fireRedemptionId: string;
  fireDistributorId: string;

  // Core Protocol
  fuelTokenId: string;
  ftrBtcTemplateId: string;
  dxBtcVaultId: string;
  vxFuelGaugeId: string;
  vxBtcUsdGaugeId: string;

  // frZEC (deployed, CGGMP21 wrapped Zcash)
  frzecId: string;
  // frBTC/frZEC synth pool (StableSwap)
  frbtcFrzecPoolId: string;
  // frETH (deployed, FROST wrapped ETH)
  frethId: string;
  // frBTC/frETH synth pool (StableSwap)
  frbtcFrethPoolId: string;

  // Synth Pool (frBTC/frUSD or frZEC/frUSD)
  synthPoolId: string;

  // frUSD Bridge
  frusdTokenId: string;
  frusdAuthTokenId: string;

  // Fujin
  fujinFactoryId: string;
  fujinMasterId: string;

  // Carbine CLOB
  carbineControllerId?: string;

  // EVM Bridge Contracts
  evmUsdtAddress?: string;
  evmUsdcAddress?: string;
}

export type DevnetStatus = 'idle' | 'booting' | 'ready' | 'error';

export interface DevnetState {
  status: DevnetStatus;
  bootProgress: string;
  bootPercent: number;
  error?: string;
  contracts: DeployedContracts | null;
  chainHeight: number;
}

export interface DevnetControls {
  mineBlocks(count: number): Promise<void>;
  faucetBtc(address: string, sats: number): Promise<void>;
  faucetDiesel(address: string): Promise<void>;
  faucetFuel(address: string): Promise<void>;
  faucetFrbtc(address: string): Promise<void>;
  faucetUsdt(address: string): Promise<void>;
  faucetUsdc(address: string): Promise<void>;
  getChainHeight(): number;
  resetDevnet(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Simulation types
// ---------------------------------------------------------------------------

export type SimActionType =
  | 'swap_diesel_to_frbtc'
  | 'swap_frbtc_to_diesel'
  | 'add_liquidity'
  | 'remove_liquidity'
  | 'vault_deposit'
  | 'vault_withdraw'
  | 'wrap_btc'
  | 'unwrap_frbtc'
  | 'wrap_zec'
  | 'unwrap_frzec'
  | 'swap_frbtc_to_frzec'
  | 'swap_frzec_to_frbtc'
  | 'fire_stake'
  | 'fire_unstake'
  | 'fire_claim'
  | 'gauge_stake'
  | 'gauge_unstake'
  | 'idle';

export interface SimAgent {
  id: number;
  name: string;
  /** Personality bias — shifts action weights (0 = trader, 1 = LP, 2 = staker, 3 = mixed) */
  personality: number;
  /** Running count of successful actions */
  actionCount: number;
  /** Last action taken */
  lastAction: SimActionType;
  /** Whether this agent "holds" LP tokens (logical tracker) */
  hasLp: boolean;
  /** Whether this agent has an active FIRE stake position */
  hasFireStake: boolean;
  /** Whether this agent has an active gauge stake */
  hasGaugeStake: boolean;
  /** Whether this agent has a vault deposit */
  hasVaultDeposit: boolean;
}

export interface SimLogEntry {
  round: number;
  agentId: number;
  agentName: string;
  action: SimActionType;
  detail: string;
  success: boolean;
  timestamp: number;
}

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'error';

export interface SimulationState {
  status: SimulationStatus;
  round: number;
  agentsPerRound: number;
  intervalMs: number;
  totalActions: number;
  totalErrors: number;
  agents: SimAgent[];
  log: SimLogEntry[];
  error?: string;
}

export interface SimulationControls {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setSpeed(intervalMs: number): void;
  setAgentsPerRound(n: number): void;
  getState(): SimulationState;
}
