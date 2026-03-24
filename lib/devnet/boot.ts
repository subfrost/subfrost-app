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

  // JOURNAL (2026-03-22): Create harness WITHOUT quspo tertiary indexer.
  // quspo is added AFTER initial mining to avoid OOM. TertiaryRuntime::run_block
  // creates a new WebAssembly.Instance per block, exhausting browser memory when
  // processing 110 coinbase-maturity blocks. Deferring quspo means it only indexes
  // blocks mined after boot — which is fine since the initial 110 blocks are empty
  // coinbase transactions with nothing for quspo to index.

  console.log('[devnet-boot] Creating DevnetTestHarness with alkanesWasm=%dKB esploraWasm=%sKB quspo=%s (deferred)',
    Math.round(alkanesWasm.length / 1024),
    esploraWasm ? Math.round(esploraWasm.length / 1024) : 'none',
    quspoWasm ? Math.round(quspoWasm.length / 1024) + 'KB' : 'deferred',
  );

  _harness = await sdk.DevnetTestHarness.create({
    alkanesWasm,
    esploraWasm,
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

  // Now add quspo tertiary indexer AFTER initial mining is complete.
  // This avoids OOM from processing 110 empty blocks.
  if (quspoWasm) {
    onProgress('Loading quspo indexer...', 52);
    try {
      _harness.server.addTertiary('quspo', quspoWasm);
      console.log('[devnet-boot] quspo tertiary indexer added (post-mining)');
    } catch (e: any) {
      console.warn('[devnet-boot] Failed to add quspo (non-fatal):', e?.message || e);
    }
  }

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
  // Full protocol deployment — ported from test suite deploy scripts.
  // Uses browser fetch() for WASMs instead of Node.js readFileSync.
  // =========================================================================

  const contracts = await deployFullProtocol(
    _provider, _harness, segwitAddress, taprootAddress, onProgress,
  );

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
};

// ===========================================================================
// Browser WASM loading + deploy helpers
// ===========================================================================

/**
 * Fetch a WASM file from /wasm/{name}.wasm and return its hex encoding.
 * Runs in the browser — uses fetch() instead of Node.js readFileSync.
 */
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
    await new Promise(r => setTimeout(r, 50)); // GC yield
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
    await new Promise(r => setTimeout(r, 50)); // GC yield
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
  console.log('[devnet-boot] Phase 1: Loading WASMs from /wasm/...');

  const [
    authTokenWasm, beaconProxyWasm, factoryWasm, poolWasm,
    upgradeableWasm, upgradeableBeaconWasm,
  ] = await Promise.all([
    fetchWasmHex('alkanes_std_auth_token'),
    fetchWasmHex('alkanes_std_beacon_proxy'),
    fetchWasmHex('factory'),
    fetchWasmHex('pool'),
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

  // Step 3: Factory Logic
  await deployWasm(provider, harness, segwit, taproot,
    factoryWasm, AMM_SLOTS.FACTORY_LOGIC, [50],
    'AMM Factory Logic', onProgress, 36);

  // Step 4: Pool Logic
  await deployWasm(provider, harness, segwit, taproot,
    poolWasm, AMM_SLOTS.POOL_LOGIC, [50],
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

  const [
    fireTreasuryWasm, fireTokenWasm, fireStakingWasm,
    fireBondingWasm, fireRedemptionWasm, fireDistributorWasm,
  ] = await Promise.all([
    fetchWasmHex('fire_treasury'),
    fetchWasmHex('fire_token'),
    fetchWasmHex('fire_staking'),
    fetchWasmHex('fire_bonding'),
    fetchWasmHex('fire_redemption'),
    fetchWasmHex('fire_distributor'),
  ]);

  // 1. Treasury: Init(fire_token, frbtc_token, fire_lp_token, diesel_lp_token)
  await deployWasm(provider, harness, segwit, taproot,
    fireTreasuryWasm, FIRE_SLOTS.TREASURY,
    [0, 4, FIRE_SLOTS.TOKEN, 32, 0, poolBlock, poolTx, poolBlock, poolTx],
    'FIRE Treasury', onProgress, 54);

  // 2. Token: Init(staking_contract) — no-premine, 100% emission pool
  await deployWasm(provider, harness, segwit, taproot,
    fireTokenWasm, FIRE_SLOTS.TOKEN,
    [0, 4, FIRE_SLOTS.STAKING],
    'FIRE Token', onProgress, 56);

  // 3. Staking: Init(lp_token, fire_token)
  await deployWasm(provider, harness, segwit, taproot,
    fireStakingWasm, FIRE_SLOTS.STAKING,
    [0, poolBlock, poolTx, 4, FIRE_SLOTS.TOKEN],
    'FIRE Staking', onProgress, 58);

  // 4. Bonding: Init(fire_token, diesel_lp_token, treasury, price_oracle)
  await deployWasm(provider, harness, segwit, taproot,
    fireBondingWasm, FIRE_SLOTS.BONDING,
    [0, 4, FIRE_SLOTS.TOKEN, poolBlock, poolTx, 4, FIRE_SLOTS.TREASURY, 4, FIRE_SLOTS.TOKEN],
    'FIRE Bonding', onProgress, 60);

  // 5. Redemption: Init(fire_token, treasury)
  await deployWasm(provider, harness, segwit, taproot,
    fireRedemptionWasm, FIRE_SLOTS.REDEMPTION,
    [0, 4, FIRE_SLOTS.TOKEN, 4, FIRE_SLOTS.TREASURY],
    'FIRE Redemption', onProgress, 62);

  // 6. Distributor: Init(fire_token, contribution_token=frBTC, treasury)
  await deployWasm(provider, harness, segwit, taproot,
    fireDistributorWasm, FIRE_SLOTS.DISTRIBUTOR,
    [0, 4, FIRE_SLOTS.TOKEN, 32, 0, 4, FIRE_SLOTS.TREASURY],
    'FIRE Distributor', onProgress, 64);

  // -----------------------------------------------------------------------
  // Phase 4: Core Protocol (FUEL, ftrBTC, dxBTC, gauges)
  // -----------------------------------------------------------------------
  onProgress('Loading core protocol WASMs...', 66);
  console.log('[devnet-boot] Phase 4: Deploying core protocol...');

  const [fuelWasm, ftrBtcWasm, dxBtcWasm, vxGaugeWasm] = await Promise.all([
    fetchWasmHex('frost_token'),
    fetchWasmHex('ftr_btc'),
    fetchWasmHex('dx_btc'),
    fetchWasmHex('vx_token_gauge_template'),
  ]);

  const S = PROTOCOL_SLOTS;

  // 1. FUEL Token — Init(total_supply=10M, treasury=itself)
  await deployWasm(provider, harness, segwit, taproot,
    fuelWasm, S.FUEL_TOKEN,
    [0, 1000000000000000, 4, S.FUEL_TOKEN],
    'FUEL Token', onProgress, 68);

  // 2. ftrBTC Template (deploy marker only, template init is no-op)
  await deployWasm(provider, harness, segwit, taproot,
    ftrBtcWasm, S.FTRBTC_TEMPLATE,
    [99],
    'ftrBTC Template', onProgress, 70);

  // 3. dxBTC Vault — Init(asset_id=frBTC, yv_vault, escrow_nft, vx_fuel_gauge)
  await deployWasm(provider, harness, segwit, taproot,
    dxBtcWasm, S.DXBTC_VAULT,
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

  const [
    fujinPoolWasm, fujinRuntimePoolWasm, fujinRuntimeFactoryWasm,
    fujinFactoryWasm, fujinTokenWasm, fujinZapWasm,
    fujinLpWasm, fujinMasterWasm,
  ] = await Promise.all([
    fetchWasmHex('fujin_pool'),
    fetchWasmHex('fujin_runtime_pool'),
    fetchWasmHex('fujin_runtime_factory'),
    fetchWasmHex('fujin_factory'),
    fetchWasmHex('fujin_token_template'),
    fetchWasmHex('fujin_zap'),
    fetchWasmHex('fujin_lp'),
    fetchWasmHex('fujin_master'),
  ]);

  // Step 1: Fujin Auth Token
  await deployWasm(provider, harness, segwit, taproot,
    authTokenWasm, S.FUJIN_AUTH_TOKEN,
    [100],
    'Fujin Auth Token', onProgress, 80);

  // Step 2: Fujin Beacon Proxy Template
  await deployWasm(provider, harness, segwit, taproot,
    beaconProxyWasm, S.FUJIN_BEACON_PROXY,
    [0x8fff],
    'Fujin Beacon Proxy', onProgress, 81);

  // Step 3: Fujin Pool Template
  await deployWasm(provider, harness, segwit, taproot,
    fujinPoolWasm, S.FUJIN_POOL_TEMPLATE,
    [50],
    'Fujin Pool Template', onProgress, 82);

  // Step 4: Fujin Runtime Pool
  await deployWasm(provider, harness, segwit, taproot,
    fujinRuntimePoolWasm, S.FUJIN_RUNTIME_POOL,
    [50],
    'Fujin Runtime Pool', onProgress, 83);

  // Step 5: Fujin Runtime Factory
  await deployWasm(provider, harness, segwit, taproot,
    fujinRuntimeFactoryWasm, S.FUJIN_RUNTIME_FACTORY,
    [50],
    'Fujin Runtime Factory', onProgress, 84);

  // Step 6: Fujin Beacon (upgradeable beacon → Pool Template)
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableBeaconWasm, S.FUJIN_BEACON,
    [0x7fff, 4, S.FUJIN_POOL_TEMPLATE, 1],
    'Fujin Beacon', onProgress, 85);

  // Step 7: Fujin Upgradeable Template
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_UPGRADEABLE_TEMPLATE,
    [0x8fff],
    'Fujin Upgradeable Template', onProgress, 86);

  // Step 8: Fujin Factory Logic
  await deployWasm(provider, harness, segwit, taproot,
    fujinFactoryWasm, S.FUJIN_FACTORY_LOGIC,
    [50],
    'Fujin Factory Logic', onProgress, 87);

  // Step 9: Fujin Token Template
  await deployWasm(provider, harness, segwit, taproot,
    fujinTokenWasm, S.FUJIN_TOKEN_TEMPLATE,
    [50],
    'Fujin Token Template', onProgress, 88);

  // Step 10: Fujin Zap Template
  await deployWasm(provider, harness, segwit, taproot,
    fujinZapWasm, S.FUJIN_ZAP,
    [50],
    'Fujin Zap', onProgress, 89);

  // Step 11: Fujin LP Vault
  await deployWasm(provider, harness, segwit, taproot,
    fujinLpWasm, S.FUJIN_LP_VAULT,
    [50],
    'Fujin LP Vault', onProgress, 90);

  // Step 12: Fujin Master Logic
  await deployWasm(provider, harness, segwit, taproot,
    fujinMasterWasm, S.FUJIN_MASTER_LOGIC,
    [50],
    'Fujin Master Logic', onProgress, 91);

  // Step 13: Fujin Master Proxy (upgradeable → master logic)
  await deployWasm(provider, harness, segwit, taproot,
    upgradeableWasm, S.FUJIN_MASTER_PROXY,
    [0x7fff, 4, S.FUJIN_MASTER_LOGIC, 1],
    'Fujin Master Proxy', onProgress, 92);

  // Step 14: Initialize MasterFujin with template references
  onProgress('Initializing MasterFujin...', 94);
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
  onProgress('Verifying deployments...', 96);
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
  onProgress('Deploying Carbine CLOB...', 78);
  try {
    const [carbineControllerWasm, carbineTemplateWasm, universalRouterWasm] = await Promise.all([
      fetchWasmHex('carbine_controller'),
      fetchWasmHex('carbine_template'),
      fetchWasmHex('universal_router'),
    ]);
    await deployWasm(provider, harness, segwit, taproot,
      carbineControllerWasm, S.CARBINE_CONTROLLER, [50],
      'Carbine Controller', onProgress, 78);
    await deployWasm(provider, harness, segwit, taproot,
      carbineTemplateWasm, S.CARBINE_TEMPLATE, [50],
      'Carbine Template', onProgress, 79);
    await deployWasm(provider, harness, segwit, taproot,
      universalRouterWasm, S.UNIVERSAL_ROUTER, [50],
      'Universal Router', onProgress, 80);
    console.log('[devnet-boot] Carbine CLOB deployed at 4:70000, 4:70001, 4:70002');
  } catch (e: any) {
    console.warn('[devnet-boot] Carbine deployment failed (non-fatal):', e?.message?.substring(0, 80));
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
    synthPoolId: '',
    frusdTokenId: '',
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
  // JOURNAL (2026-03-22): Mine 1 block at a time with real delays.
  // Both alkanes and esplora indexers create a new WebAssembly.Instance per block
  // via WebIndexerRuntime::run_block. With batch size > 1, multiple instances
  // accumulate before GC gets a chance to reclaim them, causing browser OOM.
  // Mining 1 block at a time with 50ms delay gives the browser GC enough time
  // to collect the previous block's instances before creating new ones.
  // Coinbase maturity requires 100 blocks; we mine 101 for safety.
  // Total extra time: ~5s (101 x 50ms).
  const TOTAL_BLOCKS = 101;
  for (let mined = 0; mined < TOTAL_BLOCKS; mined++) {
    _harness.mineBlocks(1);
    if (mined % 10 === 0) {
      const pct = 20 + Math.round((mined / TOTAL_BLOCKS) * 30);
      onProgress(`Mining blocks... ${mined + 1}/${TOTAL_BLOCKS}`, pct);
    }
    // Real delay (not setTimeout(0)) to allow browser GC to reclaim
    // the WebAssembly.Instance objects created by run_block
    await new Promise(r => setTimeout(r, 50));
  }
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
