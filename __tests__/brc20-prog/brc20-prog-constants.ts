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

/** Load alkanes indexer WASM (required). */
export function loadAlkanesWasm(): Uint8Array | null {
  return loadWasm('alkanes', [
    resolve(home, '.local/qubitcoin/indexers/alkanes/program.wasm'),
    resolve(__dirname, '../devnet/fixtures/alkanes.wasm'),
  ]);
}
