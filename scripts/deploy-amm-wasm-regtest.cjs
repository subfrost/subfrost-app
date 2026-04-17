#!/usr/bin/env node
/**
 * deploy-amm-wasm-regtest.cjs
 *
 * Deploys AMM contracts to local regtest using the @alkanes/ts-sdk WASM provider.
 * Uses alkanesExecuteFull (same as boot.ts) which handles commit/reveal + mining.
 *
 * Slots (CLAUDE.md "Current Regtest Deployment 2026-01-28"):
 *   [4:781000]  Beacon Proxy Template  (alkanes_std_beacon_proxy.wasm)
 *   [4:65496]   Pool Logic             (pool.wasm)
 *   [4:65500]   Factory Logic          (factory.wasm)
 *   [4:65498]   Factory Proxy          (alkanes_std_upgradeable.wasm)
 *   [4:65499]   Upgradeable Beacon     (alkanes_std_upgradeable_beacon.wasm)
 *
 * Then initializes the factory with opcode 0 (InitFactory).
 *
 * JOURNAL (2026-04-17): The Rust alkanes-cli sends sendrawtransaction with 3
 * params (tx_hex, maxfeerate, maxburnamount) but our regtest gateway rejects
 * calls with 3 params, returning bitcoin help text as an error. Switched to
 * the WASM provider (same approach as boot.ts) which uses alkanesExecuteFull.
 *
 * Usage:
 *   node scripts/deploy-amm-wasm-regtest.cjs
 *   SKIP_DEPLOYED=1 node scripts/deploy-amm-wasm-regtest.cjs  # re-init only
 */

const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = 'http://localhost:18888';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const WASM_DIR = path.resolve(__dirname, '../../github/alkanes-rs-dev/prod_wasms');

// Deployer addresses (coinType=1, derived by WASM provider from boot mnemonic)
const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';

// Slot constants (CLAUDE.md active deployment 2026-01-28)
const SLOTS = {
  BEACON_PROXY_TEMPLATE: 781000,
  POOL_LOGIC:            65496,
  FACTORY_LOGIC:         65500,
  FACTORY_PROXY:         65498,
  UPGRADEABLE_BEACON:    65499,
};

// Init args per contract (CRITICAL — see CLAUDE.md ⚠️ Proxy & Beacon Init Opcodes)
const INIT_ARGS = {
  BEACON_PROXY_TEMPLATE: [36863],              // forward opcode (no-op for template)
  POOL_LOGIC:            [50],                 // opcode 50 = Forward (read-only, safe)
  FACTORY_LOGIC:         [50],                 // opcode 50 = Forward (read-only, safe)
  FACTORY_PROXY:         [32767, 4, 65500, 1], // 0x7fff + impl(4:65500) + authUnits=1
  UPGRADEABLE_BEACON:    [32767, 4, 65496, 1], // 0x7fff + impl(4:65496) + authUnits=1
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[deploy] ${msg}`); }
function ok(msg)   { console.log(`✅  ${msg}`); }
function warn(msg) { console.log(`⚠️   ${msg}`); }
function fail(msg) { console.error(`❌  ${msg}`); process.exit(1); }

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

async function mineBlocks(count) {
  return rpc('generatetoaddress', [count, DEPLOYER_TAPROOT]);
}

function readWasm(filename) {
  const p = path.join(WASM_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`WASM not found: ${p}`);
  return fs.readFileSync(p);
}

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
    if (err.includes('unexpected end of file')) return false;
    return true;
  } catch {
    return false;
  }
}

async function deployWasm(provider, name, wasmBytes, slot, initArgs) {
  log(`Deploying ${name} → [4:${slot}]...`);
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[3,${slot},${argsStr}]:v0:v0`;
  log(`  protostone: ${protostone}`);

  const wasmHex = Buffer.from(wasmBytes).toString('hex');

  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([DEPLOYER_TAPROOT]),
      'B:100000:v0',
      protostone,
      '1',
      wasmHex,
      JSON.stringify({
        from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
        change_address: DEPLOYER_SEGWIT,
        alkanes_change_address: DEPLOYER_TAPROOT,
        mine_enabled: true,
      }),
    );
    await sleep(2000); // let indexer catch up
    ok(`${name} deployed to [4:${slot}]`);
  } catch (e) {
    throw new Error(`${name} deploy FAILED: ${e?.message || e}`);
  }
}

