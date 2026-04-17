/**
 * Centralized regtest constants for all test tiers.
 *
 * Single source of truth — eliminates duplication across e2e-swap-flow.test.ts,
 * swap-btc-diesel-e2e.test.ts, e2e-alkanes-flows.test.ts, etc.
 */

// ---------------------------------------------------------------------------
// Environment-aware RPC target
//
// LOCAL_REGTEST=true  →  localhost:18888  (docker stack, deploy-regtest.sh)
// default             →  regtest.subfrost.io  (remote subfrost regtest)
//
// Set LOCAL_REGTEST=true in .env.local or your shell before running tests
// against the local docker stack.
// ---------------------------------------------------------------------------
const isLocal = process.env.LOCAL_REGTEST === 'true' || process.env.NEXT_PUBLIC_NETWORK === 'regtest-local';

const LOCAL_RPC  = 'http://localhost:18888';
const REMOTE_RPC = 'https://regtest.subfrost.io/v4/subfrost';

export const REGTEST = {
  RPC_URL:      isLocal ? LOCAL_RPC  : REMOTE_RPC,
  DATA_API_URL: isLocal ? LOCAL_RPC  : REMOTE_RPC,

  // ---------------------------------------------------------------------------
  // Contract IDs — local deploy-regtest.sh (LOCAL_REGTEST=true)
  // ---------------------------------------------------------------------------
  // Local slots come from alkanes-rs/scripts/deploy-regtest.sh defaults:
  //   AMM_FACTORY_PROXY_TX = 65522
  //   CARBINE_CONTROLLER_TX = 8260
  //   FRUSD_TOKEN_TX = 8210
  //   DXBTC_TX = 8270
  //   FROST Token = 0x1f13 = 7955
  //   vxFROST Gauge = 0x1f14 = 7956
  // ---------------------------------------------------------------------------
  FACTORY_ID:            isLocal ? '4:65522' : '4:65498',
  FRBTC_ID:              '32:0',
  DIESEL_ID:             '2:0',
  POOL_ID:               isLocal ? '' : '2:6', // discovered after deploy on local
  FRUSD_TOKEN_ID:        isLocal ? '4:8210'  : '',
  FRUSD_AUTH_TOKEN_ID:   isLocal ? '4:8200'  : '',
  CARBINE_CONTROLLER_ID: isLocal ? '4:8260'  : '',
  CARBINE_TEMPLATE_ID:   isLocal ? '4:8202'  : '',
  CARBINE_ORDER_TOKEN_ID:isLocal ? '4:8211'  : '',
  DXBTC_VAULT_ID:        isLocal ? '4:8270'  : '',
  FROST_TOKEN_ID:        isLocal ? '4:7955'  : '',
  VXFROST_GAUGE_ID:      isLocal ? '4:7956'  : '',
  // FIRE Protocol — Phase 13 of deploy-regtest.sh (proxy slots, 2026-04-15)
  FIRE_TOKEN_ID:         isLocal ? '4:256'   : '',
  FIRE_STAKING_ID:       isLocal ? '4:257'   : '',
  FIRE_TREASURY_ID:      isLocal ? '4:258'   : '',
  FIRE_BONDING_ID:       isLocal ? '4:259'   : '',
  FIRE_REDEMPTION_ID:    isLocal ? '4:260'   : '',
  FIRE_DISTRIBUTOR_ID:   isLocal ? '4:261'   : '',
  FIRE_POSITION_TOKEN_ID:isLocal ? '4:262'   : '',

  // frBTC signer address (derived from opcode 103 GET_SIGNER on the local deployment)
  // Re-derive after a fresh deploy: alkanes-cli simulate 32:0:103
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

  PROVIDER_NETWORK: isLocal ? ('regtest-local' as const) : ('subfrost-regtest' as const),
} as const;
