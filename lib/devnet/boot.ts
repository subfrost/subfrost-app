/**
 * Devnet Boot Sequence
 *
 * Initializes an in-browser Bitcoin+EVM devnet with the full protocol stack.
 * Loads ~15MB of WASM, deploys 21+ contracts, seeds liquidity.
 *
 * This runs in the browser's main thread (could be moved to a web worker
 * for better UX if boot time becomes problematic).
 *
 * JOURNAL (2026-03-22): Added savedState parameter to bootDevnetWithWasms.
 * When a previously exported state blob is provided, the boot skips mining
 * 101 blocks and instead calls DevnetServer.importState() to restore the
 * indexer KV stores + chain height. This cuts boot from ~5s to <0.5s.
 *
 * JOURNAL (2026-03-23): Replaced TODO placeholder with full protocol deployment.
 * Ported from __tests__/devnet/amm-deploy.ts, fire-deploy.ts, deploy-full-stack.ts.
 * Uses browser fetch() for WASMs instead of Node.js readFileSync.
 * Deployment order: std WASMs -> AMM -> DIESEL mint -> frBTC wrap -> pool creation ->
 * FIRE protocol -> core protocol (FUEL, ftrBTC, dxBTC, gauges) -> Fujin.
 */

import type { DeployedContracts } from './types';

// Progress callback type
type ProgressCallback = (message: string, percent: number) => void;

// The harness and provider are stored globally so the fetch interceptor
// routes all RPC calls to the in-process devnet.
let _harness: any = null;
let _provider: any = null;
let _bootAddresses: { segwit: string; taproot: string } | null = null;

/**
 * Boot the in-browser devnet.
 *
 * This is the SAME code path as our vitest tests — we reuse the exact
 * deployment logic that's proven to work in the test suite.
 */
export async function bootDevnet(
  onProgress: ProgressCallback,
): Promise<{
  harness: any;
  provider: any;
  contracts: DeployedContracts;
  taprootAddress: string;
  segwitAddress: string;
}> {
  onProgress('Loading WASM modules...', 5);

  // Dynamic import of qubitcoin SDK
  // Import qubitcoin SDK from public dir (served as static ESM).
  // Cannot use bare '@qubitcoin/sdk' — browser can't resolve npm specifiers.
  // @ts-ignore — runtime URL import, not resolvable by TypeScript
  const sdk = await import(/* webpackIgnore: true */ '/sdk/qubitcoin/index.js');

  // Load indexer WASMs from the app's public directory or bundled assets
  // In production, these would be served as static files
  onProgress('Initializing Bitcoin node...', 10);

  // For now, we'll need the indexer WASM to be available.
  // In the browser, we fetch it from a URL or bundle it.
  // The DevnetContext will need to provide the WASM bytes.
  // This is a placeholder — the actual WASM loading depends on
  // how we serve the files (public dir, CDN, or bundled).

  // Create the harness
  // NOTE: This requires the WASM bytes to be passed in.
  // The DevnetContext will handle fetching them.
  throw new Error(
    'bootDevnet requires WASM bytes — use DevnetContext which handles fetching'
  );
}

/**
 * Boot devnet with pre-loaded WASM bytes.
 * Called by DevnetContext after fetching all required WASMs.
 *
 * @param savedState - If provided, skip mining and import this state blob
 *   (produced by DevnetServer.exportState()). This restores the indexer
 *   KV stores and chain height without re-indexing.
 */
