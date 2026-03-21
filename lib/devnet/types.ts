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

  // Synth Pool
  synthPoolId: string;

  // frUSD Bridge
  frusdTokenId: string;
  frusdAuthTokenId: string;

  // Fujin
  fujinFactoryId: string;
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
  getChainHeight(): number;
  resetDevnet(): Promise<void>;
}
