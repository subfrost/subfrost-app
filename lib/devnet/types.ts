/**
 * Types for the in-browser devnet system.
 */

/**
 * Proxy info for an upgradeable contract.
 * proxyId is the user-facing slot, implId is the implementation slot.
 * authTokenId is the [2:N] token that authorizes upgrades.
 */
export interface UpgradeableInfo {
  proxyId: string;     // User-facing ID (upgradeable proxy)
  implId: string;      // Implementation slot
  authTokenId: string; // [2:N] auth token for upgrades
}

/**
 * Beacon info for a template contract with multiple instances.
 * Upgrade the beacon once → all instances get the new implementation.
 */
export interface BeaconInfo {
  implId: string;       // Implementation slot
  beaconId: string;     // Beacon slot (holds impl pointer)
  authTokenId: string;  // [2:N] auth token for beacon upgrades
  instances: Record<string, string>; // name → beacon proxy instance ID
}

export interface DeployedContracts {
  // AMM (already has proxy/beacon pattern)
  ammFactoryId: string;
  ammPoolId: string; // DIESEL/frBTC pool

  // FIRE Protocol — each wrapped in upgradeable proxy
  fireToken: UpgradeableInfo;
  fireStaking: UpgradeableInfo;
  fireTreasury: UpgradeableInfo;
  fireBonding: UpgradeableInfo;
  fireRedemption: UpgradeableInfo;
  fireDistributor: UpgradeableInfo;

  // Core Protocol — standalone proxies
  fuelToken: UpgradeableInfo;
  yvFrbtcVault: UpgradeableInfo;  // yvfrBTC vault (dependency of dxBTC)
  dxBtcVault: UpgradeableInfo;
  carbineController: UpgradeableInfo;
  universalRouter: UpgradeableInfo;
  frzec: UpgradeableInfo;
  freth: UpgradeableInfo;

  // Template contracts — beacon pattern (upgrade once → all instances)
  ftrBtcTemplate: BeaconInfo;      // ftrBTC instances
  vxGaugeTemplate: BeaconInfo;     // vxFUEL, vxBTCUSD instances
  synthPoolTemplate: BeaconInfo;   // 6 synth pool instances
  carbineTemplate: BeaconInfo;     // carbine instances

  // Synth pool instance IDs (convenience accessors)
  synthPools: {
    frbtcFrzec: string;  // A=100 (pegged)
    frbtcFreth: string;  // A=15  (volatile)
    frbtcFrusd: string;  // A=8   (volatile)
    frzecFrusd: string;  // A=8   (volatile)
    frzecFreth: string;  // A=30  (correlated)
    frethFrusd: string;  // A=8   (volatile)
  };

  // Legacy synth pool ID (for backwards compat)
  synthPoolId: string;

  // frUSD Bridge
  frusdTokenId: string;
  frusdAuthTokenId: string;

  // Fujin (already has proxy/beacon pattern)
  fujinFactoryId: string;
  fujinMasterId: string;

  // Legacy flat IDs — kept for backwards compatibility with existing code.
  // These point to the PROXY (user-facing) IDs.
  fireTokenId: string;
  fireStakingId: string;
  fireTreasuryId: string;
  fireBondingId: string;
  fireRedemptionId: string;
  fireDistributorId: string;
  fuelTokenId: string;
  ftrBtcTemplateId: string;
  dxBtcVaultId: string;
  vxFuelGaugeId: string;
  vxBtcUsdGaugeId: string;
  frzecId: string;
  frethId: string;
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
