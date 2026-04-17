#!/usr/bin/env node
/**
 * deploy-test-token-regtest.cjs
 *
 * Sets up a test pool on local regtest:
 *   [4:300]  frSIGIL — deployed via fr_sigil.wasm (154K, initialize(amount) mints real protorunes)
 *   [32:0]   frBTC   — existing SUBFROST BTC (wrap via signer bcrt1p7aann...)
 *
 * JOURNAL (2026-04-17): Strategy evolution:
 * - unit.wasm tokens are stored internally (not transferable UTXOs) — unusable for pools
 * - fr_btc.wasm is 1.5MB — deploy cost ~3.75M sats at 10 sat/vbyte, too expensive
 * - regtest esplora does NOT return coinbase UTXOs — generatetoaddress doesn't increase wallet balance
 * - fr_sigil.wasm is 154K — affordable (~154K vbytes × 2 sat/vbyte ≈ 308K sats for reveal)
 *   initialize(amount) pushes AlkaneTransfer { id: myself, value: amount } to CallResponse
 *   This creates real transferable protorune UTXOs at alkanes_change_address
 * - frUSD is EVM-minted (confirmed by user) — not available on local regtest
 *
 * TOKEN IDs after deploy:
 *   [4:300]  frSIGIL (new test token, 10^18 supply, free mint on deploy)
 *   [32:0]   frBTC   (existing SUBFROST BTC)
 *
 * Pool: [4:300] / [32:0] created via factory [4:65498] opcode 1 (CreateNewPool)
 *
 * COINBASE NOTE: regtest esplora doesn't return coinbase UTXOs.
 * Mine blocks to THROWAWAY only. Available sats come from tx change accumulation at deployer.
 */

const path = require('path');
const fs = require('fs');

const RPC_URL = 'http://localhost:18888';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// fr_sigil.wasm from subfrost-appx (154K — fits in budget)
const SIGIL_WASM_PATH = '/Users/erickdelgado/Documents/github/subfrost-appx/prod_wasms/fr_sigil.wasm';

// Deployer (coinType=1 from boot mnemonic)
const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
const THROWAWAY        = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

// frSIGIL — fr_sigil.wasm deployed to [4:300]
// initialize(amount: u64) — mints amount tokens to deployer as real protorune UTXOs
const SIGIL_BLOCK  = 4;
const SIGIL_SLOT   = 300;
const SIGIL_SUPPLY = '1000000000000000000'; // 10^18 (fits in u64: max 1.8×10^19)

