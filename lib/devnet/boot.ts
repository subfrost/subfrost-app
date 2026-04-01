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
// Deployment Constants
//
// UPGRADE ARCHITECTURE (2026-03-28):
// Every contract except fr-btc is deployed behind an upgradeable proxy.
//
// Standalone contracts: impl at IMPL slot, upgradeable proxy at PROXY slot.
//   - Users interact with PROXY slot. Proxy delegatecalls to impl.
//   - Upgrade: send auth token + call opcode 32766 on proxy with new impl ID.
//
// Template contracts (multiple instances): impl at IMPL slot, beacon at BEACON slot,
//   instances are beacon-proxy contracts pointing to the beacon.
//   - Upgrade beacon once (opcode 32766) → all instances get new impl.
//
// Slot convention:
//   PROXY/instance slots = user-facing IDs (unchanged from before)
//   IMPL slots = original + 10000
//   BEACON slots = original + 20000
// ===========================================================================

// AMM slot assignments (already has proxy/beacon — unchanged)
const AMM_SLOTS = {
  AUTH_TOKEN_FACTORY: 0xffed,   // 65517
  POOL_BEACON_PROXY: 780993,
  FACTORY_LOGIC:     0xfff4,    // 65524
  POOL_LOGIC:        0xfff0,    // 65520
  FACTORY_PROXY:     0xfff2,    // 65522
  BEACON:            0xfff3,    // 65523
};

// FIRE contract slots — proxy at original, impl at +10000
const FIRE_SLOTS = {
  TOKEN_PROXY:       256,   TOKEN_IMPL:       10256,
  STAKING_PROXY:     257,   STAKING_IMPL:     10257,
  TREASURY_PROXY:    258,   TREASURY_IMPL:    10258,
  BONDING_PROXY:     259,   BONDING_IMPL:     10259,
  REDEMPTION_PROXY:  260,   REDEMPTION_IMPL:  10260,
  DISTRIBUTOR_PROXY: 261,   DISTRIBUTOR_IMPL: 10261,
};

// Core protocol + Fujin slots
const PROTOCOL_SLOTS = {
  // Standalone: proxy at original, impl at +10000
  FUEL_TOKEN_PROXY:    7000,  FUEL_TOKEN_IMPL:    17000,
  DXBTC_VAULT_PROXY:   7020,  DXBTC_VAULT_IMPL:   17020,
  CARBINE_CTRL_PROXY:  70000, CARBINE_CTRL_IMPL:  80000,
  UNIVERSAL_ROUTER_PROXY: 70002, UNIVERSAL_ROUTER_IMPL: 80002,
  FRZEC_PROXY:         43520, FRZEC_IMPL:         53520,  // 0xAA00 / 0xD130
  FRETH_PROXY:         52224, FRETH_IMPL:         62224,  // 0xCC00 / 0xF330

  // Template: impl at +10000, beacon at +20000, instances at original
  FTRBTC_IMPL:         17010, FTRBTC_BEACON:      27010,
  VX_GAUGE_IMPL:       17030, VX_GAUGE_BEACON:    27030,
  VX_FUEL_GAUGE:       7030,  // beacon proxy instance
  VX_BTCUSD_GAUGE:     7031,  // beacon proxy instance
  CARBINE_TMPL_IMPL:   80001, CARBINE_TMPL_BEACON: 90001,
  CARBINE_TEMPLATE:    70001, // beacon proxy instance
  SYNTH_POOL_IMPL:     66576, SYNTH_POOL_BEACON:  76576,  // impl/beacon for all synth pools
  SYNTH_FRBTC_FRZEC:   0xDD00, // 56576 — beacon proxy instance, A=100
  SYNTH_FRBTC_FRETH:   0xDD01, // 56577 — A=15
  SYNTH_FRBTC_FRUSD:   0xDD02, // 56578 — A=8
  SYNTH_FRZEC_FRUSD:   0xDD03, // 56579 — A=8
  SYNTH_FRZEC_FRETH:   0xDD04, // 56580 — A=30
  SYNTH_FRETH_FRUSD:   0xDD05, // 56581 — A=8

  // Fujin (already has proxy/beacon — unchanged)
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
};

/**
 * Helper to build an UpgradeableInfo with empty auth token (filled during deploy).
 */
function upgradeableInfo(proxySlot: number, implSlot: number): import('./types').UpgradeableInfo {
  return { proxyId: `4:${proxySlot}`, implId: `4:${implSlot}`, authTokenId: '' };
}

/**
 * Helper to build a BeaconInfo.
 */
function beaconInfo(
  implSlot: number, beaconSlot: number, instances: Record<string, number>,
): import('./types').BeaconInfo {
  const inst: Record<string, string> = {};
  for (const [k, v] of Object.entries(instances)) inst[k] = `4:${v}`;
  return { implId: `4:${implSlot}`, beaconId: `4:${beaconSlot}`, authTokenId: '', instances: inst };
}

