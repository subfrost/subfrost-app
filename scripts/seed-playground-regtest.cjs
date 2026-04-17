#!/usr/bin/env node
/**
 * seed-playground-regtest.cjs
 *
 * Seeds the local regtest-local environment for manual QA:
 *
 *   1. Wrap more frBTC (if balance low)
 *   2. Mint more frSIGIL (if balance low)
 *   3. Create frSIGIL/frBTC pool via factory [4:65522] opcode 1 (local deploy-regtest.sh slot)
 *   4. Place Carbine CLOB limit orders on [4:8260] (buy + sell wall)
 *   5. Fund dxBTC vault [4:8270] with frBTC deposits
 *   6. Fund connected user wallet with BTC + frSIGIL + frBTC
 *
 * JOURNAL (2026-04-17):
 * - WASM provider can't discover alkane UTXOs via incomingAlkanes for pool creation
 *   because regtest returns runes[].rune.id format, not balances[] format
 * - Pool creation uses manual PSBT approach with known UTXOs
 * - Carbine [4:8260] supports op20 (PlaceLimitOrder), op21 (Cancel), op24 (Depth), op25 (Count)
 * - dxBTC [4:8270] has op11 (total-assets) and op6 (deposit-fees) — already has 50M assets
 * - frSIGIL [4:300]: initialize(amount) mints real protorune UTXOs
 * - frBTC [32:0]: wrap via signer bcrt1p7aannxnu3cjea43lt80syrx68af3cd8hpzxtcr0979rk9z4csk8qdq3p7a
 *
 * Deployment map (regtest-local, deploy-regtest.sh):
 *   Factory Proxy    [4:65522]   AMM factory (local deploy-regtest.sh; remote uses 4:65498)
 *   Carbine CLOB     [4:8260]    controller proxy (op20=PlaceLimitOrder, op24=Depth, op25=Count)
 *   dxBTC Vault      [4:8270]    yield vault (op11=total-assets)
 *   FIRE Token       [4:256]     FIRE governance token
 *   frSIGIL          [4:300]     test token (fr_sigil.wasm)
 *   frBTC            [32:0]      genesis wrapped BTC
 *
 * Usage:
 *   node scripts/seed-playground-regtest.cjs
 *   USER_WALLET=bcrt1p... node scripts/seed-playground-regtest.cjs
 */

const path = require('path');
const fs   = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL       = 'http://localhost:18888';
const ESPLORA_URL   = 'http://localhost:50010';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
const THROWAWAY        = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

// User wallet to fund (pass via env or use a default test address)
const USER_WALLET = process.env.USER_WALLET || '';

const FRBTC_SIGNER = 'bcrt1p7aannxnu3cjea43lt80syrx68af3cd8hpzxtcr0979rk9z4csk8qdq3p7a';

const SIGIL_WASM_PATH = path.resolve(__dirname, '../prod_wasms/fr_sigil.wasm');

// Contract IDs
// JOURNAL (2026-04-17): local deploy-regtest.sh deploys AMM factory proxy at [4:65522],
// NOT [4:65498] which is the remote subfrost-regtest slot. Confirmed:
//   alkanes_simulate [4:65522] opcode 4 → GetNumPools = 1 (DIESEL/frBTC pool exists)
//   alkanes_simulate [4:65498] opcode 4 → GetNumPools = 0 (empty, different deployment)
const FACTORY_BLOCK  = 4;  const FACTORY_TX  = 65522;
const CARBINE_BLOCK  = 4;  const CARBINE_TX  = 8260;
const DXBTC_BLOCK    = 4;  const DXBTC_TX    = 8270;
// JOURNAL (2026-04-17): frSIGIL [4:300] was previously deployed but its initialize()
// tokens were consumed by subsequent deploy transactions as BTC fee inputs.
// The contract reports "already initialized" if we try again. Deploy at [4:999] instead
// (verified empty via alkanes_simulate "unexpected end of file" response).
const SIGIL_BLOCK    = 4;  const SIGIL_TX    = 999;
const FRBTC_BLOCK    = 32; const FRBTC_TX    = 0;

// Seeding targets
const MIN_FRBTC_FOR_SEEDING  = 200_000n;  // 200K sats frBTC — enough for pool(50K) + 3 buy orders + vault
const MIN_SIGIL_FOR_SEEDING  = 5_000_000_000n; // 5B frSIGIL
// JOURNAL (2026-04-17): Deployer taproot has 743 fragmented UTXOs averaging ~1700 sats.
// With high fee rates, selecting 30+ tiny UTXOs to fund a wrap costs more in fees than
// the wrap amount itself. Use fee_rate=1 (regtest minimum) which is always sufficient
// since the regtest mempool has no competition.
// WASM deploys (large envelope) need slightly more due to vbyte count but 3 is fine.
const WRAP_AMOUNT            = 5_000;     // 5K sats per wrap — reliable with taproot-only + fee_rate=3
const FEE_RATE               = 3;        // sat/vB — works reliably with fragmented taproot UTXOs

// Pool initial liquidity: 1B frSIGIL / 50K frBTC → price ≈ 0.00005 frBTC per frSIGIL
const POOL_SIGIL_AMOUNT = 1_000_000_000n;  // 1B frSIGIL
const POOL_FRBTC_AMOUNT = 50_000n;         // 50K frBTC sats

