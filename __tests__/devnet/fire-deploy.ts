/**
 * FIRE Protocol Contract Deployment for Devnet
 *
 * Deploys all 6 FIRE contracts and initializes them with cross-references.
 * Requires AMM pool to already exist (LP token needed for staking/bonding).
 *
 * Contract slots (from fire-constants):
 *   FIRE Token      [3:256]  → [4:256]
 *   FIRE Staking    [3:257]  → [4:257]
 *   FIRE Treasury   [3:258]  → [4:258]
 *   FIRE Bonding    [3:259]  → [4:259]
 *   FIRE Redemption [3:260]  → [4:260]
 *   FIRE Distributor[3:261]  → [4:261]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { rpcCall } from './devnet-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// FIRE contract IDs (from fire-constants/src/lib.rs)
export const FIRE = {
  TOKEN_SLOT:       256,   // 0x100
  STAKING_SLOT:     257,   // 0x101
  TREASURY_SLOT:    258,   // 0x102
  BONDING_SLOT:     259,   // 0x103
  REDEMPTION_SLOT:  260,   // 0x104
  DISTRIBUTOR_SLOT: 261,   // 0x105

  TOKEN_ID:       '4:256',
  STAKING_ID:     '4:257',
  TREASURY_ID:    '4:258',
  BONDING_ID:     '4:259',
  REDEMPTION_ID:  '4:260',
  DISTRIBUTOR_ID: '4:261',

  // Supply constants (8 decimals)
  DECIMAL_FACTOR:    100_000_000n,
  MAX_SUPPLY:        210_000_000_000_000n,   // 2.1M * 10^8
  EMISSION_POOL:      63_000_000_000_000n,   // 630K * 10^8
  TREASURY_PREMINE: 105_000_000_000_000n,    // 1.05M * 10^8
  TEAM_PREMINE:      42_000_000_000_000n,    // 420K * 10^8
};

function loadFireWasm(name: string): string {
  const paths = [
    resolve(__dirname, `fixtures/fire/${name}.wasm`),
    resolve(process.env.HOME || '~', `fire/target/wasm32-unknown-unknown/release/${name}.wasm`),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return readFileSync(p).toString('hex');
    }
  }
  throw new Error(`FIRE WASM not found: ${name}`);
}

/**
 * Deploy a FIRE contract with init in one shot.
 *
 * For [3, slot] deploys, the inputs after the slot become the opcode+args
 * called on the contract during deployment. We pass [0, ...initArgs] to
 * call Initialize (opcode 0) with the full init vector, so the contract
 * is both deployed AND initialized in a single transaction.
 */
