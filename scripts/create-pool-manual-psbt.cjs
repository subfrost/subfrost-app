#!/usr/bin/env node
/**
 * create-pool-manual-psbt.cjs
 *
 * Creates a frSIGIL/frBTC AMM pool on local regtest by manually constructing
 * a PSBT, bypassing the WASM provider's broken Lua UTXO resolution.
 *
 * PURPOSE / ROOT CAUSE
 * ====================
 * The @alkanes/ts-sdk WASM provider uses a Lua script (visible in debug logs as
 * "Batch UTXO balance fetching...") that calls alkanes_protorunesbyaddress and
 * then reads `outpoint_response.balances[]`. On this regtest node the response
 * uses `outpoint_response.runes[]` instead, so every alkane balance is read as
 * 0 — causing "Insufficient alkanes: need X of Y, have 0" on every call that
 * requires token inputs.
 *
 * STRATEGY (2026-04-17 revision)
 * ================================
 * The WASM provider CAN execute operations that don't require token inputs:
 *   - WASM deploy (alkanesExecuteFull with envelope): WORKS
 *   - frBTC wrap (BTC is the input, not alkanes): WORKS
 *
 * Steps:
 *   1. Check if frSIGIL exists at [4:300] OR [4:301] with live UTXOs
 *   2. If no live frSIGIL UTXOs → re-deploy fr_sigil.wasm to [4:301] (mints fresh tokens)
 *   3. Check frBTC balance; if needed → wrap BTC via signer address
 *   4. After steps 2-3, query alkanes_protorunesbyaddress and cross-check against esplora
 *      to find LIVE (unspent) alkane UTXOs
 *   5. Build manual PSBT using those live UTXOs + encode protostone OP_RETURN
 *   6. Sign with BIP32-derived keys (coinType=1) and broadcast
 *
 * PROTOSTONE ENCODING
 * ===================
 * The alkanes-rs Protostone encoding (from protorune-support/src/protostone.rs):
 *   Body = [protocol_tag=1, ...cellpack_values, pointer, refund_pointer]
 *   Each value encoded as LEB128 varint
 *   Body chunked into 16-byte (128-bit) pieces
 *   Each chunk stored as (tag=13, chunk_as_u128_LE) in the Runestone varint stream
 *
 * JOURNAL (2026-04-17):
 *   - Confirmed all alkane UTXOs from alkanes_protorunesbyaddress are spent (gettxout=null)
 *   - Root cause: prior deployWasm calls consumed alkane UTXOs as fee inputs (CLAUDE.md Alkane UTXO Model)
 *   - frSIGIL at [4:300] deployed OK but tokens are gone
 *   - Solution: re-deploy fr_sigil.wasm to [4:301] to get FRESH minted tokens
 *   - Must build PSBT IMMEDIATELY after token mint, before more deploy TXs consume them
 *   - Address: script 51203b82b2b2... IS the taproot address (tweaked key, not internal key)
 *   - bitcoinjs-lib v7 fromOutputScript doesn't decode SegWit v1 on regtest — use toBech32 directly
 *   - frBTC signer address: bcrt1pq7d9f59w72e582kgns8a0zd2kjktj8cqe2s034g4q9zjeerue97s6uuhpw
 *     (derived from opcode 103 data = 079a54d0...)
 *
 * JOURNAL (2026-04-17 — txid byte order bug):
 *   CRITICAL BUG FOUND AND FIXED: alkanes_protorunesbyaddress returns txids in WIRE byte order
 *   (reversed), but esplora_address::utxo returns txids in DISPLAY byte order (standard).
 *   The cross-check in getLiveAlkaneUtxos() was building liveSet from esplora (display order)
 *   and looking up keys built from proto txids (wire order) — they NEVER matched.
 *   Result: getLiveAlkaneUtxos() always returned {} even when both frSIGIL UTXOs were LIVE.
 *   Diagnosis: getrawtransaction("9218c0fc...") returned "No such mempool or blockchain tx"
 *   but the WASM deploy IS on-chain as "636758c3..." (reversed). gettxout confirmed UNSPENT.
 *   Fix: reverseHexTxid() converts wire-order txid to display-order before building candidates.
 *   Verification: esplora shows "636758c3...":0 val=546 (frSIGIL), "8694ffa5...":0 val=546 (older).
 *   Both frSIGIL UTXOs are LIVE — no need to re-deploy fr_sigil.wasm. [4:300] and [4:301] both
 *   have live token UTXOs sitting at the taproot address.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Dependencies ─────────────────────────────────────────────────────────────

const bitcoin = require('bitcoinjs-lib');
const ecc     = require('@bitcoinerlab/secp256k1');
const { BIP32Factory } = require('bip32');
const bip39   = require('bip39');

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL       = 'http://localhost:18888';
const BOOT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Deployer (coinType=1 from boot mnemonic — matches WASM provider internal keystore)
const DEPLOYER_TAPROOT = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';
const DEPLOYER_SEGWIT  = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
// throwaway address (prevents coinbase UTXOs cluttering deployer)
const THROWAWAY        = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

// fr_sigil.wasm path (154K — affordable to deploy)
const SIGIL_WASM_PATH = '/Users/erickdelgado/Documents/github/subfrost-appx/prod_wasms/fr_sigil.wasm';

// frSIGIL contract slots to try (primary, fallback slots in order)
const SIGIL_BLOCK = 4;
const SIGIL_SLOTS_TO_TRY = [300, 301, 302, 303, 304, 305]; // try these in order
const SIGIL_SUPPLY = '1000000000000000000'; // 10^18 units

// frBTC signer address (from opcode 103 GET_SIGNER on [32:0])
// Derived 2026-04-17: alkanes_simulate [32:0] inputs:['103'] returns 079a54d0...
// bitcoin.address.toBech32(Buffer.from('079a54d0...', 'hex'), 1, 'bcrt')
const FRBTC_SIGNER = 'bcrt1pq7d9f59w72e582kgns8a0zd2kjktj8cqe2s034g4q9zjeerue97s6uuhpw';
const FRBTC_BLOCK  = 32;
const FRBTC_TX     = 0;

// Factory proxy [4:65498] opcode 1 = CreateNewPool
const FACTORY_BLOCK = 4;
const FACTORY_TX    = 65498;

// Pool amounts (small amounts ensure no "balance underflow" from insufficient tokens)
const FRSIGIL_AMOUNT = BigInt('1000000000'); // 1e9
const FRBTC_AMOUNT   = BigInt('4975');       // ~5000 sats of frBTC

// BTC wrap amount per call
const WRAP_AMOUNT    = 10_000; // sats
const WRAP_REPEATS   = 2;

// Dust value for alkane outputs (SegWit-safe)
const DUST = 600;

// Bitcoin regtest network
const REGTEST = bitcoin.networks.regtest;

// ── Helpers ───────────────────────────────────────────────────────────────────

const log  = (m) => console.log(`[pool] ${m}`);
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

async function waitSync(maxWait = 120) {
  for (let i = 0; i < maxWait; i++) {
    const meta = await rpc('metashrew_height', []);
    const btc  = await rpc('getblockcount', []);
    if (Number(meta) >= Number(btc)) return;
    if (i % 10 === 0) log(`Sync: meta=${meta} btc=${btc}...`);
    await sleep(1000);
  }
  warn('Indexer sync timeout — proceeding');
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
    if (err.includes('unexpected end')) return false;
    return true;
  } catch {
    return false;
  }
}

// Mine a block to THROWAWAY to avoid polluting deployer with immature coinbase UTXOs
async function mineExternal(count) {
  await rpc('generatetoaddress', [count, THROWAWAY]);
  await sleep(300);
}

// ── Key Derivation ────────────────────────────────────────────────────────────
// coinType=1 to match WASM provider's internal keystore (CLAUDE.md coinType section)

function deriveKeys(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, REGTEST);

  // m/86'/1'/0'/0/0 → P2TR (taproot)
  const tapNode = root.derivePath("m/86'/1'/0'/0/0");
  const tapXOnly = tapNode.publicKey.slice(1); // 32-byte x-only internal key
  const p2tr = bitcoin.payments.p2tr({ internalPubkey: tapXOnly, network: REGTEST });

  // m/84'/1'/0'/0/0 → P2WPKH (segwit)
  const segNode = root.derivePath("m/84'/1'/0'/0/0");
  const p2wpkh  = bitcoin.payments.p2wpkh({ pubkey: segNode.publicKey, network: REGTEST });

  // Tweaked private key for P2TR key-spend Schnorr signing (BIP341)
  const tweak = bitcoin.crypto.taggedHash('TapTweak', tapXOnly);
  const tweakedPrivkey = ecc.privateAdd(tapNode.privateKey, tweak) || tapNode.privateKey;

  return {
    taproot: {
      xOnly: tapXOnly,
      address: p2tr.address,
      script: p2tr.output,        // OP_1 + push32 + tweaked_key
      privateKey: tapNode.privateKey,
      tweakedPrivkey,
    },
    segwit: {
      pubkey: segNode.publicKey,
      address: p2wpkh.address,
      script: p2wpkh.output,
      privateKey: segNode.privateKey,
    },
  };
}

// ── Alkane UTXO discovery ─────────────────────────────────────────────────────
// Parses alkanes_protorunesbyaddress runes[] format (this node uses runes[], not balances[])
// Cross-checks against esplora to return ONLY live (unspent) UTXOs.
//
// CRITICAL: alkanes_protorunesbyaddress returns txids in WIRE (reversed) byte order.
// esplora_address::utxo returns txids in DISPLAY (standard) byte order.
// We must reverse the txids from the protorune indexer before comparing.
// Example: proto returns "9218c0fc361d6507..." → display is "636758c3001aecc6..."
// JOURNAL (2026-04-17): This was the root cause of "live balance = 0" — the
// cross-check was always failing because of this byte-order mismatch.

function reverseHexTxid(txid) {
  // Reverse the byte order of a 64-hex-char txid string
  return Buffer.from(txid, 'hex').reverse().toString('hex');
}

async function getLiveAlkaneUtxos(address) {
  // Step 1: Get all alkane outpoints from protorune indexer
  const protoResult = await rpc('alkanes_protorunesbyaddress', [{
    address,
    protocolTag: '1',
  }]);

  const candidates = {}; // "displayTxid:vout" → { txid (display), vout, value, script, alkanes }
  for (const entry of (protoResult?.outpoints || [])) {
    const { txid: wireTxid, vout } = entry.outpoint;
    const { value, script } = entry.output;
    // Reverse wire-order txid to display-order (matching esplora format)
    const txid = reverseHexTxid(wireTxid);
    const key = `${txid}:${vout}`;
    const alkanes = (entry.runes || []).map(r => ({
      block:  parseInt(r.rune.id.block, 16),
      tx:     parseInt(r.rune.id.tx,    16),
      amount: BigInt(r.balance),
      name:   r.rune.name,
    }));
    if (alkanes.length > 0) {
      candidates[key] = { txid, vout, value, script, alkanes };
    }
  }

  // Step 2: Cross-check against esplora to keep only UNSPENT UTXOs
  // esplora returns txids in display (standard) byte order — now matches our candidates
  const esploraResult = await rpc('esplora_address::utxo', [address]);
  const liveSet = new Set((esploraResult || []).map(u => `${u.txid}:${u.vout}`));

  const live = {};
  for (const [key, utxo] of Object.entries(candidates)) {
    if (liveSet.has(key)) {
      live[key] = utxo;
    }
  }

  return live;
}

// Get alkane balance for a specific token across live UTXOs
function getAlkaneBalance(liveUtxos, block, tx) {
  let total = BigInt(0);
  for (const utxo of Object.values(liveUtxos)) {
    for (const a of utxo.alkanes) {
      if (a.block === block && a.tx === tx) {
        total += a.amount;
      }
    }
  }
  return total;
}

// Find UTXOs holding at least minAmount of a specific alkane
function findAlkaneUtxos(liveUtxos, block, tx, minAmount) {
  const results = [];
  for (const utxo of Object.values(liveUtxos)) {
    const match = utxo.alkanes.find(a => a.block === block && a.tx === tx);
    if (match && match.amount >= minAmount) {
      results.push({ ...utxo, matchedAmount: match.amount });
    }
  }
  return results;
}

// ── Varint (LEB128) encoding ──────────────────────────────────────────────────

function encodeVarint(n) {
  let v = BigInt(n);
  const bytes = [];
  if (v === 0n) return Buffer.from([0]);
  while (v > 0x7fn) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

// ── Protostone OP_RETURN encoder ──────────────────────────────────────────────
//
// Implements the alkanes-rs Protostone→Runestone encoding:
//   From protorune-support/src/protostone.rs:
//     encode() = [protocol_tag, ...message_fields, pointer, refund_pointer]
//   From runestone.rs:
//     The body is LEB128-encoded as a byte stream, then chunked into 16-byte u128s.
//     Each chunk is stored as (tag=13, chunk_as_u128_LE) in the Runestone varint stream.
//
// Wire format: OP_RETURN OP_13 <varint_stream>
// varint_stream = interleaved (tag, value) pairs
// tag=13 repeated once per 16-byte chunk of the protostone body.

function buildAlkanesOpReturn(cellpackValues, pointer, refundPointer) {
  // Protostone body = [protocolTag=1, ...cellpack, pointer, refundPointer]
  const bodyValues = [
    BigInt(1), // alkanes protocol tag
    ...cellpackValues.map(v => BigInt(v)),
    BigInt(pointer),
    BigInt(refundPointer),
  ];

  // Encode body as concatenated LEB128 varints
  const bodyBytes = Buffer.concat(bodyValues.map(v => encodeVarint(v)));

  // Pad body to multiple of 16 bytes
  const padLen = (16 - (bodyBytes.length % 16)) % 16;
  const padded = Buffer.concat([bodyBytes, Buffer.alloc(padLen, 0)]);
  const numChunks = padded.length / 16;

  // Build runestone varint stream: (tag=13, chunk_value) pairs
  const pairBuffers = [];
  for (let i = 0; i < numChunks; i++) {
    const chunk = padded.slice(i * 16, (i + 1) * 16);
    // Interpret chunk as little-endian u128
    let val = BigInt(0);
    for (let b = 15; b >= 0; b--) {
      val = (val << BigInt(8)) | BigInt(chunk[b]);
    }
    pairBuffers.push(encodeVarint(BigInt(13))); // tag
    pairBuffers.push(encodeVarint(val));          // value
  }

  const varintStream = Buffer.concat(pairBuffers);

  // OP_RETURN (0x6a) OP_13 (0x5d) <push(varintStream)>
  return bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,
    bitcoin.opcodes.OP_13,
    varintStream,
  ]);
}

// ── Manual PSBT signing ────────────────────────────────────────────────────────
// Signs P2TR inputs via Schnorr key-spend path and P2WPKH via ECDSA.
// P2TR finalization MUST use finalizeTaprootInput (not finalizeAllInputs).

function signPsbtManually(psbt, keys) {
  const tapScript  = Buffer.from(keys.taproot.script);
  const segScript  = Buffer.from(keys.segwit.script);
  const tweakedPriv = keys.taproot.tweakedPrivkey;
  const segPrivKey  = keys.segwit.privateKey;

  const tapInputIndices = [];

  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (!input.witnessUtxo) { warn(`Input ${i} missing witnessUtxo`); continue; }

    const scriptHex    = Buffer.from(input.witnessUtxo.script).toString('hex');
    const tapScriptHex = tapScript.toString('hex');
    const segScriptHex = segScript.toString('hex');

    if (scriptHex === tapScriptHex) {
      try {
        psbt.signTaprootInput(i, {
          publicKey: Buffer.from(ecc.pointFromScalar(tweakedPriv, true)),
          sign:        (hash)        => Buffer.from(ecc.signSchnorr(hash, tweakedPriv)),
          signSchnorr: (hash)        => Buffer.from(ecc.signSchnorr(hash, tweakedPriv)),
        });
        tapInputIndices.push(i);
        log(`  Input ${i}: signed taproot`);
      } catch (e) {
        warn(`  Input ${i}: taproot sign failed: ${e.message}`);
      }
    } else if (scriptHex === segScriptHex) {
      try {
        psbt.signInput(i, {
          publicKey: Buffer.from(keys.segwit.pubkey),
          sign: (hash) => Buffer.from(ecc.sign(hash, segPrivKey)),
        });
        log(`  Input ${i}: signed segwit`);
      } catch (e) {
        warn(`  Input ${i}: segwit sign failed: ${e.message}`);
      }
    } else {
      warn(`  Input ${i}: unknown script ${scriptHex.slice(0, 20)}`);
    }
  }

  // Finalize: taproot inputs use finalizeTaprootInput
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    try {
      if (tapInputIndices.includes(i)) {
        psbt.finalizeTaprootInput(i);
        log(`  Input ${i}: finalized taproot`);
      } else {
        psbt.finalizeInput(i);
        log(`  Input ${i}: finalized segwit`);
      }
    } catch (e) {
      warn(`  Input ${i}: finalize failed: ${e.message}`);
    }
  }

  return psbt;
}

// ── PSBT builder + broadcaster ────────────────────────────────────────────────

async function buildAndBroadcastPoolTx(keys, sigilUtxo, frbtcUtxo, feeUtxos, sigilBlock, sigilSlot) {
  const tapScript = Buffer.from(keys.taproot.script);
  const tapXOnly  = keys.taproot.xOnly;

  // Helper: add a P2TR input (bitcoinjs-lib v7 requires BigInt value)
  function addTapInput(psbt, txid, vout, valueSats) {
    psbt.addInput({
      hash:         txid,
      index:        vout,
      witnessUtxo:  { script: tapScript, value: BigInt(valueSats) },
      tapInternalKey: tapXOnly,
    });
  }

  const psbt = new bitcoin.Psbt({ network: REGTEST });

  // Inputs: frSIGIL, frBTC, fee UTXOs
  addTapInput(psbt, sigilUtxo.txid, sigilUtxo.vout, sigilUtxo.value);
  addTapInput(psbt, frbtcUtxo.txid, frbtcUtxo.vout, frbtcUtxo.value);
  for (const u of feeUtxos) {
    addTapInput(psbt, u.txid, u.vout, u.value);
  }

  const totalInput = sigilUtxo.value + frbtcUtxo.value +
    feeUtxos.reduce((s, u) => s + u.value, 0);

  // Output 0: alkane change at DEPLOYER_TAPROOT (LP tokens land here; protostone pointer=0)
  psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(DUST) });

  // Output 1: OP_RETURN protostone
  // Cellpack: [factory_block, factory_tx, opcode=1, tokenA_block, tokenA_tx, tokenB_block, tokenB_tx, amtA, amtB]
  const cellpack = [
    FACTORY_BLOCK, FACTORY_TX, 1,
    sigilBlock, sigilSlot,
    FRBTC_BLOCK, FRBTC_TX,
    FRSIGIL_AMOUNT, FRBTC_AMOUNT,
  ];
  const opReturnScript = buildAlkanesOpReturn(cellpack, 0, 0);
  psbt.addOutput({ script: opReturnScript, value: BigInt(0) });

  // Output 2: BTC change
  const estimatedFee  = 3000; // generous for ~4-input tx
  const changeValue   = totalInput - DUST - estimatedFee;
  if (changeValue >= 546) {
    psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(changeValue) });
  }

  log(`PSBT built: ${psbt.data.inputs.length} inputs, ${psbt.txOutputs.length} outputs`);
  log(`  Input total:   ${totalInput} sats`);
  log(`  Alkane output: ${DUST} sats`);
  log(`  Estimated fee: ${estimatedFee} sats`);
  log(`  Change:        ${changeValue >= 546 ? changeValue : 0} sats`);

  // Sign
  log('Signing...');
  signPsbtManually(psbt, keys);

  // Extract tx and broadcast
  const tx  = psbt.extractTransaction();
  const hex = tx.toHex();
  log(`Signed tx: ${hex.length / 2} bytes`);

  log('Broadcasting...');
  let txid;
  try {
    txid = await rpc('sendrawtransaction', [hex]);
    ok(`Broadcast: ${txid}`);
  } catch (e) {
    warn(`sendrawtransaction failed: ${e.message}`);
    // Retry with maxfeerate=0 to bypass fee checks
    try {
      txid = await rpc('sendrawtransaction', [hex, 0]);
      ok(`Broadcast (maxfeerate=0): ${txid}`);
    } catch (e2) {
      fail(`Broadcast failed: ${e2.message}`);
    }
  }
  return txid;
}

// ── Factory initialization check + manual init PSBT ────────────────────────
// Checks if the factory has been initialized by simulating opcode 1 (CreateNewPool).
// If it returns "failed to fill whole buffer", the factory was never initialized.
// JOURNAL (2026-04-17): deploy-amm-wasm-regtest.cjs hardcodes auth token [2:4] but
// our factory proxy minted [2:26]. The deploy script found no matching token and silently
// skipped InitFactory. We detect uninitialized factory here and call it manually.
//
// InitFactory (opcode 0) args: beacon_proxy_template_block, beacon_proxy_template_tx,
//                               beacon_block, beacon_tx
// MUST be called with factory auth token [2:N] as incomingAlkanes.

async function isFactoryInitialized() {
  const r = await rpc('alkanes_simulate', [{
    target: { block: String(FACTORY_BLOCK), tx: String(FACTORY_TX) },
    inputs: ['1', '4', '300', '32', '0', '1000000000', '4975'],
    alkanes: [
      { id: { block: '4', tx: '300' }, value: '1000000000' },
      { id: { block: '32', tx: '0' }, value: '4975' },
    ],
    transaction: '0x',
    block: '0x',
    height: '1',
    txindex: 0,
    vout: 0,
  }]).catch(() => null);
  const error = r?.execution?.error;
  // "failed to fill whole buffer" = uninitialized. Other errors = might be initialized.
  if (!error) return true;
  if (error.includes('fill whole buffer')) return false;
  return true; // other errors (e.g. balance underflow) = initialized but missing tokens
}

async function buildAndBroadcastInitFactoryTx(keys, authUtxo, authBlock, authTx, feeUtxos) {
  // Slots from CLAUDE.md: BEACON_PROXY_TEMPLATE=[4:781000], UPGRADEABLE_BEACON=[4:65499]
  const BEACON_PROXY_TEMPLATE_BLOCK = 4, BEACON_PROXY_TEMPLATE_TX = 781000;
  const UPGRADEABLE_BEACON_BLOCK = 4, UPGRADEABLE_BEACON_TX = 65499;

  const tapScript = Buffer.from(keys.taproot.script);
  const tapXOnly  = keys.taproot.xOnly;

  function addTapInput(psbt, txid, vout, valueSats) {
    psbt.addInput({
      hash:           txid,
      index:          vout,
      witnessUtxo:    { script: tapScript, value: BigInt(valueSats) },
      tapInternalKey: tapXOnly,
    });
  }

  const psbt = new bitcoin.Psbt({ network: REGTEST });

  // Input 0: auth token UTXO (carries [2:authTx] token)
  addTapInput(psbt, authUtxo.txid, authUtxo.vout, authUtxo.value);
  // Fee inputs
  for (const u of feeUtxos) {
    addTapInput(psbt, u.txid, u.vout, u.value);
  }

  const totalInput = authUtxo.value + feeUtxos.reduce((s, u) => s + u.value, 0);

  // Output 0: alkane change (auth token returns here after init; pointer=0)
  psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(DUST) });

  // Output 1: InitFactory protostone
  // Cellpack: [factory_block, factory_tx, 0, pool_factory_id, beacon_id_block, beacon_id_tx]
  //
  // InitFactory(pool_factory_id: u128, beacon_id: AlkaneId) signature:
  //   pool_factory_id = BEACON_PROXY_TEMPLATE TX slot (u128) — factory uses this to deploy new pools
  //                     at target {block:6, tx:pool_factory_id}
  //   beacon_id       = UPGRADEABLE_BEACON AlkaneId — factory calls beacon to get pool logic address
  //
  // CRITICAL: the deserialization reads args SEQUENTIALLY as:
  //   pool_factory_id = single u128 → consumes first arg after opcode
  //   beacon_id.block = u128 → second arg
  //   beacon_id.tx    = u128 → third arg
  //
  // So cellpack args after opcode: [BEACON_PROXY_TEMPLATE_TX, UPGRADEABLE_BEACON_BLOCK, UPGRADEABLE_BEACON_TX]
  // = [781000, 4, 65499]
  // JOURNAL (2026-04-17): Previous bug sent [4, 781000, 4, 65499] which deserialized as
  //   pool_factory_id=4, beacon_id={block:781000, tx:4} — completely wrong.
  //   This stored beacon_id={781000:4} which doesn't exist, causing "fill whole buffer"
  //   when create_new_pool tried to call that non-existent beacon.
  const cellpack = [
    FACTORY_BLOCK, FACTORY_TX, 0,
    BEACON_PROXY_TEMPLATE_TX,          // pool_factory_id (u128) = 781000
    UPGRADEABLE_BEACON_BLOCK,           // beacon_id.block = 4
    UPGRADEABLE_BEACON_TX,              // beacon_id.tx = 65499
  ];
  const opReturnScript = buildAlkanesOpReturn(cellpack, 0, 0);
  psbt.addOutput({ script: opReturnScript, value: BigInt(0) });

  // Output 2: BTC change
  const estimatedFee = 2000;
  const changeValue  = totalInput - DUST - estimatedFee;
  if (changeValue >= 546) {
    psbt.addOutput({ address: DEPLOYER_TAPROOT, value: BigInt(changeValue) });
  }

  log(`InitFactory PSBT: ${psbt.data.inputs.length} inputs, ${psbt.txOutputs.length} outputs`);
  log(`  Auth token: [${authBlock}:${authTx}] from ${authUtxo.txid.slice(0, 20)}:${authUtxo.vout}`);

  log('Signing InitFactory TX...');
  signPsbtManually(psbt, keys);

  const tx  = psbt.extractTransaction();
  const hex = tx.toHex();
  log(`Signed InitFactory tx: ${hex.length / 2} bytes`);

  log('Broadcasting InitFactory...');
  let txid;
  try {
    txid = await rpc('sendrawtransaction', [hex]);
    ok(`InitFactory broadcast: ${txid}`);
  } catch (e) {
    try {
      txid = await rpc('sendrawtransaction', [hex, 0]);
      ok(`InitFactory broadcast (maxfeerate=0): ${txid}`);
    } catch (e2) {
      fail(`InitFactory broadcast failed: ${e2.message}`);
    }
  }
  return txid;
}

// ── Pool count helper ─────────────────────────────────────────────────────────

async function getNumPools() {
  const r = await rpc('alkanes_simulate', [{
    target: { block: String(FACTORY_BLOCK), tx: String(FACTORY_TX) },
    inputs: ['4'],
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '1',
    txindex: 0,
    vout: 0,
  }]).catch(() => null);
  const data = r?.execution?.data;
  if (!data || data === '0x') return 0;
  const bytes = Buffer.from(data.slice(2), 'hex');
  let n = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << BigInt(8)) | BigInt(bytes[i]);
  return Number(n);
}

async function findPoolId(sigilBlock, sigilSlot) {
  for (const order of [[sigilBlock, sigilSlot, FRBTC_BLOCK, FRBTC_TX], [FRBTC_BLOCK, FRBTC_TX, sigilBlock, sigilSlot]]) {
    try {
      const r = await rpc('alkanes_simulate', [{
        target: { block: String(FACTORY_BLOCK), tx: String(FACTORY_TX) },
        inputs: ['2', ...order.map(String)],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '1',
        txindex: 0,
        vout: 0,
      }]);
      const d = r?.execution?.data?.slice(2);
      if (d && d.length >= 64) {
        const b = Buffer.from(d, 'hex');
        let pBlock = BigInt(0), pTx = BigInt(0);
        for (let i = 15; i >= 0; i--) pBlock = (pBlock << BigInt(8)) | BigInt(b[i]);
        for (let i = 31; i >= 16; i--) pTx = (pTx << BigInt(8)) | BigInt(b[i]);
        if (pBlock > 0n) return `${pBlock}:${pTx}`;
      }
    } catch {}
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('=== create-pool-manual-psbt.cjs ===');
  log('Workaround for WASM Lua reading .balances[] instead of .runes[]');
  log('');

  // ── Load WASM provider ─────────────────────────────────────────────────────
  log('Loading WASM provider...');
  const loaderPaths = [
    path.resolve(__dirname, '../node_modules/.pnpm/@alkanes+ts-sdk@https+++pkg.alkanes.build+dist+@alkanes+ts-sdk+v=0.1.5-14a5493_@types+node@20.19.37/node_modules/@alkanes/ts-sdk/wasm/node-loader.cjs'),
    path.resolve(__dirname, '../node_modules/@alkanes/ts-sdk/wasm/node-loader.cjs'),
  ];
  let loader = null;
  for (const lp of loaderPaths) {
    if (fs.existsSync(lp)) { loader = require(lp); break; }
  }
  if (!loader) fail('Cannot find @alkanes/ts-sdk node-loader.cjs');

  const bindings = await loader.init();
  const provider = new bindings.WebProvider('subfrost-regtest', {
    jsonrpc_url: RPC_URL,
    data_api_url: RPC_URL,
  });
  provider.walletLoadMnemonic(BOOT_MNEMONIC, null);
  ok('WASM provider ready');

  // ── Derive keys ────────────────────────────────────────────────────────────
  const keys = deriveKeys(BOOT_MNEMONIC);
  if (keys.taproot.address !== DEPLOYER_TAPROOT) {
    fail(`Taproot address mismatch! Got ${keys.taproot.address}`);
  }
  ok(`Keys verified — taproot: ${keys.taproot.address}`);

  // ── Chain state ────────────────────────────────────────────────────────────
  const height = await rpc('metashrew_height', []);
  ok(`Chain at block ${height}`);

  // ── Check factory initialization ──────────────────────────────────────────
  // JOURNAL (2026-04-17): deploy-amm-wasm-regtest.cjs uses hardcoded auth token [2:4].
  // Our factory proxy minted [2:26]. Deploy script silently skipped InitFactory.
  // We detect this via CreateNewPool simulation returning "fill whole buffer" error.
  log('Checking factory initialization...');
  const factoryInitialized = await isFactoryInitialized();
  if (!factoryInitialized) {
    warn('Factory NOT initialized. Sending InitFactory (opcode 0) with auth token...');

    // Find factory auth token [2:N] among live UTXOs
    let liveUtxosForInit = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);
    let authUtxo = null, authBlock = null, authTxId = null;
    for (const [key, u] of Object.entries(liveUtxosForInit)) {
      for (const a of u.alkanes) {
        if (a.block === 2) { // auth tokens are at block 2
          // Factory proxy auth token = [2:26] (from factory proxy deployment)
          authUtxo = u;
          authBlock = a.block;
          authTxId  = a.tx;
          log(`  Found auth token [${a.block}:${a.tx}] at ${key}`);
          break;
        }
      }
      if (authUtxo) break;
    }

    if (!authUtxo) {
      fail('No factory auth token [2:N] found in live UTXOs. Cannot initialize factory.');
    }

    // Fee UTXOs for the init TX
    const alkaneKeys     = new Set(Object.keys(liveUtxosForInit));
    const allTapUtxosInit = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
    const feeUtxosInit   = allTapUtxosInit
      .filter(u => u.status?.confirmed)
      .filter(u => !alkaneKeys.has(`${u.txid}:${u.vout}`))
      .filter(u => u.value >= 2000)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2);

    if (feeUtxosInit.length === 0) fail('No fee UTXOs for InitFactory TX');

    const initTxid = await buildAndBroadcastInitFactoryTx(keys, authUtxo, authBlock, authTxId, feeUtxosInit);

    log('Mining block to confirm InitFactory...');
    await mineExternal(1);
    await waitSync();

    // Verify initialization
    const isNowInit = await isFactoryInitialized();
    if (isNowInit) {
      ok('Factory initialized successfully!');
    } else {
      warn(`Factory still not initialized after init TX ${initTxid}.`);
      warn('The auth token may not have been accepted. Proceeding anyway...');
    }
  } else {
    ok('Factory already initialized');
  }

  // ── Check factory ──────────────────────────────────────────────────────────
  const initialPools = await getNumPools();
  ok(`Factory [${FACTORY_BLOCK}:${FACTORY_TX}] has ${initialPools} pool(s)`);

  // Check if pool already exists (try all known slots)
  for (const slot of SIGIL_SLOTS_TO_TRY) {
    const existing = await findPoolId(SIGIL_BLOCK, slot);
    if (existing) {
      ok(`Pool [${SIGIL_BLOCK}:${slot}]/[${FRBTC_BLOCK}:${FRBTC_TX}] already exists: ${existing}`);
      printSummary(existing, initialPools, height, SIGIL_BLOCK, slot);
      return;
    }
  }

  // ── Determine which frSIGIL slot to use ────────────────────────────────────
  let sigilSlot = null;

  // Check live UTXOs for all known slots
  log('\nChecking live alkane UTXOs...');
  let liveUtxos = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);
  log(`Live alkane UTXOs: ${Object.keys(liveUtxos).length}`);
  for (const [key, u] of Object.entries(liveUtxos)) {
    for (const a of u.alkanes) {
      log(`  ${key}  [${a.block}:${a.tx}] ${a.name}  bal=${a.amount}`);
    }
  }

  for (const slot of SIGIL_SLOTS_TO_TRY) {
    const bal = getAlkaneBalance(liveUtxos, SIGIL_BLOCK, slot);
    if (bal >= FRSIGIL_AMOUNT) {
      sigilSlot = slot;
      ok(`Live frSIGIL at [${SIGIL_BLOCK}:${slot}]: balance=${bal}`);
      break;
    }
  }

  // ── Step 1: Ensure frSIGIL tokens exist in live UTXOs ────────────────────
  if (sigilSlot === null) {
    log('\n── Step 1: Mint fresh frSIGIL ──');

    // Find first available (empty) slot
    let freshSlot = null;
    for (const slot of SIGIL_SLOTS_TO_TRY) {
      const deployed = await isSlotDeployed(SIGIL_BLOCK, slot);
      if (!deployed) { freshSlot = slot; break; }
    }

    if (freshSlot === null) {
      warn('All known frSIGIL slots are deployed but have no live tokens.');
      fail(`No live frSIGIL tokens and no empty slot (tried ${SIGIL_SLOTS_TO_TRY.join(', ')}). Extend SIGIL_SLOTS_TO_TRY array.`);
    }

    if (!fs.existsSync(SIGIL_WASM_PATH)) {
      fail(`fr_sigil.wasm not found at ${SIGIL_WASM_PATH}\nRun: node scripts/deploy-test-token-regtest.cjs`);
    }

    log(`Deploying fr_sigil.wasm → [${SIGIL_BLOCK}:${freshSlot}] (initializes with ${SIGIL_SUPPLY} tokens)...`);
    const wasmHex = Buffer.from(fs.readFileSync(SIGIL_WASM_PATH)).toString('hex');

    // alkanesExecuteFull for WASM deploy: this does NOT require alkane inputs — WORKS despite Lua bug
    try {
      await provider.alkanesExecuteFull(
        JSON.stringify([DEPLOYER_TAPROOT]),
        'B:200000:v0',
        `[3,${freshSlot},0,${SIGIL_SUPPLY}]:v0:v0`,
        '2',
        wasmHex,
        JSON.stringify({
          from_addresses: [DEPLOYER_SEGWIT, DEPLOYER_TAPROOT],
          change_address: DEPLOYER_SEGWIT,
          alkanes_change_address: DEPLOYER_TAPROOT,
          mine_enabled: true,
        }),
      );
    } catch (e) {
      fail(`frSIGIL deploy failed: ${e?.message || e}`);
    }

    await sleep(3000);
    await waitSync();
    ok(`frSIGIL deployed to [${SIGIL_BLOCK}:${freshSlot}]`);
    sigilSlot = freshSlot;

    // Refresh live UTXOs after deploy
    liveUtxos = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);
    const newBal = getAlkaneBalance(liveUtxos, SIGIL_BLOCK, sigilSlot);
    log(`frSIGIL [${SIGIL_BLOCK}:${sigilSlot}] live balance: ${newBal}`);
    if (newBal < FRSIGIL_AMOUNT) {
      warn(`frSIGIL balance (${newBal}) < required (${FRSIGIL_AMOUNT})`);
      warn('The deploy TX mints tokens; they may need another block to be indexed.');
      await mineExternal(1);
      await waitSync();
      liveUtxos = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);
      const newBal2 = getAlkaneBalance(liveUtxos, SIGIL_BLOCK, sigilSlot);
      if (newBal2 < FRSIGIL_AMOUNT) {
        fail(`frSIGIL still insufficient: ${newBal2}. Check if deploy TX confirmed and minted tokens.`);
      }
    }
  }

  // ── Step 2: Ensure frBTC tokens exist in live UTXOs ───────────────────────
  log('\n── Step 2: Ensure frBTC ──');
  let frbtcBal = getAlkaneBalance(liveUtxos, FRBTC_BLOCK, FRBTC_TX);
  log(`frBTC live balance: ${frbtcBal}`);

  if (frbtcBal < FRBTC_AMOUNT) {
    log(`Wrapping BTC → frBTC (${WRAP_REPEATS}x ${WRAP_AMOUNT} sats)...`);
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
        await waitSync(30);
        ok(`frBTC wrap ${i + 1}/${WRAP_REPEATS} done`);
      } catch (e) {
        warn(`frBTC wrap ${i + 1} failed: ${e?.message || e}`);
      }
    }

    // Refresh UTXOs
    liveUtxos = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);
    frbtcBal = getAlkaneBalance(liveUtxos, FRBTC_BLOCK, FRBTC_TX);
    log(`frBTC live balance after wraps: ${frbtcBal}`);
  }

  if (frbtcBal < FRBTC_AMOUNT) {
    fail(`frBTC balance (${frbtcBal}) < required (${FRBTC_AMOUNT}). wraps may have failed.`);
  }
  ok(`frBTC ready: ${frbtcBal} (need ${FRBTC_AMOUNT})`);

  // ── Step 3: Select UTXOs for the pool creation PSBT ──────────────────────
  log('\n── Step 3: Build pool creation PSBT ──');

  // Refresh once more to ensure we have the latest state
  liveUtxos = await getLiveAlkaneUtxos(DEPLOYER_TAPROOT);

  const sigilUtxos = findAlkaneUtxos(liveUtxos, SIGIL_BLOCK, sigilSlot, FRSIGIL_AMOUNT);
  const frbtcUtxos = findAlkaneUtxos(liveUtxos, FRBTC_BLOCK, FRBTC_TX, FRBTC_AMOUNT);

  if (sigilUtxos.length === 0) fail(`No live frSIGIL UTXO with balance >= ${FRSIGIL_AMOUNT}`);
  if (frbtcUtxos.length === 0) fail(`No live frBTC UTXO with balance >= ${FRBTC_AMOUNT}`);

  const sigilUtxo = sigilUtxos[0];
  const frbtcUtxo = frbtcUtxos[0];

  log(`frSIGIL UTXO: ${sigilUtxo.txid}:${sigilUtxo.vout} value=${sigilUtxo.value} bal=${sigilUtxo.matchedAmount}`);
  log(`frBTC UTXO:   ${frbtcUtxo.txid}:${frbtcUtxo.vout} value=${frbtcUtxo.value} bal=${frbtcUtxo.matchedAmount}`);

  // Fee UTXOs: confirmed taproot UTXOs NOT in the alkane set, value >= 2000 sats
  const alkaneKeys  = new Set(Object.keys(liveUtxos));
  const allTapUtxos = await provider.esploraGetAddressUtxo(DEPLOYER_TAPROOT);
  const feeUtxos    = allTapUtxos
    .filter(u => u.status?.confirmed)
    .filter(u => !alkaneKeys.has(`${u.txid}:${u.vout}`))
    .filter(u => u.value >= 2000)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2); // just a couple large UTXOs for fees

  if (feeUtxos.length === 0) fail('No confirmed non-alkane taproot UTXOs for fees');
  log(`Fee UTXOs: ${feeUtxos.length} × [${feeUtxos.map(u => u.value).join(', ')}] sats`);

  // ── Step 4: Build, sign, broadcast ────────────────────────────────────────
  const txid = await buildAndBroadcastPoolTx(keys, sigilUtxo, frbtcUtxo, feeUtxos, SIGIL_BLOCK, sigilSlot);

  // Mine to confirm
  log('Mining block to confirm...');
  await mineExternal(1);
  await waitSync();

  // ── Step 5: Verify pool was created ───────────────────────────────────────
  const finalPools = await getNumPools();
  const poolId     = await findPoolId(SIGIL_BLOCK, sigilSlot);

  if (finalPools > initialPools || poolId) {
    ok(`Pool count: ${initialPools} → ${finalPools}`);
    if (poolId) {
      ok(`Pool ID: ${poolId}`);
    } else {
      warn('Pool count increased but ID lookup returned null — check factory opcode 2 with both pair orders');
    }
    printSummary(poolId || 'unknown', finalPools, await rpc('metashrew_height', []), SIGIL_BLOCK, sigilSlot);
  } else {
    warn(`Pool count unchanged (${finalPools}). Tx was broadcast but pool was not created.`);
    warn('Possible causes:');
    warn('  1. Protostone encoding was not accepted (OP_RETURN format mismatch)');
    warn('  2. Factory execution reverted (wrong cellpack args or token amounts)');
    warn('  3. Tokens did not reach the factory as incomingAlkanes');
    warn(`  Tx: ${txid}`);
    log('');
    log(`Debug: alkanes_trace at ${RPC_URL}`);
    log(`  curl -s -X POST ${RPC_URL} -H 'Content-Type: application/json' \\`);
    log(`    -d '{"jsonrpc":"2.0","method":"alkanes_trace","params":["${txid}",0],"id":1}'`);
    log('');
    log('Alternative: run deploy-test-token-regtest.cjs which uses alkanesExecuteFull for pool creation.');
    log('If the Lua bug is fixed in the WASM version, that script will handle everything.');
  }
}

function printSummary(poolId, poolCount, height, sigilBlock, sigilSlot) {
  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  frSIGIL/frBTC Pool Summary');
  console.log('════════════════════════════════════════════');
  console.log(`  Chain height:  ${height}`);
  console.log(`  Total pools:   ${poolCount}`);
  console.log(`  Pool ID:       ${poolId}`);
  console.log(`  frSIGIL:       [${sigilBlock}:${sigilSlot}]`);
  console.log(`  frBTC:         [${FRBTC_BLOCK}:${FRBTC_TX}]`);
  console.log(`  frSIGIL amt:   ${FRSIGIL_AMOUNT}`);
  console.log(`  frBTC amt:     ${FRBTC_AMOUNT}`);
  console.log(`  Factory:       [${FACTORY_BLOCK}:${FACTORY_TX}]`);
  console.log('════════════════════════════════════════════');
}

main().catch(e => {
  fail(e.stack || e.message);
});
