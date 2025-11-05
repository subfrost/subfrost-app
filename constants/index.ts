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