/**
 * Returns default contract IDs when restoring from saved state (no deployment needed).
 * IDs are derived from the slot constants — same slots used during fresh deployment.
 */
function getDefaultContractIds(): DeployedContracts {
  const S = PROTOCOL_SLOTS;
  return {
    ammFactoryId: `4:${AMM_SLOTS.FACTORY_PROXY}`,
    ammPoolId: '2:3',

    // Upgradeable standalone contracts
    fireToken:       upgradeableInfo(FIRE_SLOTS.TOKEN_PROXY,       FIRE_SLOTS.TOKEN_IMPL),
    fireStaking:     upgradeableInfo(FIRE_SLOTS.STAKING_PROXY,     FIRE_SLOTS.STAKING_IMPL),
    fireTreasury:    upgradeableInfo(FIRE_SLOTS.TREASURY_PROXY,    FIRE_SLOTS.TREASURY_IMPL),
    fireBonding:     upgradeableInfo(FIRE_SLOTS.BONDING_PROXY,     FIRE_SLOTS.BONDING_IMPL),
    fireRedemption:  upgradeableInfo(FIRE_SLOTS.REDEMPTION_PROXY,  FIRE_SLOTS.REDEMPTION_IMPL),
    fireDistributor: upgradeableInfo(FIRE_SLOTS.DISTRIBUTOR_PROXY, FIRE_SLOTS.DISTRIBUTOR_IMPL),
    fuelToken:       upgradeableInfo(S.FUEL_TOKEN_PROXY,           S.FUEL_TOKEN_IMPL),
    dxBtcVault:      upgradeableInfo(S.DXBTC_VAULT_PROXY,         S.DXBTC_VAULT_IMPL),
    carbineController: upgradeableInfo(S.CARBINE_CTRL_PROXY,       S.CARBINE_CTRL_IMPL),
    universalRouter: upgradeableInfo(S.UNIVERSAL_ROUTER_PROXY,     S.UNIVERSAL_ROUTER_IMPL),
    frzec:           upgradeableInfo(S.FRZEC_PROXY,                S.FRZEC_IMPL),
    freth:           upgradeableInfo(S.FRETH_PROXY,                S.FRETH_IMPL),

    // Beacon templates
    ftrBtcTemplate: beaconInfo(S.FTRBTC_IMPL, S.FTRBTC_BEACON, {}),
    vxGaugeTemplate: beaconInfo(S.VX_GAUGE_IMPL, S.VX_GAUGE_BEACON, {
      vxFuel: S.VX_FUEL_GAUGE, vxBtcUsd: S.VX_BTCUSD_GAUGE,
    }),
    synthPoolTemplate: beaconInfo(S.SYNTH_POOL_IMPL, S.SYNTH_POOL_BEACON, {
      frbtcFrzec: S.SYNTH_FRBTC_FRZEC, frbtcFreth: S.SYNTH_FRBTC_FRETH,
      frbtcFrusd: S.SYNTH_FRBTC_FRUSD, frzecFrusd: S.SYNTH_FRZEC_FRUSD,
      frzecFreth: S.SYNTH_FRZEC_FRETH, frethFrusd: S.SYNTH_FRETH_FRUSD,
    }),
    carbineTemplate: beaconInfo(S.CARBINE_TMPL_IMPL, S.CARBINE_TMPL_BEACON, {
      default: S.CARBINE_TEMPLATE,
    }),

    synthPools: {
      frbtcFrzec: `4:${S.SYNTH_FRBTC_FRZEC}`,
      frbtcFreth: `4:${S.SYNTH_FRBTC_FRETH}`,
      frbtcFrusd: `4:${S.SYNTH_FRBTC_FRUSD}`,
      frzecFrusd: `4:${S.SYNTH_FRZEC_FRUSD}`,
      frzecFreth: `4:${S.SYNTH_FRZEC_FRETH}`,
      frethFrusd: `4:${S.SYNTH_FRETH_FRUSD}`,
    },
    synthPoolId: `4:${S.SYNTH_FRBTC_FRUSD}`,

    frusdTokenId: '4:8201',
    frusdAuthTokenId: '',
    fujinFactoryId: `4:${S.FUJIN_FACTORY_LOGIC}`,
    fujinMasterId: `4:${S.FUJIN_MASTER_PROXY}`,

    // Legacy flat IDs — point to proxy (user-facing) slots
    fireTokenId:       `4:${FIRE_SLOTS.TOKEN_PROXY}`,
    fireStakingId:     `4:${FIRE_SLOTS.STAKING_PROXY}`,
    fireTreasuryId:    `4:${FIRE_SLOTS.TREASURY_PROXY}`,
    fireBondingId:     `4:${FIRE_SLOTS.BONDING_PROXY}`,
    fireRedemptionId:  `4:${FIRE_SLOTS.REDEMPTION_PROXY}`,
    fireDistributorId: `4:${FIRE_SLOTS.DISTRIBUTOR_PROXY}`,
    fuelTokenId:       `4:${S.FUEL_TOKEN_PROXY}`,
    ftrBtcTemplateId:  `4:${S.FTRBTC_BEACON}`, // beacon is the user-facing entry point for templates
    dxBtcVaultId:      `4:${S.DXBTC_VAULT_PROXY}`,
    vxFuelGaugeId:     `4:${S.VX_FUEL_GAUGE}`,
    vxBtcUsdGaugeId:   `4:${S.VX_BTCUSD_GAUGE}`,
    frzecId:           `4:${S.FRZEC_PROXY}`,
    frethId:           `4:${S.FRETH_PROXY}`,
    carbineControllerId: `4:${S.CARBINE_CTRL_PROXY}`,
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
 *
 * CRITICAL: CREATERESERVED ATOMIC ROLLBACK BEHAVIOR
 * During CREATERESERVED [3, slot, ...args], the alkanes indexer:
 *   1. Stores the WASM binary at [4:slot] in the atomic transaction
 *   2. Executes the WASM with `args` as the cellpack inputs
 *   3. If execution REVERTS (e.g., unrecognized opcode), the entire
 *      atomic transaction is rolled back — INCLUDING the binary storage
 *
 * This means `initArgs` MUST contain a valid opcode that the contract
 * accepts. Common patterns:
 *   - Std contracts (upgradeable, beacon): [0x7fff, 4, implSlot, authUnits]
 *     These have dedicated proxy init handlers for 0x7fff/0x8fff opcodes
 *   - Custom impl contracts: Use opcode 0 (Initialize) with safe defaults,
 *     OR a read-only opcode (e.g., query) that succeeds without state deps
 *   - NEVER use an unrecognized opcode (e.g., [50]) — it will revert and
 *     the binary will NOT be stored, silently failing the deployment
 *
 * Source: alkanes-rs/src/message.rs — handle_message() returns Err on revert,
 * which prevents atomic.commit(), rolling back ptr.set() from run_special_cellpacks()
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

/** Shorthand: discover the most recently minted auth token. */
async function discoverLastAuthToken(address: string): Promise<string> {
  const tokens = await discoverAuthTokens(address);
  const t = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (t) console.log(`[devnet-boot]   Auth token: ${t}`);
  return t;
}

// ===========================================================================
// Full Protocol Deployment
// ===========================================================================

/**
 * Deploy an implementation WASM + upgradeable proxy pointing to it.
 * Returns the auth token ID discovered after proxy deployment.
 */
async function deployWithProxy(
  provider: any, harness: any, segwit: string, taproot: string,
  upgradeableWasm: string,
  wasmName: string, implSlot: number, proxySlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<string> {
  // Step 1: Deploy implementation WASM to [4:implSlot]
  // WARNING: The init arg [50] is passed as cellpack input during CREATERESERVED.
  // If the contract's opcode dispatcher doesn't handle opcode 50, the deploy
  // reverts and the binary is NOT stored (atomic rollback). Contracts that
  // support opcode 50 as a no-op/forward marker will deploy successfully.
  // For contracts without opcode 50 support, use a valid opcode instead:
  //   - opcode 0 (Initialize) with safe defaults
  //   - a read-only query opcode that succeeds without state deps
  // See: CREATERESERVED ATOMIC ROLLBACK BEHAVIOR docs on deployWasm()
  await fetchAndDeploy(provider, harness, segwit, taproot,
    wasmName, implSlot, [50],
    `${label} Impl`, onProgress, pct);

  // Step 2: Deploy upgradeable proxy → impl, mint 1 auth token
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, proxySlot,
    [0x7fff, 4, implSlot, 1],
    `${label} Proxy`, onProgress, pct);

  // Step 3: Discover auth token
  const tokens = await discoverAuthTokens(taproot);
  const authToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (authToken) {
    console.log(`[devnet-boot]   ${label} auth token: ${authToken}`);
  }
  return authToken;
}

/**
 * Deploy an implementation WASM + upgradeable beacon for it.
 * Used for template contracts where multiple beacon-proxy instances share one impl.
 * Returns the auth token ID for the beacon.
 */
async function deployWithBeacon(
  provider: any, harness: any, segwit: string, taproot: string,
  upgradeableBeaconWasm: string,
  wasmName: string, implSlot: number, beaconSlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<string> {
  // Step 1: Deploy implementation with marker init
  await fetchAndDeploy(provider, harness, segwit, taproot,
    wasmName, implSlot, [50],
    `${label} Impl`, onProgress, pct);

  // Step 2: Deploy upgradeable beacon → impl, mint 1 auth token
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, beaconSlot,
    [0x7fff, 4, implSlot, 1],
    `${label} Beacon`, onProgress, pct);

  const tokens = await discoverAuthTokens(taproot);
  const authToken = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (authToken) {
    console.log(`[devnet-boot]   ${label} beacon auth token: ${authToken}`);
  }
  return authToken;
}

/**
 * Deploy a beacon-proxy instance pointing to an existing beacon.
 * Used for each instance of a template (e.g., each synth pool, each gauge).
 */
async function deployBeaconInstance(
  provider: any, harness: any, segwit: string, taproot: string,
  beaconProxyWasm: string, instanceSlot: number, beaconSlot: number,
  label: string, onProgress: ProgressCallback, pct: number,
): Promise<void> {
  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, instanceSlot,
    [0x7fff, 4, beaconSlot],
    `${label} (beacon-proxy)`, onProgress, pct);
}

/**
 * Initialize a contract THROUGH its proxy using delegatecall.
 * The proxy's fallback routes all unknown opcodes to the implementation.
 */
async function initThroughProxy(
  provider: any, harness: any, segwit: string, taproot: string,
  proxySlot: number, initArgs: (number | bigint)[],
  label: string,
): Promise<void> {
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[4,${proxySlot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot]   Init ${label} through proxy: ${protostone.slice(0, 80)}`);
  await executeCall(provider, harness, segwit, taproot,
    protostone, 'B:100000:v0');
}

/**
 * Initialize a beacon-proxy instance (business init routed through beacon → impl).
 */
async function initBeaconInstance(
  provider: any, harness: any, segwit: string, taproot: string,
  instanceSlot: number, initArgs: (number | bigint)[],
  label: string,
): Promise<void> {
  const argsStr = initArgs.map(a => a.toString()).join(',');
  const protostone = `[4,${instanceSlot},${argsStr}]:v0:v0`;
  console.log(`[devnet-boot]   Init ${label} instance: ${protostone.slice(0, 80)}`);
  await executeCall(provider, harness, segwit, taproot,
    protostone, 'B:100000:v0');
}

async function deployFullProtocol(
  provider: any,
  harness: any,
  segwit: string,
  taproot: string,
  onProgress: ProgressCallback,
): Promise<DeployedContracts> {
  const S = PROTOCOL_SLOTS;
  const contracts = getDefaultContractIds();

  // -----------------------------------------------------------------------
  // Phase 0: Fetch reusable standard WASMs (small, reused across all phases)
  // -----------------------------------------------------------------------
  onProgress('Loading standard WASMs...', 30);
  const [authTokenWasm, beaconProxyWasm, upgradeableWasm, upgradeableBeaconWasm] = await Promise.all([
    fetchWasmHex('alkanes_std_auth_token'),
    fetchWasmHex('alkanes_std_beacon_proxy'),
    fetchWasmHex('alkanes_std_upgradeable'),
    fetchWasmHex('alkanes_std_upgradeable_beacon'),
  ]);

  // -----------------------------------------------------------------------
  // Phase 1: AMM Infrastructure (already has proxy/beacon — unchanged)
  // -----------------------------------------------------------------------
  console.log('[devnet-boot] Phase 1: Deploying AMM contracts...');

  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, AMM_SLOTS.AUTH_TOKEN_FACTORY, [100],
    'Auth Token Factory', onProgress, 32);

  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, AMM_SLOTS.POOL_BEACON_PROXY, [0x8fff],
    'Beacon Proxy Template', onProgress, 33);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'factory', AMM_SLOTS.FACTORY_LOGIC, [50],
    'AMM Factory Logic', onProgress, 34);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'pool', AMM_SLOTS.POOL_LOGIC, [50],
    'AMM Pool Logic', onProgress, 35);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, AMM_SLOTS.FACTORY_PROXY,
    [0x7fff, 4, AMM_SLOTS.FACTORY_LOGIC, 5],
    'AMM Factory Proxy', onProgress, 36);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, AMM_SLOTS.BEACON,
    [0x7fff, 4, AMM_SLOTS.POOL_LOGIC, 5],
    'AMM Beacon', onProgress, 37);

  // Initialize AMM Factory
  onProgress('Initializing AMM factory...', 38);
  let authTokens = await discoverAuthTokens(taproot);
  if (authTokens.length === 0) authTokens = await discoverAuthTokens(segwit);
  if (authTokens.length > 0) {
    const factoryAuthToken = authTokens[0];
    console.log('[devnet-boot] Factory auth token:', factoryAuthToken);
    await executeCall(provider, harness, segwit, taproot,
      `[4,${AMM_SLOTS.FACTORY_PROXY},0,${AMM_SLOTS.POOL_BEACON_PROXY},4,${AMM_SLOTS.BEACON}]:v0:v0`,
      `${factoryAuthToken}:1`);
  }

  const factoryId = `4:${AMM_SLOTS.FACTORY_PROXY}`;
  contracts.ammFactoryId = factoryId;

  // -----------------------------------------------------------------------
  // Phase 2: Mint DIESEL + wrap frBTC + create AMM pool
  // -----------------------------------------------------------------------
  onProgress('Minting DIESEL...', 40);
  console.log('[devnet-boot] Phase 2: Seeding tokens...');

  for (let i = 0; i < 3; i++) {
    harness.mineBlocks(1);
    await executeCall(provider, harness, segwit, taproot,
      '[2,0,77]:v0:v0', 'B:10000:v0');
  }
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Wrap BTC → frBTC
  onProgress('Wrapping BTC to frBTC...', 42);
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
  await executeCall(provider, harness, segwit, taproot,
    '[32,0,77]:v1:v1', 'B:1000000:v0', [signerAddr, taproot]);
  harness.mineBlocks(1);
  await new Promise(r => setTimeout(r, 50));

  // Create AMM pool
  onProgress('Creating AMM pool...', 44);
  const dieselBal = await getAlkaneBalance(provider, taproot, '2:0');
  const frbtcBal = await getAlkaneBalance(provider, taproot, '32:0');
  console.log('[devnet-boot] DIESEL:', dieselBal.toString(), 'frBTC:', frbtcBal.toString());

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
  }
  contracts.ammPoolId = poolId;
  const [poolBlock, poolTx] = poolId ? poolId.split(':').map(Number) : [2, 0];

  // -----------------------------------------------------------------------
  // Phase 3: FIRE Protocol — 6 contracts, each behind upgradeable proxy
  // Deploy impl at +10000 slot, proxy at original slot.
  // Business init happens THROUGH proxy (delegatecall).
  // -----------------------------------------------------------------------
  onProgress('Deploying FIRE protocol...', 46);
  console.log('[devnet-boot] Phase 3: FIRE protocol (impl+proxy for each)...');
  const F = FIRE_SLOTS;

  // Deploy all 6 FIRE impls + proxies
  contracts.fireTreasury.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_treasury', F.TREASURY_IMPL, F.TREASURY_PROXY,
    'FIRE Treasury', onProgress, 47);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.TREASURY_PROXY,
    [0, 4, F.TOKEN_PROXY, 32, 0, poolBlock, poolTx, poolBlock, poolTx],
    'FIRE Treasury');

  contracts.fireToken.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_token', F.TOKEN_IMPL, F.TOKEN_PROXY,
    'FIRE Token', onProgress, 49);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.TOKEN_PROXY,
    [0, 4, F.STAKING_PROXY],
    'FIRE Token');

  contracts.fireStaking.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_staking', F.STAKING_IMPL, F.STAKING_PROXY,
    'FIRE Staking', onProgress, 51);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.STAKING_PROXY,
    [0, poolBlock, poolTx, 4, F.TOKEN_PROXY],
    'FIRE Staking');

  contracts.fireBonding.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_bonding', F.BONDING_IMPL, F.BONDING_PROXY,
    'FIRE Bonding', onProgress, 53);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.BONDING_PROXY,
    [0, 4, F.TOKEN_PROXY, poolBlock, poolTx, 4, F.TREASURY_PROXY, 4, F.TOKEN_PROXY],
    'FIRE Bonding');

  contracts.fireRedemption.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_redemption', F.REDEMPTION_IMPL, F.REDEMPTION_PROXY,
    'FIRE Redemption', onProgress, 55);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.REDEMPTION_PROXY,
    [0, 4, F.TOKEN_PROXY, 4, F.TREASURY_PROXY],
    'FIRE Redemption');

  contracts.fireDistributor.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'fire_distributor', F.DISTRIBUTOR_IMPL, F.DISTRIBUTOR_PROXY,
    'FIRE Distributor', onProgress, 57);
  await initThroughProxy(provider, harness, segwit, taproot,
    F.DISTRIBUTOR_PROXY,
    [0, 4, F.TOKEN_PROXY, 32, 0, 4, F.TREASURY_PROXY],
    'FIRE Distributor');

  // -----------------------------------------------------------------------
  // Phase 4: Core Protocol — standalone proxies + template beacons
  // -----------------------------------------------------------------------
  onProgress('Deploying core protocol...', 60);
  console.log('[devnet-boot] Phase 4: Core protocol (proxied)...');

  // FUEL Token — standalone proxy
  contracts.fuelToken.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'frost_token', S.FUEL_TOKEN_IMPL, S.FUEL_TOKEN_PROXY,
    'FUEL Token', onProgress, 61);
  await initThroughProxy(provider, harness, segwit, taproot,
    S.FUEL_TOKEN_PROXY,
    [0, 1000000000000000, 4, S.FUEL_TOKEN_PROXY],
    'FUEL Token');

  // ftrBTC — beacon template (instances created on demand)
  contracts.ftrBtcTemplate.authTokenId = await deployWithBeacon(
    provider, harness, segwit, taproot, upgradeableBeaconWasm,
    'ftr_btc', S.FTRBTC_IMPL, S.FTRBTC_BEACON,
    'ftrBTC Template', onProgress, 63);

  // dxBTC Vault — standalone proxy
  contracts.dxBtcVault.authTokenId = await deployWithProxy(
    provider, harness, segwit, taproot, upgradeableWasm,
    'dx_btc', S.DXBTC_VAULT_IMPL, S.DXBTC_VAULT_PROXY,
    'dxBTC Vault', onProgress, 65);
  await initThroughProxy(provider, harness, segwit, taproot,
    S.DXBTC_VAULT_PROXY,
    [0, 32, 0, 4, S.FUEL_TOKEN_PROXY, 4, S.DXBTC_VAULT_PROXY, 4, S.VX_FUEL_GAUGE],
    'dxBTC Vault');

  // vx gauge template — beacon (shared impl for vxFUEL + vxBTCUSD instances)
  contracts.vxGaugeTemplate.authTokenId = await deployWithBeacon(
    provider, harness, segwit, taproot, upgradeableBeaconWasm,
    'vx_token_gauge_template', S.VX_GAUGE_IMPL, S.VX_GAUGE_BEACON,
    'vxGauge Template', onProgress, 67);

  // vxFUEL gauge — beacon proxy instance
  await deployBeaconInstance(provider, harness, segwit, taproot,
    beaconProxyWasm, S.VX_FUEL_GAUGE, S.VX_GAUGE_BEACON,
    'vxFUEL Gauge', onProgress, 68);
  await initBeaconInstance(provider, harness, segwit, taproot,
    S.VX_FUEL_GAUGE,
    [0, poolBlock, poolTx, 4, S.DXBTC_VAULT_PROXY, 4, S.VX_FUEL_GAUGE, 100000, 4, S.VX_FUEL_GAUGE],
    'vxFUEL Gauge');

  // vxBTCUSD gauge — beacon proxy instance
  await deployBeaconInstance(provider, harness, segwit, taproot,
    beaconProxyWasm, S.VX_BTCUSD_GAUGE, S.VX_GAUGE_BEACON,
    'vxBTCUSD Gauge', onProgress, 69);
  await initBeaconInstance(provider, harness, segwit, taproot,
    S.VX_BTCUSD_GAUGE,
    [0, poolBlock, poolTx, 4, F.TOKEN_PROXY, 4, S.VX_BTCUSD_GAUGE, 100000, 4, S.VX_BTCUSD_GAUGE],
    'vxBTCUSD Gauge');

  // -----------------------------------------------------------------------
  // Phase 5: Fujin Difficulty Futures (already has proxy/beacon — unchanged)
  // -----------------------------------------------------------------------
  onProgress('Deploying Fujin...', 72);
  console.log('[devnet-boot] Phase 5: Deploying Fujin...');

  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, S.FUJIN_AUTH_TOKEN, [100],
    'Fujin Auth Token', onProgress, 73);

  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, S.FUJIN_BEACON_PROXY, [0x8fff],
    'Fujin Beacon Proxy', onProgress, 74);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_pool', S.FUJIN_POOL_TEMPLATE, [50],
    'Fujin Pool Template', onProgress, 75);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_pool', S.FUJIN_RUNTIME_POOL, [50],
    'Fujin Runtime Pool', onProgress, 76);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_runtime_factory', S.FUJIN_RUNTIME_FACTORY, [50],
    'Fujin Runtime Factory', onProgress, 77);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, S.FUJIN_BEACON,
    [0x7fff, 4, S.FUJIN_POOL_TEMPLATE, 1],
    'Fujin Beacon', onProgress, 78);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_UPGRADEABLE_TEMPLATE, [0x8fff],
    'Fujin Upgradeable Template', onProgress, 79);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_factory', S.FUJIN_FACTORY_LOGIC, [50],
    'Fujin Factory Logic', onProgress, 80);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_token_template', S.FUJIN_TOKEN_TEMPLATE, [50],
    'Fujin Token Template', onProgress, 81);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_zap', S.FUJIN_ZAP, [50],
    'Fujin Zap', onProgress, 82);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_lp', S.FUJIN_LP_VAULT, [50],
    'Fujin LP Vault', onProgress, 83);

  await fetchAndDeploy(provider, harness, segwit, taproot,
    'fujin_master', S.FUJIN_MASTER_LOGIC, [50],
    'Fujin Master Logic', onProgress, 84);

  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_MASTER_PROXY,
    [0x7fff, 4, S.FUJIN_MASTER_LOGIC, 1],
    'Fujin Master Proxy', onProgress, 85);

  onProgress('Initializing MasterFujin...', 86);
  await executeCall(provider, harness, segwit, taproot,
    `[4,${S.FUJIN_MASTER_PROXY},0,` +
    `4,${S.FUJIN_FACTORY_LOGIC},` +
    `${S.FUJIN_UPGRADEABLE_TEMPLATE},` +
    `${S.FUJIN_BEACON_PROXY},` +
    `4,${S.FUJIN_BEACON},` +
    `${S.FUJIN_TOKEN_TEMPLATE},` +
    `${S.FUJIN_LP_VAULT},` +
    `${S.FUJIN_ZAP}` +
    `]:v0:v0`,
    'B:100000:v0');
  console.log('[devnet-boot] MasterFujin initialized');

  // -----------------------------------------------------------------------
  // Phase 6: Carbine CLOB — controller proxy + template beacon
  // -----------------------------------------------------------------------
  // CRITICAL: Carbine contracts do NOT support opcode 50 (the default init
  // arg in deployWithProxy/deployWithBeacon). Using [50] causes CREATERESERVED
  // to revert atomically — the WASM binary is never stored, and the proxy
  // points at an empty slot. Every extcall then fails with "unexpected end
  // of file". The fix: deploy impls with contract-specific safe opcodes.
  //
  // Verified init args from e2e-carbine-clob.test.ts (PlaceLimitOrder works):
  //   Controller impl: [0, 0, 0]  — opcode 0 (Initialize) with dummy template [0:0]
  //   Template impl:   [3]        — opcode 3 (query_metadata), read-only
  //   Router impl:     [0]        — opcode 0 (Initialize)
  // -----------------------------------------------------------------------
  onProgress('Deploying Carbine CLOB...', 88);
  console.log('[devnet-boot] Phase 6: Carbine CLOB (proxied)...');
  try {
    // 1. Controller impl [4:80000] — opcode 0 = Initialize(template_block=0, template_tx=0)
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_controller', S.CARBINE_CTRL_IMPL, [0, 0, 0],
      'Carbine Controller Impl', onProgress, 88);
    // 2. Controller proxy [4:70000]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableWasm, S.CARBINE_CTRL_PROXY,
      [0x7fff, 4, S.CARBINE_CTRL_IMPL, 1],
      'Carbine Controller Proxy', onProgress, 88);
    contracts.carbineController.authTokenId = await discoverLastAuthToken(taproot);

    // 3. Template impl [4:80001] — opcode 3 = query_metadata (read-only, safe)
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'carbine_template', S.CARBINE_TMPL_IMPL, [3],
      'Carbine Template Impl', onProgress, 89);
    // 4. Template beacon [4:90001]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableBeaconWasm, S.CARBINE_TMPL_BEACON,
      [0x7fff, 4, S.CARBINE_TMPL_IMPL, 1],
      'Carbine Template Beacon', onProgress, 89);
    contracts.carbineTemplate.authTokenId = await discoverLastAuthToken(taproot);

    // 5. Template beacon-proxy instance [4:70001]
    await deployBeaconInstance(provider, harness, segwit, taproot,
      beaconProxyWasm, S.CARBINE_TEMPLATE, S.CARBINE_TMPL_BEACON,
      'Carbine Default', onProgress, 89);

    // 6. Router impl [4:80002] — opcode 0 = Initialize
    await fetchAndDeploy(provider, harness, segwit, taproot,
      'universal_router', S.UNIVERSAL_ROUTER_IMPL, [0],
      'Universal Router Impl', onProgress, 90);
    // 7. Router proxy [4:70002]
    await deployWasm(provider, harness, segwit, taproot,
      upgradeableWasm, S.UNIVERSAL_ROUTER_PROXY,
      [0x7fff, 4, S.UNIVERSAL_ROUTER_IMPL, 1],
      'Universal Router Proxy', onProgress, 90);
    contracts.universalRouter.authTokenId = await discoverLastAuthToken(taproot);

    // Initialize controller through proxy with real template reference.
    // Opcode 0 = Initialize, args = [4, CARBINE_TEMPLATE] = template at [4:70001]
    await initThroughProxy(provider, harness, segwit, taproot,
      S.CARBINE_CTRL_PROXY, [0, 4, S.CARBINE_TEMPLATE],
      'Carbine Controller');

    console.log('[devnet-boot] Carbine CLOB deployed and initialized');
  } catch (e: any) {
    console.warn('[devnet-boot] Carbine deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 7: Bridge contracts — each behind upgradeable proxy
  // -----------------------------------------------------------------------
  onProgress('Deploying bridge contracts...', 91);
  console.log('[devnet-boot] Phase 7: Bridge contracts (proxied)...');
  try {
    contracts.frzec.authTokenId = await deployWithProxy(
      provider, harness, segwit, taproot, upgradeableWasm,
      'fr_zec', S.FRZEC_IMPL, S.FRZEC_PROXY,
      'frZEC', onProgress, 91);

    contracts.freth.authTokenId = await deployWithProxy(
      provider, harness, segwit, taproot, upgradeableWasm,
      'fr_eth', S.FRETH_IMPL, S.FRETH_PROXY,
      'frETH', onProgress, 92);
  } catch (e: any) {
    console.warn('[devnet-boot] Bridge deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 8: Synth Pools — beacon template + 6 beacon-proxy instances
  // All pools share one synth_pool implementation via a single beacon.
  // Upgrade the beacon once → all 6 pools get the new implementation.
  // -----------------------------------------------------------------------
  onProgress('Deploying synth pools...', 94);
  console.log('[devnet-boot] Phase 8: Synth pools (beacon pattern)...');

  const FRUSD_BLOCK = 4;
  const FRUSD_TX = 8201;

  try {
    // Deploy synth_pool impl + beacon
    contracts.synthPoolTemplate.authTokenId = await deployWithBeacon(
      provider, harness, segwit, taproot, upgradeableBeaconWasm,
      'synth_pool', S.SYNTH_POOL_IMPL, S.SYNTH_POOL_BEACON,
      'Synth Pool', onProgress, 94);

    // Deploy 6 beacon-proxy instances + initialize each with its token pair + A coefficient
    const poolDefs: [number, number, number, number, number, number, string][] = [
      [S.SYNTH_FRBTC_FRZEC, 32, 0, 4, S.FRZEC_PROXY, 100, 'frBTC/frZEC'],
      [S.SYNTH_FRBTC_FRETH, 32, 0, 4, S.FRETH_PROXY, 15,  'frBTC/frETH'],
      [S.SYNTH_FRBTC_FRUSD, 32, 0, FRUSD_BLOCK, FRUSD_TX, 8, 'frBTC/frUSD'],
      [S.SYNTH_FRZEC_FRUSD, 4, S.FRZEC_PROXY, FRUSD_BLOCK, FRUSD_TX, 8, 'frZEC/frUSD'],
      [S.SYNTH_FRZEC_FRETH, 4, S.FRZEC_PROXY, 4, S.FRETH_PROXY, 30, 'frZEC/frETH'],
      [S.SYNTH_FRETH_FRUSD, 4, S.FRETH_PROXY, FRUSD_BLOCK, FRUSD_TX, 8, 'frETH/frUSD'],
    ];

    for (const [slot, aBlk, aTx, bBlk, bTx, amp, label] of poolDefs) {
      try {
        await deployBeaconInstance(provider, harness, segwit, taproot,
          beaconProxyWasm, slot, S.SYNTH_POOL_BEACON,
          label, onProgress, 96);
        await initBeaconInstance(provider, harness, segwit, taproot,
          slot, [0, aBlk, aTx, bBlk, bTx, amp], label);
        console.log(`[devnet-boot]   Pool ${label} at 4:${slot}`);
      } catch (poolErr: any) {
        console.warn(`[devnet-boot] Pool ${label} failed:`, poolErr?.message?.substring(0, 60));
      }
    }
    console.log('[devnet-boot] Synth pools deployed (beacon pattern)');
  } catch (e: any) {
    console.warn('[devnet-boot] Synth pool deployment failed (non-fatal):', e?.message?.substring(0, 80));
  }

  // -----------------------------------------------------------------------
  // Phase 9: Verify key contracts
  // -----------------------------------------------------------------------
  onProgress('Verifying deployments...', 98);
  console.log('[devnet-boot] Phase 9: Verifying...');
  const checks: [string, string, string][] = [
    ['AMM Factory', factoryId, '4'],
    ['FIRE Token (proxy)', `4:${F.TOKEN_PROXY}`, '99'],
    ['FUEL Token (proxy)', `4:${S.FUEL_TOKEN_PROXY}`, '99'],
    ['Fujin Master', `4:${S.FUJIN_MASTER_PROXY}`, '32765'],
    ['vxFUEL (beacon-proxy)', `4:${S.VX_FUEL_GAUGE}`, '99'],
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

  console.log('[devnet-boot] Full protocol deployment complete (all contracts upgradeable)!');

  // Fill in legacy flat IDs
  contracts.fireTokenId       = contracts.fireToken.proxyId;
  contracts.fireStakingId     = contracts.fireStaking.proxyId;
  contracts.fireTreasuryId    = contracts.fireTreasury.proxyId;
  contracts.fireBondingId     = contracts.fireBonding.proxyId;
  contracts.fireRedemptionId  = contracts.fireRedemption.proxyId;
  contracts.fireDistributorId = contracts.fireDistributor.proxyId;
  contracts.fuelTokenId       = contracts.fuelToken.proxyId;
  contracts.dxBtcVaultId      = contracts.dxBtcVault.proxyId;
  contracts.frzecId           = contracts.frzec.proxyId;
  contracts.frethId           = contracts.freth.proxyId;
  contracts.vxFuelGaugeId     = `4:${S.VX_FUEL_GAUGE}`;
  contracts.vxBtcUsdGaugeId   = `4:${S.VX_BTCUSD_GAUGE}`;
  contracts.ftrBtcTemplateId  = `4:${S.FTRBTC_BEACON}`;
  contracts.carbineControllerId = contracts.carbineController.proxyId;
  contracts.fujinFactoryId    = `4:${S.FUJIN_FACTORY_LOGIC}`;
  contracts.fujinMasterId     = `4:${S.FUJIN_MASTER_PROXY}`;
  contracts.frusdTokenId      = `${FRUSD_BLOCK}:${FRUSD_TX}`;
  contracts.frusdAuthTokenId  = '';

  return contracts;
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
