/**
 * Centralized regtest constants for all test tiers.
 *
 * Single source of truth — eliminates duplication across e2e-swap-flow.test.ts,
 * swap-btc-diesel-e2e.test.ts, e2e-alkanes-flows.test.ts, etc.
 */

export const REGTEST = {
  RPC_URL: 'https://regtest.subfrost.io/v4/subfrost',
  DATA_API_URL: 'https://regtest.subfrost.io/v4/subfrost',

  // Active deployment (2026-01-28)
  FACTORY_ID: '4:65498',
  FRBTC_ID: '32:0',
  DIESEL_ID: '2:0',
  POOL_ID: '2:6', // Current DIESEL/frBTC pool on regtest

  // frBTC signer address (derived from opcode 103 GET_SIGNER)
  FRBTC_SIGNER: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',

  FACTORY_OPCODES: {
    InitFactory: 0,
    CreateNewPool: 1,
    FindExistingPoolId: 2,
    GetAllPools: 3,
    GetNumPools: 4,
    SwapExactTokensForTokens: 13,
    SwapTokensForExactTokens: 14,
  },

  POOL_OPCODES: {
    AddLiquidity: 1,
    RemoveLiquidity: 2,
    GetReserves: 97,
    PoolDetails: 999,
  },

  FRBTC_OPCODES: {
    Wrap: 77,
    Unwrap: 78,
  },

  TEST_MNEMONIC:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',

  PROVIDER_NETWORK: 'subfrost-regtest' as const,
} as const;
