#!/usr/bin/env node
/**
 * create-pool-regtest-local.cjs
 *
 * Creates the DIESEL/frBTC AMM pool on the local regtest environment.
 * Uses the @alkanes/ts-sdk WASM provider directly (no alkanes-cli needed).
 *
 * Prerequisites:
 *   - AMM contracts deployed (run deploy-amm-wasm-regtest.cjs first)
 *   - Deployer wallet funded (bcrt1p8wpt9v4... has BTC)
 *
 * What this script does:
 *   1. Mints DIESEL by calling opcode 77 on [2:0]
 *   2. Wraps BTC to get frBTC via [32:0] opcode 77 (BTC to signer address, protostone at v1)
 *   3. Creates the DIESEL/frBTC pool via factory proxy [4:65498] opcode 1
 *   4. Verifies the pool was created and reports pool ID
 *
 * JOURNAL (2026-04-17): Rewrote from scratch using boot.ts patterns.
 * - DIESEL: alkanesExecuteFull protostone=[2,0,77]:v0:v0, inputRequirements=B:10000:v0
 * - frBTC: alkanesExecuteFull protostone=[32,0,77]:v1:v1, inputRequirements=B:1000000:v0
 *   with toAddresses=[signerAddr, taproot] so signer gets BTC at v0
 * - Pool: alkanesExecuteWithStrings with both tokens as incomingAlkanes
 */

const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = 'http://localhost:18888';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Active deployment slots (matching CLAUDE.md)
const FACTORY_PROXY = { block: '4', tx: '65498' };
const DIESEL_ID     = { block: '2', tx: '0' };
const FRBTC_ID      = { block: '32', tx: '0' };