// Carbine orders (price = frBTC per frSIGIL × 1e8)
// At pool price 0.00005 frBTC/frSIGIL = 5000 raw
// Spread: 4500 (buy wall) ↔ 5500 (ask wall)
const CARBINE_ORDERS = [
  // Sell orders (side=1): sell frSIGIL for frBTC above market
  { side: 1, price: 6000, amount: 200_000_000n, label: 'sell @ 0.00006' },
  { side: 1, price: 5500, amount: 300_000_000n, label: 'sell @ 0.000055' },
  { side: 1, price: 5100, amount: 500_000_000n, label: 'sell @ 0.000051' },
  // Buy orders (side=0): buy frSIGIL with frBTC below market
  { side: 0, price: 4900, amount: 500_000_000n, label: 'buy @ 0.000049' },
  { side: 0, price: 4500, amount: 300_000_000n, label: 'buy @ 0.000045' },
  { side: 0, price: 4000, amount: 200_000_000n, label: 'buy @ 0.00004' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const log  = (m) => console.log(`[seed] ${m}`);
const ok   = (m) => console.log(`✅  ${m}`);
const warn = (m) => console.log(`⚠️   ${m}`);
const fail = (m) => { console.error(`❌  ${m}`); process.exit(1); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

async function waitSync(maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const [meta, btc] = await Promise.all([
      rpc('metashrew_height', []).catch(() => 0),
      rpc('getblockcount', []).catch(() => 0),
    ]);
    if (Number(meta) >= Number(btc)) return;
    if (i % 10 === 0) log(`Sync: meta=${meta} btc=${btc}...`);
    await sleep(1500);
  }
  warn('Sync timeout — proceeding');
}

async function mineExternal(count = 1) {
  await rpc('generatetoaddress', [count, THROWAWAY]);
  await sleep(400);
}

async function getAlkaneBalance(address, block, tx) {
  const utxos = await getAlkaneUtxos(address, block, tx);
  return utxos.reduce((s, u) => s + u.amount, 0n);
}

// Reverse a hex txid between internal (LE) and display (BE) byte order.
// JOURNAL (2026-04-17): alkanes_protorunesbyaddress returns txids in INTERNAL byte order
// (little-endian, as stored in Bitcoin serialization). Esplora uses DISPLAY byte order
// (reversed, big-endian hex). Must reverse when cross-referencing.
function reverseTxid(hexTxid) {
  return Buffer.from(hexTxid, 'hex').reverse().toString('hex');
}

// Returns all UNSPENT alkane UTXOs for a token at an address.
// Cross-references alkanes indexer (for token amounts) with esplora (for unspent status).
async function getAlkaneUtxos(address, block, tx) {
  try {
    const result = await rpc('alkanes_protorunesbyaddress', [{ address, protocolTag: '1' }]);

    // Get unspent UTXOs from esplora for cross-reference (display byte order)
    const esploraUtxos = await rpc('esplora_address::utxo', [address]).catch(() => []);
    const esploraMap = new Map((esploraUtxos || []).map(u => [`${u.txid}:${u.vout}`, u]));

    const utxos = [];
    for (const op of (result?.outpoints || [])) {
      // alkanes_protorunesbyaddress txids are in internal (LE) byte order — reverse for esplora
      const displayTxid = reverseTxid(op.outpoint.txid);
      const key = `${displayTxid}:${op.outpoint.vout}`;
      const esploraEntry = esploraMap.get(key);
      // Only include UTXOs confirmed unspent in esplora
      if (!esploraEntry) continue;

      for (const rune of (op.runes || [])) {
        const id = rune?.rune?.id;
        if (!id) continue;
        const b = parseInt(id.block, 16);
        const t = parseInt(id.tx, 16);
        if (b === Number(block) && t === Number(tx)) {
          utxos.push({
            txid:   displayTxid, // use display byte order for signing
            vout:   op.outpoint.vout,
            value:  esploraEntry.value ?? op.output.value,
            amount: BigInt(rune.balance || 0),
          });
        }
      }
    }
    return utxos;
  } catch { return []; }
}

async function simulate(block, tx, inputs) {
  return rpc('alkanes_simulate', [{
    target: { block: String(block), tx: String(tx) },
    inputs: inputs.map(String),
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '1',
    txindex: 0,
    vout: 0,
  }]);
}

// Decode a little-endian u128 from a hex-prefixed simulation result ("0x..." or "0x" = 0).
function parseLeU128(hexData) {
  if (!hexData || hexData === '0x') return 0n;
  return BigInt('0x' + Buffer.from(hexData.slice(2), 'hex').reverse().toString('hex'));
}

async function getNumPools() {
  try {
    const r = await simulate(FACTORY_BLOCK, FACTORY_TX, [4]);
    return Number(parseLeU128(r?.execution?.data));
  } catch { return 0; }
}

// Returns the pool AlkaneId {block, tx} for the frSIGIL/frBTC pair, or null if not found.
async function findSigilPool() {
  const r = await simulate(FACTORY_BLOCK, FACTORY_TX, [2, SIGIL_BLOCK, SIGIL_TX, FRBTC_BLOCK, FRBTC_TX]);
  const data = r?.execution?.data;
  if (r?.execution?.error || !data || data === '0x' || data === '0x00000000000000000000000000000000') return null;
  const d = Buffer.from(data.slice(2), 'hex');
  return { block: Number(d.readBigUInt64LE(0)), tx: Number(d.readBigUInt64LE(16)) };
}

async function isSlotDeployed(block, tx) {
  try {
    const r = await simulate(block, tx, [99]);
    const err = r?.execution?.error;
    if (!err) return true;
    if (err.includes('unexpected end')) return false;
    return true;
  } catch { return false; }
}

// ── WASM Provider Setup ───────────────────────────────────────────────────────

async function loadProvider() {
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
  const provider = new bindings.WebProvider('regtest-local', {
    jsonrpc_url: RPC_URL,
    data_api_url: RPC_URL,
  });
  provider.walletLoadMnemonic(BOOT_MNEMONIC, null);
  return provider;
}

// Execute a contract call (no WASM envelope) — for non-deploy transactions
// Uses mineExternal + waitSync since WASM auto-mine doesn't work reliably for calls
async function executeCall(provider, label, protostone, inputReqs, alkanes = []) {
  log(`  → ${label}`);
  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([DEPLOYER_TAPROOT]),
      inputReqs || 'B:2000:v0',
      protostone,
      String(FEE_RATE),
      '',
      JSON.stringify({
        // Use taproot-only to avoid depleting the large segwit UTXOs needed for manual PSBT
        from_addresses: [DEPLOYER_TAPROOT],
        change_address: DEPLOYER_TAPROOT,
        alkanes_change_address: DEPLOYER_TAPROOT,
        // JOURNAL (2026-04-17): mine_enabled: true causes "bad-txns-premature-spend-of-coinbase"
        // because the WASM selects UTXOs BEFORE mining, then mine_enabled triggers a block,
        // and the newly-mined coinbase UTXO gets re-selected for the next tx at depth=1.
        // Instead we mine externally AFTER broadcast so UTXO selection sees only mature UTXOs.
        ...(alkanes.length > 0 ? { alkanes } : {}),
      }),
    );
    await mineExternal(1);
    await sleep(1500);
    await waitSync();
    ok(`  ${label}`);
    return true;
  } catch (e) {
    warn(`  ${label} failed: ${String(e)?.slice(0, 120) || e}`);
    return false;
  }
}

