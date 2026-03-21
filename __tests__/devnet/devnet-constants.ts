/**
 * Constants for devnet testing.
 *
 * Unlike regtest-constants (which point to external infra), these are
 * used with the in-process DevnetTestHarness.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export const DEVNET = {
  // The fetch interceptor routes these to the in-process server
  RPC_URL: 'http://localhost:18888',

  // Alkane IDs (will be assigned during contract deployment)
  FRBTC_ID: '32:0',
  DIESEL_ID: '2:0',
  FACTORY_ID: '4:65498',

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

/**
 * Load a WASM indexer module from the standard location.
 * Returns null if not found (test will skip).
 */
export function loadIndexerWasm(name: string): Uint8Array | null {
  const paths = [
    resolve(process.env.HOME || '~', `.local/qubitcoin/indexers/${name}/program.wasm`),
    resolve(__dirname, `../../fixtures/indexers/${name}.wasm`),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return new Uint8Array(readFileSync(p));
    }
  }
  return null;
}

/**
 * Load a tertiary indexer WASM from test fixtures.
 * Returns null if not found.
 */
export function loadTertiaryWasm(name: string): Uint8Array | null {
  const paths = [
    resolve(__dirname, `fixtures/${name}.wasm`),
    resolve(process.env.HOME || '~', `${name}/target/wasm32-unknown-unknown/release/${name}.wasm`),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      return new Uint8Array(readFileSync(p));
    }
  }
  return null;
}
