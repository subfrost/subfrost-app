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
import { rpcCall } from './devnet-helpers';
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
 * Discover auth tokens ([2:N] with balance=1) at an address.
 * These are created during upgradeable proxy/beacon deployments.
 */
async function discoverAuthTokens(address: string): Promise<string[]> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' }
  ]);

  const tokens: string[] = [];
  if (result?.result?.outpoints) {
    for (const outpoint of result.result.outpoints) {
      const balances = outpoint.balance_sheet?.cached?.balances
        || outpoint.runes
        || [];
      for (const entry of balances) {
        const block = parseInt(entry.block ?? '0', 10);
        const tx = parseInt(entry.tx ?? '0', 10);
        const amount = parseInt(entry.amount ?? '0', 10);
        // Auth tokens are at block=2 with amount=1
        if (block === 2 && amount === 1) {
          const id = `${block}:${tx}`;
          if (!tokens.includes(id)) {
            tokens.push(id);
          }
        }
      }
    }
  }

  return tokens;
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

  const authTokenWasm = loadWasm('alkanes_std_auth_token.wasm');

  console.log('[amm-deploy] Deploying 6 contracts...');

  // 0. Auth Token Factory (required for proxy deployments to create auth tokens)
  await deployContract(
    provider, signer, segwitAddress, taprootAddress,
    authTokenWasm, 0xffed, [100], // Deploy marker 100 (from subfrost-alkanes)
    harness,
  );

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

  // Verify contracts are deployed by checking if they respond
  console.log('[amm-deploy] Verifying deployments...');
  for (const [name, id] of Object.entries(INDEXED)) {
    const [b, t] = id.split(':');
    const check = await rpcCall('alkanes_simulate', [{
      target: { block: b, tx: t },
      inputs: ['99'],  // GetName — works on most contracts
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    }]);
    const err = check?.result?.execution?.error;
    const status = err ? `ERROR: ${err.slice(0, 80)}` : 'OK';
    console.log(`[amm-deploy]   ${name} [${id}]: ${status}`);
  }

  // 6. Discover auth tokens created during proxy deployments.
  //    The upgradeable proxy (0x7fff) creates an auth token at [2:N].
  //    We need to find it and send it with the factory init call.
  console.log('[amm-deploy] Discovering auth tokens...');

  // Check both addresses for auth tokens
  let authTokens = await discoverAuthTokens(taprootAddress);
  console.log('[amm-deploy] Auth tokens on taproot:', authTokens);
  if (authTokens.length === 0) {
    authTokens = await discoverAuthTokens(segwitAddress);
    console.log('[amm-deploy] Auth tokens on segwit:', authTokens);
  }
  // Also try checking all [2:N] via simulate
  if (authTokens.length === 0) {
    // Try querying the factory proxy for its auth token
    const authCheck = await rpcCall('alkanes_simulate', [{
      target: { block: '4', tx: '1' },
      inputs: ['32765'],  // 0x7ffd = get implementation (upgradeable query)
      alkanes: [],
      transaction: '0x',
      block: '0x',
      height: '500',
      txindex: 0,
      vout: 0,
    }]);
    console.log('[amm-deploy] Factory proxy impl check:', JSON.stringify(authCheck?.result?.execution).slice(0, 200));
  }

  if (authTokens.length === 0) {
    throw new Error('No auth tokens found after proxy deployment. Factory init requires an auth token.');
  }

  // The factory proxy auth token is typically the first one created.
  // Both the factory proxy and beacon create auth tokens.
  // Factory proxy auth token = authTokens[0], beacon auth token = authTokens[1]
  const factoryAuthToken = authTokens[0];
  console.log('[amm-deploy] Using factory auth token:', factoryAuthToken);

  // 7. Initialize Factory (opcode 0 on the deployed proxy)
  //    Send the auth token as incomingAlkanes via inputRequirements.
  console.log('[amm-deploy] Initializing factory...');
  const [fpBlock, fpTx] = INDEXED.FACTORY_PROXY.split(':');
  const initProtostone = `[${fpBlock},${fpTx},0,${SLOTS.BEACON_PROXY},4,${SLOTS.BEACON}]:v0:v0`;

  const initResult = await provider.alkanesExecuteWithStrings(
    JSON.stringify([taprootAddress]),
    `${factoryAuthToken}:1`,   // Send 1 auth token as input
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