// Deploy a WASM contract
async function deployWasm(provider, label, wasmPath, slot, initArgs) {
  log(`  Deploying ${label} → [4:${slot}]...`);
  const wasmBytes = fs.readFileSync(wasmPath);
  const wasmHex   = Buffer.from(wasmBytes).toString('hex');
  const argsStr   = initArgs.map(String).join(',');
  const protostone = `[3,${slot},${argsStr}]:v0:v0`;
  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([DEPLOYER_TAPROOT]),
      'B:200000:v0',
      protostone,
      String(FEE_RATE),
      wasmHex,
      JSON.stringify({
        // Use SEGWIT for WASM deploys — large coinbase UTXOs handle the large envelope fee.
        // Segwit UTXOs are ONLY used for deploys, not for wraps or regular calls.
        from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
        change_address: DEPLOYER_SEGWIT,
        alkanes_change_address: DEPLOYER_TAPROOT,
      }),
    );
    await mineExternal(1);
    await sleep(2000);
    await waitSync();
    ok(`  ${label} deployed`);
    return true;
  } catch (e) {
    warn(`  ${label} deploy failed: ${String(e).slice(0, 120)}`);
    return false;
  }
}

// ── Step 1: Wrap frBTC ────────────────────────────────────────────────────────

async function ensureFrbtc(provider) {
  let bal = await getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX);
  log(`frBTC balance: ${bal}`);
  if (bal >= MIN_FRBTC_FOR_SEEDING) {
    ok(`frBTC already funded (${bal} >= ${MIN_FRBTC_FOR_SEEDING})`);
    return bal;
  }

  const wrapsNeeded = Math.ceil(Number(MIN_FRBTC_FOR_SEEDING - bal) / WRAP_AMOUNT) + 2;
  log(`Wrapping frBTC: ${wrapsNeeded} × ${WRAP_AMOUNT} sats...`);

  for (let i = 0; i < wrapsNeeded; i++) {
    try {
      await provider.alkanesExecuteFull(
        JSON.stringify([FRBTC_SIGNER, DEPLOYER_TAPROOT]),
        `B:${WRAP_AMOUNT}:v0`,
        '[32,0,77]:v1:v1',
        String(FEE_RATE),
        null,
        // JOURNAL (2026-04-17): Use TAPROOT-ONLY for wraps.
        // Including DEPLOYER_SEGWIT depletes the large segwit coinbase UTXOs we need for
        // the manual PSBT pool creation fee. Taproot-only with fee_rate=3 + 5K wrap is reliable.
        JSON.stringify({
          from_addresses: [DEPLOYER_TAPROOT],
          change_address: DEPLOYER_TAPROOT,
          alkanes_change_address: DEPLOYER_TAPROOT,
        }),
      );
      await mineExternal(1);
      await sleep(500);
      await waitSync();
      if ((i + 1) % 4 === 0) {
        bal = await getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX);
        log(`  frBTC after ${i + 1} wraps: ${bal}`);
        if (bal >= MIN_FRBTC_FOR_SEEDING) break;
      }
    } catch (e) {
      warn(`  wrap ${i + 1} failed: ${String(e)?.slice(0, 120)}`);
    }
  }

  bal = await getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX);
  ok(`frBTC balance after wrapping: ${bal}`);
  return bal;
}

// ── Step 2: Ensure frSIGIL ────────────────────────────────────────────────────

async function ensureFrSigil(provider) {
  const deployed = await isSlotDeployed(SIGIL_BLOCK, SIGIL_TX);
  let bal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX);
  log(`frSIGIL [4:${SIGIL_TX}] deployed: ${deployed}, balance: ${bal}`);

  if (!deployed) {
    // Find fr_sigil.wasm in multiple possible locations
    const wasmPaths = [
      SIGIL_WASM_PATH,
      path.resolve(__dirname, '../prod_wasms/fr_sigil.wasm'),
      '/Users/erickdelgado/Documents/subfrost-app/prod_wasms/fr_sigil.wasm',
    ];
    const wasmPath = wasmPaths.find(p => fs.existsSync(p));
    if (!wasmPath) {
      warn(`fr_sigil.wasm not found — searched: ${wasmPaths.join(', ')}`);
      return 0n;
    }
    log(`Deploying frSIGIL [4:${SIGIL_TX}] from ${wasmPath}...`);
    // initArgs: opcode 0 (initialize) with amount=10_000_000_000_000 (10T units)
    // CREATERESERVED passes these as the init message: [opcode, arg1]
    // fr_sigil initialize(amount: u64) mints `amount` tokens to the deploy output
    await deployWasm(provider, `frSIGIL[4:${SIGIL_TX}]`, wasmPath, SIGIL_TX, [0, '10000000000000']);
    await sleep(2000);
    bal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX);
    log(`frSIGIL balance after deploy: ${bal}`);
    if (bal === 0n) {
      // Tokens from initialize() may have gone to a different output or been consumed.
      // Check all deployer addresses.
      const segwitBal = await getAlkaneBalance(DEPLOYER_SEGWIT, SIGIL_BLOCK, SIGIL_TX);
      log(`frSIGIL at segwit: ${segwitBal}`);
    }
    ok(`frSIGIL deployed, balance: ${bal}`);
  } else if (bal >= MIN_SIGIL_FOR_SEEDING) {
    ok(`frSIGIL already funded (${bal} >= ${MIN_SIGIL_FOR_SEEDING})`);
  } else {
    log(`frSIGIL deployed but low balance (${bal}). Tokens from initialize() may have been consumed.`);
    // Already deployed — cannot re-initialize. Use what we have.
  }

  return bal;
}