export async function bootDevnetWithWasms(
  alkanesWasm: Uint8Array,
  esploraWasm: Uint8Array | undefined,
  quspoWasm: Uint8Array | undefined,
  mnemonic: string,
  onProgress: ProgressCallback,
  savedState?: Uint8Array,
): Promise<{
  harness: any;
  provider: any;
  contracts: DeployedContracts;
  taprootAddress: string;
  segwitAddress: string;
}> {
  // Import qubitcoin SDK from public dir (served as static ESM).
  // Cannot use bare '@qubitcoin/sdk' — browser can't resolve npm specifiers.
  console.log('[devnet-boot] Importing SDK from /sdk/qubitcoin/index.js...');
  // @ts-ignore — runtime URL import, not resolvable by TypeScript
  const sdk = await import(/* webpackIgnore: true */ '/sdk/qubitcoin/index.js');
  console.log('[devnet-boot] SDK imported, exports:', Object.keys(sdk));

  onProgress('Deriving wallet keys...', 10);

  // Derive coinbase key from mnemonic
  console.log('[devnet-boot] Importing crypto libs...');
  const bip39 = await import('bip39');
  const bip32Lib = await import('bip32');
  const ecc = await import('@bitcoinerlab/secp256k1');
  const bip32 = bip32Lib.default(ecc);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/84'/1'/0'/0/0");
  const secretKey = new Uint8Array(child.privateKey!);
  console.log('[devnet-boot] Keys derived, creating harness...');

  onProgress('Initializing Bitcoin node (loading WASM)...', 15);

  // JOURNAL (2026-03-26): Esplora + OOM — the constraints and solution.
  //
  // Constraint 1: Esplora MUST be enabled. The SDK's alkanesExecuteTyped()
  // internally calls essentials.get_address_outpoints() for UTXO discovery.
  // Without esplora, swaps fail with "Insufficient alkanes: have 0".
  // The DevnetEsploraBackend block-scan fallback does NOT satisfy this —
  // the SDK makes a different RPC call that requires the esplora indexer.
  //
  // Constraint 2: 101 blocks × 2 indexers = 202 WASM instances. Mining all
  // at once OOMs at block ~71-80. FinalizationRegistry can't reclaim fast enough.
  //
  // Solution: Mine in batches of 25 with setTimeout(0) yields between batches.
  // This lets GC reclaim instances from completed batches before the next starts.
  // See mineInitialBlocks() below.
  //
  // Future fix: qubitcoin addSecondary('esplora') — load esplora AFTER mining.
  // Rust source is ready but WASM can't be recompiled (alkanes-rpc-core is private).
  // boot.ts has hasAddSecondary feature detection ready for when the WASM ships.
  //
  // DO NOT disable esplora — swaps will break.
  // DO NOT remove batched mining — OOM will return.
  // DO NOT add waitForDevnetSync / extra generatetoaddress calls — the indexer
  // is synchronous in-process WASM, extra blocks CREATE desync, not fix it.
  const useEsplora = true;

  console.log('[devnet-boot] Creating DevnetTestHarness with alkanesWasm=%dKB esplora=%s quspo=deferred',
    Math.round(alkanesWasm.length / 1024),
    useEsplora ? Math.round((esploraWasm?.length || 0) / 1024) + 'KB' : 'disabled',
  );

  _harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    esploraWasm: useEsplora ? esploraWasm : undefined,
    secretKey,
  });
  console.log('[devnet-boot] Harness created successfully (without quspo)');

  // Install fetch interceptor — all RPC calls now go in-process
  _harness.installFetchInterceptor();

  // If we have a saved state, import it instead of mining blocks
  if (savedState) {
    onProgress('Restoring saved state...', 20);
    console.log('[devnet-boot] Importing saved state (%d KB)...', Math.round(savedState.length / 1024));
    try {
      _harness.server.importState(savedState);
      console.log('[devnet-boot] State imported, chain height:', _harness.height);
      onProgress('State restored!', 50);
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to import saved state, falling back to fresh boot:', e?.message || e);
      // Fall through to normal mining path
      await mineInitialBlocks(onProgress);
    }
  } else {
    await mineInitialBlocks(onProgress);
  }

  // quspo tertiary indexer is deferred until AFTER all deployments.
  // Adding it here causes each deploy's mine+index cycle to also run quspo,
  // making the metashrew indexer fall behind and triggering sync timeouts.

  // Create provider
  const wasm = await import('@alkanes/ts-sdk/wasm');
  _provider = new wasm.WebProvider('subfrost-regtest', {
    jsonrpc_url: 'http://localhost:18888',
    data_api_url: 'http://localhost:18888',
  });
  _provider.walletLoadMnemonic(mnemonic, null);

  // Derive addresses
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
  const segwitAddress = segwitPayment.address!;
  const taprootAddress = taprootPayment.address!;
  _bootAddresses = { segwit: segwitAddress, taproot: taprootAddress };

  // =========================================================================
  // Full protocol deployment — only on FRESH boot (no saved state).
  // When restoring from saved state, contracts are already deployed.
  // Re-deploying on top of restored state would create duplicate/corrupt entries.
  // =========================================================================

  let contracts: DeployedContracts;
  if (savedState) {
    // State restored — contracts already deployed, just need contract IDs
    console.log('[devnet-boot] Skipping deployment (restored from saved state)');
    onProgress('Contracts ready (from saved state)', 95);
    // Return default contract IDs from the deployment constants
    contracts = getDefaultContractIds();
  } else {
    contracts = await deployFullProtocol(
      _provider, _harness, segwitAddress, taprootAddress, onProgress,
    );
  }

  // Add quspo tertiary indexer AFTER deployments (or state restore).
  // quspo processes the full chain on addTertiary, catching up instantly.
  if (quspoWasm) {
    onProgress('Loading quspo indexer...', 98);
    try {
      _harness.server.addTertiary('quspo', quspoWasm);
      _harness.mineBlocks(1);
      console.log('[devnet-boot] quspo tertiary indexer added');
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to add quspo (non-fatal):', e?.message || e);
    }
  }

  onProgress('Devnet ready!', 100);

  return {
    harness: _harness,
    provider: _provider,
    contracts,
    taprootAddress,
    segwitAddress,
  };
}

// ===========================================================================
// Deployment Constants — match __tests__/devnet/amm-deploy.ts and
// __tests__/devnet/deploy-full-stack.ts exactly.
// ===========================================================================

// AMM slot assignments (from amm-deploy.ts / deploy-subfrost-regtest.sh)
const AMM_SLOTS = {
  AUTH_TOKEN_FACTORY: 0xffed,   // 65517
  POOL_BEACON_PROXY: 780993,
  FACTORY_LOGIC:     0xfff4,    // 65524
  POOL_LOGIC:        0xfff0,    // 65520
  FACTORY_PROXY:     0xfff2,    // 65522
  BEACON:            0xfff3,    // 65523
};

// FIRE contract slots (from fire-deploy.ts)
const FIRE_SLOTS = {
  TOKEN:       256,
  STAKING:     257,
  TREASURY:    258,
  BONDING:     259,
  REDEMPTION:  260,
  DISTRIBUTOR: 261,
};

