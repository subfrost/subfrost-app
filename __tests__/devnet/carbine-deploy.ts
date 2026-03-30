/**
 * Carbine CLOB Contract Deployment for Devnet
 *
 * Deploys the Carbine CLOB stack (controller, template, universal router)
 * onto the in-process devnet for orderbook tests.
 *
 * Deployment order (mirrors lib/devnet/boot.ts Phase 6):
 * 1. Carbine Controller Impl   → [3, 80000]  → indexed as [4, 80000]
 * 2. Carbine Controller Proxy   → [3, 70000]  → indexed as [4, 70000]  (upgradeable → 80000)
 * 3. Carbine Template Impl      → [3, 80001]  → indexed as [4, 80001]
 * 4. Carbine Template Beacon    → [3, 90001]  → indexed as [4, 90001]  (beacon → 80001)
 * 5. Carbine Default Instance   → [3, 70001]  → indexed as [4, 70001]  (beacon-proxy → 90001)
 * 6. Universal Router Impl      → [3, 80002]  → indexed as [4, 80002]
 * 7. Universal Router Proxy     → [3, 70002]  → indexed as [4, 70002]  (upgradeable → 80002)
 *
 * After deployment, opcodes are verified via alkanes_simulate.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rpcCall } from './devnet-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const __deploy_dirname = dirname(fileURLToPath(import.meta.url));
const REPO_WASMS = resolve(__deploy_dirname, '../../prod_wasms');
const HOME_WASMS = resolve(process.env.HOME || process.env.USERPROFILE || '~', 'alkanes-rs/prod_wasms');
const PROD_WASMS = existsSync(REPO_WASMS) ? REPO_WASMS : HOME_WASMS;

// Slot assignments matching lib/devnet/boot.ts and getConfig devnet
const SLOTS = {
  CARBINE_CTRL_IMPL: 80000,
  CARBINE_CTRL_PROXY: 70000,
  CARBINE_TMPL_IMPL: 80001,
  CARBINE_TMPL_BEACON: 90001,
  CARBINE_TEMPLATE: 70001,
  UNIVERSAL_ROUTER_IMPL: 80002,
  UNIVERSAL_ROUTER_PROXY: 70002,
};

const INDEXED = {
  CARBINE_CTRL_PROXY: `4:${SLOTS.CARBINE_CTRL_PROXY}`,
  CARBINE_TEMPLATE: `4:${SLOTS.CARBINE_TEMPLATE}`,
  UNIVERSAL_ROUTER_PROXY: `4:${SLOTS.UNIVERSAL_ROUTER_PROXY}`,
};

function loadWasm(name: string): string {
  const path = resolve(PROD_WASMS, name);
  if (!existsSync(path)) {
    throw new Error(`WASM not found: ${path}`);
  }
  const bytes = readFileSync(path);
  return bytes.toString('hex');
}

/**
 * Deploy a single contract via envelope (commit/reveal).
 */
async function deployContract(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  wasmHex: string,
  slot: number,
  inputs: number[],
  harness: any,
  label: string,
): Promise<string> {
  const cellpack = `[3,${slot},${inputs.join(',')}]`;
  const protostone = `${cellpack}:v0:v0`;

  console.log(`[carbine-deploy] Deploying ${label} to [3,${slot}]...`);

  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    'B:100000:v0',
    protostone,
    '1',
    wasmHex,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      mine_enabled: true,
    }),
  );

  const txid = result?.reveal_txid || result?.revealTxid || result?.txid || 'unknown';
  harness.mineBlocks(1);
  console.log(`[carbine-deploy] ${label} deployed → txid: ${txid}`);
  return txid;
}

/**
 * Verify a deployed contract responds to a test opcode.
 */
async function verifyDeployed(target: string, label: string, testOpcode: string = '99'): Promise<boolean> {
  const [b, t] = target.split(':');
  const check = await rpcCall('alkanes_simulate', [{
    target: { block: b, tx: t },
    inputs: [testOpcode],
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '500',
    txindex: 0,
    vout: 0,
  }]);
  const err = check?.result?.execution?.error;
  const ok = !err || err !== 'unexpected end of file';
  console.log(`[carbine-deploy]   ${label} [${target}]: ${err ? err.slice(0, 80) : 'OK'}`);
  return ok;
}