// ── Step 3: Create AMM Pool ───────────────────────────────────────────────────

async function ensurePool(provider, sigilBal, frbtcBal) {
  // Use FindExistingPoolId (opcode 2) so we don't skip when another pool already exists
  const existing = await findSigilPool();
  if (existing) {
    ok(`frSIGIL/frBTC pool already exists at [${existing.block}:${existing.tx}]`);
    return true;
  }

  if (sigilBal < POOL_SIGIL_AMOUNT || frbtcBal < POOL_FRBTC_AMOUNT) {
    warn(`Insufficient balance for pool: frSIGIL=${sigilBal}/${POOL_SIGIL_AMOUNT}, frBTC=${frbtcBal}/${POOL_FRBTC_AMOUNT}`);
    return false;
  }

  log(`Creating frSIGIL/frBTC pool: ${POOL_SIGIL_AMOUNT} frSIGIL + ${POOL_FRBTC_AMOUNT} frBTC...`);

  // WASM provider fails silently on regtest (runes[] format != balances[] format).
  // It broadcasts but factory receives 0 incomingAlkanes → 0 pools created.
  // Manual PSBT selects alkane UTXOs explicitly.
  warn('WASM pool creation skipped (regtest runes[] format incompatibility) — using manual PSBT');
  return await createPoolManualPsbt(sigilBal, frbtcBal);
}

