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
  deployerNonce?: number,
): Promise<string> {
  const foundryJson = loadFrBtcFoundryJson();
  if (!foundryJson) {
    throw new Error(
      'FrBTC.json not found. Run `forge build` in ~/subfrost-brc20/'
    );
  }

  console.log(`[brc20-deploy] Deploying FrBTC.sol via BRC20-Prog (nonce=${deployerNonce ?? 0})...`);

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
      deployer_nonce: deployerNonce ?? 0,
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
  deployerNonce?: number,
): Promise<string | null> {
  const foundryJson = loadBisSwapFoundryJson();
  if (!foundryJson) {
    console.warn('[brc20-deploy] BiS_Swap.json not found. Run: cd ~/subfrost-brc20/bis-build && forge build');
    return null;
  }

  console.log(`[brc20-deploy] Deploying BiS_Swap implementation (nonce=${deployerNonce ?? 0})...`);

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
      deployer_nonce: deployerNonce ?? 0,
    }),
  );

  harness.mineBlocks(3);

  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  const addr = parsed?.contract_address || parsed?.contractAddress || null;
  console.log('[brc20-deploy] BiS_Swap impl:', addr);
  return addr;
}

/** ABI-encode an address to 32 bytes (left-padded with zeros). */
function abiAddress(addr: string): string {
  return addr.replace('0x', '').toLowerCase().padStart(64, '0');
}

/** ABI-encode a uint256 value. */
function abiUint256(val: number | bigint): string {
  return val.toString(16).padStart(64, '0');
}

/**
 * Deploy BiS_Swap via TransparentUpgradeableProxy with initialize() calldata.
 *
 * 1. Deploys BiS_Swap implementation (nonce N)
 * 2. Builds initialize() calldata (sets us as sequencer)
 * 3. Deploys SequencedSwapProxy(impl, admin, initData) (nonce N+1)
 *    The proxy constructor delegatecalls initialize() on the implementation.
 *
 * Returns { implAddress, proxyAddress }
 */
