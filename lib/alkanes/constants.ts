/**
 * Shared constants for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 * Previously duplicated across useSwapMutation, useWrapMutation,
 * useSwapUnwrapMutation, useAddLiquidityMutation, useRemoveLiquidityMutation.
 */

/** Factory router opcode for SwapExactTokensForTokens */
export const FACTORY_SWAP_OPCODE = 13;

/** frBTC wrap opcode (exchange BTC for frBTC) — contract [32:0] */
export const FRBTC_WRAP_OPCODE = 77;

/** frBTC unwrap opcode (exchange frBTC for BTC) — contract [32:0] */
export const FRBTC_UNWRAP_OPCODE = 78;

/**
 * Pool contract opcodes (NOT factory opcodes).
 * These are used when calling the pool contract directly.
 */
export const POOL_OPCODES = {
  Init: 0,
  AddLiquidity: 1,
  RemoveLiquidity: 2,
  Swap: 3,
  SimulateSwap: 4,
} as const;

/**
 * Signer addresses per network — derived from frBTC contract opcode 103 (GET_SIGNER).
 *
 * The CLI derives this dynamically via `get_subfrost_address()` in `subfrost.rs`,
 * which calls opcode 103 on [32:0], receives a 32-byte x-only pubkey,
 * and converts it to a P2TR address.
 *
 * If the frBTC contract is redeployed with a different signer key, update here.
 */
export const SIGNER_ADDRESSES: Record<string, string> = {
  mainnet: 'bc1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqcdrpr6',
  regtest: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'subfrost-regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  oylnet: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
};