// Manual PSBT fallback: construct transaction with known alkane UTXOs
//
// JOURNAL (2026-04-17): Implemented because the WASM provider's alkanesExecuteFull
// cannot discover alkane UTXOs on regtest. The regtest alkanes_protorunesbyaddress
// response uses runes[].rune.id format instead of balances[] format that the WASM
// Lua UTXO discovery script expects. So we build and sign the PSBT entirely in JS.
//
// The two-protostone pattern is used for CreateNewPool because the factory's opcode 1
// requires BOTH tokens as incomingAlkanes:
//   p0: edict protostone — transfers frSIGIL + frBTC to protostone[1] (the cellpack)
//   p1: cellpack protostone — calls factory [4:65522] opcode 1 (CreateNewPool)
//
// All taproot inputs are signed with the BIP-341 tweaked private key (key-path spend).
// The segwit fee input is signed as P2WPKH (BIP-143 sighash).
//
// Key derivation (coinType=1 because WASM provider uses regtest derivation):
//   taproot: m/86'/1'/0'/0/0 → bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg
//   segwit:  m/84'/1'/0'/0/0 → bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk
//
// Source references:
//   lib/alkanes/buildAlkaneTransferPsbt.ts — pattern for PSBT construction with ProtoStone
//   lib/alkanes/builders.ts:buildCreateNewPoolProtostone — two-protostone pattern
//   CLAUDE.md "Two-Protostone Pattern" section — explains why two protostones are needed
async function createPoolManualPsbt(sigilBal, frbtcBal) {
  try {
    // ── Dependencies ─────────────────────────────────────────────────────────
    const bitcoin = require('bitcoinjs-lib');
    const { ECPairFactory } = require('ecpair');
    const tinysecp = require('tiny-secp256k1');
    const { BIP32Factory } = require('bip32');
    const bip39 = require('bip39');
    const crypto = require('crypto');

    // SDK protostone encoding utilities — available in node environment
    // Resolved from @alkanes/ts-sdk/dist/index.js (CJS build)
    const sdkPaths = [
      path.resolve(__dirname, '../node_modules/@alkanes/ts-sdk/dist/index.js'),
      path.resolve(__dirname, '../node_modules/.pnpm/@alkanes+ts-sdk@https+++pkg.alkanes.build+dist+@alkanes+ts-sdk+v=0.1.5-14a5493_@types+node@20.19.37/node_modules/@alkanes/ts-sdk/dist/index.js'),
    ];
    let sdkMod = null;
    for (const p of sdkPaths) {
      if (fs.existsSync(p)) { sdkMod = require(p); break; }
    }
    if (!sdkMod) throw new Error('Cannot find @alkanes/ts-sdk dist/index.js for ProtoStone encoding');

    const { ProtoStone, ProtoruneRuneId, encodeRunestoneProtostone, lebEncodeU128 } = sdkMod;

    bitcoin.initEccLib(tinysecp);
    const ECPair = ECPairFactory(tinysecp);
    const BIP32 = BIP32Factory(tinysecp);

    // ── Key Derivation (coinType=1 for regtest WASM wallet) ──────────────────
    const seed = bip39.mnemonicToSeedSync(BOOT_MNEMONIC);
    const root = BIP32.fromSeed(seed);

    // Taproot: m/86'/1'/0'/0/0
    const taprootChild  = root.derivePath("m/86'/1'/0'/0/0");
    const taprootPrivKey = taprootChild.privateKey;
    const taprootPubKey  = taprootChild.publicKey;
    const xOnlyPubKey    = taprootPubKey.slice(1); // remove 02/03 prefix

    // Segwit: m/84'/1'/0'/0/0
    const segwitChild   = root.derivePath("m/84'/1'/0'/0/0");
    const segwitPrivKey = segwitChild.privateKey;
    const segwitPubKey  = segwitChild.publicKey;

    const network = bitcoin.networks.regtest;

    // Verify derived addresses match expected constants
    const { address: derivedTaproot } = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });
    const { address: derivedSegwit  } = bitcoin.payments.p2wpkh({ pubkey: segwitPubKey, network });
    if (derivedTaproot !== DEPLOYER_TAPROOT) throw new Error(`Taproot address mismatch: ${derivedTaproot}`);
    if (derivedSegwit  !== DEPLOYER_SEGWIT)  throw new Error(`Segwit address mismatch: ${derivedSegwit}`);
    log('  Key derivation verified — addresses match');

    // ── Gather Alkane UTXOs from deployer taproot (parallel) ──────────────────
    const [sigilUtxos, frbtcUtxos] = await Promise.all([
      getAlkaneUtxos(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX),
      getAlkaneUtxos(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX),
    ]);

    if (sigilUtxos.length === 0) throw new Error(`No frSIGIL UTXOs at ${DEPLOYER_TAPROOT}`);
    if (frbtcUtxos.length === 0) throw new Error(`No frBTC UTXOs at ${DEPLOYER_TAPROOT}`);

    log(`  frSIGIL UTXOs: ${sigilUtxos.length}, frBTC UTXOs: ${frbtcUtxos.length}`);

    // Select frSIGIL UTXOs — greedily pick until we have enough
    const selectedSigil = [];
    let accSigil = 0n;
    for (const u of sigilUtxos) {
      if (accSigil >= POOL_SIGIL_AMOUNT) break;
      selectedSigil.push(u);
      accSigil += u.amount;
    }
    if (accSigil < POOL_SIGIL_AMOUNT) throw new Error(`Insufficient frSIGIL: have ${accSigil}, need ${POOL_SIGIL_AMOUNT}`);

    // Select frBTC UTXOs — greedily pick until we have enough.
    // IMPORTANT: Skip UTXOs already selected for frSIGIL — a single UTXO can carry both tokens.
    // The edict will transfer both token types from the shared UTXOs in one input.
    const sigilSelectedKeys = new Set(selectedSigil.map(u => `${u.txid}:${u.vout}`));
    // Count frBTC already present in the shared sigil UTXOs
    let accFrbtc = 0n;
    for (const u of sigilUtxos) {
      if (sigilSelectedKeys.has(`${u.txid}:${u.vout}`)) {
        // This UTXO is already selected; if it also carries frBTC we count that amount
        const frbtcMatch = frbtcUtxos.find(f => f.txid === u.txid && f.vout === u.vout);
        if (frbtcMatch) accFrbtc += frbtcMatch.amount;
      }
    }
    const selectedFrbtc = [];
    for (const u of frbtcUtxos) {
      if (accFrbtc >= POOL_FRBTC_AMOUNT) break;
      if (sigilSelectedKeys.has(`${u.txid}:${u.vout}`)) continue; // already included
      selectedFrbtc.push(u);
      accFrbtc += u.amount;
    }
    if (accFrbtc < POOL_FRBTC_AMOUNT) throw new Error(`Insufficient frBTC: have ${accFrbtc}, need ${POOL_FRBTC_AMOUNT}`);

    log(`  Selected ${selectedSigil.length} frSIGIL UTXOs (total=${accSigil}), ${selectedFrbtc.length} frBTC UTXOs (total=${accFrbtc})`);

    // ── Gather additional fee UTXOs from deployer taproot ────────────────────
    // JOURNAL (2026-04-17): regtest block subsidy is ~0 at height 6492 (43 halvings).
    // Mining to segwit yields 0-value coinbase UTXOs. Use taproot UTXOs for fees instead.
    // We need enough BTC to cover: DUST (600) + estimated fee (~3K sats).
    // The taproot address has 1M+ sats in fragmented UTXOs from transaction fees.
    const allTaprootUtxoRes = await rpc('esplora_address::utxo', [DEPLOYER_TAPROOT]).catch(() => []);
    // Only use UTXOs NOT already selected as alkane inputs (avoid double-spend)
    const selectedOutpoints = new Set([
      ...selectedSigil.map(u => `${u.txid}:${u.vout}`),
      ...selectedFrbtc.map(u => `${u.txid}:${u.vout}`),
    ]);
    const availableFeeUtxos = (allTaprootUtxoRes || [])
      .filter(u => {
        if (!u.status?.confirmed) return false;
        if (selectedOutpoints.has(`${u.txid}:${u.vout}`)) return false;
        return (u.value || 0) > 0;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // ── Build Two-Protostone Runestone OP_RETURN ──────────────────────────────
    // p0: edict protostone — transfer frSIGIL + frBTC to protostone[1] (the cellpack).
    //
    // JOURNAL (2026-04-17): Verified correct formula from protorune/src/lib.rs line 907:
    //   protostone_slot[position] = tx.output.len() + 1 + position
    //
    // Our tx layout:
    //   vout[0] = LP dust (600 sats, P2TR)
    //   vout[1] = OP_RETURN (runestone)
    //   vout[2] = BTC change (P2TR)
    //   tx.output.len() = 3
    //
    //   protostone[0] (edict p0)    = 3 + 1 + 0 = 4
    //   protostone[1] (cellpack p1) = 3 + 1 + 1 = 5  ← edict must target this slot
    //
    // The edict in p0 must set output = 5 to send tokens to p1 (the factory cellpack).
    //
    // Earlier attempts used output=3 and output=1 which were wrong:
    //   output=1 → OP_RETURN vout[1] = burns the tokens
    //   output=3 → protostone[0] (the edict protostone itself) = self-referential
    //   output=5 → protostone[1] (the cellpack) = CORRECT ✓
    const TOTAL_VOUTS = 3;        // vout[0] LP dust + vout[1] OP_RETURN + vout[2] change
    const CELLPACK_PROTOSTONE_IDX = 1; // p1 is the second protostone (index 1)
    const edictOutput = TOTAL_VOUTS + 1 + CELLPACK_PROTOSTONE_IDX; // = 5
    const p0 = ProtoStone.edicts({
      protocolTag: 1n,
      edicts: [
        { id: new ProtoruneRuneId(BigInt(SIGIL_BLOCK), BigInt(SIGIL_TX)), amount: POOL_SIGIL_AMOUNT, output: edictOutput },
        { id: new ProtoruneRuneId(BigInt(FRBTC_BLOCK), BigInt(FRBTC_TX)), amount: POOL_FRBTC_AMOUNT, output: edictOutput },
      ],
    });

    // p1: cellpack protostone — call factory [4:65522] opcode 1 (CreateNewPool)
    //   Calldata: [factory_block, factory_tx, opcode, tokenA_block, tokenA_tx, tokenB_block, tokenB_tx, amountA, amountB]
    //   LEB128-encoded as a sequence of u128 values (lebEncodeU128)
    const cellpackArgs = [
      BigInt(FACTORY_BLOCK), BigInt(FACTORY_TX),
      1n, // CreateNewPool opcode
      BigInt(SIGIL_BLOCK),  BigInt(SIGIL_TX),
      BigInt(FRBTC_BLOCK),  BigInt(FRBTC_TX),
      POOL_SIGIL_AMOUNT,
      POOL_FRBTC_AMOUNT,
    ];
    const calldata = lebEncodeU128(cellpackArgs);
    const p1 = ProtoStone.message({
      protocolTag: 1n,
      pointer: 0,       // vout 0 = dust output (receives LP token change)
      refundPointer: 0,
      calldata,
    });

    // Encode both protostones into a single OP_RETURN runestone
    const { encodedRunestone } = encodeRunestoneProtostone({
      protostones: [p0, p1],
      pointer: 0,
    });
    const opReturnScript = Buffer.from(encodedRunestone);
    log(`  Runestone OP_RETURN: ${opReturnScript.length} bytes`);

    // ── Estimate Fee and Select Fee UTXOs ────────────────────────────────────
    const TAPROOT_IN_VBYTES = 57.5;
    const TX_OVERHEAD       = 10.5;
    const P2TR_OUT          = 43;
    const OP_RETURN_OUT     = 10 + opReturnScript.length;
    const DUST              = 600; // sats for dust output carrying LP tokens

    // Greedily select fee UTXOs to cover: DUST + fee for all inputs+outputs
    const selectedFee = [];
    let accFee = 0;
    for (const u of availableFeeUtxos) {
      const totalInputs = selectedSigil.length + selectedFrbtc.length + selectedFee.length + 1;
      const estimatedVbytesNow = Math.ceil(
        TX_OVERHEAD
        + totalInputs * TAPROOT_IN_VBYTES
        + P2TR_OUT * 2    // v0: LP dust, v2: BTC change
        + OP_RETURN_OUT   // v1: protostone
      );
      const needFee = Math.ceil(estimatedVbytesNow * FEE_RATE) + DUST;
      const alkanesBtc = selectedSigil.reduce((s, u) => s + u.value, 0)
                       + selectedFrbtc.reduce((s, u) => s + u.value, 0);
      if (alkanesBtc + accFee + (u.value || 0) >= needFee) {
        selectedFee.push(u);
        accFee += u.value || 0;
        break;
      }
      selectedFee.push(u);
      accFee += u.value || 0;
    }

    const totalInputsF = selectedSigil.length + selectedFrbtc.length + selectedFee.length;
    const estimatedVbytes = Math.ceil(
      TX_OVERHEAD
      + totalInputsF * TAPROOT_IN_VBYTES
      + P2TR_OUT * 2
      + OP_RETURN_OUT
    );
    const estimatedFee = Math.ceil(estimatedVbytes * FEE_RATE);
    log(`  Estimated: ${estimatedVbytes} vbytes × ${FEE_RATE} sat/vB = ${estimatedFee} sats fee`);
    log(`  Fee UTXOs: ${selectedFee.length} taproot UTXOs (${accFee} sats)`);

    // ── Build PSBT ────────────────────────────────────────────────────────────
    const psbt = new bitcoin.Psbt({ network });

    // Derive taproot output script (for witnessUtxo)
    const { output: taprootOutputScript } = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });

    // Add alkane inputs first — taproot P2TR (hold frSIGIL and frBTC)
    for (const u of [...selectedSigil, ...selectedFrbtc]) {
      psbt.addInput({
        hash:  u.txid,
        index: u.vout,
        witnessUtxo: {
          script: taprootOutputScript,
          value:  BigInt(u.value),
        },
        tapInternalKey: xOnlyPubKey,
      });
    }

    // Add taproot fee inputs (no alkane tokens on these UTXOs)
    for (const u of selectedFee) {
      psbt.addInput({
        hash:  u.txid,
        index: u.vout,
        witnessUtxo: {
          script: taprootOutputScript,
          value:  BigInt(u.value || 0),
        },
        tapInternalKey: xOnlyPubKey,
      });
    }

    // Output layout:
    //   v0: dust P2TR → deployer taproot (receives LP tokens as alkane change)
    //   v1: OP_RETURN with runestone (two protostones: edict + cellpack)
    //   v2: BTC change → deployer taproot (consolidates fee change)
    psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(DUST) });
    psbt.addOutput({ script: opReturnScript,    value: 0n });

    const totalInBtc = selectedSigil.reduce((s, u) => s + u.value, 0)
                     + selectedFrbtc.reduce((s, u) => s + u.value, 0)
                     + accFee;
    const btcChange = totalInBtc - DUST - estimatedFee;
    if (btcChange < 0) throw new Error(`Insufficient BTC for fee: have ${totalInBtc}, need ${DUST + estimatedFee}`);
    if (btcChange >= DUST) {
      psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(btcChange) });
    }

    // ── Sign All Taproot Inputs ───────────────────────────────────────────────
    // BIP-341 tweaked key signing for key-path spends.
    function buildTaprootTweakSigner(privKeyBuf, pubKeyBuf) {
      const xOnly = pubKeyBuf.slice(1);
      const tagHash = crypto.createHash('sha256').update('TapTweak').digest();
      const tweakHash = crypto.createHash('sha256').update(Buffer.concat([tagHash, tagHash, xOnly])).digest();
      let priv = privKeyBuf;
      if (pubKeyBuf[0] === 3) {
        priv = Buffer.from(tinysecp.privateNegate(priv));
      }
      const tweakedPriv = tinysecp.privateAdd(priv, tweakHash);
      if (!tweakedPriv) throw new Error('Taproot key tweak failed');
      return ECPair.fromPrivateKey(Buffer.from(tweakedPriv), { network });
    }

    const tweakedSigner = buildTaprootTweakSigner(taprootPrivKey, taprootPubKey);

    // Sign all inputs (all taproot now)
    for (let i = 0; i < psbt.inputCount; i++) {
      psbt.signTaprootInput(i, tweakedSigner);
    }

    // Finalize all inputs
    psbt.finalizeAllInputs();

    // ── Broadcast ─────────────────────────────────────────────────────────────
    const txHex = psbt.extractTransaction().toHex();
    log(`  Broadcasting manual PSBT tx (${txHex.length / 2} bytes)...`);
    const txid = await rpc('sendrawtransaction', [txHex]);
    log(`  Broadcast txid: ${txid}`);

    // Mine a block to confirm and wait for indexer sync
    await mineExternal(1);
    await sleep(2000);
    await waitSync();

    const created = await findSigilPool();
    if (created) {
      ok(`  frSIGIL/frBTC pool created at [${created.block}:${created.tx}]`);
      return true;
    } else {
      warn(`  Manual PSBT tx confirmed (${txid.slice(0,16)}...) but factory reports no frSIGIL/frBTC pool`);
      warn('  The protorune may not have executed — check tx OP_RETURN encoding');
      return false;
    }
  } catch (e) {
    warn(`Manual PSBT failed: ${e?.message || e}`);
    if (e?.stack) log(`  Stack: ${e.stack.split('\n').slice(0,4).join(' | ')}`);
    return false;
  }
}