export async function deployBisSwapWithProxy(
  provider: WebProvider,
  harness: any,
  params: {
    frBtcAddress: string;
    adminAddress: string; // EVM address for admin/batch-executor
    implNonce: number;    // deployer nonce for impl
    proxyNonce: number;   // deployer nonce for proxy
  },
): Promise<{ implAddress: string | null; proxyAddress: string | null }> {
  // Step 1: Deploy implementation
  const implAddress = await deployBisSwapImpl(provider, harness, params.implNonce);
  if (!implAddress) {
    return { implAddress: null, proxyAddress: null };
  }

  // Step 2: Build initialize() calldata
  // initialize(address _depositSignerWallet, address _batchExecutorAddress,
  //            address _feeTo, address _wrappedBTCAddress,
  //            uint256 _btcUpscale, address _adminWallet)
  // Selector: 53c425c1
  const admin = abiAddress(params.adminAddress);
  const frbtc = abiAddress(params.frBtcAddress);
  const initCalldata =
    '53c425c1' +  // selector
    admin +       // _depositSignerWallet
    admin +       // _batchExecutorAddress (WE are the sequencer)
    admin +       // _feeTo
    frbtc +       // _wrappedBTCAddress
    abiUint256(1) + // _btcUpscale (1 = no scaling, 8 decimals)
    admin;        // _adminWallet
  // Total: 4 + 6*32 = 196 bytes = 392 hex chars

  // Step 3: Deploy proxy with constructor args
  // TransparentUpgradeableProxy(address _logic, address _admin, bytes _data)
  console.log('[brc20-deploy] Deploying SequencedSwapProxy with initialize()...');
  console.log(`[brc20-deploy] initCalldata: ${initCalldata.slice(0, 20)}... (${initCalldata.length/2} bytes)`);
  console.log(`[brc20-deploy] admin: 0x${params.adminAddress.replace('0x','')}`);
  console.log(`[brc20-deploy] frBTC: 0x${params.frBtcAddress.replace('0x','')}`);
  console.log(`[brc20-deploy] impl: ${implAddress}`);

  const { readFileSync, existsSync } = await import('fs');
  const { resolve } = await import('path');
  const home = process.env.HOME || '/home/ubuntu';

  // Use MinimalProxy instead of TransparentUpgradeableProxy for simpler deployment.
  // MinimalProxy(address _logic, bytes _data) — stores impl and delegatecalls _data.
  const proxyJsonPath = resolve(home, 'subfrost-brc20/bis-build/out/MinimalProxy.sol/MinimalProxy.json');
  if (!existsSync(proxyJsonPath)) {
    console.warn('[brc20-deploy] MinimalProxy.json not found');
    return { implAddress, proxyAddress: null };
  }

  const proxyJson = JSON.parse(readFileSync(proxyJsonPath, 'utf-8'));
  let proxyBytecode = proxyJson.bytecode?.object || '';
  if (proxyBytecode.startsWith('0x')) proxyBytecode = proxyBytecode.slice(2);

  // Foundry includes CBOR metadata in bytecode.object. Constructor args are
  // appended AFTER the full bytecode (including CBOR). The Solidity compiler
  // generates code that reads args from offset `codesize - init_code_size`
  // where init_code_size is a compile-time constant that includes CBOR.

  // ABI-encode constructor args: MinimalProxy(address _logic, bytes _data)
  // For (address, bytes), the encoding is:
  //   word 0: _logic (address padded to 32 bytes)
  //   word 1: offset to _data (= 0x40 = 64, since 2 head slots × 32 bytes)
  //   word 2: length of _data in bytes
  //   word 3+: _data padded to 32-byte boundary
  // Deploy proxy with EMPTY _data first (no initialize in constructor).
  // We'll call initialize() separately via brc20ProgTransact.
  // This avoids issues with complex constructor delegatecall + nested CREATEs.
  const constructorArgs =
    abiAddress(implAddress) +     // _logic
    abiUint256(64) +              // offset to _data (2 head words × 32)
    abiUint256(0);                // length of _data = 0 (empty bytes)

  const fullBytecode = proxyBytecode + constructorArgs;
  console.log(`[brc20-deploy] Proxy bytecode: ${proxyBytecode.length/2} bytes`);
  console.log(`[brc20-deploy] Constructor args: ${constructorArgs.length/2} bytes`);
  console.log(`[brc20-deploy] Init calldata: ${initCalldata.length/2} bytes (to be called separately)`);
  console.log(`[brc20-deploy] Full deploy: ${fullBytecode.length/2} bytes`);
  console.log(`[brc20-deploy] Args start: ${constructorArgs.slice(0, 128)}...`);

  // Create a minimal Foundry JSON with the full bytecode (init code + constructor args)
  const syntheticJson = {
    abi: proxyJson.abi || [],
    bytecode: {
      object: '0x' + fullBytecode,
      sourceMap: '',
      linkReferences: {},
    },
  };
  console.log(`[brc20-deploy] Synthetic JSON bytecode length: ${fullBytecode.length / 2} bytes`);

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
        deployer_nonce: params.proxyNonce,
      }),
    );

    harness.mineBlocks(3);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    let proxyAddress = parsed?.contract_address || parsed?.contractAddress || null;
    console.log('[brc20-deploy] BiS_Swap proxy (SDK address):', proxyAddress);

    // The SDK computes the address from deployer nonce, which may not match the EVM's
    // actual nonce. Query the debug view to get the REAL deployed address.
    try {
      const debugInput = '0x' + Buffer.from('{}').toString('hex');
      const debugResp = await fetch(BRC20_PROG.RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_view', params: ['debug', debugInput, 'latest'], id: 999 }),
      });
      const debugJson = await debugResp.json();
      if (debugJson.result) {
        const hex = debugJson.result.replace('0x', '');
        const debug = JSON.parse(Buffer.from(hex, 'hex').toString('utf-8'));
        const deployResult = debug.last_deploy_result || '';
        const addrMatch = deployResult.match(/addr=(0x[0-9a-f]+)/);
        if (addrMatch && addrMatch[1] !== proxyAddress) {
          console.log(`[brc20-deploy] BiS_Swap proxy (ACTUAL EVM address): ${addrMatch[1]}`);
          proxyAddress = addrMatch[1];
        }
      }
    } catch (e) {
      // Debug query failed, use SDK address
    }

    // Now call initialize() on the proxy via a separate brc20ProgTransact
    if (proxyAddress) {
      // Call initialize() using raw calldata hex (bypass encode_function_call)
      // This matches exactly what the cargo test does.
      console.log('[brc20-deploy] Calling initialize() on proxy with raw calldata...');
      console.log(`[brc20-deploy] proxy target: ${proxyAddress}`);
      try {
        // Build raw calldata: selector + 6 ABI-encoded params
        const rawCalldata = '0x' + initCalldata;
        console.log(`[brc20-deploy] Raw calldata: ${rawCalldata.slice(0, 20)}... (${rawCalldata.length/2 - 1} bytes)`);

        // Use brc20ProgTransact with a dummy signature and the raw hex as the calldata.
        // Actually, brc20ProgTransact expects (contract, signature, args, params).
        // We need a way to pass raw hex. Let's use the 'call' op directly.
        // The Brc20ProgCallInscription has d: "0x<hex>".
        // We can construct it manually via brc20ProgDeploy... no, that creates a deploy inscription.
        //
        // The cleanest approach: call brc20ProgTransact with a function signature
        // that matches the raw calldata we want. Since we're passing raw hex,
        // we use a simple approach: pass the full calldata as the "d" field
        // by creating the inscription JSON manually and deploying it.
        //
        // Actually, brc20ProgTransact takes function_signature + args and ABI-encodes.
        // We can't bypass it. So let's verify the encoding produces the same bytes.
        const initResult = await (provider as any).brc20ProgTransact(
          proxyAddress,
          'initialize(address,address,address,address,uint256,address)',
          [
            `0x${params.adminAddress.replace('0x','')}`,
            `0x${params.adminAddress.replace('0x','')}`,
            `0x${params.adminAddress.replace('0x','')}`,
            `0x${params.frBtcAddress.replace('0x','')}`,
            '1',
            `0x${params.adminAddress.replace('0x','')}`,
          ].join(','),
          JSON.stringify({ fee_rate: 1, mine_enabled: true }),
        );
        harness.mineBlocks(3);
        const initParsed = typeof initResult === 'string' ? JSON.parse(initResult) : initResult;
        console.log('[brc20-deploy] initialize() txids:', JSON.stringify(initParsed).slice(0, 200));
      } catch (e: any) {
        console.warn('[brc20-deploy] initialize() failed:', e?.message ?? String(e));
      }
    }

    return { implAddress, proxyAddress };
  } catch (e: any) {
    console.warn('[brc20-deploy] Proxy deploy failed:', e?.message ?? String(e));
    return { implAddress, proxyAddress: null };
  }
}