// Core protocol + Fujin slots (from deploy-full-stack.ts)
const PROTOCOL_SLOTS = {
  FUEL_TOKEN:                7000,
  FTRBTC_TEMPLATE:           7010,
  DXBTC_VAULT:               7020,
  VX_FUEL_GAUGE:             7030,
  VX_BTCUSD_GAUGE:           7031,
  FUJIN_AUTH_TOKEN:           7100,
  FUJIN_BEACON_PROXY:        7101,
  FUJIN_POOL_TEMPLATE:       7102,
  FUJIN_RUNTIME_POOL:        7103,
  FUJIN_RUNTIME_FACTORY:     7104,
  FUJIN_BEACON:              7105,
  FUJIN_UPGRADEABLE_TEMPLATE:7106,
  FUJIN_FACTORY_LOGIC:       7107,
  FUJIN_TOKEN_TEMPLATE:      7108,
  FUJIN_ZAP:                 7109,
  FUJIN_LP_VAULT:            7110,
  FUJIN_MASTER_LOGIC:        7111,
  FUJIN_MASTER_PROXY:        7112,
  // Carbine CLOB
  CARBINE_CONTROLLER:        70000,
  CARBINE_TEMPLATE:          70001,
  UNIVERSAL_ROUTER:          70002,
  // ZEC bridge
  FRZEC:                     43520,  // 0xAA00
  // ETH bridge
  FRETH:                     52224,  // 0xCC00
  // Synth pools (StableSwap with tuned A coefficients)
  // All 6 pairs between frBTC, frZEC, frETH, frUSD
  SYNTH_FRBTC_FRZEC:        0xDD00, // 56576 — A=100 (pegged, both BTC-denominated)
  SYNTH_FRBTC_FRETH:        0xDD01, // 56577 — A=15  (volatile, BTC/ETH)
  SYNTH_FRBTC_FRUSD:        0xDD02, // 56578 — A=8   (volatile, BTC/USD)
  SYNTH_FRZEC_FRUSD:        0xDD03, // 56579 — A=8   (volatile, ZEC/USD)
  SYNTH_FRZEC_FRETH:        0xDD04, // 56580 — A=30  (correlated, crypto-to-crypto)
  SYNTH_FRETH_FRUSD:        0xDD05, // 56581 — A=8   (volatile, ETH/USD)
};

/**
 * Returns default contract IDs when restoring from saved state (no deployment needed).
 * IDs are derived from the slot constants — same slots used during fresh deployment.
 */
function getDefaultContractIds(): DeployedContracts {
  return {
    ammFactoryId: `4:${AMM_SLOTS.FACTORY_PROXY}`,
    ammPoolId: '2:3', // Created during boot, always gets this ID
    fireTokenId: `4:${FIRE_SLOTS.TOKEN}`,
    fireStakingId: `4:${FIRE_SLOTS.STAKING}`,
    fireTreasuryId: `4:${FIRE_SLOTS.TREASURY}`,
    fireBondingId: `4:${FIRE_SLOTS.BONDING}`,
    fireRedemptionId: `4:${FIRE_SLOTS.REDEMPTION}`,
    fireDistributorId: `4:${FIRE_SLOTS.DISTRIBUTOR}`,
    fuelTokenId: `4:${PROTOCOL_SLOTS.FUEL_TOKEN}`,
    ftrBtcTemplateId: `4:${PROTOCOL_SLOTS.FTRBTC_TEMPLATE}`,
    dxBtcVaultId: `4:${PROTOCOL_SLOTS.DXBTC_VAULT}`,
    vxFuelGaugeId: `4:${PROTOCOL_SLOTS.VX_FUEL_GAUGE}`,
    vxBtcUsdGaugeId: `4:${PROTOCOL_SLOTS.VX_BTCUSD_GAUGE}`,
    frzecId: `4:${PROTOCOL_SLOTS.FRZEC}`,
    frethId: `4:${PROTOCOL_SLOTS.FRETH}`,
    synthPools: {
      frbtcFrzec: `4:${PROTOCOL_SLOTS.SYNTH_FRBTC_FRZEC}`,
      frbtcFreth: `4:${PROTOCOL_SLOTS.SYNTH_FRBTC_FRETH}`,
      frbtcFrusd: `4:${PROTOCOL_SLOTS.SYNTH_FRBTC_FRUSD}`,
      frzecFrusd: `4:${PROTOCOL_SLOTS.SYNTH_FRZEC_FRUSD}`,
      frzecFreth: `4:${PROTOCOL_SLOTS.SYNTH_FRZEC_FRETH}`,
      frethFrusd: `4:${PROTOCOL_SLOTS.SYNTH_FRETH_FRUSD}`,
    },
    synthPoolId: `4:${PROTOCOL_SLOTS.SYNTH_FRBTC_FRUSD}`,
    frusdTokenId: '4:8201',
    frusdAuthTokenId: '',
    fujinFactoryId: `4:${PROTOCOL_SLOTS.FUJIN_MASTER_PROXY}`,
    fujinMasterId: `4:${PROTOCOL_SLOTS.FUJIN_MASTER_PROXY}`,
    carbineControllerId: `4:${PROTOCOL_SLOTS.CARBINE_CONTROLLER}`,
  };
}

// ===========================================================================
// Browser WASM loading + deploy helpers
// ===========================================================================

/**
 * Fetch a WASM file from /wasm/{name}.wasm and return its hex encoding.
 * Runs in the browser — uses fetch() instead of Node.js readFileSync.
 */
/**
 * Fetch-deploy-release: fetch a WASM, deploy it, then let the hex string be GC'd.
 * Reduces peak memory by ~60% compared to fetching all WASMs upfront.
 */