// ── Step 4: Seed Carbine CLOB Orders ─────────────────────────────────────────

async function seedCarbineOrders(provider, sigilBal, frbtcBal) {
  const currentOrders = await simulate(CARBINE_BLOCK, CARBINE_TX, [25]);
  const orderCount = Number(parseLeU128(currentOrders?.execution?.data));

  log(`Current Carbine orders: ${orderCount}`);
  if (orderCount >= 6) {
    ok(`Carbine already has ${orderCount} orders — skipping`);
    return;
  }

  log('Seeding Carbine CLOB orders...');

  for (const order of CARBINE_ORDERS) {
    const { side, price, amount, label } = order;

    if (side === 1) {
      // Sell order: send frSIGIL as incomingAlkanes
      const amountScaled = amount; // already in 1e8 units
      const protostone = `[${CARBINE_BLOCK},${CARBINE_TX},20,${SIGIL_BLOCK},${SIGIL_TX},${FRBTC_BLOCK},${FRBTC_TX},${side},${price},${amountScaled}]:v0:v0`;
      const inputReqs  = `${SIGIL_BLOCK}:${SIGIL_TX}:${amountScaled}`;
      await executeCall(provider, `CLOB ${label}`, protostone, inputReqs);
    } else {
      // Buy order: send frBTC as incomingAlkanes (cost = price × amount / 1e8)
      const btcCost = BigInt(price) * amount / 100_000_000n;
      if (btcCost === 0n) continue;
      const protostone = `[${CARBINE_BLOCK},${CARBINE_TX},20,${SIGIL_BLOCK},${SIGIL_TX},${FRBTC_BLOCK},${FRBTC_TX},${side},${price},${amount}]:v0:v0`;
      const inputReqs  = `${FRBTC_BLOCK}:${FRBTC_TX}:${btcCost}`;
      await executeCall(provider, `CLOB ${label}`, protostone, inputReqs);
    }

    await sleep(2000); // wait for mine + sync before next order (avoid mempool conflict)
  }

  const finalOrders = await simulate(CARBINE_BLOCK, CARBINE_TX, [25]);
  const finalData = finalOrders?.execution?.data;
  const finalCount = finalData && finalData !== '0x'
    ? Number(BigInt('0x' + Buffer.from(finalData.slice(2), 'hex').reverse().toString('hex')))
    : 0;
  ok(`Carbine seeded: ${finalCount} orders`);
}

