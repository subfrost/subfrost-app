/**
 * BRC20-Prog Contract Deployment Helpers
 *
 * Deploys FrBTC.sol (via BRC20-Prog commit-reveal) and fr-brc20-vault
 * (via alkane protostone deploy) on the devnet.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { BRC20_PROG, loadVaultWasm, loadFrBtcFoundryJson, loadBisSwapFoundryJson } from './brc20-prog-constants';
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

  // Get wallet addresses for from_addresses / change_address
  const addresses = provider.walletGetAddresses('p2wpkh', 0, 1);
  const walletAddress = addresses?.[0]?.address;

  const result = await (provider as any).brc20ProgDeploy(
    JSON.stringify(foundryJson),
    JSON.stringify({
      fee_rate: 1,
      mine_enabled: true,
      use_activation: true,
      auto_confirm: true,
      from_addresses: walletAddress ? [walletAddress] : undefined,
      change_address: walletAddress || undefined,
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

/**
 * Deploy BiS_Swap implementation contract.
 * Returns the implementation contract address.
 *
 * Note: BiS_Swap uses Initializable with _disableInitializers() in constructor,
 * so this implementation cannot be used directly. Deploy a proxy on top.
 */
export async function deployBisSwapImpl(
  provider: WebProvider,
  harness: any,
): Promise<string | null> {
  const foundryJson = loadBisSwapFoundryJson();
  if (!foundryJson) {
    console.warn('[brc20-deploy] BiS_Swap.json not found. Run: cd ~/subfrost-brc20/bis-build && forge build');
    return null;
  }

  console.log('[brc20-deploy] Deploying BiS_Swap implementation...');

  const addresses = provider.walletGetAddresses('p2wpkh', 0, 1);
  const walletAddress = addresses?.[0]?.address;

  const result = await (provider as any).brc20ProgDeploy(
    JSON.stringify(foundryJson),
    JSON.stringify({
      fee_rate: 1,
      mine_enabled: true,
      use_activation: true,
      auto_confirm: true,
      from_addresses: walletAddress ? [walletAddress] : undefined,
      change_address: walletAddress || undefined,
    }),
  );

  harness.mineBlocks(3);

  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  const addr = parsed?.contract_address || parsed?.contractAddress || null;
  console.log('[brc20-deploy] BiS_Swap impl:', addr);
  return addr;
}

/**
 * Deploy BiS_Swap via proxy with initialize() calldata.
 *
 * 1. Deploys BiS_Swap implementation
 * 2. Deploys SequencedSwapProxy(impl, admin, initializeCalldata)
 *
 * The initialize params set up the DEX with our wallet as the sequencer
 * (batchExecutorAddress), allowing us to process batches directly.
 *
 * Returns { implAddress, proxyAddress }
 */
export async function deployBisSwapWithProxy(
  provider: WebProvider,
  harness: any,
  params: {
    frBtcAddress: string;
    adminAddress: string; // EVM address for admin (derived from our pkscript)
  },
): Promise<{ implAddress: string | null; proxyAddress: string | null }> {
  // Step 1: Deploy implementation
  const implAddress = await deployBisSwapImpl(provider, harness);
  if (!implAddress) {
    return { implAddress: null, proxyAddress: null };
  }

  // Step 2: Build initialize() calldata
  // initialize(address _depositSignerWallet, address _batchExecutorAddress,
  //            address _feeTo, address _wrappedBTCAddress,
  //            uint256 _btcUpscale, address _adminWallet)
  // Selector: 53c425c1
  const admin = params.adminAddress.replace('0x', '').padStart(64, '0');
  const frbtc = params.frBtcAddress.replace('0x', '').padStart(64, '0');
  const btcUpscale = '1'.padStart(64, '0'); // 1 = no upscaling (8 decimals)
  const initCalldata = '53c425c1' + admin + admin + admin + frbtc + btcUpscale + admin;

  // Step 3: Deploy proxy with init calldata
  // The proxy constructor is: (address _logic, address _admin, bytes _data)
  // We need to ABI-encode these as constructor args appended to the proxy bytecode
  console.log('[brc20-deploy] Deploying SequencedSwapProxy with initialize()...');

  // For BRC2.0 deploy, we pass the full deployment bytecode (proxy bytecode + constructor args).
  // The constructor args are ABI-encoded: (address logic, address admin, bytes data)
  // But brc20ProgDeploy takes a Foundry JSON, not raw bytecode.
  // We need to create a synthetic Foundry JSON with the proxy bytecode + encoded constructor args.

  const { readFileSync, existsSync } = await import('fs');
  const { resolve } = await import('path');
  const home = process.env.HOME || '/home/ubuntu';

  // Load proxy bytecode from fixture
  const proxyHexPath = resolve(home, 'subfrost-brc20/bis-build/out/SequencedSwapProxy.sol/SequencedSwapProxy.json');
  if (!existsSync(proxyHexPath)) {
    console.warn('[brc20-deploy] SequencedSwapProxy.json not found');
    return { implAddress, proxyAddress: null };
  }

  const proxyJson = JSON.parse(readFileSync(proxyHexPath, 'utf-8'));
  let proxyBytecode = proxyJson.bytecode?.object || '';
  if (proxyBytecode.startsWith('0x')) proxyBytecode = proxyBytecode.slice(2);

  // ABI-encode constructor args: (address logic, address admin, bytes data)
  const logicArg = implAddress.replace('0x', '').padStart(64, '0');
  const adminArg = admin; // Same as our wallet
  // bytes data = offset(96=0x60) + length + data
  const dataOffset = '0000000000000000000000000000000000000000000000000000000000000060';
  const initBytes = Buffer.from(initCalldata, 'hex');
  const dataLength = initBytes.length.toString(16).padStart(64, '0');
  const dataPadded = initCalldata + '0'.repeat((32 - (initBytes.length % 32)) % 32 * 2);

  const constructorArgs = logicArg + adminArg + dataOffset + dataLength + dataPadded;
  const fullBytecode = proxyBytecode + constructorArgs;

  // Create synthetic Foundry JSON
  const syntheticJson = {
    ...proxyJson,
    bytecode: { object: '0x' + fullBytecode },
  };

  try {
    const addresses = provider.walletGetAddresses('p2wpkh', 0, 1);
    const walletAddress = addresses?.[0]?.address;

    const result = await (provider as any).brc20ProgDeploy(
      JSON.stringify(syntheticJson),
      JSON.stringify({
        fee_rate: 1,
        mine_enabled: true,
        use_activation: true,
        auto_confirm: true,
        from_addresses: walletAddress ? [walletAddress] : undefined,
        change_address: walletAddress || undefined,
      }),
    );

    harness.mineBlocks(3);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const proxyAddress = parsed?.contract_address || parsed?.contractAddress || null;
    console.log('[brc20-deploy] BiS_Swap proxy:', proxyAddress);
    return { implAddress, proxyAddress };
  } catch (e: any) {
    console.warn('[brc20-deploy] Proxy deploy failed:', e?.message ?? String(e));
    return { implAddress, proxyAddress: null };
  }
}