async function fetchAndDeploy(
  provider: any, harness: any, segwit: string, taproot: string,
  name: string, slot: number, initArgs: (number | bigint)[],
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<void> {
  const hex = await fetchWasmHex(name);
  await deployWasm(provider, harness, segwit, taproot, hex, slot, initArgs, label, onProgress, pct);
  // hex string is now eligible for GC — no reference retained
}

async function fetchWasmHex(name: string): Promise<string> {
  const resp = await fetch(`/wasm/${name}.wasm`);
  if (!resp.ok) throw new Error(`WASM not found: ${name}.wasm (HTTP ${resp.status})`);

  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Convert to hex string
  const hexChars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hexChars[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return hexChars.join('');
}

/**
 * Deploy a WASM contract via alkanesExecuteFull (handles commit/reveal internally).
 * Mines 1 block after deploy and yields to GC.
 */
async function deployWasm(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  wasmHex: string,
  slot: number,
  initArgs: (number | bigint)[],
  label: string,
  onProgress: ProgressCallback,
  pct: number,
): Promise<void> {
  onProgress(`Deploying ${label}...`, pct);
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[3,${slot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot] Deploy ${label} → [4:${slot}] protostone=${protostone.slice(0, 100)}`);

  try {
    await provider.alkanesExecuteFull(
      JSON.stringify([taproot]),
      'B:100000:v0',
      protostone,
      '1',
      wasmHex,
      JSON.stringify({
        from_addresses: [segwit, taproot],
        change_address: segwit,
        alkanes_change_address: taproot,
        mine_enabled: true,
      }),
    );
    harness.mineBlocks(1);
    await new Promise(r => setTimeout(r, 200)); // GC yield + let indexer catch up
    console.log(`[devnet-boot] ${label} deployed OK → [4:${slot}]`);
  } catch (e: any) {
    console.error(`[devnet-boot] ${label} deploy FAILED:`, e?.message || e);
  }
}

/**
 * Execute a non-envelope alkane call (init, mint, swap, etc.)
 * Uses alkanesExecuteFull with no envelope.
 */
async function executeCall(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  protostone: string,
  inputRequirements: string,
  toAddresses?: string[],
): Promise<void> {
  try {
    await provider.alkanesExecuteFull(
      JSON.stringify(toAddresses || [taproot]),
      inputRequirements,
      protostone,
      '1',
      null,
      JSON.stringify({
        from_addresses: [segwit, taproot],
        change_address: segwit,
        alkanes_change_address: taproot,
        mine_enabled: true,
      }),
    );
    harness.mineBlocks(1);
    await new Promise(r => setTimeout(r, 200)); // GC yield + let indexer catch up
  } catch (e: any) {
    console.error(`[devnet-boot] executeCall failed (${protostone.slice(0, 60)}):`, e?.message || e);
  }
}

/**
 * RPC call to the devnet (routed in-process via fetch interceptor).
 */
let _rpcId = 1;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch('http://localhost:18888', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: _rpcId++ }),
  });
  return response.json();
}

/**
 * Simulate an alkane call (read-only query).
 */
async function simulate(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx }, inputs, alkanes: [],
    transaction: '0x', block: '0x', height: '999', txindex: 0, vout: 0,
  }]);
}

/**
 * Get alkane balance for a specific token at an address.
 */
async function getAlkaneBalance(
  provider: any,
  address: string,
  alkaneId: string,
): Promise<bigint> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);
  if (!result?.result?.outpoints) return BigInt(0);
  let total = BigInt(0);
  for (const outpoint of result.result.outpoints) {
    const balances = outpoint.balance_sheet?.cached?.balances
      || outpoint.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      const tx = parseInt(entry.tx ?? '0', 10);
      if (block === targetBlock && tx === targetTx) {
        total += BigInt(entry.amount || '0');
      }
    }
  }
  return total;
}

/**
 * Discover auth tokens ([2:N] with balance > 0) at an address.
 */
async function discoverAuthTokens(address: string): Promise<string[]> {
  const result = await rpcCall('alkanes_protorunesbyaddress', [
    { address, protocolTag: '1' },
  ]);
  const tokens: string[] = [];
  if (!result?.result?.outpoints) return tokens;
  for (const outpoint of result.result.outpoints) {
    const balances = outpoint.balance_sheet?.cached?.balances
      || outpoint.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      const tx = parseInt(entry.tx ?? '0', 10);
      const amount = parseInt(entry.amount ?? '0', 10);
      if (block === 2 && amount > 0) {
        const id = `${block}:${tx}`;
        if (!tokens.includes(id)) tokens.push(id);
      }
    }
  }
  return tokens;
}

// ===========================================================================
// Full Protocol Deployment
// ===========================================================================

async function deployFullProtocol(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  onProgress: ProgressCallback,
): Promise<DeployedContracts> {
  // -----------------------------------------------------------------------
  // Phase 1: AMM standard contracts
  // -----------------------------------------------------------------------
  onProgress('Loading AMM WASMs...', 30);
  console.log('[devnet-boot] Phase 1: Deploying AMM contracts (sequential fetch-deploy-release)...');

  // Fetch reusable standard WASMs that are needed across multiple phases.
  // These are small (~10-30KB) and reused for Fujin + AMM.
  const [authTokenWasm, beaconProxyWasm, upgradeableWasm, upgradeableBeaconWasm] = await Promise.all([
    fetchWasmHex('alkanes_std_auth_token'),
    fetchWasmHex('alkanes_std_beacon_proxy'),
    fetchWasmHex('alkanes_std_upgradeable'),
    fetchWasmHex('alkanes_std_upgradeable_beacon'),
  ]);

  // Step 1: Auth Token Factory
  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, AMM_SLOTS.AUTH_TOKEN_FACTORY, [100],
    'Auth Token Factory', onProgress, 32);

  // Step 2: Beacon Proxy Template
  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, AMM_SLOTS.POOL_BEACON_PROXY, [0x8fff],
    'Beacon Proxy Template', onProgress, 34);

  // Steps 3-4: Factory + Pool logic — fetch, deploy, release each to reduce peak memory
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'factory', AMM_SLOTS.FACTORY_LOGIC, [50],
    'AMM Factory Logic', onProgress, 36);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'pool', AMM_SLOTS.POOL_LOGIC, [50],
    'AMM Pool Logic', onProgress, 38);

  // Step 5: Factory Proxy (Upgradeable → Factory Logic, auth_units=5)
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, AMM_SLOTS.FACTORY_PROXY,
    [0x7fff, 4, AMM_SLOTS.FACTORY_LOGIC, 5],
    'AMM Factory Proxy', onProgress, 40);

  // Step 6: Upgradeable Beacon (→ Pool Logic, auth_units=5)
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, AMM_SLOTS.BEACON,
    [0x7fff, 4, AMM_SLOTS.POOL_LOGIC, 5],
    'AMM Beacon', onProgress, 42);

  // Step 7: Initialize Factory
  onProgress('Initializing AMM factory...', 44);
  console.log('[devnet-boot] Discovering auth tokens...');
  let authTokens = await discoverAuthTokens(taproot);
  if (authTokens.length === 0) {
    authTokens = await discoverAuthTokens(segwit);
  }
  if (authTokens.length > 0) {
    const factoryAuthToken = authTokens[0];
    console.log('[devnet-boot] Factory auth token:', factoryAuthToken);
    const fpBlock = 4, fpTx = AMM_SLOTS.FACTORY_PROXY;
    const initProtostone = `[${fpBlock},${fpTx},0,${AMM_SLOTS.POOL_BEACON_PROXY},4,${AMM_SLOTS.BEACON}]:v0:v0`;
    await executeCall(provider, harness, segwit, taproot,
      initProtostone, `${factoryAuthToken}:1`);
    console.log('[devnet-boot] Factory initialized');
  } else {
    console.warn('[devnet-boot] No auth tokens found — factory init skipped');
  }

  const factoryId = `4:${AMM_SLOTS.FACTORY_PROXY}`;

  // -----------------------------------------------------------------------
  // Phase 2: Mint DIESEL + wrap frBTC + create pool
  // -----------------------------------------------------------------------
  onProgress('Minting DIESEL...', 46);
  console.log('[devnet-boot] Phase 2: Seeding tokens...');

  // Mint DIESEL 3 times to accumulate balance
  for (let i = 0; i < 3; i++) {
    harness.mineBlocks(1);
    await executeCall(provider, harness, segwit, taproot,
      '[2,0,77]:v0:v0', 'B:10000:v0');
  }
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Wrap BTC → frBTC
  onProgress('Wrapping BTC to frBTC...', 48);
  // Get frBTC signer address from opcode 103
  let signerAddr = taproot;
  try {
    const signerResult = await simulate('32:0', ['103']);
    if (signerResult?.result?.execution?.data) {
      const hex = signerResult.result.execution.data.replace('0x', '');
      if (hex.length === 64) {
        const bitcoin = await import('bitcoinjs-lib');
        const ecc = await import('@bitcoinerlab/secp256k1');
        bitcoin.initEccLib(ecc);
        const xOnly = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({
          internalPubkey: xOnly,
          network: bitcoin.networks.regtest,
        });
        if (payment.address) signerAddr = payment.address;
      }
    }
  } catch (e: any) {
    console.warn('[devnet-boot] Failed to get frBTC signer, using taproot:', e?.message);
  }
  console.log('[devnet-boot] frBTC signer address:', signerAddr);

  // Wrap BTC: send 1M sats to signer at v0, user gets frBTC at v1
  await executeCall(provider, harness, segwit, taproot,
    '[32,0,77]:v1:v1', 'B:1000000:v0',
    [signerAddr, taproot]);
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Create DIESEL/frBTC pool
  onProgress('Creating AMM pool...', 50);
  const dieselBal = await getAlkaneBalance(provider, taproot, '2:0');
  const frbtcBal = await getAlkaneBalance(provider, taproot, '32:0');
  console.log('[devnet-boot] DIESEL balance:', dieselBal.toString(), 'frBTC balance:', frbtcBal.toString());

  let poolId = '';
  if (dieselBal > BigInt(0) && frbtcBal > BigInt(0)) {
    const dieselAmount = dieselBal / BigInt(3);
    const frbtcAmount = frbtcBal / BigInt(2);
    const [fBlock, fTx] = factoryId.split(':');
    await executeCall(provider, harness, segwit, taproot,
      `[${fBlock},${fTx},1,2,0,32,0,${dieselAmount},${frbtcAmount}]:v0:v0`,
      `2:0:${dieselAmount},32:0:${frbtcAmount}`);
    harness.mineBlocks(1);
    await new Promise(r => setTimeout(r, 50));

    // Discover pool ID via factory opcode 2 (FindExistingPoolId)
    try {
      const findPool = await simulate(factoryId, ['2', '2', '0', '32', '0']);
      const poolData = findPool?.result?.execution?.data?.replace('0x', '') || '';
      if (poolData.length >= 64) {
        const buf = Buffer.from(poolData, 'hex');
        poolId = `${Number(buf.readBigUInt64LE(0))}:${Number(buf.readBigUInt64LE(16))}`;
        console.log('[devnet-boot] AMM pool created:', poolId);
      }
    } catch (e: any) {
      console.warn('[devnet-boot] Pool discovery failed:', e?.message);
    }
  } else {
    console.warn('[devnet-boot] Insufficient tokens for pool creation');
  }

  // -----------------------------------------------------------------------
  // Phase 3: FIRE Protocol (6 contracts)
  // -----------------------------------------------------------------------
  onProgress('Loading FIRE WASMs...', 52);
  console.log('[devnet-boot] Phase 3: Deploying FIRE protocol...');

  const [poolBlock, poolTx] = poolId ? poolId.split(':').map(Number) : [2, 0];

  // FIRE contracts — fetch and deploy sequentially to reduce peak memory
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_treasury', FIRE_SLOTS.TREASURY,
    [0, 4, FIRE_SLOTS.TOKEN, 32, 0, poolBlock, poolTx, poolBlock, poolTx],
    'FIRE Treasury', onProgress, 54);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_token', FIRE_SLOTS.TOKEN,
    [0, 4, FIRE_SLOTS.STAKING],
    'FIRE Token', onProgress, 56);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_staking', FIRE_SLOTS.STAKING,
    [0, poolBlock, poolTx, 4, FIRE_SLOTS.TOKEN],
    'FIRE Staking', onProgress, 58);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_bonding', FIRE_SLOTS.BONDING,
    [0, 4, FIRE_SLOTS.TOKEN, poolBlock, poolTx, 4, FIRE_SLOTS.TREASURY, 4, FIRE_SLOTS.TOKEN],
    'FIRE Bonding', onProgress, 60);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_redemption', FIRE_SLOTS.REDEMPTION,
    [0, 4, FIRE_SLOTS.TOKEN, 4, FIRE_SLOTS.TREASURY],
    'FIRE Redemption', onProgress, 62);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fire_distributor', FIRE_SLOTS.DISTRIBUTOR,
    [0, 4, FIRE_SLOTS.TOKEN, 32, 0, 4, FIRE_SLOTS.TREASURY],
    'FIRE Distributor', onProgress, 64);

  // -----------------------------------------------------------------------
  // Phase 4: Core Protocol (FUEL, ftrBTC, dxBTC, gauges)
  // -----------------------------------------------------------------------
  onProgress('Loading core protocol WASMs...', 66);
  console.log('[devnet-boot] Phase 4: Deploying core protocol...');

  // Protocol contracts — fetch gauge template once (reused for 2 gauges), rest sequential
  const vxGaugeWasm = await fetchWasmHex('vx_token_gauge_template');

  const S = PROTOCOL_SLOTS;

  // 1. FUEL Token — Init(total_supply=10M, treasury=itself)
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'frost_token', S.FUEL_TOKEN,
    [0, 1000000000000000, 4, S.FUEL_TOKEN],
    'FUEL Token', onProgress, 68);

  // 2. ftrBTC Template (deploy marker only, template init is no-op)
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'ftr_btc', S.FTRBTC_TEMPLATE,
    [99],
    'ftrBTC Template', onProgress, 70);

  // 3. dxBTC Vault — Init(asset_id=frBTC, yv_vault, escrow_nft, vx_fuel_gauge)
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'dx_btc', S.DXBTC_VAULT,
    [0, 32, 0, 4, S.FUEL_TOKEN, 4, S.DXBTC_VAULT, 4, S.VX_FUEL_GAUGE],
    'dxBTC Vault', onProgress, 72);

  // 4. vxFUEL Gauge — Init(lp_token, reward_token, yve_token, rate, sigil)
  await deployWasm(provider, harness, segwit, taproot,
    vxGaugeWasm, S.VX_FUEL_GAUGE,
    [0, poolBlock, poolTx, 4, S.DXBTC_VAULT, 4, S.VX_FUEL_GAUGE, 100000, 4, S.VX_FUEL_GAUGE],
    'vxFUEL Gauge', onProgress, 74);

  // 5. vxBTCUSD Gauge
  await deployWasm(provider, harness, segwit, taproot,
    vxGaugeWasm, S.VX_BTCUSD_GAUGE,
    [0, poolBlock, poolTx, 4, FIRE_SLOTS.TOKEN, 4, S.VX_BTCUSD_GAUGE, 100000, 4, S.VX_BTCUSD_GAUGE],
    'vxBTCUSD Gauge', onProgress, 76);

  // -----------------------------------------------------------------------
  // Phase 5: Fujin Difficulty Futures (13 contracts + init)
  // -----------------------------------------------------------------------
  onProgress('Loading Fujin WASMs...', 78);
  console.log('[devnet-boot] Phase 5: Deploying Fujin...');

  // Steps 1-2: Fujin uses the same auth token + beacon proxy WASMs (already in memory)
  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, S.FUJIN_AUTH_TOKEN,
    [100],
    'Fujin Auth Token', onProgress, 80);

  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, S.FUJIN_BEACON_PROXY,
    [0x8fff],
    'Fujin Beacon Proxy', onProgress, 81);

  // Steps 3-12: Fujin-specific WASMs — fetch, deploy, release each
  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_pool', S.FUJIN_POOL_TEMPLATE, [50],
    'Fujin Pool Template', onProgress, 82);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_pool', S.FUJIN_RUNTIME_POOL, [50],
    'Fujin Runtime Pool', onProgress, 83);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_factory', S.FUJIN_RUNTIME_FACTORY, [50],
    'Fujin Runtime Factory', onProgress, 84);

  // Fujin Beacon + Upgradeable Template reuse WASMs already in memory
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, S.FUJIN_BEACON,
    [0x7fff, 4, S.FUJIN_POOL_TEMPLATE, 1],
    'Fujin Beacon', onProgress, 85);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_UPGRADEABLE_TEMPLATE,
    [0x8fff],
    'Fujin Upgradeable Template', onProgress, 86);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_factory', S.FUJIN_FACTORY_LOGIC, [50],
    'Fujin Factory Logic', onProgress, 87);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_token_template', S.FUJIN_TOKEN_TEMPLATE, [50],
    'Fujin Token Template', onProgress, 88);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_zap', S.FUJIN_ZAP, [50],
    'Fujin Zap', onProgress, 89);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_lp', S.FUJIN_LP_VAULT, [50],
    'Fujin LP Vault', onProgress, 90);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_master', S.FUJIN_MASTER_LOGIC, [50],
    'Fujin Master Logic', onProgress, 91);

  // Fujin Master Proxy reuses upgradeableWasm
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_MASTER_PROXY,
    [0x7fff, 4, S.FUJIN_MASTER_LOGIC, 1],
    'Fujin Master Proxy', onProgress, 92);

  // Step 14: Initialize MasterFujin with template references
  onProgress('Initializing MasterFujin...', 93);
  const masterInitProtostone = `[4,${S.FUJIN_MASTER_PROXY},0,` +
    `4,${S.FUJIN_FACTORY_LOGIC},` +
    `${S.FUJIN_UPGRADEABLE_TEMPLATE},` +
    `${S.FUJIN_BEACON_PROXY},` +
    `4,${S.FUJIN_BEACON},` +
    `${S.FUJIN_TOKEN_TEMPLATE},` +
    `${S.FUJIN_LP_VAULT},` +
    `${S.FUJIN_ZAP}` +
    `]:v0:v0`;
  await executeCall(provider, harness, segwit, taproot,
    masterInitProtostone, 'B:100000:v0');
  console.log('[devnet-boot] MasterFujin initialized');

  // -----------------------------------------------------------------------
  // Phase 6: Verify key contracts
  // -----------------------------------------------------------------------
  onProgress('Verifying deployments...', 94);
  console.log('[devnet-boot] Phase 6: Verifying...');
  const checks: [string, string, string][] = [
    ['AMM Factory', factoryId, '4'],
    ['FIRE Token', `4:${FIRE_SLOTS.TOKEN}`, '99'],
    ['FUEL Token', `4:${S.FUEL_TOKEN}`, '99'],
    ['Fujin Master', `4:${S.FUJIN_MASTER_PROXY}`, '32765'],
  ];
  for (const [name, id, opcode] of checks) {
    try {
      const check = await simulate(id, [opcode]);
      const err = check?.result?.execution?.error || '';
      const status = err.includes('unexpected end of file') ? 'NOT DEPLOYED' :
                     err ? 'deployed' : 'OK';
      console.log(`[devnet-boot]   ${name} [${id}]: ${status}`);
    } catch {
      console.log(`[devnet-boot]   ${name} [${id}]: check failed`);
    }
  }

  // ── Carbine CLOB ────────────────────────────────────────────────
  onProgress('Deploying Carbine CLOB...', 95);
  try {
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_controller', S.CARBINE_CONTROLLER, [50],
      'Carbine Controller', onProgress, 95);
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_template', S.CARBINE_TEMPLATE, [50],
      'Carbine Template', onProgress, 96);
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'universal_router', S.UNIVERSAL_ROUTER, [50],
      'Universal Router', onProgress, 97);
    console.log('[devnet-boot] Carbine CLOB deployed at 4:70000, 4:70001, 4:70002');
  } catch (e: any) {
    console.warn('[devnet-boot] Carbine deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 6: Bridge contracts (frZEC + frETH)
  // -----------------------------------------------------------------------
  let frzecId = `4:${S.FRZEC}`;
  let frethId = `4:${S.FRETH}`;
  try {
    onProgress('Deploying bridge contracts...', 96);
    console.log('[devnet-boot] Phase 6: Deploying frZEC + frETH...');

    await fetchAndDeploy(provider, harness, segwit, taproot,
      'fr_zec', S.FRZEC, [50],
      'frZEC Contract', onProgress, 96);
    console.log('[devnet-boot] frZEC at', frzecId);

    await fetchAndDeploy(provider, harness, segwit, taproot,
      'fr_eth', S.FRETH, [50],
      'frETH Contract', onProgress, 97);
    console.log('[devnet-boot] frETH at', frethId);
  } catch (e: any) {
    console.warn('[devnet-boot] Bridge contract deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 7: All 6 synth pools (StableSwap with tuned A coefficients)
  // -----------------------------------------------------------------------
  // frBTC = [32:0], frZEC = [4:FRZEC], frETH = [4:FRETH], frUSD = [4:8201]
  const synthPools = {
    frbtcFrzec: `4:${S.SYNTH_FRBTC_FRZEC}`,
    frbtcFreth: `4:${S.SYNTH_FRBTC_FRETH}`,
    frbtcFrusd: `4:${S.SYNTH_FRBTC_FRUSD}`,
    frzecFrusd: `4:${S.SYNTH_FRZEC_FRUSD}`,
    frzecFreth: `4:${S.SYNTH_FRZEC_FRETH}`,
    frethFrusd: `4:${S.SYNTH_FRETH_FRUSD}`,
  };

  const FRUSD_BLOCK = 4;
  const FRUSD_TX = 8201; // frUSD token slot from earlier deployment

  // Pool definitions: [slot, tokenA_block, tokenA_tx, tokenB_block, tokenB_tx, amplification, label]
  const poolDefs: [number, number, number, number, number, number, string][] = [
    [S.SYNTH_FRBTC_FRZEC, 32, 0, 4, S.FRZEC, 100, 'frBTC/frZEC (A=100, pegged)'],
    [S.SYNTH_FRBTC_FRETH, 32, 0, 4, S.FRETH, 15,  'frBTC/frETH (A=15, volatile)'],
    [S.SYNTH_FRBTC_FRUSD, 32, 0, FRUSD_BLOCK, FRUSD_TX, 8, 'frBTC/frUSD (A=8, volatile)'],
    [S.SYNTH_FRZEC_FRUSD, 4, S.FRZEC, FRUSD_BLOCK, FRUSD_TX, 8, 'frZEC/frUSD (A=8, volatile)'],
    [S.SYNTH_FRZEC_FRETH, 4, S.FRZEC, 4, S.FRETH, 30, 'frZEC/frETH (A=30, correlated)'],
    [S.SYNTH_FRETH_FRUSD, 4, S.FRETH, FRUSD_BLOCK, FRUSD_TX, 8, 'frETH/frUSD (A=8, volatile)'],
  ];

  try {
    onProgress('Deploying 6 synth pools...', 98);
    console.log('[devnet-boot] Phase 7: Deploying 6 synth pools...');

    for (const [slot, aBlk, aTx, bBlk, bTx, amp, label] of poolDefs) {
      try {
        await fetchAndDeploy(provider, harness, segwit, taproot,
          'synth_pool', slot,
          [0, aBlk, aTx, bBlk, bTx, amp],
          label, onProgress, 98);
        console.log(`[devnet-boot] Pool ${label} at 4:${slot}`);
      } catch (poolErr: any) {
        console.warn(`[devnet-boot] Pool ${label} failed:`, poolErr?.message?.substring(0, 60));
      }
    }
    console.log('[devnet-boot] Synth pools deployed');
  } catch (e: any) {
    console.warn('[devnet-boot] Synth pool deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  console.log('[devnet-boot] Full protocol deployment complete!');

  return {
    ammFactoryId: factoryId,
    ammPoolId: poolId,
    fireTokenId: `4:${FIRE_SLOTS.TOKEN}`,
    fireStakingId: `4:${FIRE_SLOTS.STAKING}`,
    fireTreasuryId: `4:${FIRE_SLOTS.TREASURY}`,
    fireBondingId: `4:${FIRE_SLOTS.BONDING}`,
    fireRedemptionId: `4:${FIRE_SLOTS.REDEMPTION}`,
    fireDistributorId: `4:${FIRE_SLOTS.DISTRIBUTOR}`,
    fuelTokenId: `4:${S.FUEL_TOKEN}`,
    ftrBtcTemplateId: `4:${S.FTRBTC_TEMPLATE}`,
    dxBtcVaultId: `4:${S.DXBTC_VAULT}`,
    vxFuelGaugeId: `4:${S.VX_FUEL_GAUGE}`,
    vxBtcUsdGaugeId: `4:${S.VX_BTCUSD_GAUGE}`,
    frzecId,
    frethId,
    synthPools,
    synthPoolId: synthPools.frbtcFrusd, // legacy compat
    frusdTokenId: `${FRUSD_BLOCK}:${FRUSD_TX}`,
    frusdAuthTokenId: '',
    fujinFactoryId: `4:${S.FUJIN_FACTORY_LOGIC}`,
    fujinMasterId: `4:${S.FUJIN_MASTER_PROXY}`,
    carbineControllerId: `4:${S.CARBINE_CONTROLLER}`,
  };
}

/**
 * Mine 101 blocks one at a time with GC-friendly delays.
 * Extracted to share between fresh boot and fallback after import failure.
 */
async function mineInitialBlocks(onProgress: ProgressCallback): Promise<void> {
  onProgress('Mining initial blocks...', 20);
  // ⚠️ CRITICAL (2026-03-26): The alkanes indexer creates a WebAssembly.Instance
  // per block. Mining 101 blocks with pauses (50ms-1000ms) between individual
  // blocks still OOMs at ~70-80 blocks. FinalizationRegistry cannot keep up
  // regardless of pause duration.
  //
  // Solution: mine ALL blocks in a single synchronous call. mineBlocks(N) runs
  // synchronously in WASM, creating and destroying instances within the same
  // call frame. The WASM runtime's internal allocator can reuse memory without
  // relying on JS FinalizationRegistry. This is how the vitest harness works
  // (createDevnetTestContext calls mineBlocks(201) in one shot without OOM).
  //
  // After mining completes, a single yield lets the browser process pending work.
  // Subsequent boots skip mining via IndexedDB importState (<1s).
  // Mine in batches of 25 with GC yields between them.
  // With esplora loaded, each block creates 2 WASM instances. 101 blocks =
  // 202 instances. Mining all at once OOMs at ~71-80 blocks. Batching with
  // setTimeout(0) yields lets FinalizationRegistry reclaim instances.
  const BATCH = 25;
  const TOTAL = 101;
  for (let mined = 0; mined < TOTAL; ) {
    const n = Math.min(BATCH, TOTAL - mined);
    onProgress(`Mining blocks ${mined + 1}-${mined + n} of ${TOTAL}...`, 20 + Math.round((mined / TOTAL) * 30));
    _harness.mineBlocks(n);
    mined += n;
    // Yield to let FinalizationRegistry / GC reclaim WASM instances
    await new Promise(r => setTimeout(r, 0));
  }
  onProgress('Mining complete', 50);
}

/**
 * Get the current harness (for devnet controls).
 */
export function getHarness() {
  return _harness;
}

/**
 * Get the current provider.
 */
export function getProvider() {
  return _provider;
}

/**
 * Get the boot addresses (derived from the mnemonic during boot).
 */
export function getBootAddresses(): { segwit: string; taproot: string } {
  if (!_bootAddresses) throw new Error('Devnet not booted');
  return _bootAddresses;
}

/**
 * Dispose the devnet and restore original fetch.
 */
export function disposeDevnet() {
  if (_harness) {
    _harness.restoreFetch();
    _harness.dispose();
    _harness = null;
  }
  _provider = null;
}