async function executeCall(provider, name, protostone, inputRequirements, incomingAlkanes) {
  log(`Executing: ${name}`);
  log(`  protostone: ${protostone}`);

  const alkanesArg = incomingAlkanes || [];

  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([DEPLOYER_TAPROOT]),
      inputRequirements || 'B:2000:v0',
      protostone,
      '1',
      '',   // no envelope
      JSON.stringify({
        from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
        change_address: DEPLOYER_SEGWIT,
        alkanes_change_address: DEPLOYER_TAPROOT,
        mine_enabled: true,
        alkanes: alkanesArg,
      }),
    );
    await sleep(2000);
    ok(`${name} done`);
  } catch (e) {
    warn(`${name} failed: ${e?.message || e}`);
    throw e;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('Loading WASM provider...');

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

  // ── Check height ──────────────────────────────────────────────────────────
  const height = await rpc('metashrew_height', []);
  ok(`Regtest at block ${height}`);

  // ── Check deployer balance ────────────────────────────────────────────────
  const utxos = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
  const bal = utxos.reduce((s, u) => s + u.value, 0);
  log(`Deployer taproot balance: ${bal} sats (${utxos.length} UTXOs)`);

  if (bal < 1_000_000) {
    log('Mining 10 blocks to deployer...');
    await mineBlocks(10);
    await sleep(3000);
    ok('Funded deployer');
  }

  // ── Check which slots need deployment ────────────────────────────────────
  const skipDeployed = process.env.SKIP_DEPLOYED === '1';

  const checks = {
    BEACON_PROXY_TEMPLATE: await isSlotDeployed(4, SLOTS.BEACON_PROXY_TEMPLATE),
    POOL_LOGIC:            await isSlotDeployed(4, SLOTS.POOL_LOGIC),
    FACTORY_LOGIC:         await isSlotDeployed(4, SLOTS.FACTORY_LOGIC),
    FACTORY_PROXY:         await isSlotDeployed(4, SLOTS.FACTORY_PROXY),
    UPGRADEABLE_BEACON:    await isSlotDeployed(4, SLOTS.UPGRADEABLE_BEACON),
  };

  console.log('\nDeployment status:');
  for (const [name, deployed] of Object.entries(checks)) {
    console.log(`  ${deployed ? '✅' : '❌'}  ${name} [4:${SLOTS[name]}]`);
  }
  console.log('');

  if (!Object.values(checks).some(v => !v)) {
    ok('All contracts already deployed!');
    if (skipDeployed) {
      log('SKIP_DEPLOYED=1: proceeding to factory init check');
    }
  } else {
    // ── Deploy contracts ──────────────────────────────────────────────────
    if (!checks.BEACON_PROXY_TEMPLATE) {
      await deployWasm(provider, 'Beacon Proxy Template',
        readWasm('alkanes_std_beacon_proxy.wasm'),
        SLOTS.BEACON_PROXY_TEMPLATE,
        INIT_ARGS.BEACON_PROXY_TEMPLATE);
    }

    if (!checks.POOL_LOGIC) {
      await deployWasm(provider, 'Pool Logic',
        readWasm('pool.wasm'),
        SLOTS.POOL_LOGIC,
        INIT_ARGS.POOL_LOGIC);
    }

    if (!checks.FACTORY_LOGIC) {
      await deployWasm(provider, 'Factory Logic',
        readWasm('factory.wasm'),
        SLOTS.FACTORY_LOGIC,
        INIT_ARGS.FACTORY_LOGIC);
    }

    if (!checks.FACTORY_PROXY) {
      await deployWasm(provider, 'Factory Proxy',
        readWasm('alkanes_std_upgradeable.wasm'),
        SLOTS.FACTORY_PROXY,
        INIT_ARGS.FACTORY_PROXY);
    }

    if (!checks.UPGRADEABLE_BEACON) {
      await deployWasm(provider, 'Upgradeable Beacon',
        readWasm('alkanes_std_upgradeable_beacon.wasm'),
        SLOTS.UPGRADEABLE_BEACON,
        INIT_ARGS.UPGRADEABLE_BEACON);
    }

    ok('All contracts deployed!');
  }

  // ── Check factory initialization ─────────────────────────────────────────
  log('Checking factory (opcode 4 = GetNumPools)...');
  const numPoolsResult = await rpc('alkanes_simulate', [{
    target: { block: '4', tx: String(SLOTS.FACTORY_PROXY) },
    inputs: ['4'],
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '1',
    txindex: 0,
    vout: 0,
  }]);
  const poolErr = numPoolsResult?.execution?.error;
  const poolData = numPoolsResult?.execution?.data;
  log(`Factory response: data=${poolData?.slice(0, 20)}, error=${poolErr}`);

  const factoryInitialized = poolErr === null || poolErr === undefined || poolErr === '';

  if (factoryInitialized) {
    // Parse pool count
    let numPools = 0;
    if (poolData && poolData !== '0x') {
      const hex = poolData.slice(2);
      const bytes = Buffer.from(hex, 'hex');
      let n = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
      numPools = Number(n);
    }
    ok(`Factory already initialized. Pool count: ${numPools}`);
  } else if (poolErr && (poolErr.includes('not initialized') || poolErr.includes('Unrecognized'))) {
    warn(`Factory not initialized (error: ${poolErr}). Initializing...`);

    // Find auth token — factory proxy deployment mints [2:N] auth token
    log('Looking for factory auth token...');
    let authTokenId = null;
    try {
      const protorunes = await rpc('alkanes_protorunesbyaddress', [{
        address: DEPLOYER_TAPROOT,
        protocolTag: '1',
      }]);
      const balances = protorunes?.balances || [];
      for (const b of balances) {
        const id = b?.alkane?.id;
        if (id?.block === '2') {
          authTokenId = `${id.block}:${id.tx}`;
          log(`Found auth token: ${authTokenId} (balance: ${b.value})`);
        }
      }
    } catch (e) {
      warn(`Auth token lookup failed: ${e.message}`);
    }

    // InitFactory: opcode 0, args: beacon_proxy_template block/tx, beacon block/tx
    const initProtostone = `[4,${SLOTS.FACTORY_PROXY},0,4,${SLOTS.BEACON_PROXY_TEMPLATE},4,${SLOTS.UPGRADEABLE_BEACON}]:v0:v0`;

    try {
      const alkanesInput = authTokenId
        ? [{ id: { block: authTokenId.split(':')[0], tx: authTokenId.split(':')[1] }, value: '1' }]
        : [];

      await executeCall(provider, 'InitFactory',
        initProtostone,
        'B:2000:v0',
        alkanesInput);
    } catch (e) {
      warn(`InitFactory failed: ${e.message}`);
      warn('Factory may need a different auth token. Check auth token IDs manually.');
    }
  } else {
    log(`Factory error (may be normal for simulations): ${poolErr}`);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const finalHeight = await rpc('metashrew_height', []);

  // Re-verify all slots
  const finalChecks = {
    'Beacon Proxy Template': await isSlotDeployed(4, SLOTS.BEACON_PROXY_TEMPLATE),
    'Pool Logic':            await isSlotDeployed(4, SLOTS.POOL_LOGIC),
    'Factory Logic':         await isSlotDeployed(4, SLOTS.FACTORY_LOGIC),
    'Factory Proxy':         await isSlotDeployed(4, SLOTS.FACTORY_PROXY),
    'Upgradeable Beacon':    await isSlotDeployed(4, SLOTS.UPGRADEABLE_BEACON),
  };

  console.log('\n════════════════════════════════════════');
  console.log('  AMM Deploy Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Chain height:      ${finalHeight}`);
  console.log('  Contract status:');
  for (const [name, deployed] of Object.entries(finalChecks)) {
    console.log(`    ${deployed ? '✅' : '❌'}  ${name}`);
  }
  console.log('');
  console.log('  Slot map:');
  for (const [name, slot] of Object.entries(SLOTS)) {
    console.log(`    [4:${slot}]  ${name}`);
  }
  console.log('');
  console.log('  Next: Create DIESEL/frBTC pool:');
  console.log('    node scripts/create-pool-regtest-local.cjs');
  console.log('════════════════════════════════════════');
}

main().catch(e => {
  fail(e.message);
});
