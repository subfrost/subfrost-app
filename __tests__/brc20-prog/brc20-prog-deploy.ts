/**
 * BRC20-Prog Contract Deployment Helpers
 *
 * Deploys FrBTC.sol (via BRC20-Prog commit-reveal) and fr-brc20-vault
 * (via alkane protostone deploy) on the devnet.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { BRC20_PROG, loadVaultWasm, loadFrBtcFoundryJson } from './brc20-prog-constants';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Deploy FrBTC.sol via BRC20-Prog commit-reveal-activation pattern.
 * Returns the deployed contract address.
 */
export async function deployFrBtcContract(
  provider: WebProvider,
  harness: any,
): Promise<string> {
  const foundryJson = loadFrBtcFoundryJson();
  if (!foundryJson) {
    throw new Error(
      'FrBTC.json not found. Run `forge build` in ~/subfrost-brc20/'
    );
  }

  console.log('[brc20-deploy] Deploying FrBTC.sol via BRC20-Prog...');

  const result = await (provider as any).brc20ProgDeploy(
    JSON.stringify(foundryJson),
    JSON.stringify({
      fee_rate: 1,
      mine_enabled: true,
      use_activation: true,
      auto_confirm: true,
    }),
  );

  harness.mineBlocks(3);

  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  console.log(`[brc20-deploy] Deploy result keys: ${Object.keys(parsed || {}).join(', ')}`);
  console.log(`[brc20-deploy] Deploy result: ${JSON.stringify(parsed).slice(0, 500)}`);

  // BRC20-Prog contract address is derived from the reveal inscription.
  // The executor returns txids; the contract address is computed from the
  // deployer address (first output of activation tx) at nonce 0.
  // For devnet testing, we can compute it or query it from the indexer.
  const contractAddress = parsed?.contract_address
    || parsed?.contractAddress
    || parsed?.activation_contract_address
    || null;

  // If no address returned, try to derive from activation txid
  if (!contractAddress && parsed?.activation_txid) {
    console.log(`[brc20-deploy] Contract deployed (activation: ${parsed.activation_txid}), address TBD`);
  }

  return contractAddress;
}

/**
 * Deploy fr-brc20-vault alkane contract via protostone.
 * Returns the vault alkane ID (e.g., "4:8000").
 */
export async function deployVaultContract(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
): Promise<string> {
  const vaultWasm = loadVaultWasm();
  if (!vaultWasm) {
    throw new Error(
      'fr-brc20-vault WASM not found. Build in ~/subfrost-brc20/alkanes/fr-brc20-vault/'
    );
  }

  const wasmHex = Buffer.from(vaultWasm).toString('hex');
  const slot = BRC20_PROG.VAULT_SLOT;
  const protostone = `[3,${slot},0]:v0:v0`; // Deploy with opcode 0 (Initialize)

  console.log(`[brc20-deploy] Deploying fr-brc20-vault → [4:${slot}]`);

  await (provider as any).alkanesExecuteFull(
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

  harness.mineBlocks(1);

  const vaultId = `4:${slot}`;
  console.log(`[brc20-deploy] Vault deployed at ${vaultId}`);
  return vaultId;
}

/**
 * Deploy the full BRC20-Prog stack in order:
 *   1. Deploy FrBTC.sol (BRC20-Prog EVM contract)
 *   2. Deploy fr-brc20-vault (alkane contract)
 *   3. Initialize vault
 */
export async function deployBrc20ProgStack(
  provider: WebProvider,
  signer: TestSignerResult,
  segwitAddress: string,
  taprootAddress: string,
  harness: any,
): Promise<{
  frBtcAddress: string | null;
  vaultId: string | null;
}> {
  let frBtcAddress: string | null = null;
  let vaultId: string | null = null;

  // Deploy FrBTC.sol if Foundry JSON is available
  const foundryJson = loadFrBtcFoundryJson();
  if (foundryJson) {
    try {
      frBtcAddress = await deployFrBtcContract(provider, harness);
    } catch (e: any) {
      console.warn(`[brc20-deploy] FrBTC.sol deploy failed: ${e.message}`);
    }
  } else {
    console.warn('[brc20-deploy] Skipping FrBTC.sol (no Foundry JSON)');
  }

  // Deploy vault if WASM is available
  const vaultWasm = loadVaultWasm();
  if (vaultWasm) {
    try {
      vaultId = await deployVaultContract(
        provider, signer, segwitAddress, taprootAddress, harness
      );
    } catch (e: any) {
      console.warn(`[brc20-deploy] Vault deploy failed: ${e.message}`);
    }
  } else {
    console.warn('[brc20-deploy] Skipping vault (no WASM)');
  }

  return { frBtcAddress, vaultId };
}
