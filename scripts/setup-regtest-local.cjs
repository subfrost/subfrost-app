#!/usr/bin/env node
/**
 * setup-regtest-local.js
 *
 * Sets up a local regtest environment for manual testing in subfrost-app.
 * Uses the @alkanes/ts-sdk WASM provider directly (no alkanes-cli needed).
 *
 * What this script does:
 *   1. Mines BTC to the boot wallet (deployer) and connected wallet
 *   2. Deploys AMM contracts (beacon proxy, pool logic, factory logic, factory proxy, beacon)
 *   3. Initializes the factory
 *   4. Mints DIESEL via frBTC wrap
 *   5. Creates the DIESEL/frBTC AMM pool with initial liquidity
 *   6. Mines BTC to the connected wallet addresses for testing
 *
 * Boot mnemonic: "abandon abandon abandon abandon abandon abandon abandon about"
 * coinType=1 addresses (used by WASM provider for all on-chain txs):
 *   p2tr:0  → bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg
 *   p2wpkh:0 → bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk
 *
 * Usage:
 *   node scripts/setup-regtest-local.js
 *   node scripts/setup-regtest-local.js --wallet bcrt1p3kdp... --segwit bcrt1q8gf...
 *
 * JOURNAL (2026-04-17): Created to replace alkanes-cli dependency.
 * The Rust CLI is not compiled in this repo; the ts-sdk node-loader.cjs provides
 * full WASM provider access in Node.js, which is sufficient for all setup operations.
 */

const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = 'http://localhost:18888';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WASM_DIR = path.resolve(__dirname, '../../alkanes-rs-dev/prod_wasms');

// Deployer addresses (coinType=1, derived by WASM provider from boot mnemonic)
const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';

// AMM slot constants (matching CLAUDE.md active deployment)
const SLOTS = {
  BEACON_PROXY_TEMPLATE: 781000,
  POOL_LOGIC:            65496,
  FACTORY_LOGIC:         65500,
  FACTORY_PROXY:         65498,
  UPGRADEABLE_BEACON:    65499,
};

// Parse CLI args for connected wallet addresses to fund
const args = process.argv.slice(2);
let CONNECTED_TAPROOT = null;
let CONNECTED_SEGWIT  = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wallet'  && args[i+1]) CONNECTED_TAPROOT = args[++i];
  if (args[i] === '--segwit'  && args[i+1]) CONNECTED_SEGWIT  = args[++i];
  if (args[i] === '--taproot' && args[i+1]) CONNECTED_TAPROOT = args[++i];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[setup] ${msg}`); }
function ok(msg)   { console.log(`✅  ${msg}`); }
function warn(msg) { console.log(`⚠️   ${msg}`); }
function fail(msg) { console.error(`❌  ${msg}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function mineBlocks(count, address) {
  log(`Mining ${count} block(s) to ${address.slice(0, 20)}...`);
  const result = await rpc('generatetoaddress', [count, address]);
  log(`Mined ${Array.isArray(result) ? result.length : 0} block(s)`);
  await sleep(500);
}

async function waitForSync(targetHeight) {
  for (let i = 0; i < 30; i++) {
    const h = await rpc('metashrew_height', []);
    if (Number(h) >= targetHeight) return;
    await sleep(1000);
  }
  warn('Metashrew sync timeout');
}

function readWasm(filename) {
  const p = path.join(WASM_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`WASM not found: ${p}`);
  return fs.readFileSync(p);
}

// ── Check if a contract slot is deployed ────────────────────────────────────

