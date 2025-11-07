export type VaultType = 'yve-diesel' | 'gauge';

export type VaultStats = {
  tvl: string; // Total value locked
  apy: string; // Annual percentage yield
  userBalance: string; // User's deposited amount
  userShares: string; // User's vault shares (veDIESEL or gauge tokens)
  pendingRewards: string; // Claimable rewards
  boost?: string; // Boost multiplier (for gauges)
};

export type VaultAction = 'deposit' | 'withdraw' | 'stake' | 'unstake' | 'claim';

export type VaultInfo = {
  id: string;
  name: string;
  type: VaultType;
  description: string;
  inputToken: {
    id: string;
    symbol: string;
    name: string;
  };
  outputToken: {
    id: string;
    symbol: string;
    name: string;
  };
  rewardToken: {
    id: string;
    symbol: string;
    name: string;
  };
  contractId: {
    block: number;
    tx: number;
  };
};