// ── Step 5: Seed dxBTC Vault ──────────────────────────────────────────────────

async function seedDxbtcVault(provider, frbtcBal) {
  const totalAssetsResult = await simulate(DXBTC_BLOCK, DXBTC_TX, [11]);
  const totalAssets = (() => {
    const d = totalAssetsResult?.execution?.data;
    if (!d || d === '0x') return 0n;
    return BigInt('0x' + Buffer.from(d.slice(2), 'hex').reverse().toString('hex'));
  })();

  log(`dxBTC vault total_assets: ${totalAssets}`);

  if (totalAssets >= 50_000_000n) {
    ok(`dxBTC vault already funded (${totalAssets} frBTC)`);
    return;
  }

  const depositAmount = 10_000n;
  if (frbtcBal < depositAmount) {
    warn(`Insufficient frBTC for vault deposit (need ${depositAmount}, have ${frbtcBal})`);
    return;
  }

  log(`Depositing ${depositAmount} frBTC into dxBTC vault...`);

  // swap=1 per dx-btc alkanes.toml (exchanges frBTC for dxBTC shares)
  const depositProto = `[${DXBTC_BLOCK},${DXBTC_TX},1]:v0:v0`;
  const inputReqs    = `${FRBTC_BLOCK}:${FRBTC_TX}:${depositAmount}`;
  await executeCall(provider, `Deposit ${depositAmount} frBTC into dxBTC vault`, depositProto, inputReqs);
}

// ── Step 6: Fund User Wallet ──────────────────────────────────────────────────