// Deployer addresses (coinType=1, derived by WASM provider from boot mnemonic)
const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[create-pool] ${msg}`); }
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
  log(`Mining ${count} block(s)...`);
  await rpc('generatetoaddress', [count, address || DEPLOYER_TAPROOT]);
  await sleep(1000);
}

/**
 * Execute a non-deploy alkane call via alkanesExecuteFull.
 * toAddresses: outputs where tokens/BTC should be sent (array of addresses)
 */
async function executeCall(provider, name, protostone, inputRequirements, toAddresses) {
  log(`Executing: ${name} [${protostone.slice(0, 60)}]`);
  try {
    await provider.alkanesExecuteFull(
      JSON.stringify(toAddresses || [DEPLOYER_TAPROOT]),
      inputRequirements,
      protostone,
      '2',
      null,
      JSON.stringify({
        from_addresses: [DEPLOYER_SEGWIT],
        change_address: DEPLOYER_SEGWIT,
        alkanes_change_address: DEPLOYER_TAPROOT,
      }),
    );
    // Mine externally to confirm TX, then wait for indexer
    await mineExternal(1);
    await waitSync();
    ok(`${name} done`);
  } catch (e) {
    warn(`${name} failed: ${e?.message || e}`);
    throw e;
  }
}

/** Mine blocks to throwaway address (avoids adding coinbase UTXOs to deployer) */
async function mineExternal(count) {
  const THROWAWAY = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';
  await rpc('generatetoaddress', [count, THROWAWAY]);
  await sleep(500);
}

/** Wait for metashrew to catch up to bitcoind */
async function waitSync(maxRetries = 120) {
  for (let i = 0; i < maxRetries; i++) {
    const meta = await rpc('metashrew_height', []);
    const btc  = await rpc('getblockcount', []);
    if (Number(meta) >= Number(btc)) return;
    if (i % 10 === 0) log(`Sync: meta=${meta} btc=${btc} (waiting...)`);
    await sleep(2000);
  }
  warn('Indexer sync timeout — proceeding anyway');
}

async function getNumPools() {
  try {
    const result = await rpc('alkanes_simulate', [{
      target: FACTORY_PROXY,
      inputs: ['4'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '1',
      txindex: 0,
      vout: 0,
    }]);
    const data = result?.execution?.data;
    if (!data || data === '0x') return 0;
    const hex = data.slice(2);
    if (hex.length === 0) return 0;
    const bytes = Buffer.from(hex, 'hex');
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    return Number(n);
  } catch (e) {
    warn(`getNumPools failed: ${e.message}`);
    return -1;
  }
}

async function getAlkaneBalance(address, block, tx) {
  try {
    const result = await rpc('alkanes_protorunesbyaddress', [{
      address,
      protocolTag: '1',
    }]);
    const balances = result?.balances || [];
    for (const b of balances) {
      const aid = b?.alkane?.id;
      if (aid?.block === block && aid?.tx === tx) {
        return BigInt(b.value || 0);
      }
    }
    return 0n;
  } catch {
    return 0n;
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

  // ── 1. Check factory is initialized ──────────────────────────────────────
  const numPools = await getNumPools();
  if (numPools < 0) {
    fail('Factory not responding. Deploy AMM contracts first: node scripts/deploy-amm-wasm-regtest.cjs');
    process.exit(1);
  }
  ok(`Factory responding. Current pool count: ${numPools}`);

  // ── 2. Check if pool already exists ──────────────────────────────────────
  if (numPools >= 1) {
    log('Pool already exists. Finding pool ID...');
    try {
      const findResult = await rpc('alkanes_simulate', [{
        target: FACTORY_PROXY,
        inputs: ['2', DIESEL_ID.block, DIESEL_ID.tx, FRBTC_ID.block, FRBTC_ID.tx],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '1',
        txindex: 0,
        vout: 0,
      }]);
      const findData = findResult?.execution?.data;
      if (findData && findData !== '0x') {
        const hex = findData.slice(2);
        const bytes = Buffer.from(hex, 'hex');
        let poolBlock = 0n, poolTx = 0n;
        for (let i = 15; i >= 0; i--) poolBlock = (poolBlock << 8n) | BigInt(bytes[i]);
        for (let i = 31; i >= 16; i--) poolTx = (poolTx << 8n) | BigInt(bytes[i]);
        ok(`DIESEL/frBTC pool exists at [${poolBlock}:${poolTx}]`);
        printSummary(String(poolBlock), String(poolTx), numPools, await rpc('metashrew_height', []));
        return;
      }
    } catch (e) {
      log(`Pool lookup: ${e.message}`);
    }
  }

  // ── 3. Mint DIESEL ────────────────────────────────────────────────────────
  let dieselBal = await getAlkaneBalance(DEPLOYER_TAPROOT, '2', '0');
  log(`DIESEL balance: ${dieselBal}`);

  if (dieselBal < 100_000_000n) {
    log('Minting DIESEL via [2:0] opcode 77...');
    for (let i = 0; i < 5; i++) {
      await executeCall(provider,
        `DIESEL mint ${i + 1}/5`,
        '[2,0,77]:v0:v0',
        'B:600:v0',
        [DEPLOYER_TAPROOT]);
    }
    dieselBal = await getAlkaneBalance(DEPLOYER_TAPROOT, '2', '0');
    log(`DIESEL balance after minting: ${dieselBal}`);
  }

  // ── 4. Wrap BTC → frBTC ───────────────────────────────────────────────────
  let frBtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, '32', '0');
  log(`frBTC balance: ${frBtcBal}`);

  if (frBtcBal < 50_000_000n) {
    log('Wrapping BTC → frBTC via [32:0] opcode 77...');

    // Get frBTC signer address from opcode 103
    let signerAddr = DEPLOYER_TAPROOT;
    try {
      const signerResult = await rpc('alkanes_simulate', [{
        target: FRBTC_ID,
        inputs: ['103'],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '1',
        txindex: 0,
        vout: 0,
      }]);
      const signerData = signerResult?.execution?.data?.replace('0x', '');
      if (signerData && signerData.length === 64) {
        // Derive P2TR address from x-only pubkey (33 byte compressed → remove prefix)
        // The signer data is already x-only 32-byte pubkey
        const { createHash } = require('crypto');
        // Use bitcoinjs-lib via dynamic require
        try {
          const bitcoin = require('../node_modules/bitcoinjs-lib/src/index.js');
          const xOnly = Buffer.from(signerData, 'hex');
          const payment = bitcoin.payments.p2tr({
            internalPubkey: xOnly,
            network: bitcoin.networks.regtest,
          });
          if (payment.address) {
            signerAddr = payment.address;
            log(`frBTC signer address: ${signerAddr}`);
          }
        } catch (e) {
          warn(`Could not derive signer P2TR address: ${e.message}. Using taproot.`);
        }
      }
    } catch (e) {
      warn(`Could not query frBTC signer: ${e.message}. Using taproot.`);
    }

    // Wrap: protostone at v1, BTC to signer at v0
    // toAddresses=[signerAddr, DEPLOYER_TAPROOT] → signer at v0, user at v1
    // inputRequirements=B:1000000:v0 → 0.01 BTC to output 0 (signer)
    for (let i = 0; i < 3; i++) {
      await executeCall(provider,
        `frBTC wrap ${i + 1}/3`,
        '[32,0,77]:v1:v1',
        'B:1000000:v0',
        [signerAddr, DEPLOYER_TAPROOT]);
    }

    frBtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, '32', '0');
    log(`frBTC balance after wrapping: ${frBtcBal}`);
  }

  // ── 5. Verify balances ────────────────────────────────────────────────────
  dieselBal = await getAlkaneBalance(DEPLOYER_TAPROOT, '2', '0');
  frBtcBal  = await getAlkaneBalance(DEPLOYER_TAPROOT, '32', '0');
  log(`Final balances — DIESEL: ${dieselBal}, frBTC: ${frBtcBal}`);

  if (dieselBal === 0n || frBtcBal === 0n) {
    warn(`Insufficient balances to create pool. DIESEL: ${dieselBal}, frBTC: ${frBtcBal}`);
    warn('Check that [2:0] and [32:0] contracts are deployed on this chain.');
    process.exit(1);
  }

  // Use a fraction of available balance for pool seeding
  const dieselToSend = dieselBal / 3n;
  const frBtcToSend  = frBtcBal  / 2n;

  log(`Creating pool with: ${dieselToSend} DIESEL, ${frBtcToSend} frBTC`);

  // ── 6. Create DIESEL/frBTC pool ───────────────────────────────────────────
  // Factory opcode 1 = CreateNewPool
  // args: token_a_block, token_a_tx, token_b_block, token_b_tx, amount_a, amount_b
  // Both tokens must arrive as incomingAlkanes (SDK auto-edict from inputRequirements)
  const createProtostone = `[4,65498,1,${DIESEL_ID.block},${DIESEL_ID.tx},${FRBTC_ID.block},${FRBTC_ID.tx},${dieselToSend.toString()},${frBtcToSend.toString()}]:v0:v0`;
  const inputReqs = `${DIESEL_ID.block}:${DIESEL_ID.tx}:${dieselToSend.toString()},${FRBTC_ID.block}:${FRBTC_ID.tx}:${frBtcToSend.toString()}`;

  log(`Pool protostone: ${createProtostone}`);
  log(`Input requirements: ${inputReqs}`);

  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([DEPLOYER_TAPROOT]),
      inputReqs,
      createProtostone,
      '2',
      null,
      JSON.stringify({
        from_addresses: [DEPLOYER_SEGWIT],
        change_address: DEPLOYER_SEGWIT,
        alkanes_change_address: DEPLOYER_TAPROOT,
      }),
    );
    await mineExternal(1);
    await waitSync();
    ok('CreateNewPool transaction confirmed');
  } catch (e) {
    warn(`CreateNewPool failed: ${e?.message || e}`);
    log('');
    log('Note: If DIESEL or frBTC shows "have 0", re-run after checking:');
    log('  1. alkanes_protorunesbyaddress for DEPLOYER_TAPROOT has DIESEL/frBTC UTXOs');
    log('  2. alkanesExecuteFull is resolving UTXOs from correct address');
    process.exit(1);
  }

  // ── 7. Verify pool was created ────────────────────────────────────────────
  await sleep(2000);
  const newPoolCount = await getNumPools();
  log(`Pool count after creation: ${newPoolCount}`);

  const finalHeight = await rpc('metashrew_height', []);

  if (newPoolCount > numPools) {
    ok(`DIESEL/frBTC pool created! Total pools: ${newPoolCount}`);

    // Find pool ID
    let poolBlock = '?', poolTx = '?';
    try {
      const findResult = await rpc('alkanes_simulate', [{
        target: FACTORY_PROXY,
        inputs: ['2', DIESEL_ID.block, DIESEL_ID.tx, FRBTC_ID.block, FRBTC_ID.tx],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '1',
        txindex: 0,
        vout: 0,
      }]);
      const findData = findResult?.execution?.data;
      if (findData && findData !== '0x') {
        const hex = findData.slice(2);
        const bytes = Buffer.from(hex, 'hex');
        let pBlock = 0n, pTx = 0n;
        for (let i = 15; i >= 0; i--) pBlock = (pBlock << 8n) | BigInt(bytes[i]);
        for (let i = 31; i >= 16; i--) pTx = (pTx << 8n) | BigInt(bytes[i]);
        poolBlock = String(pBlock);
        poolTx = String(pTx);
      }
    } catch (e) {
      log(`Pool ID lookup: ${e.message}`);
    }

    printSummary(poolBlock, poolTx, newPoolCount, finalHeight);
  } else {
    warn('Pool count did not increase. Check transaction trace.');
    log(`Pool count: ${newPoolCount} (was ${numPools})`);
  }
}

function printSummary(poolBlock, poolTx, poolCount, height) {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  Pool Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Chain height: ${height}`);
  console.log(`  Total pools:  ${poolCount}`);
  console.log(`  Pool ID:      ${poolBlock}:${poolTx}`);
  console.log(`  DIESEL:       2:0`);
  console.log(`  frBTC:        32:0`);
  console.log(`  Factory:      4:65498`);
  console.log(`  Pool Logic:   4:65496`);
  console.log('');
  console.log('  Next: Fund connected wallet:');
  console.log('    node scripts/setup-regtest-local.cjs --wallet <taproot> --segwit <segwit>');
  console.log('════════════════════════════════════════');
}

main().catch(e => {
  fail(e.message);
  process.exit(1);
});
