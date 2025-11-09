export const SANDSHREW_PROJECT_ID =
  process.env.SANDSHREW_PROJECT_ID ?? 'd6aebfed1769128379aca7d215f0b689';
export const OYL_PROJECT_ID =
  process.env.OYL_PROJECT_ID ?? 'd6aebfed1769128379aca7d215f0b689';

export const FACTORY_OPCODES = {
  InitFactory: '0',
  CreateNewPool: '1',
  FindExistingPoolId: '2',
  GetAllPools: '3',
  GetNumPools: '4',
  SetPoolFactoryId: '7',
  CollectFees: '10',
  AddLiquidity: '11',
  Burn: '12',
  SwapExactTokensForTokens: '13',
  SwapTokensForExactTokens: '14',
};

// Vault opcodes for UnitVault operations (yveDIESEL, yvfrBTC, etc.)
export const VAULT_OPCODES = {
  Initialize: '0',
  Purchase: '1',           // Deposit tokens, receive vault units
  Redeem: '2',             // Burn vault units, receive tokens back
  ClaimAndRestake: '3',    // Claim rewards and auto-compound
  GetVeDieselBalance: '4', // Query user's vault unit balance
  ReceiveRewards: '5',     // Claim accumulated rewards
  ClaimAndDistributeRewards: '6', // Strategist harvest operation
};


