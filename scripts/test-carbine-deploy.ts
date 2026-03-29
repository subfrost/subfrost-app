#!/usr/bin/env npx tsx
/**
 * Standalone script to test carbine controller deployment on devnet.
 * Runs outside vitest — no vite-plugin-wasm needed.
 *
 * Usage: npx tsx scripts/test-carbine-deploy.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bip32 = BIP32Factory(ecc);
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function loadWasm(name: string): Uint8Array | null {
  const paths = [
    resolve(__dirname, `../public/wasm/${name}.wasm`),
    resolve(__dirname, `../prod_wasms/${name}.wasm`),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      console.log(`[load] ${name}: ${p} (${(readFileSync(p).length / 1024).toFixed(0)} KB)`);
      return new Uint8Array(readFileSync(p));
    }
  }
  console.error(`[load] ${name}: NOT FOUND`);
  return null;
}

function loadIndexerWasm(name: string): Uint8Array | null {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  const paths = [
    resolve(home, `.local/qubitcoin/indexers/${name}/program.wasm`),
    resolve(__dirname, `../__tests__/devnet/fixtures/indexers/${name}.wasm`),
    resolve(__dirname, `../public/wasm/${name}.wasm`),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      console.log(`[load] ${name} indexer: ${p} (${(readFileSync(p).length / 1024).toFixed(0)} KB)`);
      return new Uint8Array(readFileSync(p));
    }
  }
  return null;
}

async function main() {
  console.log('=== Carbine Deployment Test ===\n');

  // Load indexer WASM
  const alkanesWasm = loadIndexerWasm('alkanes');
  if (!alkanesWasm) {
    console.error('FATAL: alkanes indexer WASM not found');
    process.exit(1);
  }
  const esploraWasm = loadIndexerWasm('esplora');

  // Derive coinbase key
  const seed = bip39.mnemonicToSeedSync(MNEMONIC);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/84'/1'/0'/0/0");
  const secretKey = new Uint8Array(child.privateKey!);

  // Import qubitcoin SDK
  const sdk = await import('@qubitcoin/sdk');
  console.log('[sdk] DevnetTestHarness available');

  // Create harness
  const harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    esploraWasm: esploraWasm ?? undefined,
    secretKey,
  });
  console.log('[harness] Created');

  harness.installFetchInterceptor();
  console.log('[harness] Fetch interceptor installed');

  // Mine initial blocks
  harness.mineBlocks(201);
  console.log('[harness] Mined 201 blocks, height:', harness.height);

  // Use handleRpc directly for simulation queries
  function rpcCall(method: string, params: any[]): any {
    const result = harness.server.handleRpc(JSON.stringify({
      jsonrpc: '2.0', method, params, id: 1,
    }));
    return JSON.parse(result);
  }

  function simulate(target: string, inputs: string[]): any {
    const [block, tx] = target.split(':');
    return rpcCall('alkanes_simulate', [{
      target: { block, tx },
      inputs,
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: String(harness.height),
      txindex: 0,
      vout: 0,
    }]);
  }

  // Check if carbine slot is empty
  console.log('\n--- Pre-deploy check ---');
  const preCheck = simulate('4:70000', ['24', '2', '0', '32', '0']);
  console.log('Carbine [4:70000] opcode 24:', preCheck?.result?.execution?.error || 'OK');

  // Load carbine WASM
  const carbineWasm = loadWasm('carbine_controller');
  const carbineTemplateWasm = loadWasm('carbine_template');
  const upgradeableWasm = loadWasm('alkanes_std_upgradeable');
  const upgradeableBeaconWasm = loadWasm('alkanes_std_upgradeable_beacon');
  const beaconProxyWasm = loadWasm('alkanes_std_beacon_proxy');

  if (!carbineWasm || !upgradeableWasm) {
    console.error('FATAL: Required WASMs not found');
    process.exit(1);
  }

  // Try deploying carbine directly (like e2e-all-protocols.test.ts does)
  console.log('\n--- Deploying carbine controller directly ---');

  // First, get addresses for deployment
  const bitcoin = await import('bitcoinjs-lib');
  bitcoin.initEccLib(ecc);
  const network = bitcoin.networks.regtest;

  const segwitChild = root.derivePath("m/84'/1'/0'/0/0");
  const taprootChild = root.derivePath("m/86'/1'/0'/0/0");
  const segwitPayment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(segwitChild.publicKey),
    network,
  });
  const xOnlyPubkey = Buffer.from(taprootChild.publicKey).slice(1);
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network,
  });
  const segwit = segwitPayment.address!;
  const taproot = taprootPayment.address!;
  console.log('[addresses] segwit:', segwit, 'taproot:', taproot);

  // Deploy using harness.deployContract() — bypasses WebProvider WASM import issues
  const implSlot = 80000;
  const proxySlot = 70000;

  // Step 1: Deploy carbine impl directly to slot
  console.log('[deploy] Step 1: Deploy carbine impl → [4:%d] (%d KB)', implSlot, carbineWasm!.length / 1024);
  try {
    harness.deployContract(carbineWasm!, implSlot, [50]);
    harness.mineBlocks(1);
    console.log('[deploy] Step 1 OK');
  } catch (e: any) {
    console.error('[deploy] Step 1 FAILED:', e?.message?.slice(0, 300));
  }

  // Check impl
  const implCheck = simulate(`4:${implSlot}`, ['50']);
  console.log('[check] Impl [4:%d] opcode 50:', implSlot, implCheck?.result?.execution?.error || 'OK');

  // Step 2: Deploy upgradeable proxy
  if (upgradeableWasm) {
    console.log('[deploy] Step 2: Deploy proxy → [4:%d] pointing to impl [4:%d]', proxySlot, implSlot);
    try {
      harness.deployContract(upgradeableWasm!, proxySlot, [0x7fff, 4, implSlot, 1]);
      harness.mineBlocks(1);
      console.log('[deploy] Step 2 OK');
    } catch (e: any) {
      console.error('[deploy] Step 2 FAILED:', e?.message?.slice(0, 300));
    }
  }

  // Final check
  console.log('\n--- Post-deploy check ---');
  const postCheck = simulate('4:70000', ['24', '2', '0', '32', '0']);
  console.log('Carbine [4:70000] opcode 24:', postCheck?.result?.execution?.error || 'data: ' + postCheck?.result?.execution?.data?.slice(0, 100));

  const postCheck2 = simulate('4:70000', ['25']);
  console.log('Carbine [4:70000] opcode 25:', postCheck2?.result?.execution?.error || 'data: ' + postCheck2?.result?.execution?.data?.slice(0, 100));

  harness.dispose();
  console.log('\n=== Done ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
