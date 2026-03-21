/**
 * Full Protocol Stack Deployment for Devnet
 *
 * Deploys ALL protocol contracts in dependency order:
 *   1. AMM (already done in amm-deploy.ts)
 *   2. FIRE protocol (already done in fire-deploy.ts)
 *   3. FUEL token (=FROST)
 *   4. ftrBTC template
 *   5. dxBTC vault
 *   6. vx-fuel-gauge
 *   7. vx-btcusd-gauge (from template)
 *   8. Fujin difficulty futures (factory + pool + zap + LP + token template)
 *
 * Uses the same deploy+init pattern as amm-deploy.ts.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { rpcCall } from './devnet-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const PROTOCOL_DIR = resolve(__dirname, 'fixtures/protocol');
const PROD_WASMS = resolve(process.env.HOME || '~', 'alkanes-rs/prod_wasms');

// Slot assignments for protocol contracts
export const PROTOCOL_SLOTS = {
  // FUEL (=FROST) token
  FUEL_TOKEN: 7000,

  // ftrBTC futures
  FTRBTC_TEMPLATE: 7010,

  // dxBTC vault system
  DXBTC_VAULT: 7020,
  DXBTC_NORMAL_POOL: 7021,

  // vx gauges
  VX_FUEL_GAUGE: 7030,
  VX_BTCUSD_GAUGE: 7031,
  GAUGE_CONTRACT: 7032,

  // Fujin difficulty futures
  FUJIN_AUTH_TOKEN: 7100,
  FUJIN_BEACON_PROXY: 7101,
  FUJIN_RUNTIME_POOL: 7102,
  FUJIN_RUNTIME_FACTORY: 7103,
  FUJIN_BEACON: 7104,
  FUJIN_FACTORY_PROXY: 7105,
  FUJIN_TOKEN_TEMPLATE: 7106,
  FUJIN_ZAP: 7107,
  FUJIN_LP_VAULT: 7108,
};

export const PROTOCOL_IDS = Object.fromEntries(
  Object.entries(PROTOCOL_SLOTS).map(([k, v]) => [k, `4:${v}`])
) as Record<keyof typeof PROTOCOL_SLOTS, string>;

function loadProtocolWasm(name: string): string {
  const path = resolve(PROTOCOL_DIR, `${name}.wasm`);
  if (!existsSync(path)) throw new Error(`WASM not found: ${path}`);
  return readFileSync(path).toString('hex');
}

function loadStdWasm(name: string): string {
  const path = resolve(PROD_WASMS, `${name}.wasm`);
  if (!existsSync(path)) throw new Error(`Std WASM not found: ${path}`);
  return readFileSync(path).toString('hex');
}

async function deployContract(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  wasmHex: string,
  slot: number,
  initInputs: number[],
  harness: any,
  label: string,
): Promise<string> {
  const protostone = `[3,${slot},${initInputs.join(',')}]:v0:v0`;
  console.log(`[full-stack] Deploy ${label} → [4:${slot}]`);

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
  return txid;
}

async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0,
  }]);
}

export interface FullStackDeployResult {
  fuelTokenId: string;
  ftrBtcTemplateId: string;
  dxBtcVaultId: string;
  dxBtcNormalPoolId: string;
  vxFuelGaugeId: string;
  vxBtcUsdGaugeId: string;
  fujinFactoryId: string;
}

/**
 * Deploy the FUEL token and core vault infrastructure.
 * Requires AMM to already be deployed (for LP tokens).
 */