async function fundUserWallet(provider, userAddr) {
  if (!userAddr) {
    log('No USER_WALLET specified — skipping user wallet funding');
    log('Re-run with: USER_WALLET=bcrt1p... node scripts/seed-playground-regtest.cjs');
    return;
  }

  log(`Funding user wallet: ${userAddr}`);

  // Send BTC: mine directly to user address
  log('  Mining 5 blocks to user address...');
  try {
    await rpc('generatetoaddress', [5, userAddr]);
    await sleep(1000);
    await waitSync();
    ok('  Mined 5 blocks to user wallet');
  } catch (e) {
    warn(`  Mining to user wallet failed: ${e?.message}`);
  }

  // Send frSIGIL to user
  const sigilBal = await getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX);
  const sigilSend = sigilBal > 100_000_000n ? 100_000_000n : sigilBal / 2n;
  if (sigilSend > 0n) {
    log(`  Sending ${sigilSend} frSIGIL to user wallet...`);
    const protostone = `[${SIGIL_BLOCK},${SIGIL_TX},0]:v0:v0`; // transfer via protostone
    // Transfer via forward opcode — frSIGIL uses fr_sigil.wasm which has opcode 0=forward
    const inputReqs = `${SIGIL_BLOCK}:${SIGIL_TX}:${sigilSend}`;
    await executeCall(
      provider,
      `Transfer frSIGIL to ${userAddr.slice(0, 20)}...`,
      `[${SIGIL_BLOCK},${SIGIL_TX},50]:v0:v0`,
      inputReqs,
    );
  }

  // Send frBTC to user
  const frbtcBal = await getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX);
  const frbtcSend = frbtcBal > 5_000n ? 5_000n : frbtcBal / 2n;
  if (frbtcSend > 0n) {
    log(`  Sending ${frbtcSend} frBTC to user wallet via wrapping...`);
    // Wrap directly to user as alkanes_change_address
    try {
      await provider.alkanesExecuteFull(
        JSON.stringify([FRBTC_SIGNER, userAddr]),
        `B:${WRAP_AMOUNT}:v0`,
        '[32,0,77]:v1:v1',
        String(FEE_RATE),
        null,
        JSON.stringify({
          from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
          change_address: DEPLOYER_SEGWIT,
          alkanes_change_address: userAddr,
        }),
      );
      await mineExternal(1);
      await sleep(1000);
      await waitSync();
      ok(`  frBTC wrapped to user wallet`);
    } catch (e) {
      warn(`  frBTC wrap to user failed: ${String(e)?.slice(0, 120)}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  Regtest Playground Seeder');
  console.log('════════════════════════════════════════');
  console.log('');

  const height = await rpc('metashrew_height', []).catch(() => null);
  if (!height) fail('Regtest node not running at ' + RPC_URL);
  ok(`Chain at block ${height}`);

  log('Loading WASM provider...');
  const provider = await loadProvider();
  ok('WASM provider ready');

  // Check deployer BTC balance and ensure coinbase UTXOs are mature
  const tapUtxos = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT).catch(() => []);
  const tapBal   = tapUtxos.reduce((s, u) => s + u.value, 0);
  log(`Deployer taproot: ${tapBal} sats (${tapUtxos.length} UTXOs)`);

  // JOURNAL (2026-04-17): At height 6492, regtest block subsidy ≈ 0 (43 halvings).
  // Mining blocks yields 0-sat coinbase outputs. All BTC in the deployer taproot comes
  // from transaction fees collected during the original deploy-regtest.sh run.
  // No coinbase mining needed — the existing taproot UTXOs are used directly for fees.

  console.log('');
  console.log('── Step 1: frBTC ────────────────────────');
  const frbtcBal = await ensureFrbtc(provider);

  console.log('');
  console.log('── Step 2: frSIGIL ──────────────────────');
  const sigilBal = await ensureFrSigil(provider);

  console.log('');
  console.log('── Step 3: AMM Pool ─────────────────────');
  await ensurePool(provider, sigilBal, frbtcBal);

  console.log('');
  console.log('── Step 4: Carbine CLOB Orders ──────────');
  // Fetch both balances in parallel — both are needed before seeding orders
  const [freshSigil, freshFrbtc] = await Promise.all([
    getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX),
    getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX),
  ]);
  await seedCarbineOrders(provider, freshSigil, freshFrbtc);

  console.log('');
  console.log('── Step 5: dxBTC Vault ──────────────────');
  // Reuse freshFrbtc — it was fetched after pool creation, still accurate
  await seedDxbtcVault(provider, freshFrbtc);

  console.log('');
  console.log('── Step 6: Fund User Wallet ─────────────');
  await fundUserWallet(provider, USER_WALLET);

  // ── Final Summary (all queries in parallel) ────────────────────────────────
  const [finalHeight, finalSigil, finalFrbtc, finalPools, finalOrdersSim, finalAssetsSim] =
    await Promise.all([
      rpc('metashrew_height', []),
      getAlkaneBalance(DEPLOYER_TAPROOT, SIGIL_BLOCK, SIGIL_TX),
      getAlkaneBalance(DEPLOYER_TAPROOT, FRBTC_BLOCK, FRBTC_TX),
      getNumPools(),
      simulate(CARBINE_BLOCK, CARBINE_TX, [25]).catch(() => null),
      simulate(DXBTC_BLOCK, DXBTC_TX, [11]).catch(() => null),
    ]);
  const finalOrders = Number(parseLeU128(finalOrdersSim?.execution?.data));
  const finalAssets = parseLeU128(finalAssetsSim?.execution?.data);

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  Playground Status');
  console.log('════════════════════════════════════════');
  console.log(`  Chain height:         ${finalHeight}`);
  console.log(`  frSIGIL [4:300]:      ${finalSigil}`);
  console.log(`  frBTC [32:0]:         ${finalFrbtc}`);
  console.log(`  AMM pools:            ${finalPools}`);
  console.log(`  Carbine orders:       ${finalOrders}`);
  console.log(`  dxBTC vault assets:   ${finalAssets}`);
  console.log('');
  console.log('  Contract map (regtest-local):');
  console.log(`  [${FACTORY_BLOCK}:${FACTORY_TX}]  AMM Factory Proxy`);
  console.log(`  [${CARBINE_BLOCK}:${CARBINE_TX}]   Carbine CLOB Controller`);
  console.log(`  [${DXBTC_BLOCK}:${DXBTC_TX}]   dxBTC Vault`);
  console.log(`  [4:256]       FIRE Token`);
  console.log(`  [4:300]       frSIGIL (test token)`);
  console.log(`  [32:0]        frBTC`);
  console.log('');
  if (!USER_WALLET) {
    console.log('  To fund your connected wallet:');
    console.log('  USER_WALLET=<your-taproot-addr> node scripts/seed-playground-regtest.cjs');
  } else {
    console.log(`  User wallet funded: ${USER_WALLET}`);
  }
  console.log('════════════════════════════════════════');
}

main().catch(e => { fail(String(e).slice(0, 120)); });