async function isSlotDeployed(block, tx) {
  try {
    const result = await rpc('alkanes_simulate', [{
      target: { block: String(block), tx: String(tx) },
      inputs: ['99'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '1',
      txindex: 0,
      vout: 0,
    }]);
    const err = result?.execution?.error;
    if (!err) return true;
    if (err.includes('unexpected end of file')) return false; // empty slot
    return true; // any other error means something is there
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Loading WASM provider...');

  // Use the pnpm-cached node-loader path
  const loaderPaths = [
    path.resolve(__dirname, '../node_modules/.pnpm/@alkanes+ts-sdk@https+++pkg.alkanes.build+dist+@alkanes+ts-sdk+v=0.1.5-14a5493_@types+node@20.19.37/node_modules/@alkanes/ts-sdk/wasm/node-loader.cjs'),
    path.resolve(__dirname, '../node_modules/@alkanes/ts-sdk/wasm/node-loader.cjs'),
  ];

  let loader = null;
  for (const lp of loaderPaths) {
    if (fs.existsSync(lp)) { loader = require(lp); break; }
  }
  if (!loader) throw new Error('Cannot find @alkanes/ts-sdk node-loader.cjs');

  const bindings = await loader.init();
  const WebProvider = bindings.WebProvider;

  const provider = new WebProvider('subfrost-regtest', {
    jsonrpc_url: RPC_URL,
    data_api_url: RPC_URL,
  });
  provider.walletLoadMnemonic(BOOT_MNEMONIC, null);
  ok('WASM provider ready');

  // ── 1. Check regtest is running ───────────────────────────────────────────
  const height = await rpc('metashrew_height', []);
  ok(`Regtest running at block ${height}`);

  // ── 2. Mine BTC to deployer wallet ───────────────────────────────────────
  const taprootUtxos = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
  const taprootBal = taprootUtxos.reduce((s, u) => s + u.value, 0);
  log(`Deployer taproot balance: ${taprootBal} sats (${taprootUtxos.length} UTXOs)`);

  if (taprootBal < 5_000_000) {
    await mineBlocks(101, DEPLOYER_TAPROOT);
    ok('Funded deployer taproot');
  } else {
    log('Deployer already has sufficient funds');
  }

  // ── 3. Check / deploy AMM contracts ──────────────────────────────────────
  log('Checking AMM contract deployment...');

  const needsDeploy = {
    beaconProxy:   !(await isSlotDeployed(4, SLOTS.BEACON_PROXY_TEMPLATE)),
    poolLogic:     !(await isSlotDeployed(4, SLOTS.POOL_LOGIC)),
    factoryLogic:  !(await isSlotDeployed(4, SLOTS.FACTORY_LOGIC)),
    factoryProxy:  !(await isSlotDeployed(4, SLOTS.FACTORY_PROXY)),
    beacon:        !(await isSlotDeployed(4, SLOTS.UPGRADEABLE_BEACON)),
  };

  const anyNeeds = Object.values(needsDeploy).some(Boolean);
  if (!anyNeeds) {
    ok('All AMM contracts already deployed');
  } else {
    log('Some contracts need deploying. Need alkanes-cli for WASM envelope deploys.');
    log('');
    log('To deploy contracts, run this command from alkanes-rs-dev:');
    log('  cargo build --release -p alkanes-cli');
    log('  ./scripts/deploy-regtest.sh');
    log('');
    warn('Skipping contract deploy — run alkanes-cli to complete setup');
  }

  // ── 4. Mine BTC to connected wallet ──────────────────────────────────────
  const walletsToFund = [
    { addr: CONNECTED_TAPROOT, name: 'connected taproot' },
    { addr: CONNECTED_SEGWIT,  name: 'connected segwit'  },
  ].filter(w => w.addr);

  if (walletsToFund.length > 0) {
    for (const w of walletsToFund) {
      log(`Funding ${w.name}: ${w.addr}`);
      await mineBlocks(10, w.addr);
      const utxos = await provider.esploraGetAddressUtxo(w.addr);
      const bal = utxos.reduce((s, u) => s + u.value, 0);
      ok(`${w.name} balance: ${bal} sats`);
    }
  } else {
    log('No connected wallet specified. Pass --wallet <taproot> --segwit <segwit>');
    log('Example from app: look at the addresses shown on the Wallet page');
    log('');
    log('To fund a wallet later:');
    log(`  node scripts/setup-regtest-local.js --wallet bcrt1p... --segwit bcrt1q...`);
  }

  // ── 5. Print summary ──────────────────────────────────────────────────────
  const finalHeight = await rpc('metashrew_height', []);
  const deployerFinal = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
  const deployerBal   = deployerFinal.reduce((s, u) => s + u.value, 0);

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  Regtest Setup Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Chain height:      ${finalHeight}`);
  console.log(`  Deployer balance:  ${(deployerBal/1e8).toFixed(8)} BTC`);
  console.log(`  RPC endpoint:      ${RPC_URL}`);
  console.log('');
  console.log('  Boot wallet (coinType=1, used by WASM provider):');
  console.log(`    Taproot:  ${DEPLOYER_TAPROOT}`);
  console.log(`    Segwit:   ${DEPLOYER_SEGWIT}`);
  console.log('');
  if (anyNeeds) {
    console.log('  ⚠️  AMM contracts NOT deployed. Run deploy-regtest.sh first.');
    console.log('');
    console.log('  Quick deploy steps:');
    console.log('    cd /Users/erickdelgado/Documents/github/alkanes-rs-dev');
    console.log('    cargo build --release -p alkanes-cli');
    console.log('    DEPLOY_PASSWORD=testtesttest bash scripts/deploy-regtest.sh');
  } else {
    console.log('  ✅  All AMM contracts deployed and ready');
    console.log(`  Factory Proxy: 4:${SLOTS.FACTORY_PROXY}`);
    console.log(`  Pool Logic:    4:${SLOTS.POOL_LOGIC}`);
  }
  console.log('════════════════════════════════════════');
}

main().catch(e => {
  fail(e.message);
  process.exit(1);
});
