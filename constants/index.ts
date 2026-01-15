export const SANDSHREW_PROJECT_ID =
  process.env.SANDSHREW_PROJECT_ID ?? 'd5ccdb288adb17eeab785a15766cc897';
export const OYL_PROJECT_ID =
  process.env.OYL_PROJECT_ID ?? 'd5ccdb288adb17eeab785a15766cc897';

/**
 * FACTORY_OPCODES - AMM Factory Contract Operations
 *
 * ⚠️ CRITICAL: These are FACTORY opcodes, NOT pool opcodes!
 *
 * The deployed factory contract (e.g., 4:65522) only has opcodes 0-3:
 *   - 0: InitFactory (one-time initialization)
 *   - 1: CreateNewPool (create a new liquidity pool)
 *   - 2: FindExistingPoolId (query pool by token pair)
 *   - 3: GetAllPools (query all pools)
 *
 * The opcodes 4-12 below are LEGACY/INCORRECT mappings that were never
 * implemented in the factory. DO NOT use these for swap/liquidity operations!
 *
 * For actual swap/liquidity operations, call the POOL contract directly:
 *   - Pool opcode 0: Init
 *   - Pool opcode 1: AddLiquidity (mint LP tokens)
 *   - Pool opcode 2: RemoveLiquidity (burn LP tokens)
 *   - Pool opcode 3: Swap
 *   - Pool opcode 4: SimulateSwap
 *
 * See: useSwapMutation.ts, useRemoveLiquidityMutation.ts for correct patterns
 * See: alkanes-rs-dev/crates/alkanes-cli-common/src/alkanes/amm.rs for source
 */
export const FACTORY_OPCODES = {
  // Actual factory opcodes (0-3)
  InitFactory: '0',
  CreateNewPool: '1',
  FindExistingPoolId: '2',
  GetAllPools: '3', // This is what opcode 3 actually does!

  // LEGACY - These were never implemented in the factory contract
  // Kept for backwards compatibility but DO NOT USE for swap operations
  SwapExactTokensForTokens: '3', // ❌ WRONG - factory opcode 3 is GetAllPools!
  SwapTokensForExactTokens: '4', // ❌ WRONG - factory doesn't have opcode 4
  SetPoolFactoryId: '7',
  CollectFees: '10',
  AddLiquidity: '11',
  Burn: '12',
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