// frBTC (existing at genesis)
const FRBTC_SIGNER = 'bcrt1p7aannxnu3cjea43lt80syrx68af3cd8hpzxtcr0979rk9z4csk8qdq3p7a';

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[test-token] ${msg}`); }
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

async function waitSync(maxRetries = 120) {
  for (let i = 0; i < maxRetries; i++) {
    const meta = await rpc('metashrew_height', []);
    const btc  = await rpc('getblockcount', []);
    if (Number(meta) >= Number(btc)) return;
    if (i % 15 === 0) log(`Sync: meta=${meta} btc=${btc}...`);
    await sleep(2000);
  }
  warn('Indexer sync timeout — proceeding');
}

// Mine to THROWAWAY to avoid polluting deployer with immature coinbase UTXOs
async function mineExternal(count) {
  await rpc('generatetoaddress', [count, THROWAWAY]);
  await sleep(500);
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
    // Both "unexpected end of file" and "unexpected end-of-file" mean empty slot
    if (err.includes('unexpected end')) return false;
    return true; // any other error = WASM is there
  } catch {
    return false;
  }
}

async function getAlkaneBalance(address, block, tx) {
  try {
    const result = await rpc('alkanes_protorunesbyaddress', [{
      address,
      protocolTag: '1',
    }]);
    // Response uses outpoints[].runes[].rune.id (hex-encoded) format
    const outpoints = result?.outpoints || [];
    let total = 0n;
    for (const op of outpoints) {
      for (const rune of (op.runes || [])) {
        const id = rune?.rune?.id;
        if (!id) continue;
        const idBlock = parseInt(id.block, 16);
        const idTx    = parseInt(id.tx, 16);
        if (idBlock === Number(block) && idTx === Number(tx)) {
          total += BigInt(rune.balance || 0);
        }
      }
    }
    return total;
  } catch {
    return 0n;
  }
}

async function getNumPools() {
  const r = await rpc('alkanes_simulate', [{
    target: { block: '4', tx: '65498' },
    inputs: ['4'],
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '1',
    txindex: 0,
    vout: 0,
  }]).catch(() => null);
  const d = r?.execution?.data;
  if (!d || d === '0x') return 0;
  const b = Buffer.from(d.slice(2), 'hex');
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]);
  return Number(n);
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

  const height = await rpc('metashrew_height', []);
  ok(`Chain at block ${height}`);

  const tapUtxos = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
  const segUtxos = await provider.esploraGetAddressUtxo(DEPLOYER_SEGWIT);
  const tapBal = tapUtxos.reduce((s, u) => s + u.value, 0);
  const segBal = segUtxos.reduce((s, u) => s + u.value, 0);
  log(`Taproot: ${tapBal} sats (${tapUtxos.length} UTXOs), Segwit: ${segBal} sats (${segUtxos.length} UTXOs)`);

  // ── 1. Deploy frSIGIL [4:300] ─────────────────────────────────────────────
  const sigilDeployed = await isSlotDeployed(SIGIL_BLOCK, SIGIL_SLOT);
  if (sigilDeployed) {
    ok(`frSIGIL already deployed at [${SIGIL_BLOCK}:${SIGIL_SLOT}]`);
  } else {
    log(`Deploying fr_sigil.wasm to [${SIGIL_BLOCK}:${SIGIL_SLOT}]...`);
    if (!fs.existsSync(SIGIL_WASM_PATH)) {
      fail(`fr_sigil.wasm not found at ${SIGIL_WASM_PATH}`);
      process.exit(1);
    }
    const wasmBytes = fs.readFileSync(SIGIL_WASM_PATH);
    const wasmHex = Buffer.from(wasmBytes).toString('hex');
    log(`  WASM size: ${wasmBytes.length} bytes`);

    // fr_sigil.wasm initialize(amount: u64): opcode 0, arg = supply
    // Mints supply tokens to the alkane_change_address via AlkaneTransfer in CallResponse
    const protostone = `[3,${SIGIL_SLOT},0,${SIGIL_SUPPLY}]:v0:v0`;
    log(`  protostone: ${protostone}`);

    try {
      await provider.alkanesExecuteFull(
        JSON.stringify([DEPLOYER_TAPROOT]),
        'B:100000:v0',
        protostone,
        '2',
        wasmHex,
        JSON.stringify({
          from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
          change_address: DEPLOYER_SEGWIT,
          alkanes_change_address: DEPLOYER_TAPROOT,
          mine_enabled: true,
        }),
      );
      await sleep(3000);
      await waitSync();
      ok(`frSIGIL deployed to [${SIGIL_BLOCK}:${SIGIL_SLOT}]`);
    } catch (e) {
      fail(`frSIGIL deploy failed: ${e?.message || e}`);
      process.exit(1);
    }
  }

  // ── 2. Check frSIGIL balance ──────────────────────────────────────────────
  let sigilBal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_SLOT);
  log(`frSIGIL [${SIGIL_BLOCK}:${SIGIL_SLOT}] balance: ${sigilBal}`);

  if (sigilBal === 0n) {
    // Check the contract name to confirm it's deployed
    const r = await rpc('alkanes_simulate', [{
      target: { block: String(SIGIL_BLOCK), tx: String(SIGIL_SLOT) },
      inputs: ['99'],
      alkanes: [],
      transaction: '0x', block: '0x', height: '1', txindex: 0, vout: 0,
    }]);
    const name = Buffer.from((r?.execution?.data || '0x').slice(2), 'hex').toString('utf8');
    log(`  frSIGIL opcode 99 (get_name): "${name}" | error: ${r?.execution?.error || 'none'}`);
    warn('frSIGIL balance is 0 — tokens may need a block to confirm');
  }

  // ── 3. Wrap BTC → frBTC ───────────────────────────────────────────────────
  let frbtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, 32, 0);
  log(`frBTC [32:0] balance: ${frbtcBal}`);

  // JOURNAL (2026-04-17): Taproot address is heavily fragmented — 724 UTXOs of ~1700 sats avg.
  // Wrapping a large BTC amount requires aggregating many small UTXOs, and the fee
  // on all those taproot inputs (~58 vbytes each) quickly exceeds the available balance.
  // Strategy: wrap small amounts (5000 sats) multiple times to accumulate frBTC gradually.
  // 5000 sats output + ~1000 sat fee (using ~5 UTXOs) = ~6000 sats needed per wrap.
  const WRAP_AMOUNT = 5_000;
  const WRAP_REPEATS = 5; // wrap 5 times = ~25K sats frBTC total (enough for pool)
  if (frbtcBal < BigInt(WRAP_AMOUNT * WRAP_REPEATS)) {
    log(`Wrapping BTC → frBTC [32:0] (${WRAP_REPEATS} × ${WRAP_AMOUNT} sats)...`);
    for (let i = 0; i < WRAP_REPEATS; i++) {
      try {
        await provider.alkanesExecuteFull(
          JSON.stringify([FRBTC_SIGNER, DEPLOYER_TAPROOT]),
          `B:${WRAP_AMOUNT}:v0`,
          '[32,0,77]:v1:v1',
          '2',
          null,
          JSON.stringify({
            from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
            change_address: DEPLOYER_SEGWIT,
            alkanes_change_address: DEPLOYER_TAPROOT,
          }),
        );
        await mineExternal(1);
        await waitSync();
        ok(`frBTC wrap ${i + 1}/${WRAP_REPEATS} done`);
      } catch (e) {
        warn(`frBTC wrap ${i + 1}/${WRAP_REPEATS} failed: ${e?.message || e}`);
      }
    }
    frbtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, 32, 0);
    log(`frBTC balance after wrapping: ${frbtcBal}`);
  } else {
    ok(`frBTC already funded: ${frbtcBal} (>= ${WRAP_AMOUNT * WRAP_REPEATS})`);
  }

  // ── 4. Create frSIGIL/frBTC pool ─────────────────────────────────────────
  // Refresh sigil balance after potential delay
  sigilBal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_SLOT);
  log(`frSIGIL balance (refreshed): ${sigilBal}`);

  const numPools = await getNumPools();
  ok(`Factory [4:65498] has ${numPools} pool(s)`);

  if (numPools > 0) {
    ok('Pool already exists — skipping pool creation');
  } else if (sigilBal === 0n || frbtcBal === 0n) {
    warn(`Cannot create pool: frSIGIL=${sigilBal}, frBTC=${frbtcBal}`);
    warn('Ensure frSIGIL deploy minted tokens and frBTC wraps succeeded');
  } else {
    const sigilToSend = sigilBal > 1_000_000_000n ? 1_000_000_000n : sigilBal / 2n;
    const frbtcToSend = frbtcBal > 500_000n       ? 500_000n       : frbtcBal / 2n;

    log(`Creating pool: ${sigilToSend} frSIGIL [${SIGIL_BLOCK}:${SIGIL_SLOT}] / ${frbtcToSend} frBTC [32:0]`);

    // CreateNewPool (factory opcode 1): token_a, token_b, amount_a, amount_b
    // Tokens MUST arrive via incomingAlkanes (two-protostone pattern)
    const createProtostone = `[4,65498,1,${SIGIL_BLOCK},${SIGIL_SLOT},32,0,${sigilToSend.toString()},${frbtcToSend.toString()}]:v0:v0`;
    const inputReqs = `${SIGIL_BLOCK}:${SIGIL_SLOT}:${sigilToSend.toString()},32:0:${frbtcToSend.toString()}`;

    log(`  protostone: ${createProtostone}`);
    log(`  inputReqs:  ${inputReqs}`);

    try {
      await provider.alkanesExecuteFull(
        JSON.stringify([DEPLOYER_TAPROOT]),
        inputReqs,
        createProtostone,
        '2',
        null,
        JSON.stringify({
          from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
          change_address: DEPLOYER_SEGWIT,
          alkanes_change_address: DEPLOYER_TAPROOT,
        }),
      );
      await mineExternal(1);
      await waitSync();
      ok('Pool creation TX confirmed');
    } catch (e) {
      warn(`Pool creation failed: ${e?.message || e}`);
    }
  }

  // ── 5. Final summary ──────────────────────────────────────────────────────
  const finalNumPools = await getNumPools();
  const finalSigilBal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_SLOT);
  const finalFrbtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, 32, 0);
  const finalHeight   = await rpc('metashrew_height', []);

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  Regtest Test Setup Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Chain height:         ${finalHeight}`);
  console.log(`  frSIGIL [4:300]:      ${finalSigilBal} units`);
  console.log(`  frBTC [32:0]:         ${finalFrbtcBal} units`);
  console.log(`  Pools in factory:     ${finalNumPools}`);
  console.log('');
  console.log('  Token Map:');
  console.log('    [4:300]  frSIGIL (test token, fr_sigil.wasm)');
  console.log('    [32:0]   frBTC   (SUBFROST BTC)');
  console.log('    [4:65498] Factory Proxy');
  console.log('');
  console.log('  Next: Fund connected wallet:');
  console.log('    node scripts/setup-regtest-local.cjs --wallet <taproot> --segwit <segwit>');
  console.log('════════════════════════════════════════');
}

main().catch(e => {
  fail(e.message);
  process.exit(1);
});