async function deployAndInit(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  wasmHex: string,
  slot: number,
  initArgs: (number | bigint)[],
  harness: any,
  label: string,
): Promise<string> {
  // [3, slot, 0, ...initArgs] — opcode 0 = Initialize
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[3,${slot},0,${argsStr}]:v0:v0`;
  console.log(`[fire-deploy] Deploy+init ${label} → [3,${slot},0,...]: ${protostone.slice(0, 120)}`);

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

  // Verify bytecode stored
  // Use a read opcode each contract implements
  const verifyOpcode = label === 'Token' ? '99' : '20';
  const check = await simulate(`4:${slot}`, [verifyOpcode]);
  const err = check?.result?.execution?.error;
  if (err?.includes('unexpected end of file')) {
    console.log(`[fire-deploy]   FAILED: [4:${slot}] has NO bytecode! Deploy reverted.`);
  } else {
    console.log(`[fire-deploy]   OK: [4:${slot}] deployed (${err ? 'init may have issues: ' + err.slice(0, 60) : 'verified'})`);
  }

  return txid;
}

/**
 * Execute a non-envelope alkane call (init, admin ops, etc.)
 */
async function executeCall(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  protostone: string,
  inputRequirements: string,
  harness: any,
): Promise<string> {
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    inputRequirements,
    protostone,
    '1',
    null,
    JSON.stringify({
      from: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
    }),
  );

  if (result?.reveal_txid || result?.revealTxid) {
    const txid = result.reveal_txid || result.revealTxid;
    harness.mineBlocks(1);
    return txid;
  }
  if (result?.txid) {
    harness.mineBlocks(1);
    return result.txid;
  }
  return signAndBroadcast(provider, result, signer, segwitAddress);
}

/**
 * Simulate an alkane call (read-only query).
 */
async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '999',
    txindex: 0,
    vout: 0,
  }]);
}

/**
 * Parse a u128 from simulation response data (16 bytes LE).
 */
function parseU128(data: string, offset = 0): bigint {
  const hex = data.replace('0x', '');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length < offset + 16) return 0n;
  return bytes.readBigUInt64LE(offset) + (bytes.readBigUInt64LE(offset + 8) << 64n);
}

export interface FireDeployResult {
  tokenId: string;
  stakingId: string;
  treasuryId: string;
  bondingId: string;
  redemptionId: string;
  distributorId: string;
  poolId: string;  // The AMM pool used as LP token
}

/**
 * Deploy and initialize all FIRE contracts.
 *
 * @param poolId - AMM pool ID (e.g. "2:3") to use as LP token for staking/bonding
 */
export async function deployFireContracts(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
  poolId: string,
): Promise<FireDeployResult> {
  console.log('[fire-deploy] Loading FIRE WASM binaries...');

  const tokenWasm = loadFireWasm('fire_token');
  const stakingWasm = loadFireWasm('fire_staking');
  const treasuryWasm = loadFireWasm('fire_treasury');
  const bondingWasm = loadFireWasm('fire_bonding');
  const redemptionWasm = loadFireWasm('fire_redemption');
  const distributorWasm = loadFireWasm('fire_distributor');

  // =========================================================================
  // Deploy+init all 6 FIRE contracts in one shot per contract.
  //
  // For [3, slot] deploys, the cellpack inputs are [3, slot, opcode, ...args].
  // We use opcode 0 (Initialize) with the full init args so the contract is
  // deployed AND initialized atomically. If init reverts, the deploy reverts
  // too — no half-deployed contracts.
  //
  // Init args reference other FIRE contracts by their future [4:slot] IDs.
  // This works because init just stores the IDs, it doesn't call them.
  // =========================================================================

  const [poolBlock, poolTx] = poolId.split(':').map(Number);

  console.log('[fire-deploy] Deploy+init 6 FIRE contracts...');

  // 1. Treasury: Init(fire_token, frbtc_token, fire_lp_token, diesel_lp_token)
  //    Use DIESEL/frBTC pool as both LP tokens for devnet
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    treasuryWasm, FIRE.TREASURY_SLOT,
    [4, FIRE.TOKEN_SLOT, 32, 0, poolBlock, poolTx, poolBlock, poolTx],
    harness, 'Treasury');

  // 2. Token: Init(staking_contract, treasury, treasury_amount, team_vesting, team_amount, emission_pool)
  //    team_vesting = bonding contract (receives team premine)
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    tokenWasm, FIRE.TOKEN_SLOT,
    [4, FIRE.STAKING_SLOT, 4, FIRE.TREASURY_SLOT, FIRE.TREASURY_PREMINE, 4, FIRE.BONDING_SLOT, FIRE.TEAM_PREMINE, FIRE.EMISSION_POOL],
    harness, 'Token');

  // 3. Staking: Init(lp_token, fire_token)
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    stakingWasm, FIRE.STAKING_SLOT,
    [poolBlock, poolTx, 4, FIRE.TOKEN_SLOT],
    harness, 'Staking');

  // 4. Bonding: Init(fire_token, diesel_lp_token, treasury, price_oracle)
  //    price_oracle = FIRE token itself for devnet
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    bondingWasm, FIRE.BONDING_SLOT,
    [4, FIRE.TOKEN_SLOT, poolBlock, poolTx, 4, FIRE.TREASURY_SLOT, 4, FIRE.TOKEN_SLOT],
    harness, 'Bonding');

  // 5. Redemption: Init(fire_token, treasury)
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    redemptionWasm, FIRE.REDEMPTION_SLOT,
    [4, FIRE.TOKEN_SLOT, 4, FIRE.TREASURY_SLOT],
    harness, 'Redemption');

  // 6. Distributor: Init(fire_token, contribution_token, treasury)
  //    contribution_token = frBTC [32:0]
  await deployAndInit(provider, signer, segwitAddress, taprootAddress,
    distributorWasm, FIRE.DISTRIBUTOR_SLOT,
    [4, FIRE.TOKEN_SLOT, 32, 0, 4, FIRE.TREASURY_SLOT],
    harness, 'Distributor');

  // =========================================================================
  // Phase 3: Verify initialization
  // =========================================================================
  console.log('[fire-deploy] Verifying FIRE initialization...');

  // Check FIRE Token name
  const nameCheck = await simulate(FIRE.TOKEN_ID, ['99']);
  if (nameCheck?.result?.execution?.data) {
    const hex = nameCheck.result.execution.data.replace('0x', '');
    const name = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
    console.log(`[fire-deploy]   Token name: "${name}"`);
  } else {
    console.log(`[fire-deploy]   Token name check failed: ${nameCheck?.result?.execution?.error}`);
  }

  // Check total supply
  const supplyCheck = await simulate(FIRE.TOKEN_ID, ['101']);
  if (supplyCheck?.result?.execution?.data) {
    const supply = parseU128(supplyCheck.result.execution.data);
    console.log(`[fire-deploy]   Total supply: ${supply} (${Number(supply) / 1e8} FIRE)`);
  }

  // Check emission pool remaining
  const emissionCheck = await simulate(FIRE.TOKEN_ID, ['103']);
  if (emissionCheck?.result?.execution?.data) {
    const emission = parseU128(emissionCheck.result.execution.data);
    console.log(`[fire-deploy]   Emission pool: ${emission} (${Number(emission) / 1e8} FIRE)`);
  }

  // Check staking total staked
  const stakedCheck = await simulate(FIRE.STAKING_ID, ['12']);
  if (stakedCheck?.result?.execution?.error) {
    console.log(`[fire-deploy]   Staking total staked error: ${stakedCheck.result.execution.error.slice(0, 80)}`);
  } else {
    const staked = parseU128(stakedCheck?.result?.execution?.data || '0x');
    console.log(`[fire-deploy]   Staking total staked: ${staked}`);
  }

  console.log('[fire-deploy] FIRE protocol deployment complete!');

  return {
    tokenId: FIRE.TOKEN_ID,
    stakingId: FIRE.STAKING_ID,
    treasuryId: FIRE.TREASURY_ID,
    bondingId: FIRE.BONDING_ID,
    redemptionId: FIRE.REDEMPTION_ID,
    distributorId: FIRE.DISTRIBUTOR_ID,
    poolId,
  };
}
