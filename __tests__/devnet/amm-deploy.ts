/**
 * AMM Contract Deployment for Devnet
 *
 * Deploys the full AMM stack (factory, pool, beacon) onto the in-process
 * devnet so swap and liquidity tests can run.
 *
 * Deployment order (from subfrost-alkanes/src/tests/amm_setup.rs):
 * 1. Pool Logic         → [3, 0xffef] → indexed as [4, 0xffef]
 * 2. Factory Logic      → [3, 2]      → indexed as [4, 2]
 * 3. Beacon Proxy Tmpl  → [3, 0xbeac1] → indexed as [4, 0xbeac1]
 * 4. Upgradeable Beacon → [3, 0xbeac0] → indexed as [4, 0xbeac0]
 * 5. Factory Proxy      → [3, 1]      → indexed as [4, 1]
 * 6. Initialize Factory (opcode 0 on [4, 1])
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const PROD_WASMS = resolve(process.env.HOME || '~', 'alkanes-rs/prod_wasms');

// Slot assignments (matching subfrost-alkanes test harness)
const SLOTS = {
  POOL_LOGIC:      0xffef,  // 65519
  FACTORY_LOGIC:   2,
  BEACON_PROXY:    0xbeac1, // 781505 — but subfrost-alkanes uses 48833
  BEACON:          0xbeac0, // 781504 — but subfrost-alkanes uses 48832
  FACTORY_PROXY:   1,
};

// After indexing, block 3 becomes block 4
const INDEXED = {
  POOL_LOGIC:      `4:${SLOTS.POOL_LOGIC}`,
  FACTORY_LOGIC:   `4:${SLOTS.FACTORY_LOGIC}`,
  BEACON_PROXY:    `4:${SLOTS.BEACON_PROXY}`,
  BEACON:          `4:${SLOTS.BEACON}`,
  FACTORY_PROXY:   `4:${SLOTS.FACTORY_PROXY}`,
};

function loadWasm(name: string): string {
  const path = resolve(PROD_WASMS, name);
  const bytes = readFileSync(path);
  return bytes.toString('hex');
}

/**
 * Deploy a single contract via envelope (commit/reveal).
 *
 * The protostone format for deployment is:
 *   [3, slot, deployMarker, ...args]:v0:v0
 *
 * The envelope contains the WASM binary.
 */
async function deployContract(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  wasmHex: string,
  slot: number,
  inputs: number[],
  mineHarness: any,
): Promise<string> {
  const cellpack = `[3,${slot},${inputs.join(',')}]`;
  const protostone = `${cellpack}:v0:v0`;

  console.log(`[amm-deploy] Deploying to [3,${slot}] with inputs [${inputs}]...`);

  // Use alkanesExecuteFull which handles the complete commit/reveal flow internally
  // (avoids PSBT serialization issues with the intermediate ReadyToSignCommit state)
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

  // alkanesExecuteFull returns EnhancedExecuteResult with txids
  const txid = result?.reveal_txid || result?.revealTxid || result?.txid || 'unknown';

  mineHarness.mineBlocks(1);
  console.log(`[amm-deploy] Deployed [3,${slot}] → txid: ${txid}`);
  return txid;
}

/**
 * Deploy the full AMM infrastructure and return the factory proxy ID.
 */
export async function deployAmmContracts(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
): Promise<{ factoryId: string; beaconId: string; poolLogicId: string }> {
  console.log('[amm-deploy] Loading WASM binaries...');

  const poolWasm = loadWasm('pool.wasm');
  const factoryWasm = loadWasm('factory.wasm');
  const beaconProxyWasm = loadWasm('alkanes_std_beacon_proxy.wasm');
  const upgradeableBeaconWasm = loadWasm('alkanes_std_upgradeable_beacon.wasm');
  const upgradeableWasm = loadWasm('alkanes_std_upgradeable.wasm');

  console.log('[amm-deploy] Deploying 5 contracts...');

  // 1. Pool Logic
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    poolWasm, SLOTS.POOL_LOGIC, [50],
    harness,
  );

  // 2. Factory Logic
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    factoryWasm, SLOTS.FACTORY_LOGIC, [50],
    harness,
  );

  // 3. Beacon Proxy Template
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    beaconProxyWasm, SLOTS.BEACON_PROXY, [0x8fff],
    harness,
  );

  // 4. Upgradeable Beacon → points to Pool Logic
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    upgradeableBeaconWasm, SLOTS.BEACON, [0x7fff, 4, SLOTS.POOL_LOGIC, 1],
    harness,
  );

  // 5. Factory Proxy → points to Factory Logic
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    upgradeableWasm, SLOTS.FACTORY_PROXY, [0x7fff, 4, SLOTS.FACTORY_LOGIC, 1],
    harness,
  );

  // 6. Initialize Factory (opcode 0 on the deployed proxy)
  console.log('[amm-deploy] Initializing factory...');
  // INDEXED.FACTORY_PROXY is "4:1" — need to split for protostone format
  const [fpBlock, fpTx] = INDEXED.FACTORY_PROXY.split(':');
  const initProtostone = `[${fpBlock},${fpTx},0,${SLOTS.BEACON_PROXY},4,${SLOTS.BEACON}]:v0:v0`;

  const initResult = await provider.alkanesExecuteWithStrings(
    JSON.stringify([taprootAddress]),
    'B:10000:v0',
    initProtostone,
    '1',
    null,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      auto_confirm: false,
    }),
  );

  const initTxid = await signAndBroadcast(provider, initResult, signer, segwitAddress);
  harness.mineBlocks(1);
  console.log('[amm-deploy] Factory initialized:', initTxid);

  return {
    factoryId: INDEXED.FACTORY_PROXY,
    beaconId: INDEXED.BEACON,
    poolLogicId: INDEXED.POOL_LOGIC,
  };
}