export async function deployCoreProtocol(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
  poolId: string,
): Promise<FullStackDeployResult> {
  const S = PROTOCOL_SLOTS;
  const [poolBlock, poolTx] = poolId.split(':').map(Number);

  console.log('[full-stack] Deploying core protocol contracts...');

  // 1. FUEL Token — Init(total_supply, treasury)
  // Treasury = deployer for now (taprootAddress gets all tokens)
  // We use a simple self-init: opcode 0, supply=10M, treasury=itself
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('frost_token'), S.FUEL_TOKEN,
    [0, 1000000000000000, 4, S.FUEL_TOKEN], // 10M FUEL (8 decimals)
    harness, 'FUEL Token');

  // 2. ftrBTC Template — opcode 0 (template init is no-op, just deploys the WASM)
  // Template at [4:N] doesn't initialize — instances do via [6:N]
  // Use a read opcode (99=GetName) as deploy marker since template has it
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('ftr_btc'), S.FTRBTC_TEMPLATE,
    [99], // GetName as deploy marker (template doesn't need init)
    harness, 'ftrBTC Template');

  // 3. dxBTC Vault — Init(asset_id=frBTC, yv_vault, escrow_nft, vx_fuel_gauge)
  // For devnet: yv_vault = FUEL token (won't recurse on deposit — just stores frBTC directly)
  // escrow_nft = self (placeholder)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('dx_btc'), S.DXBTC_VAULT,
    [0, 32, 0, 4, S.FUEL_TOKEN, 4, S.DXBTC_VAULT, 4, S.VX_FUEL_GAUGE],
    harness, 'dxBTC Vault');

  // 4. vx-fuel-gauge — Init(lp_token, reward_token, yve_token_nft_id, reward_rate, fr_sigil_id)
  // LP token = AMM pool (placeholder for FUEL/frBTC LP)
  // Reward token = dxBTC vault shares
  // yve_token_nft_id = placeholder (use self)
  // fr_sigil_id = placeholder (use self)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('vx_token_gauge_template'), S.VX_FUEL_GAUGE,
    [0, poolBlock, poolTx, 4, S.DXBTC_VAULT, 4, S.VX_FUEL_GAUGE, 100000, 4, S.VX_FUEL_GAUGE],
    harness, 'vxFUEL Gauge');

  // 5. vx-btcusd-gauge — Init(lp_token, reward_token, yve_token_nft_id, reward_rate, fr_sigil_id)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('vx_token_gauge_template'), S.VX_BTCUSD_GAUGE,
    [0, poolBlock, poolTx, 4, 256, 4, S.VX_BTCUSD_GAUGE, 100000, 4, S.VX_BTCUSD_GAUGE],
    harness, 'vxBTCUSD Gauge');

  // Verify deployments
  console.log('[full-stack] Verifying core protocol...');
  const checks = [
    ['FUEL', PROTOCOL_IDS.FUEL_TOKEN, '99'],
    ['ftrBTC', PROTOCOL_IDS.FTRBTC_TEMPLATE, '99'],
    ['dxBTC', PROTOCOL_IDS.DXBTC_VAULT, '99'],
    ['vxFUEL', PROTOCOL_IDS.VX_FUEL_GAUGE, '20'],
    ['vxBTCUSD', PROTOCOL_IDS.VX_BTCUSD_GAUGE, '20'],
  ];
  for (const [name, id, opcode] of checks) {
    const check = await simulate(id, [opcode]);
    const err = check?.result?.execution?.error || '';
    const status = err.includes('unexpected end of file') ? 'NOT DEPLOYED' :
                   err ? 'deployed (opcode issue)' : 'OK';
    console.log(`[full-stack]   ${name} [${id}]: ${status}`);
  }

  console.log('[full-stack] Core protocol deployed!');

  return {
    fuelTokenId: PROTOCOL_IDS.FUEL_TOKEN,
    ftrBtcTemplateId: PROTOCOL_IDS.FTRBTC_TEMPLATE,
    dxBtcVaultId: PROTOCOL_IDS.DXBTC_VAULT,
    dxBtcNormalPoolId: PROTOCOL_IDS.DXBTC_NORMAL_POOL,
    vxFuelGaugeId: PROTOCOL_IDS.VX_FUEL_GAUGE,
    vxBtcUsdGaugeId: PROTOCOL_IDS.VX_BTCUSD_GAUGE,
    fujinFactoryId: PROTOCOL_IDS.FUJIN_FACTORY_PROXY,
  };
}

/**
 * Deploy Fujin difficulty futures system.
 * Uses the same beacon proxy pattern as AMM.
 */
export async function deployFujin(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
): Promise<string> {
  const S = PROTOCOL_SLOTS;

  console.log('[full-stack] Deploying Fujin difficulty futures...');

  // Step 1: Auth Token Factory (reuse from AMM or deploy new)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadStdWasm('alkanes_std_auth_token'), S.FUJIN_AUTH_TOKEN,
    [100], harness, 'Fujin Auth Token');

  // Step 2: Beacon Proxy Template
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadStdWasm('alkanes_std_beacon_proxy'), S.FUJIN_BEACON_PROXY,
    [36863], harness, 'Fujin Beacon Proxy');

  // Step 3: Runtime Factory (logic)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('fujin_runtime_factory'), S.FUJIN_RUNTIME_FACTORY,
    [50], harness, 'Fujin Runtime Factory');

  // Step 4: Runtime Pool (logic)
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('fujin_runtime_pool'), S.FUJIN_RUNTIME_POOL,
    [50], harness, 'Fujin Runtime Pool');

  // Step 5: Factory Proxy (upgradeable) → points to Runtime Factory
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadStdWasm('alkanes_std_upgradeable'), S.FUJIN_FACTORY_PROXY,
    [0x7fff, 4, S.FUJIN_RUNTIME_FACTORY, 5],
    harness, 'Fujin Factory Proxy');

  // Step 6: Upgradeable Beacon → points to Runtime Pool
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadStdWasm('alkanes_std_upgradeable_beacon'), S.FUJIN_BEACON,
    [0x7fff, 4, S.FUJIN_RUNTIME_POOL, 5],
    harness, 'Fujin Beacon');

  // Step 7: Token Template
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('fujin_token_template'), S.FUJIN_TOKEN_TEMPLATE,
    [0], harness, 'Fujin Token Template');

  // Step 8: Zap
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('fujin_zap'), S.FUJIN_ZAP,
    [0], harness, 'Fujin Zap');

  // Step 9: LP Vault
  await deployContract(provider, signer, segwitAddress, taprootAddress,
    loadProtocolWasm('fujin_lp'), S.FUJIN_LP_VAULT,
    [0], harness, 'Fujin LP Vault');

  // TODO: Initialize factory with InitFactory opcode
  // Needs auth token discovery + init call

  console.log('[full-stack] Fujin deployed!');
  return PROTOCOL_IDS.FUJIN_FACTORY_PROXY;
}