export interface CarbineDeployResult {
  controllerId: string;   // "4:70000"
  templateId: string;     // "4:70001"
  routerId: string;       // "4:70002"
}

/**
 * Deploy the full Carbine CLOB stack and return contract IDs.
 */
export async function deployCarbineContracts(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
): Promise<CarbineDeployResult> {
  console.log('[carbine-deploy] Loading WASM binaries...');

  const controllerWasm = loadWasm('carbine_controller.wasm');
  const templateWasm = loadWasm('carbine_template.wasm');
  const routerWasm = loadWasm('universal_router.wasm');
  const upgradeableWasm = loadWasm('alkanes_std_upgradeable.wasm');
  const upgradeableBeaconWasm = loadWasm('alkanes_std_upgradeable_beacon.wasm');
  const beaconProxyWasm = loadWasm('alkanes_std_beacon_proxy.wasm');

  console.log('[carbine-deploy] Deploying 7 contracts...');

  // 1. Carbine Controller Implementation (marker init opcode 50)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    controllerWasm, SLOTS.CARBINE_CTRL_IMPL, [50],
    harness, 'Carbine Controller Impl',
  );

  // 2. Carbine Controller Proxy (upgradeable → points to impl)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    upgradeableWasm, SLOTS.CARBINE_CTRL_PROXY, [0x7fff, 4, SLOTS.CARBINE_CTRL_IMPL, 1],
    harness, 'Carbine Controller Proxy',
  );

  // 3. Carbine Template Implementation (marker init opcode 50)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    templateWasm, SLOTS.CARBINE_TMPL_IMPL, [50],
    harness, 'Carbine Template Impl',
  );

  // 4. Carbine Template Beacon (upgradeable beacon → points to template impl)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    upgradeableBeaconWasm, SLOTS.CARBINE_TMPL_BEACON, [0x7fff, 4, SLOTS.CARBINE_TMPL_IMPL, 1],
    harness, 'Carbine Template Beacon',
  );

  // 5. Carbine Default Instance (beacon-proxy → points to beacon)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    beaconProxyWasm, SLOTS.CARBINE_TEMPLATE, [0x7fff, 4, SLOTS.CARBINE_TMPL_BEACON],
    harness, 'Carbine Default Instance',
  );

  // 6. Universal Router Implementation (marker init opcode 50)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    routerWasm, SLOTS.UNIVERSAL_ROUTER_IMPL, [50],
    harness, 'Universal Router Impl',
  );

  // 7. Universal Router Proxy (upgradeable → points to impl)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    upgradeableWasm, SLOTS.UNIVERSAL_ROUTER_PROXY, [0x7fff, 4, SLOTS.UNIVERSAL_ROUTER_IMPL, 1],
    harness, 'Universal Router Proxy',
  );

  // Verify all deployments
  console.log('[carbine-deploy] Verifying deployments...');
  await verifyDeployed(INDEXED.CARBINE_CTRL_PROXY, 'Controller', '24');  // GetOrderbookDepth
  await verifyDeployed(INDEXED.CARBINE_TEMPLATE, 'Template', '99');
  await verifyDeployed(INDEXED.UNIVERSAL_ROUTER_PROXY, 'Router', '2');  // Quote

  // Test controller opcodes
  console.log('[carbine-deploy] Testing controller opcodes...');
  for (const [name, opcode] of [['GetOrderbookDepth', '24'], ['GetOpenOrderCount', '25'], ['PlaceLimitOrder', '20']]) {
    const [b, t] = INDEXED.CARBINE_CTRL_PROXY.split(':');
    const check = await rpcCall('alkanes_simulate', [{
      target: { block: b, tx: t },
      inputs: [opcode, '2', '0', '32', '0'],
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    }]);
    const err = check?.result?.execution?.error;
    const data = check?.result?.execution?.data;
    console.log(`[carbine-deploy]   Opcode ${opcode} (${name}): ${err ? err.slice(0, 100) : `data=${data?.slice(0, 40)}`}`);
  }

  console.log('[carbine-deploy] Deployment complete!');

  return {
    controllerId: INDEXED.CARBINE_CTRL_PROXY,
    templateId: INDEXED.CARBINE_TEMPLATE,
    routerId: INDEXED.UNIVERSAL_ROUTER_PROXY,
  };
}
