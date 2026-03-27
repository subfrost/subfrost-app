/**
 * Constants for BRC20-Prog devnet testing.
 *
 * Paths to WASM artifacts, contract opcodes, and configuration
 * for the BRC20-Prog protocol tests.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const home = process.env.HOME || '/home/ubuntu';

export const BRC20_PROG = {
  // fr-brc20-vault alkane opcodes
  VAULT_OPCODES: {
    Initialize: 0,
    Lock: 1,
    Unlock: 2,
    GetNextUnlock: 10,
    GetUnlockAmount: 11,
    Withdraw: 20,
    GetTotalLocked: 100,
    GetQueueLength: 101,
  },

  // frBTC contract opcodes (alkanes-level)
  FRBTC_OPCODES: {
    Wrap: 77,
    Unwrap: 78,
  },

  // Standard contract IDs (assigned during deployment)
  FRBTC_ID: '32:0',
  DIESEL_ID: '2:0',

  // Deployment slots for BRC20-Prog contracts
  VAULT_SLOT: 8000,

  // Test mnemonic (same as devnet)
  TEST_MNEMONIC:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',

  PROVIDER_NETWORK: 'subfrost-regtest' as const,
  RPC_URL: 'http://localhost:18888',
} as const;

/**
 * Load a WASM file from multiple candidate paths.
 * Returns null if not found.
 */
function loadWasm(name: string, paths: string[]): Uint8Array | null {
  for (const p of paths) {
    if (existsSync(p)) {
      console.log(`[brc20-prog] Loaded ${name} from ${p}`);
      return new Uint8Array(readFileSync(p));
    }
  }
  console.warn(`[brc20-prog] ${name} WASM not found`);
  return null;
}

/** Load brc20shrew (BRC20-Prog indexer) WASM. */
export function loadBrc20ShrewWasm(): Uint8Array | null {
  return loadWasm('brc20shrew', [
    resolve(home, 'brc20shrew-rs/target/wasm32-unknown-unknown/release/shrew_brc20_prog.wasm'),
    resolve(__dirname, '../devnet/fixtures/shrew_brc20_prog.wasm'),
  ]);
}

/** Load fr-brc20-vault alkane contract WASM. */
export function loadVaultWasm(): Uint8Array | null {
  return loadWasm('fr-brc20-vault', [
    resolve(home, 'subfrost-brc20/alkanes/fr-brc20-vault/target/wasm32-unknown-unknown/release/fr_brc20_vault.wasm'),
    resolve(__dirname, '../devnet/fixtures/protocol/fr_brc20_vault.wasm'),
  ]);
}

/** Load FrBTC.sol Foundry build artifact (JSON). */
export function loadFrBtcFoundryJson(): any | null {
  const paths = [
    resolve(home, 'subfrost-brc20/out/FrBTC.sol/FrBTC.json'),
    resolve(__dirname, '../devnet/fixtures/protocol/FrBTC.json'),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      console.log(`[brc20-prog] Loaded FrBTC.json from ${p}`);
      return JSON.parse(readFileSync(p, 'utf-8'));
    }
  }
  console.warn('[brc20-prog] FrBTC.json not found');
  return null;
}

/** Load BiS_Swap Foundry build artifact (JSON). */
export function loadBisSwapFoundryJson(): any | null {
  const paths = [
    resolve(home, 'subfrost-brc20/bis-build/out/BiS_Swap.sol/BiS_Swap.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      console.log(`[brc20-prog] Loaded BiS_Swap.json from ${p}`);
      return JSON.parse(readFileSync(p, 'utf-8'));
    }
  }
  console.warn('[brc20-prog] BiS_Swap.json not found — run: cd ~/subfrost-brc20/bis-build && forge build');
  return null;
}

/** Load UniswapV2Factory Foundry build artifact (JSON). */
export function loadUniswapV2FactoryJson(): any | null {
  const p = resolve(home, 'subfrost-brc20/bis-build/out/UniswapV2Factory.sol/UniswapV2Factory.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  return null;
}

/** Load UniswapV2Pair Foundry build artifact (JSON). */
export function loadUniswapV2PairJson(): any | null {
  const p = resolve(home, 'subfrost-brc20/bis-build/out/UniswapV2Pair.sol/UniswapV2Pair.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  return null;
}

/** Load UniswapV2Router01 Foundry build artifact (JSON). */
export function loadUniswapV2Router01Json(): any | null {
  const p = resolve(home, 'subfrost-brc20/bis-build/out/UniswapV2Router01.sol/UniswapV2Router01.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  return null;
}

/** BiS DEX production contract addresses (mainnet brc20.build) */
export const BIS_DEX_MAINNET = {
  SEQUENCED_SWAP_PROXY: '0x62879BB3dD949c4CF06f71BF7c281DcF24D163e7',
  BIS_SWAP_IMPL: '0x3aAB41b28533816817CD8A3F520c39864C0D7ba2',
  BATCH_EXECUTOR: '0x59bbbE8F190620aE3b3AD57b9F8868f04B0E5984',
  FRBTC_UPGRADEABLE: '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337',
  // Known LP pair addresses from explorer
  PAIRS: {
    // Populated from explorer data
  },
} as const;

/** BRC20_Controller address (deployed at genesis by BRC2.0 indexer) */
export const BRC20_CONTROLLER_ADDRESS = '0xc54dd4581af2dbf18e4d90840226756e9d2b3cdb';

/** Common function selectors for BRC2.0 contracts */
export const SELECTORS = {
  // ERC20
  balanceOf: '70a08231',
  totalSupply: '18160ddd',
  transfer: 'a9059cbb',
  approve: '095ea7b3',
  // FrBTC
  getSignerAddress: '1a296e02',
  getPaymentsLength: 'b8e0ffbe',
  decimals: '313ce567',
  name: '06fdde03',
  // UniswapV2
  getPairAddress: 'e6a43905', // getPair(address,address) on factory
  getReserves: '0902f1ac',
  // BiS_Swap
  initialize: '8129fc1c',
  deposit: 'deposit', // complex ABI
  withdrawableBalances: 'withdrawableBalances',
  uniswapRouter: 'uniswapRouter',
} as const;

/** Load alkanes indexer WASM (required). */
export function loadAlkanesWasm(): Uint8Array | null {
  return loadWasm('alkanes', [
    resolve(home, '.local/qubitcoin/indexers/alkanes/program.wasm'),
    resolve(__dirname, '../devnet/fixtures/alkanes.wasm'),
  ]);
}
