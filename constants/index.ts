export const SANDSHREW_PROJECT_ID =
  process.env.SANDSHREW_PROJECT_ID ?? 'd6aebfed1769128379aca7d215f0b689';
export const OYL_PROJECT_ID =
  process.env.OYL_PROJECT_ID ?? 'd6aebfed1769128379aca7d215f0b689';

/**
 * FACTORY_OPCODES - AMM Factory Contract Operations
 *
 * Source: oyl-amm/alkanes/factory/src/lib.rs + alkanes-runtime-factory/src/lib.rs
 * Regtest factory proxy: [4:65498] (see utils/getConfig.ts)
 *
 * The factory has TWO categories of opcodes:
 *   1. Management: 0 (InitFactory), 2 (FindPoolId), 3 (GetAllPools), 4 (GetNumPools)
 *   2. Router: 1 (CreateNewPool), 11 (AddLiquidity), 12 (Burn), 13/14/29 (Swaps)
 *
 * Router opcodes call pools internally. The frontend can ALSO call pools directly:
 *   - Pool opcode 1: AddLiquidity (mint LP tokens)
 *   - Pool opcode 2: WithdrawAndBurn (burn LP tokens)
 *   - Pool opcode 3: Swap
 *   - Pool opcode 97: GetReserves
 *   - Pool opcode 99: GetName
 *   - Pool opcode 999: PoolDetails
 *
 * See CLAUDE.md for the full opcode reference table.
 */
export const FACTORY_OPCODES = {
  // Management opcodes
  InitFactory: '0',
  CreateNewPool: '1',
  FindExistingPoolId: '2',
  GetAllPools: '3',
  GetNumPools: '4',

  // Admin opcodes
  SetPoolFactoryId: '7',
  CollectFees: '10',
  SetTotalFeeForPool: '21',

  // Router opcodes (call pools internally)
  AddLiquidity: '11',
  Burn: '12',
  SwapExactTokensForTokens: '13',
  SwapTokensForExactTokens: '14',
  SwapExactTokensForTokensImplicit: '29',

  // Utility
  Forward: '50',
};

/**
 * POOL_OPCODES - AMM Pool Instance Operations
 *
 * Source: oyl-amm/alkanes/pool/src/lib.rs + alkanes-runtime-pool/src/lib.rs
 * Pool instances are beacon proxies at [2:N], created via factory CreateNewPool.
 *
 * Operations that need tokens (1, 2, 3) require the two-protostone pattern:
 *   p0: edict protostone transferring tokens to p1
 *   p1: cellpack protostone calling the pool
 */
export const POOL_OPCODES = {
  InitPool: '0',
  AddLiquidity: '1',       // Requires 2 alkane inputs (both tokens)
  WithdrawAndBurn: '2',    // Requires 1 alkane input (LP token)
  Swap: '3',               // Requires 1 alkane input (token being sold)
  CollectFees: '10',       // Factory-only
  GetTotalFee: '20',
  SetTotalFee: '21',       // Factory-only
  ForwardIncoming: '50',
  GetReserves: '97',
  GetPriceCumulativeLast: '98',
  GetName: '99',
  PoolDetails: '999',
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


